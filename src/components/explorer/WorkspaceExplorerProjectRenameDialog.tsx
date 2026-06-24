import { FONTS } from '../../utils/fonts';

interface WorkspaceExplorerProjectRenameDialogProps {
  open: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function WorkspaceExplorerProjectRenameDialog({
  open,
  draft,
  onDraftChange,
  onConfirm,
  onCancel,
}: WorkspaceExplorerProjectRenameDialogProps) {
  if (!open) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.42)' }}
      onMouseDown={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-project-title"
        style={{
          width: 340,
          maxWidth: 'calc(100vw - 28px)',
          border: '1px solid var(--c-border)',
          borderRadius: 14,
          background: 'var(--c-panel)',
          boxShadow: '0 18px 56px rgba(0,0,0,0.34)',
          fontFamily: FONTS.ui,
          overflow: 'hidden',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--c-border)' }}>
          <h2 id="rename-project-title" style={{ margin: 0, fontSize: 15, lineHeight: 1.2, color: 'var(--c-text-hi)', fontWeight: 750 }}>
            Rename project
          </h2>
        </div>
        <div style={{ padding: 16 }}>
          <input
            autoFocus
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onConfirm();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
              }
            }}
            style={{
              width: '100%',
              height: 34,
              padding: '0 10px',
              border: '1px solid var(--c-border)',
              borderRadius: 8,
              background: 'var(--c-canvas)',
              color: 'var(--c-text-hi)',
              outline: 'none',
              fontFamily: FONTS.ui,
              fontSize: 12,
              fontWeight: 650,
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!draft.trim()}
              style={{ flex: 1, height: 32, border: 'none', borderRadius: 8, background: draft.trim() ? 'var(--c-line)' : 'var(--c-hover)', color: draft.trim() ? '#fff' : 'var(--c-text-lo)', cursor: draft.trim() ? 'pointer' : 'default', fontFamily: FONTS.ui, fontSize: 11, fontWeight: 750 }}
            >
              Rename
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{ flex: 1, height: 32, border: 'none', borderRadius: 8, background: 'var(--c-hover)', color: 'var(--c-text-hi)', cursor: 'pointer', fontFamily: FONTS.ui, fontSize: 11, fontWeight: 650 }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
