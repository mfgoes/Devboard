import { type CanvasNode, type Document, type PageMeta } from '../../types';
import { FONTS } from '../../utils/fonts';
import { isCanvasDocument } from './workspaceExplorerUtils';
import { NoteHoverThumbnail, CanvasHoverThumbnail } from './WorkspaceExplorerThumbnails';

export type NotePreview = {
  kind: 'note';
  page: PageMeta;
  doc: Document;
  anchorY: number;
};

interface WorkspaceExplorerNotePreviewProps {
  preview: NotePreview;
  panelRect: DOMRect | null;
  workspaceWidth: number;
  getPageNodes: (pageId: string) => CanvasNode[];
}

export default function WorkspaceExplorerNotePreview({
  preview,
  panelRect,
  workspaceWidth,
  getPageNodes,
}: WorkspaceExplorerNotePreviewProps) {
  const previewW = 240;
  const panelLeft = panelRect?.left ?? 0;
  const panelRight = panelRect?.right ?? workspaceWidth;
  const spaceRight = window.innerWidth - (panelRight + 8);
  const left = spaceRight >= previewW ? panelRight + 8 : Math.max(8, panelLeft - previewW - 8);
  const isCanvasPreview = isCanvasDocument(preview.doc);
  const canvasNodes = isCanvasPreview && preview.doc.canvasPageId ? getPageNodes(preview.doc.canvasPageId) : [];
  const previewHeight = isCanvasPreview ? 250 : 140;
  const top = Math.max(8, Math.min(preview.anchorY - 48, window.innerHeight - previewHeight));

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top,
        width: previewW,
        zIndex: 200,
        borderRadius: 8,
        border: '1px solid var(--c-border)',
        background: 'var(--c-panel)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {isCanvasPreview ? (
        <CanvasHoverThumbnail doc={preview.doc} pageName={preview.page.name} nodes={canvasNodes} />
      ) : (
        <NoteHoverThumbnail doc={preview.doc} pageName={preview.page.name} />
      )}
    </div>
  );
}
