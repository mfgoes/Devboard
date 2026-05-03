/**
 * Workspace folder support via File System Access API (browser) or Tauri fs plugin (desktop).
 *
 * Folder structure:
 *   workspace/
 *     workspace.json       ← manifest: { title, pages, activePageId }
 *     pages/
 *       <id>.json          ← { nodes (no image src), camera }
 *     assets/
 *       <uniqueName>.png   ← actual image files (no base64 in JSON)
 */
import { BoardData, CanvasNode, Document } from '../types';
import { toast } from './toast';
import { generateMarkdownFilename, htmlToMarkdown, markdownToHtml } from './exportMarkdown';
import { getDeviceId, getDeviceLabel } from './deviceIdentity';

type FSAWindow = Window & typeof globalThis & {
  showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
};

let workspaceHandle: FileSystemDirectoryHandle | null = null;
let onSavedCallback: (() => void) | null = null;
let workspaceSyncMetadata: WorkspaceSyncMetadata | null = null;

interface SaveWorkspaceOptions {
  notify?: boolean;
}

export interface SaveWorkspaceResult {
  saved: boolean;
  workspaceName?: string;
}

export interface WorkspaceSyncMetadata {
  cloudBoardId?: string | null;
  cloudBoardTitle?: string | null;
  cloudWorkspaceId?: string | null;
  lastSyncedAt?: number | null;
  deviceId?: string;
  deviceLabel?: string;
  lastLocalPath?: string | null;
  lastOpenedAt?: number;
  locations?: Record<string, {
    deviceLabel?: string;
    path?: string | null;
    openedAt?: number;
    syncedAt?: number | null;
  }>;
}

export interface WorkspaceOpenResult {
  data: BoardData | null;
  name: string;
  sync?: WorkspaceSyncMetadata | null;
}

export interface WorkspaceDownloadProgress {
  totalSteps: number;
  completedSteps: number;
  label: string;
  warning?: string;
}

export interface DownloadCloudWorkspaceOptions {
  cloud: {
    boardId: string;
    title: string;
    workspaceId: string;
    updatedAt: string;
  };
  data: BoardData;
  onProgress?: (progress: WorkspaceDownloadProgress) => void;
}

/** Register a callback that fires after every successful saveWorkspace call. */
export function setOnWorkspaceSavedCallback(fn: () => void): void {
  onSavedCallback = fn;
}
const WORKSPACE_DB = 'devboard-workspace';
const WORKSPACE_STORE = 'handles';
const WORKSPACE_KEY = 'last-workspace';
const WORKSPACE_RECENTS_KEY = 'recent-workspaces';
const WORKSPACE_RECENT_HANDLE_PREFIX = 'recent-workspace-handle:';

export interface LocalRecentWorkspace {
  id: string;
  title: string;
  localPathHint: string | null;
  lastOpenedAt: number;
  lastSavedAt?: number | null;
  cloudBoardId?: string | null;
  cloudBoardTitle?: string | null;
  cloudWorkspaceId?: string | null;
  cloudSyncedAt?: number | null;
  source: 'browser' | 'tauri';
  permissionState?: PermissionState | 'unknown' | 'missing';
  contentSummary?: WorkspaceContentSummary;
}

export interface WorkspaceContentSummary {
  pages: number;
  notes: number;
  canvasItems: number;
  images: number;
}

export function summarizeBoardContent(data: BoardData | null | undefined): WorkspaceContentSummary | undefined {
  if (!data) return undefined;
  const pageNodes = data.pages?.flatMap((page) => page.nodes) ?? data.nodes ?? [];
  return {
    pages: data.pages?.length ?? 1,
    notes: data.documents?.length ?? 0,
    canvasItems: pageNodes.length,
    images: pageNodes.filter((node) => node.type === 'image').length,
  };
}

/** True when running inside a cross-origin iframe (e.g. embedded on itch.io). */
export const IN_IFRAME =
  typeof window !== 'undefined' && window.self !== window.top;

/** True when running inside the Tauri desktop app. */
export const IS_TAURI =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Event fired when a mobile browser tries to use folder-based workspaces. */
export const MOBILE_WORKSPACE_WARNING_EVENT = 'devboard:mobile-workspace-warning';

/** True when running in a mobile browser where folder-based workspaces are not supported. */
export const IS_MOBILE_BROWSER =
  typeof navigator !== 'undefined' &&
  !IS_TAURI &&
  (
    // `userAgentData.mobile` is the cleanest signal when available.
    ('userAgentData' in navigator &&
      !!(navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile) ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );

/** Workspace path used in the Tauri code path (absolute OS path string). */
let tauriWorkspacePath: string | null = null;

/** True when the environment supports folder picking (browser FSA or Tauri native dialog). */
export const FSA_DIR_SUPPORTED =
  typeof window !== 'undefined' &&
  !IN_IFRAME &&
  ('showDirectoryPicker' in window || IS_TAURI);

function notifyMobileWorkspaceUnsupported(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MOBILE_WORKSPACE_WARNING_EVENT));
}

export function getWorkspaceName(): string | null {
  if (IS_TAURI) return tauriWorkspacePath ? tauriWorkspacePath.replace(/\\/g, '/').split('/').pop() ?? null : null;
  return workspaceHandle?.name ?? null;
}

export function getWorkspacePathHint(): string | null {
  if (IS_TAURI) return tauriWorkspacePath;
  return workspaceHandle?.name ?? null;
}

export function getWorkspaceSyncMetadata(): WorkspaceSyncMetadata | null {
  return workspaceSyncMetadata;
}

export function setWorkspaceSyncMetadata(metadata: Partial<WorkspaceSyncMetadata> | null): WorkspaceSyncMetadata | null {
  if (metadata === null) {
    workspaceSyncMetadata = null;
    return null;
  }

  const deviceId = getDeviceId();
  const deviceLabel = getDeviceLabel();
  const now = Date.now();
  const path = getWorkspacePathHint();
  const locations = {
    ...(workspaceSyncMetadata?.locations ?? {}),
    ...(metadata.locations ?? {}),
    [deviceId]: {
      ...(workspaceSyncMetadata?.locations?.[deviceId] ?? {}),
      deviceLabel,
      path,
      openedAt: now,
      syncedAt: metadata.lastSyncedAt ?? workspaceSyncMetadata?.locations?.[deviceId]?.syncedAt ?? null,
    },
  };

  workspaceSyncMetadata = {
    ...(workspaceSyncMetadata ?? {}),
    ...metadata,
    deviceId,
    deviceLabel,
    lastLocalPath: path,
    lastOpenedAt: now,
    locations,
  };
  return workspaceSyncMetadata;
}

export function clearWorkspaceHandle(): void {
  workspaceHandle = null;
  tauriWorkspacePath = null;
  workspaceSyncMetadata = null;
  if (!IS_TAURI) void clearStoredWorkspaceHandle();
}

export function hasWorkspaceHandle(): boolean {
  if (IS_TAURI) return tauriWorkspacePath !== null;
  return workspaceHandle !== null;
}

export async function revealInFinder(relativePath: string): Promise<boolean> {
  if (!IS_TAURI || !tauriWorkspacePath) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    await invoke('reveal_in_finder', { path: joinPath(tauriWorkspacePath, normalized) });
    return true;
  } catch (err) {
    console.warn('revealInFinder failed', err);
    toast('Could not show item in folder');
    return false;
  }
}

async function openWorkspaceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WORKSPACE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WORKSPACE_STORE)) db.createObjectStore(WORKSPACE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function persistWorkspaceHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openWorkspaceDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_STORE, 'readwrite');
    tx.objectStore(WORKSPACE_STORE).put(handle, WORKSPACE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }).finally(() => db.close());
}

async function getStoredWorkspaceHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openWorkspaceDb();
  return new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_STORE, 'readonly');
    const req = tx.objectStore(WORKSPACE_STORE).get(WORKSPACE_KEY);
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null);
    req.onerror = () => reject(req.error);
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => db.close();
  });
}

async function clearStoredWorkspaceHandle(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openWorkspaceDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_STORE, 'readwrite');
    tx.objectStore(WORKSPACE_STORE).delete(WORKSPACE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }).finally(() => db.close());
}

