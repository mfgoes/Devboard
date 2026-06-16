import type { Document, PageMeta } from '../../types';

export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;
  return new Date(ms).toLocaleDateString();
}

export function sortDocumentsForExplorer(docs: Document[], sortMode: PageMeta['noteSort'] = 'updated'): Document[] {
  if (sortMode === 'custom') {
    return [...docs].sort((a, b) => {
      if (a.orderIndex != null && b.orderIndex != null) return a.orderIndex - b.orderIndex;
      if (a.orderIndex != null) return -1;
      if (b.orderIndex != null) return 1;
      return b.updatedAt - a.updatedAt;
    });
  }
  return [...docs].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function isCanvasDocument(doc: Document): boolean {
  return doc.docType === 'canvas';
}

export function wordCountFromPreviewText(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}
