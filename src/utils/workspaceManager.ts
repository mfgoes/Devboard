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

type FSAWindow = Window & typeof globalThis & {
  showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
};

let workspaceHandle: FileSystemDirectoryHandle | null = null;
let onSavedCallback: (() => void) | null = null;

/** Register a callback that fires after every successful saveWorkspace call. */
export function setOnWorkspaceSavedCallback(fn: () => void): void {
  onSavedCallback = fn;
}
const WORKSPACE_DB = 'devboard-workspace';
const WORKSPACE_STORE = 'handles';
const WORKSPACE_KEY = 'last-workspace';

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

export function clearWorkspaceHandle(): void {
  workspaceHandle = null;
  tauriWorkspacePath = null;
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

async function getBrowserWorkspaceData(dirHandle: FileSystemDirectoryHandle): Promise<{ data: BoardData | null; name: string }> {
  const name = dirHandle.name;

  try {
    const manifestHandle = await dirHandle.getFileHandle('workspace.json');
    const manifest = JSON.parse(await (await manifestHandle.getFile()).text()) as WorkspaceManifest;

    const pagesDir = await dirHandle.getDirectoryHandle('pages');

    // Load all pages
    const pages: Array<{ id: string; name: string; nodes: CanvasNode[]; camera: Camera }> = [];
    for (const pageMeta of manifest.pages) {
      try {
        const pageHandle = await pagesDir.getFileHandle(`${pageMeta.id}.json`);
        const pageData = JSON.parse(await (await pageHandle.getFile()).text());
        pages.push({
          ...pageMeta,
          nodes: pageData.nodes ?? [],
          camera: pageData.camera ?? { x: 0, y: 0, scale: 1 },
        });
      } catch {
        pages.push({ ...pageMeta, nodes: [], camera: { x: 0, y: 0, scale: 1 } });
      }
    }

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
      boardTitle: manifest.title,
      pages,
      activePageId: manifest.activePageId,
      nodes: [],
      documents: manifest.documents ?? [],
    };
    return { data, name };
  } catch {
    return { data: null, name };
  }
}

export async function restoreWorkspace(): Promise<{ data: BoardData | null; name: string } | null> {
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
    return await getBrowserWorkspaceData(stored);
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
  pages: Array<{ id: string; name: string }>;
  activePageId: string;
  documents?: Document[];
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
export async function openWorkspace(): Promise<{ data: BoardData | null; name: string } | null> {
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
      const pagesDir = joinPath(tauriWorkspacePath!, 'pages');

      const pages: Array<{ id: string; name: string; nodes: CanvasNode[]; camera: Camera }> = [];
      for (const pageMeta of manifest.pages) {
        try {
          const pageText = await tauriFsReadText(joinPath(pagesDir, `${pageMeta.id}.json`));
          const pageData = JSON.parse(pageText);
          pages.push({ ...pageMeta, nodes: pageData.nodes ?? [], camera: pageData.camera ?? { x: 0, y: 0, scale: 1 } });
        } catch {
          pages.push({ ...pageMeta, nodes: [], camera: { x: 0, y: 0, scale: 1 } });
        }
      }

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

      toast(`Opened workspace · ${name}`);
      return { data: { boardTitle: manifest.title, pages, activePageId: manifest.activePageId, nodes: [], documents: manifest.documents ?? [] }, name };
    } catch {
      toast(`New workspace · ${name} (no board found yet)`);
      return { data: null, name };
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
    return { data: null, name };
  } catch (err) {
    console.warn('createWorkspace failed', err);
    return null;
  }
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
export async function saveWorkspace(data: BoardData): Promise<void> {
  if (IS_TAURI) {
    if (!tauriWorkspacePath) return;
    const manifest: WorkspaceManifest = {
      title: data.boardTitle,
      pages: (data.pages ?? []).map((p) => ({ id: p.id, name: p.name })),
      activePageId: data.activePageId ?? '',
      documents: data.documents ?? [],
    };
    await tauriFsWriteText(joinPath(tauriWorkspacePath, 'workspace.json'), JSON.stringify(manifest, null, 2));
    const pagesDir = joinPath(tauriWorkspacePath, 'pages');
    await tauriFsMkdir(pagesDir);
    for (const page of data.pages ?? []) {
      const pageJson = { nodes: stripImageSrc(page.nodes), camera: page.camera };
      await tauriFsWriteText(joinPath(pagesDir, `${page.id}.json`), JSON.stringify(pageJson, null, 2));
    }
    const name = tauriWorkspacePath.replace(/\\/g, '/').split('/').pop() ?? 'workspace';
    toast(`Saved workspace · ${name}`);
    onSavedCallback?.();
    return;
  }

  if (!workspaceHandle) return;

  const manifest: WorkspaceManifest = {
    title: data.boardTitle,
    pages: (data.pages ?? []).map((p) => ({ id: p.id, name: p.name })),
    activePageId: data.activePageId ?? '',
    documents: data.documents ?? [],
  };
  await writeTextFile(workspaceHandle, 'workspace.json', JSON.stringify(manifest, null, 2));

  const pagesDir = await getOrCreateDir(workspaceHandle, 'pages');
  for (const page of data.pages ?? []) {
    const pageJson = {
      nodes: stripImageSrc(page.nodes),
      camera: page.camera,
    };
    await writeTextFile(pagesDir, `${page.id}.json`, JSON.stringify(pageJson, null, 2));
  }

  toast(`Saved workspace · ${workspaceHandle.name}`);
  onSavedCallback?.();
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