async function readRecentWorkspaceMetadata(): Promise<LocalRecentWorkspace[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openWorkspaceDb();
  return new Promise<LocalRecentWorkspace[]>((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_STORE, 'readonly');
    const req = tx.objectStore(WORKSPACE_STORE).get(WORKSPACE_RECENTS_KEY);
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result as LocalRecentWorkspace[] : []);
    req.onerror = () => reject(req.error);
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => db.close();
  });
}

async function writeRecentWorkspaceMetadata(recents: LocalRecentWorkspace[]): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openWorkspaceDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_STORE, 'readwrite');
    tx.objectStore(WORKSPACE_STORE).put(recents.slice(0, 20), WORKSPACE_RECENTS_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }).finally(() => db.close());
}

async function persistRecentWorkspaceHandle(id: string, handle: FileSystemDirectoryHandle): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openWorkspaceDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_STORE, 'readwrite');
    tx.objectStore(WORKSPACE_STORE).put(handle, `${WORKSPACE_RECENT_HANDLE_PREFIX}${id}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }).finally(() => db.close());
}

async function getRecentWorkspaceHandle(id: string): Promise<FileSystemDirectoryHandle | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openWorkspaceDb();
  return new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_STORE, 'readonly');
    const req = tx.objectStore(WORKSPACE_STORE).get(`${WORKSPACE_RECENT_HANDLE_PREFIX}${id}`);
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null);
    req.onerror = () => reject(req.error);
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => db.close();
  });
}

async function deleteRecentWorkspaceHandle(id: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openWorkspaceDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(WORKSPACE_STORE, 'readwrite');
    tx.objectStore(WORKSPACE_STORE).delete(`${WORKSPACE_RECENT_HANDLE_PREFIX}${id}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }).finally(() => db.close());
}

function currentRecentWorkspaceId(): string | null {
  if (IS_TAURI) {
    if (!tauriWorkspacePath) return null;
    return `tauri:${tauriWorkspacePath}`;
  }
  if (!workspaceHandle) return null;
  return `browser:${workspaceHandle.name.trim().toLowerCase()}`;
}

export async function recordCurrentWorkspaceRecent(title?: string, options: { savedAt?: number; openedAt?: number; data?: BoardData | null } = {}): Promise<void> {
  const id = currentRecentWorkspaceId();
  if (!id) return;

  const now = Date.now();
  const path = getWorkspacePathHint();
  const recents = await readRecentWorkspaceMetadata();
  const existing = recents.find((recent) => recent.id === id);
  const next: LocalRecentWorkspace = {
    ...(existing ?? {}),
    id,
    title: title?.trim() || existing?.title || getWorkspaceName() || 'Untitled Workspace',
    localPathHint: path,
    lastOpenedAt: options.openedAt ?? existing?.lastOpenedAt ?? now,
    lastSavedAt: options.savedAt ?? existing?.lastSavedAt ?? null,
    cloudBoardId: workspaceSyncMetadata?.cloudBoardId ?? existing?.cloudBoardId ?? null,
    cloudBoardTitle: workspaceSyncMetadata?.cloudBoardTitle ?? existing?.cloudBoardTitle ?? null,
    cloudWorkspaceId: workspaceSyncMetadata?.cloudWorkspaceId ?? existing?.cloudWorkspaceId ?? null,
    cloudSyncedAt: workspaceSyncMetadata?.lastSyncedAt ?? existing?.cloudSyncedAt ?? null,
    source: IS_TAURI ? 'tauri' : 'browser',
    permissionState: existing?.permissionState,
    contentSummary: summarizeBoardContent(options.data) ?? existing?.contentSummary,
  };

  await writeRecentWorkspaceMetadata([
    next,
    ...recents.filter((recent) => recent.id !== id),
  ].sort((a, b) => Math.max(b.lastSavedAt ?? 0, b.lastOpenedAt) - Math.max(a.lastSavedAt ?? 0, a.lastOpenedAt)));

  if (!IS_TAURI && workspaceHandle) {
    await persistRecentWorkspaceHandle(id, workspaceHandle);
  }
}

export async function listLocalRecentWorkspaces(): Promise<LocalRecentWorkspace[]> {
  const recents = await readRecentWorkspaceMetadata();
  const withPermission = await Promise.all(recents.map(async (recent) => {
    if (recent.source === 'tauri') {
      if (!recent.localPathHint) return { ...recent, permissionState: 'missing' as const };
      try {
        return { ...recent, permissionState: await tauriFsExists(recent.localPathHint) ? 'granted' as const : 'missing' as const };
      } catch {
        return { ...recent, permissionState: 'missing' as const };
      }
    }
    if (recent.source !== 'browser') return recent;
    const handle = await getRecentWorkspaceHandle(recent.id);
    if (!handle) return { ...recent, permissionState: 'missing' as const };
    try {
      const permissionApi = handle as FileSystemDirectoryHandle & {
        queryPermission?: (descriptor?: { mode?: 'readwrite' }) => Promise<PermissionState>;
      };
      const permissionState = await permissionApi.queryPermission?.({ mode: 'readwrite' }) ?? 'unknown';
      return {
        ...recent,
        permissionState: permissionState as LocalRecentWorkspace['permissionState'],
      };
    } catch {
      return { ...recent, permissionState: 'unknown' as const };
    }
  }));

  return withPermission.sort((a, b) => Math.max(b.lastSavedAt ?? 0, b.lastOpenedAt) - Math.max(a.lastSavedAt ?? 0, a.lastOpenedAt));
}

async function readTauriWorkspaceAtPath(path: string): Promise<WorkspaceOpenResult> {
  tauriWorkspacePath = path;
  const name = path.replace(/\\/g, '/').split('/').pop() ?? 'workspace';

  try {
    const manifestText = await tauriFsReadText(joinPath(path, 'workspace.json'));
    const manifest = JSON.parse(manifestText) as WorkspaceManifest;
    const sync = refreshWorkspaceOpenMetadata(manifest.sync);
    const pages = await readTauriWorkspacePages(path, Array.isArray(manifest.pages) ? manifest.pages : []);
    const activePageId = pages.some((page) => page.id === manifest.activePageId)
      ? manifest.activePageId
      : pages[0].id;
    const noteDocuments = await readTauriNoteDocuments(path, activePageId);

    for (const page of pages) {
      for (const node of page.nodes) {
        if (node.type === 'image' && node.assetName && !node.src) {
          const imgNode = node as import('../types').ImageNode;
          let url: string | null = null;
          if (imgNode.assetFolder !== undefined) {
            url = await loadImageAsset(imgNode.assetName!, imgNode.assetFolder);
          }
          if (!url) {
            const found = await findImageInWorkspace(imgNode.assetName!);
            if (found) { url = found.url; imgNode.assetFolder = found.folder; }
          }
          if (url) (imgNode as unknown as { src: string }).src = url;
        }
      }
    }

    return {
      data: {
        boardTitle: manifest.title || name,
        pages,
        activePageId,
        nodes: [],
        documents: mergeWorkspaceDocuments(manifest.documents, noteDocuments, activePageId),
      },
      name,
      sync,
    };
  } catch {
    const sync = refreshWorkspaceOpenMetadata(null);
    return { data: null, name, sync };
  }
}

