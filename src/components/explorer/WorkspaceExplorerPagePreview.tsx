import { type CanvasNode, type Document, type PageMeta } from '../../types';
import { FONTS } from '../../utils/fonts';
import { stripHtmlPreview } from '../../utils/documentExport';
import PageMiniMap from './PageMiniMap';

export type PagePreview = {
  kind: 'page';
  page: PageMeta;
  docs: Document[];
  nodes: CanvasNode[];
  anchorY: number;
};

interface WorkspaceExplorerPagePreviewProps {
  preview: PagePreview;
  panelRect: DOMRect | null;
  workspaceWidth: number;
}

export default function WorkspaceExplorerPagePreview({
  preview,
  panelRect,
  workspaceWidth,
}: WorkspaceExplorerPagePreviewProps) {
  const previewW = 240;
  const panelLeft = panelRect?.left ?? 0;
  const panelRight = panelRect?.right ?? workspaceWidth;
  const spaceRight = window.innerWidth - (panelRight + 8);
  const left = spaceRight >= previewW ? panelRight + 8 : Math.max(8, panelLeft - previewW - 8);
  const top = Math.max(8, Math.min(preview.anchorY - 80, window.innerHeight - 320));
  const noteCount = preview.docs.length;
  const canvasNodeCount = preview.nodes.filter((node) => node.type !== 'connector').length;
  const previewDocs = preview.docs.slice(0, 3);

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top,
        width: previewW,
        maxHeight: 360,
        zIndex: 200,
        borderRadius: 10,
        border: '1px solid var(--c-border)',
        background: 'var(--c-panel)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.36)',
        overflow: 'hidden',
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '7px 10px', borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
        <span style={{ fontFamily: FONTS.ui, fontSize: 10, fontWeight: 700, color: 'var(--c-text-hi)' }}>
          {preview.page.name}
        </span>
        <span style={{ fontFamily: FONTS.ui, fontSize: 9, color: 'var(--c-text-off)', marginLeft: 6 }}>
          folder
        </span>
      </div>
      <div style={{ padding: 8, borderBottom: '1px solid var(--c-border)', background: 'linear-gradient(180deg, rgba(212,131,90,0.08), rgba(212,131,90,0.02))' }}>
        <PageMiniMap nodes={preview.nodes} />
      </div>
      <div style={{ padding: '8px 10px', display: 'flex', gap: 10, flexShrink: 0 }}>
        <span style={{ fontFamily: FONTS.ui, fontSize: 10, fontWeight: 600, color: 'var(--c-text-hi)' }}>{canvasNodeCount} nodes</span>
        <span style={{ fontFamily: FONTS.ui, fontSize: 10, color: 'var(--c-text-off)' }}>{noteCount} notes</span>
      </div>
      {previewDocs.length > 0 && (
        <div style={{ padding: '0 10px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {previewDocs.map((doc) => (
            <div key={doc.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontFamily: FONTS.ui, fontSize: 9.5, fontWeight: 700, color: 'var(--c-text-hi)' }}>
                {doc.title || 'Untitled note'}
              </span>
              <span style={{ fontFamily: FONTS.ui, fontSize: 9.5, color: 'var(--c-text-lo)', lineHeight: 1.4 }}>
                {(stripHtmlPreview(doc.content) || 'No preview text yet').slice(0, 78)}
              </span>
            </div>
          ))}
        </div>
      )}
      <div style={{ padding: '5px 10px', borderTop: '1px solid var(--c-border)', flexShrink: 0 }}>
        <span style={{ fontFamily: FONTS.ui, fontSize: 9, color: 'var(--c-text-off)' }}>
          press ↵ to open folder overview
        </span>
      </div>
    </div>
  );
}

