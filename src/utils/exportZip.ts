/**
 * Exports a board as a .zip file containing:
 *   board.json        — board data with image nodes using assetName references (no base64)
 *   assets/<name>     — actual image files extracted from base64 src fields
 *   notes/<name>.md   — individual note files exported as Markdown
 */
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { BoardData, CanvasNode, Document } from '../types';
import { generateMarkdownFilename, htmlToMarkdown } from './exportMarkdown';

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

function mimeToExt(dataUrl: string): string {
  const mime = dataUrl.match(/data:([^;]+)/)?.[1] ?? '';
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
  };
  return map[mime] ?? '.png';
}

function stripImageSrc(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.map((n) => {
    if (n.type === 'image' && n.assetName) return { ...n, src: '' };
    return n;
  });
}

function documentToMarkdownFile(doc: Document): string {
  const parts: string[] = [];
  if (doc.title) {
    parts.push(`# ${doc.title}`);
    parts.push('');
  }
  if (doc.content) parts.push(htmlToMarkdown(doc.content));
  return `${parts.join('\n').trimEnd()}\n`;
}

function uniqueNotePath(doc: Document, usedPaths: Set<string>): string {
  const linked = doc.linkedFile?.trim();
  const preferred = linked && linked.toLowerCase().startsWith('notes/')
    ? linked
    : `notes/${generateMarkdownFilename(doc.title)}`;

  const dot = preferred.lastIndexOf('.');
  const stem = dot >= 0 ? preferred.slice(0, dot) : preferred;
  const ext = dot >= 0 ? preferred.slice(dot) : '.md';

  let candidate = preferred;
  let counter = 2;
  while (usedPaths.has(candidate.toLowerCase())) {
    candidate = `${stem}-${counter}${ext}`;
    counter += 1;
  }
  usedPaths.add(candidate.toLowerCase());
  return candidate;
}

export async function exportBoardAsZip(data: BoardData, title: string): Promise<void> {
  const zip = new JSZip();
  const assets = zip.folder('assets')!;
  const notesFolder = zip.folder('notes')!;
  const assetsSeen = new Map<string, true>();
  const notePaths = new Set<string>();

  // Collect all image nodes across all pages
  const allPageNodes = (data.pages ?? []).flatMap((p) => p.nodes).concat(data.nodes ?? []);
  for (const node of allPageNodes) {
    if (node.type !== 'image' || !node.src || !node.src.startsWith('data:')) continue;
    const assetName = node.assetName ?? `image-${node.id}${mimeToExt(node.src)}`;
    if (!assetsSeen.has(assetName)) {
      assetsSeen.set(assetName, true);
      assets.file(assetName, dataUrlToBlob(node.src));
    }
  }

  // Write board.json with src stripped (assetName stays)
  const strippedData: BoardData = {
    ...data,
    nodes: stripImageSrc(data.nodes ?? []),
    pages: data.pages?.map((p) => ({ ...p, nodes: stripImageSrc(p.nodes) })),
  };
  zip.file('board.json', JSON.stringify(strippedData, null, 2));

  for (const doc of data.documents ?? []) {
    const notePath = uniqueNotePath(doc, notePaths);
    const relativePath = notePath.replace(/^notes\//i, '');
    notesFolder.file(relativePath, documentToMarkdownFile(doc));
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  saveAs(blob, `${title.replace(/\s+/g, '_')}.devboard.zip`);
}