export async function openRecentWorkspace(id: string): Promise<WorkspaceOpenResult | null> {
  const recent = (await readRecentWorkspaceMetadata()).find((entry) => entry.id === id);
  if (!recent) return null;

  if (recent.source === 'tauri') {
    if (!recent.localPathHint) return null;
    if (!(await tauriFsExists(recent.localPathHint))) return null;
    const result = await readTauriWorkspaceAtPath(recent.localPathHint);
    await recordCurrentWorkspaceRecent(result.data?.boardTitle ?? result.name, { openedAt: Date.now(), data: result.data });
    toast(`Opened workspace · ${result.name}`);
    return result;
  }

  const handle = await getRecentWorkspaceHandle(id);
  if (!handle) return null;
  const permissionApi = handle as FileSystemDirectoryHandle & {
    queryPermission?: (descriptor?: { mode?: 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (descriptor?: { mode?: 'readwrite' }) => Promise<PermissionState>;
  };
  let permission = await permissionApi.queryPermission?.({ mode: 'readwrite' });
  if (permission !== 'granted') {
    permission = await permissionApi.requestPermission?.({ mode: 'readwrite' });
  }
  if (permission !== 'granted') return null;

  workspaceHandle = handle;
  try { await persistWorkspaceHandle(handle); } catch (err) { console.warn('Failed to persist workspace handle', err); }
  const result = await getBrowserWorkspaceData(handle);
  await recordCurrentWorkspaceRecent(result.data?.boardTitle ?? result.name, { openedAt: Date.now(), data: result.data });
  toast(result.data ? `Opened workspace · ${result.name}` : `New workspace · ${result.name} (no board found yet)`);
  return result;
}

export async function relocateRecentWorkspace(id: string): Promise<WorkspaceOpenResult | null> {
  const result = await openWorkspace();
  if (!result) return null;
  if (currentRecentWorkspaceId() !== id) {
    await removeLocalRecentWorkspace(id);
  }
  return result;
}

export async function removeLocalRecentWorkspace(id: string): Promise<void> {
  const recents = await readRecentWorkspaceMetadata();
  await writeRecentWorkspaceMetadata(recents.filter((recent) => recent.id !== id));
  await deleteRecentWorkspaceHandle(id);
}

type WorkspacePageData = {
  id: string;
  name: string;
  layoutMode?: 'freeform' | 'stack';
  noteSort?: 'updated' | 'custom';
  nodes: CanvasNode[];
  camera: { x: number; y: number; scale: number };
};

function noteTitleFromContent(filename: string, content: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading;
  const stem = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  return stem ? stem.replace(/\b\w/g, (ch) => ch.toUpperCase()) : 'Untitled note';
}

function stableDocumentId(linkedFile: string): string {
  const safe = linkedFile.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `doc_${safe || 'note'}`.slice(0, 72);
}

function documentFromNoteFile(filename: string, content: string, pageId: string, modifiedAt = Date.now()): Document {
  const linkedFile = `notes/${filename}`;
  return {
    id: stableDocumentId(linkedFile),
    title: noteTitleFromContent(filename, content),
    content: markdownToHtml(content),
    linkedFile,
    pageId,
    createdAt: modifiedAt,
    updatedAt: modifiedAt,
  };
}

function mergeWorkspaceDocuments(
  manifestDocuments: Document[] | undefined,
  noteDocuments: Document[],
  fallbackPageId: string,
): Document[] {
  const merged = new Map<string, Document>();
  for (const doc of manifestDocuments ?? []) {
    const key = doc.linkedFile?.toLowerCase() ?? doc.id;
    merged.set(key, { ...doc, pageId: doc.pageId ?? fallbackPageId });
  }

  for (const noteDoc of noteDocuments) {
    const key = noteDoc.linkedFile?.toLowerCase() ?? noteDoc.id;
    const existing = merged.get(key);
    merged.set(key, existing
      ? {
          ...existing,
          title: existing.title || noteDoc.title,
          content: noteDoc.content,
          linkedFile: existing.linkedFile ?? noteDoc.linkedFile,
          pageId: existing.pageId ?? fallbackPageId,
          updatedAt: Math.max(existing.updatedAt ?? 0, noteDoc.updatedAt),
        }
      : noteDoc
    );
  }

  return Array.from(merged.values());
}

async function readBrowserNoteDocuments(dirHandle: FileSystemDirectoryHandle, fallbackPageId: string): Promise<Document[]> {
  try {
    const notesDir = await dirHandle.getDirectoryHandle('notes');
    const docs: Document[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const handle of (notesDir as any).values() as AsyncIterable<FileSystemHandle>) {
      if (handle.kind !== 'file' || !/\.(md|markdown|txt)$/i.test(handle.name)) continue;
      const file = await (handle as FileSystemFileHandle).getFile();
      const content = await file.text();
      docs.push(documentFromNoteFile(handle.name, content, fallbackPageId, file.lastModified || Date.now()));
    }
    return docs.sort((a, b) => (a.orderIndex ?? Number.MAX_SAFE_INTEGER) - (b.orderIndex ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title));
  } catch {
    return [];
  }
}

async function readBrowserPageFile(
  pagesDir: FileSystemDirectoryHandle | null,
  pageMeta: { id: string; name?: string; layoutMode?: 'freeform' | 'stack'; noteSort?: 'updated' | 'custom' },
): Promise<WorkspacePageData> {
  try {
    if (!pagesDir) throw new Error('No pages directory');
    const pageHandle = await pagesDir.getFileHandle(`${pageMeta.id}.json`);
    const pageData = JSON.parse(await (await pageHandle.getFile()).text());
    return {
      id: pageMeta.id,
      name: pageMeta.name || pageData.name || pageMeta.id,
      layoutMode: pageMeta.layoutMode ?? pageData.layoutMode,
      noteSort: pageMeta.noteSort ?? pageData.noteSort,
      nodes: pageData.nodes ?? [],
      camera: pageData.camera ?? { x: 0, y: 0, scale: 1 },
    };
  } catch {
    return {
      id: pageMeta.id,
      name: pageMeta.name || pageMeta.id,
      layoutMode: pageMeta.layoutMode,
      noteSort: pageMeta.noteSort,
      nodes: [],
      camera: { x: 0, y: 0, scale: 1 },
    };
  }
}

async function readBrowserWorkspacePages(
  dirHandle: FileSystemDirectoryHandle,
  manifestPages: WorkspaceManifest['pages'],
): Promise<WorkspacePageData[]> {
  let pagesDir: FileSystemDirectoryHandle | null = null;
  try {
    pagesDir = await dirHandle.getDirectoryHandle('pages');
  } catch {
    pagesDir = null;
  }

  const pages: WorkspacePageData[] = [];
  const seen = new Set<string>();
  for (const pageMeta of manifestPages ?? []) {
    if (!pageMeta.id) continue;
    pages.push(await readBrowserPageFile(pagesDir, pageMeta));
    seen.add(pageMeta.id);
  }

  if (pagesDir) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const handle of (pagesDir as any).values() as AsyncIterable<FileSystemHandle>) {
      if (handle.kind !== 'file' || !handle.name.endsWith('.json')) continue;
      const id = handle.name.replace(/\.json$/i, '');
      if (!id || seen.has(id)) continue;
      pages.push(await readBrowserPageFile(pagesDir, { id, name: id }));
    }
  }

  return pages.length > 0
    ? pages
    : [{ id: 'page-1', name: 'Page 1', nodes: [], camera: { x: 0, y: 0, scale: 1 } }];
}

function refreshWorkspaceOpenMetadata(sync: WorkspaceSyncMetadata | null | undefined): WorkspaceSyncMetadata | null {
  return setWorkspaceSyncMetadata(sync ?? {});
}

async function getBrowserWorkspaceData(dirHandle: FileSystemDirectoryHandle): Promise<WorkspaceOpenResult> {
  const name = dirHandle.name;

  try {
    const manifestHandle = await dirHandle.getFileHandle('workspace.json');
    const manifest = JSON.parse(await (await manifestHandle.getFile()).text()) as WorkspaceManifest;
    const sync = refreshWorkspaceOpenMetadata(manifest.sync);
    const pages = await readBrowserWorkspacePages(dirHandle, Array.isArray(manifest.pages) ? manifest.pages : []);
    const activePageId = pages.some((page) => page.id === manifest.activePageId)
      ? manifest.activePageId
      : pages[0].id;
    const noteDocuments = await readBrowserNoteDocuments(dirHandle, activePageId);

    for (const page of pages) {
      for (const node of page.nodes) {
        if (node.type === 'image' && node.assetName && !node.src) {
          const imgNode = node as import('../types').ImageNode;
          let url: string | null = null;
          if (imgNode.assetFolder !== undefined) {
            url = await loadImageAsset(imgNode.assetName!, imgNode.assetFolder);
          }
          if (!url) {
            const found = await findImageInWorkspace(imgNode.assetName!);
            if (found) {
              url = found.url;
              imgNode.assetFolder = found.folder;
            }
          }
          if (url) (imgNode as unknown as { src: string }).src = url;
        }
      }
    }

    const data: BoardData = {
      boardTitle: manifest.title || name,
      pages,
      activePageId,
      nodes: [],
      documents: mergeWorkspaceDocuments(manifest.documents, noteDocuments, activePageId),
    };
    return { data, name, sync };
  } catch {
    const sync = refreshWorkspaceOpenMetadata(null);
    return { data: null, name, sync };
  }
}

