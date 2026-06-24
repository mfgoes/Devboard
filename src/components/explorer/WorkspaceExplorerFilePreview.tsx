import { DOC_EXTS, ext, fileColor, formatSize, type TreeEntry } from './fileTreeUtils';
import { FONTS } from '../../utils/fonts';

type FilePreview =
  | { kind: 'image'; entry: TreeEntry; url: string; natW: number; natH: number; size: number; anchorY: number }
  | { kind: 'code'; entry: TreeEntry; content: string; anchorY: number };

interface WorkspaceExplorerFilePreviewProps {
  preview: FilePreview;
  panelRect: DOMRect | null;
  workspaceWidth: number;
  isDark: boolean;
}

export default function WorkspaceExplorerFilePreview({
  preview,
  panelRect,
  workspaceWidth,
  isDark,
}: WorkspaceExplorerFilePreviewProps) {
  const previewW = 240;
  const panelLeft = panelRect?.left ?? 0;
  const panelRight = panelRect?.right ?? workspaceWidth;
  const spaceRight = window.innerWidth - (panelRight + 8);
  const left = spaceRight >= previewW ? panelRight + 8 : Math.max(8, panelLeft - previewW - 8);
  const top = Math.max(8, Math.min(preview.anchorY - 80, window.innerHeight - 260));

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top,
        width: previewW,
        maxHeight: 340,
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
        <span style={{ fontFamily: FONTS.ui, fontSize: 10, fontWeight: 700, color: fileColor(preview.entry.name, isDark) }}>
          {preview.entry.name}
        </span>
        <span style={{ fontFamily: FONTS.ui, fontSize: 9, color: 'var(--c-text-off)', marginLeft: 6 }}>
          {preview.entry.path.slice(0, -1).join('/')}
        </span>
      </div>

      {preview.kind === 'image' ? (
        <>
          <div style={{ background: 'rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80, maxHeight: 180, overflow: 'hidden', flexShrink: 0 }}>
            <img src={preview.url} style={{ maxWidth: '100%', maxHeight: 180, display: 'block', objectFit: 'contain' }} alt="" />
          </div>
          <div style={{ padding: '7px 10px', display: 'flex', gap: 10, flexShrink: 0 }}>
            <span style={{ fontFamily: FONTS.ui, fontSize: 10, fontWeight: 600, color: 'var(--c-text-hi)' }}>{preview.natW} × {preview.natH}</span>
            <span style={{ fontFamily: FONTS.ui, fontSize: 10, color: 'var(--c-text-off)' }}>{formatSize(preview.size)}</span>
          </div>
        </>
      ) : (
        <div style={{ overflow: 'auto', flex: 1, padding: '6px 0' }}>
          <pre style={{ margin: 0, padding: '0 10px', fontFamily: FONTS.ui, fontSize: 10, lineHeight: 1.5, color: 'var(--c-text-hi)', whiteSpace: 'pre', tabSize: 2 }}>
            {preview.content.split('\n').slice(0, 40).join('\n')}
            {preview.content.split('\n').length > 40 && '\n…'}
          </pre>
        </div>
      )}

      <div style={{ padding: '5px 10px', borderTop: '1px solid var(--c-border)', flexShrink: 0 }}>
        <span style={{ fontFamily: FONTS.ui, fontSize: 9, color: 'var(--c-text-off)' }}>
          {DOC_EXTS.has(ext(preview.entry.name))
            ? 'double-click or ↵ to open note · drag to place'
            : 'double-click or ↵ to place on canvas'}
        </span>
      </div>
    </div>
  );
}
