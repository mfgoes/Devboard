/**
 * Workspace folder support via File System Access API.
 *
 * Folder structure:
 *   workspace/
 *     workspace.json       ← manifest: { title, pages, activePageId }
 *     pages/
 *       <id>.json          ← { nodes (no image src), camera }
 *     assets/
 *       <uniqueName>.png   ← actual image files (no base64 in JSON)
 */
import { BoardData, CanvasNode } from '../types';
import { toast } from './toast';

type FSAWindow = Window & typeof globalThis & {
  showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
};

let workspaceHandle: FileSystemDirectoryHandle | null = null;

/** True when the browser supports folder picking (Chrome, Edge, desktop Tauri webview). */
export const FSA_DIR_SUPPORTED =
  typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export function getWorkspaceName(): string | null {
  return workspaceHandle?.name ?? null;
}

export function clearWorkspaceHandle(): void {
  workspaceHandle = null;
}

interface WorkspaceManifest {
  title: string;
  pages: Array<{ id: string; name: string }>;
  activePageId: string;
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

/** Load an image from workspace/assets/ and return a blob object URL. */
export async function loadImageAsset(assetName: string): Promise<string | null> {
  if (!workspaceHandle) return null;
  try {
    const assetsDir = await workspaceHandle.getDirectoryHandle('assets');
    const fileHandle = await assetsDir.getFileHandle(assetName);
    const file = await fileHandle.getFile();
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

/** Load any file from the workspace by relative path and return a blob object URL + file size. */
export async function readWorkspaceFileInfo(relativePath: string): Promise<{ url: string; size: number } | null> {
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

/** Save an image File (or Blob) to workspace/assets/. */
export async function saveImageAsset(assetName: string, data: File | Blob): Promise<void> {
  if (!workspaceHandle) return;
  try {
    const assetsDir = await getOrCreateDir(workspaceHandle, 'assets');
    const handle = await assetsDir.getFileHandle(assetName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
  } catch (err) {
    console.warn('Failed to save image asset', err);
  }
}

/**
 * Opens a directory picker, loads workspace.json + page files.
 * Returns null if cancelled or if a new (empty) workspace was picked.
 */
export async function openWorkspace(): Promise<{ data: BoardData | null; name: string } | null> {
  if (!FSA_DIR_SUPPORTED) {
    toast('Open Folder requires Chrome, Edge, or the desktop app');
    return null;
  }
  try {
    workspaceHandle = await (window as FSAWindow).showDirectoryPicker({ mode: 'readwrite' });
  } catch {
    return null; // user cancelled
  }

  const name = workspaceHandle.name;

  try {
    const manifestHandle = await workspaceHandle.getFileHandle('workspace.json');
    const manifest = JSON.parse(await (await manifestHandle.getFile()).text()) as WorkspaceManifest;

    const pagesDir = await workspaceHandle.getDirectoryHandle('pages');

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

    // Populate src for image nodes from assets/
    for (const page of pages) {
      for (const node of page.nodes) {
        if (node.type === 'image' && node.assetName && !node.src) {
          const url = await loadImageAsset(node.assetName);
          if (url) (node as { src: string }).src = url;
        }
      }
    }

    toast(`Opened workspace · ${name}`);
    const data: BoardData = {
      boardTitle: manifest.title,
      pages,
      activePageId: manifest.activePageId,
      nodes: [],
    };
    return { data, name };
  } catch {
    toast(`New workspace · ${name} (no board found yet)`);
    return { data: null, name };
  }
}

/** Saves all board data to the open workspace folder. Images stay in assets/. */
export async function saveWorkspace(data: BoardData): Promise<void> {
  if (!workspaceHandle) return;

  const manifest: WorkspaceManifest = {
    title: data.boardTitle,
    pages: (data.pages ?? []).map((p) => ({ id: p.id, name: p.name })),
    activePageId: data.activePageId ?? '',
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
}

/**
 * Lists the entries in a directory relative to workspace root.
 * pathParts = [] means the root itself.
 */
export async function listDirectory(
  pathParts: string[] = []
): Promise<Array<{ name: string; kind: 'file' | 'directory' }>> {
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

// Local type aliases
type Camera = import('../types').Camera;