export async function restoreWorkspace(): Promise<WorkspaceOpenResult | null> {
  if (IS_TAURI || IN_IFRAME || typeof window === 'undefined' || !('showDirectoryPicker' in window)) return null;
  try {
    const stored = await getStoredWorkspaceHandle();
    if (!stored) return null;
    const permissionApi = stored as FileSystemDirectoryHandle & {
      queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
    };
    const permission = await permissionApi.queryPermission?.({ mode: 'readwrite' });
    if (permission !== 'granted') return null;
    workspaceHandle = stored;
    const result = await getBrowserWorkspaceData(stored);
    await recordCurrentWorkspaceRecent(result.data?.boardTitle ?? result.name, { openedAt: Date.now(), data: result.data });
    return result;
  } catch {
    return null;
  }
}

// ── Tauri helpers ──────────────────────────────────────────────────────────────

function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/');
}

function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

async function tauriFsWriteText(path: string, content: string): Promise<void> {
  const { writeTextFile } = await import('@tauri-apps/plugin-fs');
  await writeTextFile(path, content);
}

async function tauriFsReadText(path: string): Promise<string> {
  const { readTextFile } = await import('@tauri-apps/plugin-fs');
  return readTextFile(path);
}

async function tauriFsMkdir(path: string): Promise<void> {
  const { mkdir, exists } = await import('@tauri-apps/plugin-fs');
  if (!(await exists(path))) {
    await mkdir(path, { recursive: true });
  }
}

async function tauriFsReadFile(path: string): Promise<Uint8Array> {
  const { readFile } = await import('@tauri-apps/plugin-fs');
  return readFile(path);
}

async function tauriFsWriteFile(path: string, bytes: Uint8Array): Promise<void> {
  const { writeFile } = await import('@tauri-apps/plugin-fs');
  await writeFile(path, bytes);
}

async function tauriFsExists(path: string): Promise<boolean> {
  const { exists } = await import('@tauri-apps/plugin-fs');
  return exists(path);
}

async function tauriFsReadDir(path: string): Promise<Array<{ name: string; kind: 'file' | 'directory' }>> {
  const { readDir } = await import('@tauri-apps/plugin-fs');
  const entries = await readDir(path);
  return entries
    .filter((e) => e.name)
    .map((e) => ({
      name: e.name!,
      kind: (e.isDirectory ? 'directory' : 'file') as 'file' | 'directory',
    }));
}

async function tauriFsRemove(path: string): Promise<void> {
  const { remove } = await import('@tauri-apps/plugin-fs');
  await remove(path);
}

async function tauriFsRename(oldPath: string, newPath: string): Promise<void> {
  const { rename } = await import('@tauri-apps/plugin-fs');
  await rename(oldPath, newPath);
}

interface WorkspaceManifest {
  title: string;
  pages: Array<{ id: string; name: string; layoutMode?: 'freeform' | 'stack'; noteSort?: 'updated' | 'custom' }>;
  activePageId: string;
  documents?: Document[];
  sync?: WorkspaceSyncMetadata;
}

async function readTauriNoteDocuments(workspacePath: string, fallbackPageId: string): Promise<Document[]> {
  try {
    const notesDir = joinPath(workspacePath, 'notes');
    if (!(await tauriFsExists(notesDir))) return [];
    const entries = await tauriFsReadDir(notesDir);
    const docs: Document[] = [];
    for (const entry of entries) {
      if (entry.kind !== 'file' || !/\.(md|markdown|txt)$/i.test(entry.name)) continue;
      const content = await tauriFsReadText(joinPath(notesDir, entry.name));
      docs.push(documentFromNoteFile(entry.name, content, fallbackPageId));
    }
    return docs.sort((a, b) => (a.orderIndex ?? Number.MAX_SAFE_INTEGER) - (b.orderIndex ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title));
  } catch {
    return [];
  }
}

async function readTauriPageFile(
  pagesDir: string,
  pageMeta: { id: string; name?: string; layoutMode?: 'freeform' | 'stack'; noteSort?: 'updated' | 'custom' },
): Promise<WorkspacePageData> {
  try {
    const pageText = await tauriFsReadText(joinPath(pagesDir, `${pageMeta.id}.json`));
    const pageData = JSON.parse(pageText);
    return {
      id: pageMeta.id,
      name: pageMeta.name || pageData.name || pageMeta.id,
      layoutMode: pageMeta.layoutMode ?? pageData.layoutMode,
      noteSort: pageMeta.noteSort ?? pageData.noteSort,
      nodes: pageData.nodes ?? [],
      camera: pageData.camera ?? { x: 0, y: 0, scale: 1 },
    };
  } catch {
    return {
      id: pageMeta.id,
      name: pageMeta.name || pageMeta.id,
      layoutMode: pageMeta.layoutMode,
      noteSort: pageMeta.noteSort,
      nodes: [],
      camera: { x: 0, y: 0, scale: 1 },
    };
  }
}

async function readTauriWorkspacePages(
  workspacePath: string,
  manifestPages: WorkspaceManifest['pages'],
): Promise<WorkspacePageData[]> {
  const pagesDir = joinPath(workspacePath, 'pages');
  const pages: WorkspacePageData[] = [];
  const seen = new Set<string>();

  for (const pageMeta of manifestPages ?? []) {
    if (!pageMeta.id) continue;
    pages.push(await readTauriPageFile(pagesDir, pageMeta));
    seen.add(pageMeta.id);
  }

  try {
    if (await tauriFsExists(pagesDir)) {
      const entries = await tauriFsReadDir(pagesDir);
      for (const entry of entries) {
        if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
        const id = entry.name.replace(/\.json$/i, '');
        if (!id || seen.has(id)) continue;
        pages.push(await readTauriPageFile(pagesDir, { id, name: id }));
      }
    }
  } catch {
    // Keep the manifest pages even if scanning the directory fails.
  }

  return pages.length > 0
    ? pages
    : [{ id: 'page-1', name: 'Page 1', nodes: [], camera: { x: 0, y: 0, scale: 1 } }];
}

async function writeTextFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  content: string
): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function getOrCreateDir(
  parent: FileSystemDirectoryHandle,
  name: string
): Promise<FileSystemDirectoryHandle> {
  return parent.getDirectoryHandle(name, { create: true });
}

/** Strip src from image nodes so they aren't embedded in JSON. */
function stripImageSrc(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.map((n) => {
    if (n.type === 'image' && n.assetName) return { ...n, src: '' };
    return n;
  });
}

const ALLOWED_EMPTY_FOLDER_ENTRIES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

function isDirectoryEffectivelyEmpty(entries: Array<{ name: string }>): boolean {
  return entries.every((entry) => ALLOWED_EMPTY_FOLDER_ENTRIES.has(entry.name));
}

function safeRelativePath(path: string): string | null {
  const normalized = path.replace(/\\/g, '/').split('/').filter(Boolean);
  if (normalized.length === 0 || normalized.some((part) => part === '.' || part === '..')) return null;
  return normalized.join('/');
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; extension: string } | null {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return null;

  const mime = match[1] ?? 'image/png';
  const isBase64 = !!match[2];
  const body = match[3] ?? '';
  const bytes = isBase64
    ? Uint8Array.from(atob(body), (char) => char.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(body));
  const extensionByMime: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
  };

  return { bytes, extension: extensionByMime[mime] ?? '.png' };
}

function uniqueWorkspacePath(preferredPath: string, usedPaths: Set<string>): string {
  const safePath = safeRelativePath(preferredPath) ?? 'notes/untitled.md';
  const dot = safePath.lastIndexOf('.');
  const stem = dot >= 0 ? safePath.slice(0, dot) : safePath;
  const ext = dot >= 0 ? safePath.slice(dot) : '';
  let candidate = safePath;
  let counter = 2;

  while (usedPaths.has(candidate.toLowerCase())) {
    candidate = `${stem}-${counter}${ext}`;
    counter += 1;
  }

  usedPaths.add(candidate.toLowerCase());
  return candidate;
}

