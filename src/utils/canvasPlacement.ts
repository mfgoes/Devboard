/**
 * Utilities for placing files from the workspace explorer onto the canvas.
 */
import { useBoardStore } from '../store/boardStore';
import { CODE_EXTS, CODE_EXTS as codeExts, ext, generateId } from '../components/explorer/fileTreeUtils';
import { readWorkspaceFile, readWorkspaceFileAsUrl, saveWorkspace } from './workspaceManager';
import { markdownToHtml } from './exportMarkdown';
import { CodeBlockNode, DocumentNode, ImageNode } from '../types';

export function canvasCenter() {
  const { camera } = useBoardStore.getState();
  return {
    x: (-camera.x + window.innerWidth / 2) / camera.scale,
    y: (-camera.y + window.innerHeight / 2) / camera.scale,
  };
}

export async function placeCodeFile(pathParts: string[]) {
  const relativePath = pathParts.join('/');
  const content = await readWorkspaceFile(relativePath);
  if (content === null) return;
  const { addNode } = useBoardStore.getState();
  const { x, y } = canvasCenter();
  const e = ext(pathParts[pathParts.length - 1]);
  const language = codeExts[e] ?? 'text';
  const lines = content.split('\n').length;
  const height = Math.min(Math.max(lines * 16, 120), 520);
  addNode({
    id: generateId(),
    type: 'codeblock',
    x: x - 260,
    y: y - height / 2,
    width: 520,
    height,
    code: content,
    language,
    title: pathParts[pathParts.length - 1],
    showLineNumbers: true,
    linkedFile: relativePath,
  } satisfies CodeBlockNode);
}

export async function placeDocumentFile(pathParts: string[]) {
  const { x, y } = canvasCenter();
  await placeDocumentFileAt(pathParts, x, y);
}

export async function placeDocumentFileAt(pathParts: string[], worldX: number, worldY: number) {
  const relativePath = pathParts.join('/');
  const content = await readWorkspaceFile(relativePath);
  if (content === null) return;
  const { addDocument, addNode } = useBoardStore.getState();
  const htmlContent = markdownToHtml(content);
  const titleMatch = content.match(/^#\s+(.+)/m);
  const stem = pathParts[pathParts.length - 1].replace(/\.md$/i, '');
  const title = titleMatch ? titleMatch[1].trim() : stem;
  const docId = addDocument({ title, content: htmlContent, linkedFile: relativePath });
  addNode({
    id: generateId(),
    type: 'document',
    x: worldX - 140,
    y: worldY - 88,
    width: 280,
    height: 176,
    docId,
  } as DocumentNode);
}

export async function placeImageFile(pathParts: string[]) {
  const { x, y } = canvasCenter();
  await placeImageFileAt(pathParts, x, y);
}

export async function placeImageFileAt(pathParts: string[], worldX: number, worldY: number) {
  const relativePath = pathParts.join('/');
  const objectUrl = await readWorkspaceFileAsUrl(relativePath);
  if (!objectUrl) return;
  const { addNode } = useBoardStore.getState();
  const assetName = pathParts[pathParts.length - 1];
  // folder is everything except the filename; empty string = workspace root
  const assetFolder = pathParts.slice(0, -1).join('/');
  const imgEl = new window.Image();
  imgEl.onload = async () => {
    const maxW = 480;
    const w = Math.min(imgEl.width, maxW);
    const h = Math.round(imgEl.height * (w / imgEl.width));
    addNode({
      id: generateId(),
      type: 'image',
      x: worldX - w / 2,
      y: worldY - h / 2,
      width: w,
      height: h,
      src: objectUrl,
      assetName,
      assetFolder,
    } satisfies ImageNode);
    // Persist metadata immediately so assetFolder survives a reload
    setTimeout(() => saveWorkspace(useBoardStore.getState().exportData()), 0);
  };
  imgEl.src = objectUrl;
}
