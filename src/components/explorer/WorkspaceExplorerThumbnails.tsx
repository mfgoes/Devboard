import { type CanvasNode, type Document } from '../../types';
import { FONTS } from '../../utils/fonts';
import { relativeTime, wordCountFromPreviewText } from './workspaceExplorerUtils';
import { stripHtmlPreview } from '../../utils/documentExport';
import PageMiniMap from './PageMiniMap';

function canvasNodeSummary(nodes: CanvasNode[]): string {
  const visibleNodes = nodes.filter((node) => node.type !== 'connector');
  const counts: Array<[string, number]> = [
    ['note', visibleNodes.filter((node) => node.type === 'sticky').length],
    ['doc', visibleNodes.filter((node) => node.type === 'document').length],
    ['shape', visibleNodes.filter((node) => node.type === 'shape').length],
    ['image', visibleNodes.filter((node) => node.type === 'image' || node.type === 'sticker').length],
    ['task', visibleNodes.filter((node) => node.type === 'taskcard').length],
    ['code', visibleNodes.filter((node) => node.type === 'codeblock').length],
  ];
  const summaryParts = counts
    .filter(([, count]) => count > 0)
    .slice(0, 3)
    .map(([label, count]) => `${count} ${label}${count === 1 ? '' : 's'}`);

  return summaryParts.length ? summaryParts.join(' · ') : 'Empty canvas';
}

function canvasPreviewText(nodes: CanvasNode[]): string {
  for (const node of nodes) {
    if (node.type === 'sticky' && node.text.trim()) return node.text.trim();
    if (node.type === 'textblock' && node.text.trim()) return node.text.trim();
    if (node.type === 'section' && node.name.trim()) return node.name.trim();
    if (node.type === 'taskcard' && node.title.trim()) return node.title.trim();
    if (node.type === 'codeblock' && node.title.trim()) return node.title.trim();
    if (node.type === 'link' && (node.title?.trim() || node.url.trim())) return node.title?.trim() || node.url.trim();
  }
  return '';
}

export function NoteHoverThumbnail({ doc, pageName }: { doc: Document; pageName: string }) {
  const plain = stripHtmlPreview(doc.content);
  const wordCount = wordCountFromPreviewText(plain);
  const meta = [
    pageName,
    relativeTime(doc.updatedAt),
    `${wordCount} ${wordCount === 1 ? 'word' : 'words'}`,
  ].filter(Boolean).join(' · ');

  return (
    <div
      style={{
        padding: '9px 10px 8px',
        overflow: 'hidden',
        color: 'var(--c-text-hi)',
      }}
    >
      <div style={{ fontFamily: FONTS.ui, fontSize: 11.5, fontWeight: 600, lineHeight: 1.25, color: 'var(--c-text-hi)', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {(doc.title || 'Untitled note').slice(0, 70)}
      </div>
      <div
        style={{
          fontFamily: FONTS.ui,
          fontSize: 10.5,
          fontWeight: 500,
          lineHeight: 1.4,
          color: 'var(--c-text-md)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {plain || 'No preview text yet'}
      </div>
      <div style={{ marginTop: 7, fontFamily: FONTS.ui, fontSize: 9, fontWeight: 500, lineHeight: 1.3, color: 'var(--c-text-off)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {meta}
      </div>
    </div>
  );
}

export function CanvasHoverThumbnail({ doc, pageName, nodes }: { doc: Document; pageName: string; nodes: CanvasNode[] }) {
  const visibleNodeCount = nodes.filter((node) => node.type !== 'connector').length;
  const connectorCount = nodes.filter((node) => node.type === 'connector').length;
  const preview = canvasPreviewText(nodes);
  const meta = [
    pageName,
    relativeTime(doc.updatedAt),
    `${visibleNodeCount} ${visibleNodeCount === 1 ? 'item' : 'items'}`,
    connectorCount ? `${connectorCount} ${connectorCount === 1 ? 'connector' : 'connectors'}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <div style={{ overflow: 'hidden', color: 'var(--c-text-hi)' }}>
      <div style={{ padding: '9px 10px 7px', borderBottom: '1px solid var(--c-border)' }}>
        <div style={{ fontFamily: FONTS.ui, fontSize: 11.5, fontWeight: 700, lineHeight: 1.25, color: 'var(--c-text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {doc.title || 'Untitled canvas'}
        </div>
        <div style={{ marginTop: 4, fontFamily: FONTS.ui, fontSize: 9.5, fontWeight: 600, lineHeight: 1.3, color: 'var(--c-text-off)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meta}
        </div>
      </div>
      <div style={{ height: 118, background: 'linear-gradient(180deg, rgba(212,131,90,0.08), rgba(212,131,90,0.02))', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {nodes.length > 0 ? (
          <PageMiniMap nodes={nodes} />
        ) : (
          <div style={{ fontFamily: FONTS.ui, fontSize: 10.5, fontWeight: 650, color: 'var(--c-text-lo)' }}>
            Empty canvas
          </div>
        )}
      </div>
      <div style={{ padding: '8px 10px 9px' }}>
        <div style={{ fontFamily: FONTS.ui, fontSize: 10.5, fontWeight: 650, lineHeight: 1.35, color: 'var(--c-text-md)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {preview || canvasNodeSummary(nodes)}
        </div>
      </div>
    </div>
  );
}