function documentMarkdown(doc: Document): string {
  const parts: string[] = [];
  if (doc.title.trim()) {
    parts.push(`# ${doc.title.trim()}`);
    parts.push('');
  }
  if (doc.content) parts.push(htmlToMarkdown(doc.content));
  return `${parts.join('\n').trimEnd()}\n`;
}

function materializeDocuments(documents: Document[] | undefined): { documents: Document[]; notes: Array<{ path: string; content: string }> } {
  const usedPaths = new Set<string>();
  const notes: Array<{ path: string; content: string }> = [];
  const materialized = (documents ?? []).map((doc) => {
    const linkedPath = doc.linkedFile && /\.(md|markdown|txt)$/i.test(doc.linkedFile)
      ? safeRelativePath(doc.linkedFile)
      : null;
    const path = uniqueWorkspacePath(linkedPath ?? `notes/${generateMarkdownFilename(doc.title)}`, usedPaths);
    notes.push({ path, content: documentMarkdown({ ...doc, linkedFile: path }) });
    return { ...doc, linkedFile: path };
  });

  return { documents: materialized, notes };
}

function materializePages(data: BoardData): Array<{
  id: string;
  name: string;
  layoutMode?: 'freeform' | 'stack';
  noteSort?: 'updated' | 'custom';
  nodes: CanvasNode[];
  camera: { x: number; y: number; scale: number };
}> {
  if (data.pages?.length) return data.pages;
  return [{
    id: data.activePageId || 'page-1',
    name: 'Page 1',
    nodes: data.nodes ?? [],
    camera: { x: 0, y: 0, scale: 1 },
  }];
}

function materializePageAssets(pages: ReturnType<typeof materializePages>): {
  pages: ReturnType<typeof materializePages>;
  assets: Array<{ folder: string; name: string; bytes: Uint8Array }>;
  missingAssets: number;
} {
  const assetKeys = new Set<string>();
  const assets: Array<{ folder: string; name: string; bytes: Uint8Array }> = [];
  let missingAssets = 0;

  const nextPages = pages.map((page) => ({
    ...page,
    nodes: page.nodes.map((node) => {
      if (node.type !== 'image') return node;

      const parsed = node.src?.startsWith('data:') ? dataUrlToBytes(node.src) : null;
      if (!parsed) {
        if (node.assetName || node.src) missingAssets += 1;
        return node.assetName || node.src ? { ...node, src: '' } : node;
      }

      const folder = safeRelativePath(node.assetFolder ?? 'assets') ?? 'assets';
      const name = node.assetName || `image-${node.id}${parsed.extension}`;
      const key = `${folder}/${name}`.toLowerCase();
      if (!assetKeys.has(key)) {
        assetKeys.add(key);
        assets.push({ folder, name, bytes: parsed.bytes });
      }
      return { ...node, assetFolder: folder, assetName: name, src: '' };
    }),
  }));

  return { pages: nextPages, assets, missingAssets };
}

async function writeBrowserTextAt(root: FileSystemDirectoryHandle, relativePath: string, content: string): Promise<void> {
  const parts = safeRelativePath(relativePath)?.split('/') ?? [];
  if (parts.length === 0) throw new Error('Invalid workspace path.');

  let dir = root;
  for (const part of parts.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }

  await writeTextFile(dir, parts[parts.length - 1], content);
}

async function writeBrowserBytesAt(root: FileSystemDirectoryHandle, relativePath: string, bytes: Uint8Array): Promise<void> {
  const parts = safeRelativePath(relativePath)?.split('/') ?? [];
  if (parts.length === 0) throw new Error('Invalid workspace path.');

  let dir = root;
  for (const part of parts.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }

  const handle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await handle.createWritable();
  const copy = new Uint8Array(bytes);
  await writable.write(copy.buffer);
  await writable.close();
}

/** Load an image from a workspace subfolder and return a blob object URL.
 *  `folder` can be a nested path like 'src/assets'; an empty string means workspace root. */
export async function loadImageAsset(assetName: string, folder = 'assets'): Promise<string | null> {
  if (IS_TAURI) {
    if (!tauriWorkspacePath) return null;
    try {
      const path = folder
        ? joinPath(tauriWorkspacePath, folder, assetName)
        : joinPath(tauriWorkspacePath, assetName);
      const bytes = await tauriFsReadFile(path);
      const blob = new Blob([bytes as unknown as Uint8Array<ArrayBuffer>], { type: mimeFromName(assetName) });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }
  if (!workspaceHandle) return null;
  try {
    let dir: FileSystemDirectoryHandle = workspaceHandle;
    for (const part of folder.split('/').filter(Boolean)) {
      dir = await dir.getDirectoryHandle(part);
    }
    const fileHandle = await dir.getFileHandle(assetName);
    const file = await fileHandle.getFile();
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

/** Load any file from the workspace by relative path and return a blob object URL + file size. */
export async function readWorkspaceFileInfo(relativePath: string): Promise<{ url: string; size: number } | null> {
  if (IS_TAURI) {
    if (!tauriWorkspacePath) return null;
    try {
      const path = joinPath(tauriWorkspacePath, relativePath.replace(/\\/g, '/'));
      const bytes = await tauriFsReadFile(path);
      const blob = new Blob([bytes as unknown as Uint8Array<ArrayBuffer>], { type: mimeFromName(relativePath) });
      return { url: URL.createObjectURL(blob), size: bytes.byteLength };
    } catch {
      return null;
    }
  }
  if (!workspaceHandle) return null;
  try {
    const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
    let dir: FileSystemDirectoryHandle = workspaceHandle;
    for (const part of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(part);
    }
    const handle = await dir.getFileHandle(parts[parts.length - 1]);
    const file = await handle.getFile();
    return { url: URL.createObjectURL(file), size: file.size };
  } catch {
    return null;
  }
}

/** Load any file from the workspace by relative path and return a blob object URL. */
export async function readWorkspaceFileAsUrl(relativePath: string): Promise<string | null> {
  if (IS_TAURI) {
    if (!tauriWorkspacePath) return null;
    try {
      const path = joinPath(tauriWorkspacePath, relativePath.replace(/\\/g, '/'));
      const bytes = await tauriFsReadFile(path);
      const blob = new Blob([bytes as unknown as Uint8Array<ArrayBuffer>], { type: mimeFromName(relativePath) });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }
  if (!workspaceHandle) return null;
  try {
    const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
    let dir: FileSystemDirectoryHandle = workspaceHandle;
    for (const part of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(part);
    }
    const handle = await dir.getFileHandle(parts[parts.length - 1]);
    const file = await handle.getFile();
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

/** Save an image File (or Blob) to a workspace subfolder (default: 'assets').
 *  `folder` can be a nested path like 'src/assets'. */
export async function saveImageAsset(assetName: string, data: File | Blob, folder = 'assets'): Promise<void> {
  if (IS_TAURI) {
    if (!tauriWorkspacePath) return;
    try {
      const dir = folder ? joinPath(tauriWorkspacePath, folder) : tauriWorkspacePath;
      await tauriFsMkdir(dir);
      const path = joinPath(dir, assetName);
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      await writeFile(path, new Uint8Array(await data.arrayBuffer()));
    } catch (err) {
      console.warn('Failed to save image asset', err);
    }
    return;
  }
  if (!workspaceHandle) return;
  try {
    let dir: FileSystemDirectoryHandle = workspaceHandle;
    for (const part of folder.split('/').filter(Boolean)) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
    const handle = await dir.getFileHandle(assetName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
  } catch (err) {
    console.warn('Failed to save image asset', err);
  }
}

/**
 * Move an image between workspace subfolders.
 * Copies to the new folder, removes from the old one, returns a fresh object URL.
 */
export async function moveImageAsset(
  assetName: string,
  fromFolder: string,
  toFolder: string,
): Promise<string | null> {
  if (IS_TAURI) {
    if (!tauriWorkspacePath || fromFolder === toFolder) return null;
    try {
      const srcPath = fromFolder ? joinPath(tauriWorkspacePath, fromFolder, assetName) : joinPath(tauriWorkspacePath, assetName);
      const dstDir = toFolder ? joinPath(tauriWorkspacePath, toFolder) : tauriWorkspacePath;
      const dstPath = joinPath(dstDir, assetName);
      await tauriFsMkdir(dstDir);
      const bytes = await tauriFsReadFile(srcPath);
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      await writeFile(dstPath, bytes);
      try { await tauriFsRemove(srcPath); } catch { /* ignore */ }
      const blob = new Blob([bytes as unknown as Uint8Array<ArrayBuffer>], { type: mimeFromName(assetName) });
      return URL.createObjectURL(blob);
    } catch (err) {
      console.warn('Failed to move image asset', err);
      return null;
    }
  }
  if (!workspaceHandle || fromFolder === toFolder) return null;
  try {
    let srcDir: FileSystemDirectoryHandle = workspaceHandle;
    for (const part of fromFolder.split('/').filter(Boolean)) srcDir = await srcDir.getDirectoryHandle(part);
    const srcHandle = await srcDir.getFileHandle(assetName);
    const blob = await srcHandle.getFile();

    let dstDir: FileSystemDirectoryHandle = workspaceHandle;
    for (const part of toFolder.split('/').filter(Boolean)) dstDir = await dstDir.getDirectoryHandle(part, { create: true });
    const dstHandle = await dstDir.getFileHandle(assetName, { create: true });
    const writable = await dstHandle.createWritable();
    await writable.write(blob);
    await writable.close();

    // Best-effort delete from source
    try { await srcDir.removeEntry(assetName); } catch { /* ignore */ }

    return URL.createObjectURL(blob);
  } catch (err) {
    console.warn('Failed to move image asset', err);
    return null;
  }
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.venv', 'venv', '.idea']);

/**
 * Recursively searches the workspace for a file with the given name.
 * Returns { folder, url } where folder is the relative path to the containing directory
 * (empty string = workspace root), or null if not found.
 */
export async function findImageInWorkspace(assetName: string): Promise<{ folder: string; url: string } | null> {
  if (IS_TAURI) {
    if (!tauriWorkspacePath) return null;

    async function tauriSearch(dirPath: string, folderPath: string): Promise<{ folder: string; url: string } | null> {
      try {
        const entries = await tauriFsReadDir(dirPath);
        for (const entry of entries) {
          if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
          if (entry.kind === 'file' && entry.name === assetName) {
            const bytes = await tauriFsReadFile(joinPath(dirPath, entry.name));
            const blob = new Blob([bytes as unknown as Uint8Array<ArrayBuffer>], { type: mimeFromName(assetName) });
            return { folder: folderPath, url: URL.createObjectURL(blob) };
          }
          if (entry.kind === 'directory') {
            const sub = folderPath ? `${folderPath}/${entry.name}` : entry.name;
            const found = await tauriSearch(joinPath(dirPath, entry.name), sub);
            if (found) return found;
          }
        }
      } catch { /* skip inaccessible dirs */ }
      return null;
    }

    return tauriSearch(tauriWorkspacePath, '');
  }

  if (!workspaceHandle) return null;

  async function search(
    dir: FileSystemDirectoryHandle,
    folderPath: string,
  ): Promise<{ folder: string; url: string } | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const handle of (dir as any).values() as AsyncIterable<FileSystemHandle>) {
        if (handle.name.startsWith('.') || SKIP_DIRS.has(handle.name)) continue;
        if (handle.kind === 'file' && handle.name === assetName) {
          const file = await (handle as FileSystemFileHandle).getFile();
          return { folder: folderPath, url: URL.createObjectURL(file) };
        }
        if (handle.kind === 'directory') {
          const sub = folderPath ? `${folderPath}/${handle.name}` : handle.name;
          const found = await search(handle as FileSystemDirectoryHandle, sub);
          if (found) return found;
        }
      }
    } catch { /* permission denied or other error — skip */ }
    return null;
  }

  return search(workspaceHandle, '');
}

/**
 * Opens a directory picker, loads workspace.json + page files.
 * Returns null if cancelled or if a new (empty) workspace was picked.
 */
export async function openWorkspace(): Promise<WorkspaceOpenResult | null> {
  if (IS_MOBILE_BROWSER) {
    notifyMobileWorkspaceUnsupported();
    return null;
  }

  if (!FSA_DIR_SUPPORTED) {
    // Silently return null — workspace not supported in this environment
    return null;
  }

  // ── Tauri native folder picker ──────────────────────────────────────────────
  if (IS_TAURI) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false, title: 'Open Workspace Folder' });
      if (!selected || typeof selected !== 'string') return null;
      tauriWorkspacePath = selected;
    } catch {
      return null;
    }

    const name = tauriWorkspacePath!.replace(/\\/g, '/').split('/').pop() ?? 'workspace';
    try {
      const manifestText = await tauriFsReadText(joinPath(tauriWorkspacePath!, 'workspace.json'));
      const manifest = JSON.parse(manifestText) as WorkspaceManifest;
      const sync = refreshWorkspaceOpenMetadata(manifest.sync);
      const pages = await readTauriWorkspacePages(tauriWorkspacePath!, Array.isArray(manifest.pages) ? manifest.pages : []);
      const activePageId = pages.some((page) => page.id === manifest.activePageId)
        ? manifest.activePageId
        : pages[0].id;
      const noteDocuments = await readTauriNoteDocuments(tauriWorkspacePath!, activePageId);

      // Populate image src
      for (const page of pages) {
        for (const node of page.nodes) {
          if (node.type === 'image' && node.assetName && !node.src) {
            const imgNode = node as import('../types').ImageNode;
            let url: string | null = null;
            if (imgNode.assetFolder !== undefined) {
              url = await loadImageAsset(imgNode.assetName!, imgNode.assetFolder);
            }
            if (!url) {
              const found = await findImageInWorkspace(imgNode.assetName!);
              if (found) { url = found.url; imgNode.assetFolder = found.folder; }
            }
            if (url) (imgNode as unknown as { src: string }).src = url;
          }
        }
      }

      const result = {
        data: {
          boardTitle: manifest.title || name,
          pages,
          activePageId,
          nodes: [],
          documents: mergeWorkspaceDocuments(manifest.documents, noteDocuments, activePageId),
        },
        name,
        sync,
      };
      await recordCurrentWorkspaceRecent(result.data.boardTitle, { openedAt: Date.now(), data: result.data });
      toast(`Opened workspace · ${name}`);
      return result;
    } catch {
      const sync = refreshWorkspaceOpenMetadata(null);
      await recordCurrentWorkspaceRecent(name, { openedAt: Date.now() });
      toast(`New workspace · ${name} (no board found yet)`);
      return { data: null, name, sync };
    }
  }

  // ── Browser File System Access API ─────────────────────────────────────────
  try {
    workspaceHandle = await (window as FSAWindow).showDirectoryPicker({ mode: 'readwrite' });
  } catch {
    return null; // user cancelled
  }
  try { await persistWorkspaceHandle(workspaceHandle); } catch (err) { console.warn('Failed to persist workspace handle', err); }
  const result = await getBrowserWorkspaceData(workspaceHandle);
  if (result.data) {
    toast(`Opened workspace · ${result.name}`);
  } else {
    toast(`New workspace · ${result.name} (no board found yet)`);
  }
  await recordCurrentWorkspaceRecent(result.data?.boardTitle ?? result.name, { openedAt: Date.now(), data: result.data });
  return result;
}

/** Creates a new workspace folder in Tauri and optionally seeds it with board data. */
export async function createWorkspace(
  initialData?: BoardData,
  preferredName = 'DevBoard Workspace',
): Promise<{ data: BoardData | null; name: string } | null> {
  if (!IS_TAURI) return null;

  try {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const selected = await save({
      title: 'Create Workspace Folder',
      defaultPath: preferredName,
    });
    if (!selected || typeof selected !== 'string') return null;

    tauriWorkspacePath = selected;
    await tauriFsMkdir(tauriWorkspacePath);

    const name = tauriWorkspacePath.replace(/\\/g, '/').split('/').pop() ?? preferredName;
    if (initialData) {
      await saveWorkspace(initialData);
      return { data: initialData, name };
    }

    toast(`Created workspace · ${name}`);
    await recordCurrentWorkspaceRecent(name, { openedAt: Date.now() });
    return { data: null, name };
  } catch (err) {
    console.warn('createWorkspace failed', err);
    return null;
  }
}

export async function downloadCloudWorkspaceToFolder({
  cloud,
  data,
  onProgress,
}: DownloadCloudWorkspaceOptions): Promise<WorkspaceOpenResult | null> {
  const selectedTitle = cloud.title.trim() || data.boardTitle || 'DevBoard Workspace';
  const startedAt = Date.now();
  const syncedAt = new Date(cloud.updatedAt).getTime();
  const pagesBeforeAssets = materializePages({ ...data, boardTitle: selectedTitle });
  const { documents, notes } = materializeDocuments(data.documents);
  const { pages, assets, missingAssets } = materializePageAssets(pagesBeforeAssets);
  const totalSteps = 3 + pages.length + notes.length + assets.length;
  let completedSteps = 0;
  let warning: string | undefined;

  const emit = (label: string) => {
    onProgress?.({ totalSteps, completedSteps, label, warning });
  };
  const complete = (label: string) => {
    completedSteps += 1;
    emit(label);
  };

  const sync: WorkspaceSyncMetadata = {
    cloudBoardId: cloud.boardId,
    cloudBoardTitle: selectedTitle,
    cloudWorkspaceId: cloud.workspaceId,
    lastSyncedAt: syncedAt,
  };
  const manifest: WorkspaceManifest = {
    title: selectedTitle,
    pages: pages.map((page) => ({
      id: page.id,
      name: page.name,
      layoutMode: page.layoutMode,
      noteSort: page.noteSort,
    })),
    activePageId: data.activePageId && pages.some((page) => page.id === data.activePageId) ? data.activePageId : pages[0]?.id ?? '',
    documents,
    sync,
  };

  emit('Choose an empty folder');

  if (IS_TAURI) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, multiple: false, title: 'Download Workspace To Folder' });
    if (!selected || typeof selected !== 'string') {
      return null;
    }

    const entries = await tauriFsReadDir(selected);
    if (!isDirectoryEffectivelyEmpty(entries)) {
      throw new Error('Choose an empty folder to download this workspace.');
    }

    tauriWorkspacePath = selected;
    setWorkspaceSyncMetadata(sync);
    manifest.sync = workspaceSyncMetadata ?? sync;
    complete('Checked empty folder');

    await tauriFsWriteText(joinPath(selected, 'workspace.json'), JSON.stringify(manifest, null, 2));
    complete('Wrote workspace manifest');

    const pagesDir = joinPath(selected, 'pages');
    await tauriFsMkdir(pagesDir);
    for (const page of pages) {
      await tauriFsWriteText(joinPath(pagesDir, `${page.id}.json`), JSON.stringify({
        name: page.name,
        layoutMode: page.layoutMode,
        noteSort: page.noteSort,
        nodes: page.nodes,
        camera: page.camera,
      }, null, 2));
      complete(`Wrote page "${page.name}"`);
    }

    for (const note of notes) {
      const path = safeRelativePath(note.path);
      if (!path) continue;
      const folder = path.split('/').slice(0, -1).join('/');
      if (folder) await tauriFsMkdir(joinPath(selected, folder));
      await tauriFsWriteText(joinPath(selected, path), note.content);
      complete(`Wrote note "${path.split('/').pop() ?? 'note'}"`);
    }

    for (const asset of assets) {
      const folder = safeRelativePath(asset.folder) ?? 'assets';
      await tauriFsMkdir(joinPath(selected, folder));
      await tauriFsWriteFile(joinPath(selected, folder, asset.name), asset.bytes);
      complete(`Restored asset "${asset.name}"`);
    }

    if (missingAssets > 0) {
      warning = `Downloaded workspace, ${missingAssets} local-only asset${missingAssets === 1 ? '' : 's'} could not be restored.`;
    }

    const result = await readTauriWorkspaceAtPath(selected);
    await recordCurrentWorkspaceRecent(result.data?.boardTitle ?? result.name, { openedAt: startedAt, savedAt: syncedAt, data: result.data });
    complete('Opened downloaded workspace');
    if (warning) toast(warning);
    else toast(`Downloaded workspace · ${result.name}`);
    return result;
  }

  if (!FSA_DIR_SUPPORTED || typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
    return null;
  }

  let selectedHandle: FileSystemDirectoryHandle;
  try {
    selectedHandle = await (window as FSAWindow).showDirectoryPicker({ mode: 'readwrite' });
  } catch {
    return null;
  }

  const entries: Array<{ name: string }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const handle of (selectedHandle as any).values() as AsyncIterable<FileSystemHandle>) {
    entries.push({ name: handle.name });
  }
  if (!isDirectoryEffectivelyEmpty(entries)) {
    throw new Error('Choose an empty folder to download this workspace.');
  }

  workspaceHandle = selectedHandle;
  setWorkspaceSyncMetadata(sync);
  manifest.sync = workspaceSyncMetadata ?? sync;
  complete('Checked empty folder');

  await writeBrowserTextAt(selectedHandle, 'workspace.json', JSON.stringify(manifest, null, 2));
  complete('Wrote workspace manifest');

  for (const page of pages) {
    await writeBrowserTextAt(selectedHandle, `pages/${page.id}.json`, JSON.stringify({
      name: page.name,
      layoutMode: page.layoutMode,
      noteSort: page.noteSort,
      nodes: page.nodes,
      camera: page.camera,
    }, null, 2));
    complete(`Wrote page "${page.name}"`);
  }

  for (const note of notes) {
    await writeBrowserTextAt(selectedHandle, note.path, note.content);
    complete(`Wrote note "${note.path.split('/').pop() ?? 'note'}"`);
  }

  for (const asset of assets) {
    const folder = safeRelativePath(asset.folder) ?? 'assets';
    await writeBrowserBytesAt(selectedHandle, `${folder}/${asset.name}`, asset.bytes);
    complete(`Restored asset "${asset.name}"`);
  }

  if (missingAssets > 0) {
    warning = `Downloaded workspace, ${missingAssets} local-only asset${missingAssets === 1 ? '' : 's'} could not be restored.`;
  }

  try { await persistWorkspaceHandle(selectedHandle); } catch (err) { console.warn('Failed to persist workspace handle', err); }
  const result = await getBrowserWorkspaceData(selectedHandle);
  await recordCurrentWorkspaceRecent(result.data?.boardTitle ?? result.name, { openedAt: startedAt, savedAt: syncedAt, data: result.data });
  complete('Opened downloaded workspace');
  if (warning) toast(warning);
  else toast(`Downloaded workspace · ${result.name}`);
  return result;
}

/** Saves a text file (e.g. Markdown) to a subfolder in the workspace.
 *  Returns true on success. Creates the folder if it doesn't exist. */
export async function saveTextFileToWorkspace(
  folder: string,
  filename: string,
  content: string,
): Promise<boolean> {
  try {
    if (IS_TAURI) {
      if (!tauriWorkspacePath) return false;
      const dir = joinPath(tauriWorkspacePath, folder);
      await tauriFsMkdir(dir);
      await tauriFsWriteText(joinPath(dir, filename), content);
      return true;
    }
    if (!workspaceHandle) return false;
    let dir: FileSystemDirectoryHandle = workspaceHandle;
    for (const part of folder.split('/').filter(Boolean)) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch (err) {
    console.warn('saveTextFileToWorkspace failed', err);
    return false;
  }
}

/** Saves all board data to the open workspace folder. Images stay in assets/. */
export async function saveWorkspace(data: BoardData, options: SaveWorkspaceOptions = {}): Promise<SaveWorkspaceResult> {
  const shouldNotify = options.notify !== false;

  if (IS_TAURI) {
    if (!tauriWorkspacePath) return { saved: false };
    const manifest: WorkspaceManifest = {
      title: data.boardTitle,
      pages: (data.pages ?? []).map((p) => ({ id: p.id, name: p.name, layoutMode: p.layoutMode, noteSort: p.noteSort })),
      activePageId: data.activePageId ?? '',
      documents: data.documents ?? [],
      sync: setWorkspaceSyncMetadata(workspaceSyncMetadata ?? {}) ?? undefined,
    };
    await tauriFsWriteText(joinPath(tauriWorkspacePath, 'workspace.json'), JSON.stringify(manifest, null, 2));
    const pagesDir = joinPath(tauriWorkspacePath, 'pages');
    await tauriFsMkdir(pagesDir);
    for (const page of data.pages ?? []) {
      const pageJson = {
        name: page.name,
        layoutMode: page.layoutMode,
        noteSort: page.noteSort,
        nodes: stripImageSrc(page.nodes),
        camera: page.camera,
      };
      await tauriFsWriteText(joinPath(pagesDir, `${page.id}.json`), JSON.stringify(pageJson, null, 2));
    }
    const name = tauriWorkspacePath.replace(/\\/g, '/').split('/').pop() ?? 'workspace';
    if (shouldNotify) toast(`Saved workspace · ${name}`);
    onSavedCallback?.();
    await recordCurrentWorkspaceRecent(data.boardTitle || name, { savedAt: Date.now(), data });
    return { saved: true, workspaceName: name };
  }

  if (!workspaceHandle) return { saved: false };

  const manifest: WorkspaceManifest = {
    title: data.boardTitle,
    pages: (data.pages ?? []).map((p) => ({ id: p.id, name: p.name, layoutMode: p.layoutMode, noteSort: p.noteSort })),
    activePageId: data.activePageId ?? '',
    documents: data.documents ?? [],
    sync: setWorkspaceSyncMetadata(workspaceSyncMetadata ?? {}) ?? undefined,
  };
  await writeTextFile(workspaceHandle, 'workspace.json', JSON.stringify(manifest, null, 2));

  const pagesDir = await getOrCreateDir(workspaceHandle, 'pages');
  for (const page of data.pages ?? []) {
    const pageJson = {
      name: page.name,
      layoutMode: page.layoutMode,
      noteSort: page.noteSort,
      nodes: stripImageSrc(page.nodes),
      camera: page.camera,
    };
    await writeTextFile(pagesDir, `${page.id}.json`, JSON.stringify(pageJson, null, 2));
  }

  if (shouldNotify) toast(`Saved workspace · ${workspaceHandle.name}`);
  onSavedCallback?.();
  await recordCurrentWorkspaceRecent(data.boardTitle || workspaceHandle.name, { savedAt: Date.now(), data });
  return { saved: true, workspaceName: workspaceHandle.name };
}

/**
 * Lists the entries in a directory relative to workspace root.
 * pathParts = [] means the root itself.
 */
export async function listDirectory(
  pathParts: string[] = []
): Promise<Array<{ name: string; kind: 'file' | 'directory' }>> {
  if (IS_TAURI) {
    if (!tauriWorkspacePath) return [];
    try {
      const dirPath = pathParts.length ? joinPath(tauriWorkspacePath, ...pathParts) : tauriWorkspacePath;
      const entries = await tauriFsReadDir(dirPath);
      return entries.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      });
    } catch (err) {
      console.error('[workspaceManager] listDirectory error:', err);
      throw err;
    }
  }
  if (!workspaceHandle) return [];
  try {
    let dir: FileSystemDirectoryHandle = workspaceHandle;
    for (const part of pathParts) {
      dir = await dir.getDirectoryHandle(part);
    }
    const entries: Array<{ name: string; kind: 'file' | 'directory' }> = [];
    // .values() yields FileSystemHandle objects — name + kind are on each handle
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const handle of (dir as any).values() as AsyncIterable<FileSystemHandle>) {
      entries.push({ name: handle.name, kind: handle.kind as 'file' | 'directory' });
    }
    return entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
  } catch (err) {
    console.error('[workspaceManager] listDirectory error:', err);
    throw err; // let callers surface the error
  }
}

/** Reads a text file relative to the workspace root (e.g. "src/App.tsx"). */
export async function readWorkspaceFile(relativePath: string): Promise<string | null> {
  if (IS_TAURI) {
    if (!tauriWorkspacePath) return null;
    try {
      return await tauriFsReadText(joinPath(tauriWorkspacePath, relativePath.replace(/\\/g, '/')));
    } catch {
      return null;
    }
  }
  if (!workspaceHandle) return null;
  try {
    const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
    let dir: FileSystemDirectoryHandle = workspaceHandle;
    for (const part of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(part);
    }
    const handle = await dir.getFileHandle(parts[parts.length - 1]);
    return (await handle.getFile()).text();
  } catch {
    return null;
  }
}

/**
 * Deletes a file or directory (recursive) at pathParts relative to the workspace root.
 * Throws if the workspace isn't open or deletion fails.
 */
export async function deleteEntry(pathParts: string[]): Promise<void> {
  if (IS_TAURI) {
    if (!tauriWorkspacePath) throw new Error('No workspace open');
    if (pathParts.length === 0) throw new Error('Cannot delete workspace root');
    const path = joinPath(tauriWorkspacePath, ...pathParts);
    const { remove } = await import('@tauri-apps/plugin-fs');
    await remove(path, { recursive: true });
    return;
  }
  if (!workspaceHandle) throw new Error('No workspace open');
  if (pathParts.length === 0) throw new Error('Cannot delete workspace root');
  let parentDir: FileSystemDirectoryHandle = workspaceHandle;
  for (const part of pathParts.slice(0, -1)) {
    parentDir = await parentDir.getDirectoryHandle(part);
  }
  await parentDir.removeEntry(pathParts[pathParts.length - 1], { recursive: true });
}

/**
 * Creates a directory at pathParts relative to the workspace root.
 * Throws if the workspace isn't open or creation fails.
 */
export async function createDirectory(pathParts: string[]): Promise<void> {
  if (IS_TAURI) {
    if (!tauriWorkspacePath) throw new Error('No workspace open');
    await tauriFsMkdir(joinPath(tauriWorkspacePath, ...pathParts));
    return;
  }
  if (!workspaceHandle) throw new Error('No workspace open');
  let dir: FileSystemDirectoryHandle = workspaceHandle;
  for (const part of pathParts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
}

/**
 * Renames a file or directory at pathParts to newName (same parent dir).
 * Uses native FileSystemHandle.move() where available (Chrome 116+);
 * falls back to copy-then-delete for files.
 */
export async function renameEntry(pathParts: string[], newName: string): Promise<void> {
  if (IS_TAURI) {
    if (!tauriWorkspacePath) throw new Error('No workspace open');
    if (pathParts.length === 0) throw new Error('Cannot rename workspace root');
    const parentPath = pathParts.length > 1 ? joinPath(tauriWorkspacePath, ...pathParts.slice(0, -1)) : tauriWorkspacePath;
    const oldPath = joinPath(parentPath, pathParts[pathParts.length - 1]);
    const newPath = joinPath(parentPath, newName);
    await tauriFsRename(oldPath, newPath);
    return;
  }
  if (!workspaceHandle) throw new Error('No workspace open');
  if (pathParts.length === 0) throw new Error('Cannot rename workspace root');

  let parentDir: FileSystemDirectoryHandle = workspaceHandle;
  for (const part of pathParts.slice(0, -1)) {
    parentDir = await parentDir.getDirectoryHandle(part);
  }
  const oldName = pathParts[pathParts.length - 1];

  // ── Try file ──────────────────────────────────────────────────────────────
  let fileHandle: FileSystemFileHandle | null = null;
  try { fileHandle = await parentDir.getFileHandle(oldName); } catch { /* not a file */ }

  if (fileHandle) {
    // Native move() — Chrome 116+
    if ('move' in fileHandle && typeof (fileHandle as Record<string, unknown>).move === 'function') {
      await (fileHandle as unknown as { move(name: string): Promise<void> }).move(newName);
      return;
    }
    // Fallback: copy + delete
    const blob = await fileHandle.getFile();
    const dst = await parentDir.getFileHandle(newName, { create: true });
    const w = await dst.createWritable();
    await w.write(blob);
    await w.close();
    await parentDir.removeEntry(oldName);
    return;
  }

  // ── Try directory ─────────────────────────────────────────────────────────
  let dirHandle: FileSystemDirectoryHandle | null = null;
  try { dirHandle = await parentDir.getDirectoryHandle(oldName); } catch { /* not a dir */ }

  if (dirHandle) {
    if ('move' in dirHandle && typeof (dirHandle as Record<string, unknown>).move === 'function') {
      await (dirHandle as unknown as { move(name: string): Promise<void> }).move(newName);
      return;
    }
    throw new Error('Directory rename requires Chrome 116+ or a newer browser');
  }

  throw new Error(`"${oldName}" not found`);
}

// Local type aliases
type Camera = import('../types').Camera;
