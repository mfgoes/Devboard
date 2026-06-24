import ModalCloseButton from '../ModalCloseButton';
import { FONTS } from '../../utils/fonts';

interface PreferenceItem {
  label: string;
  detail: string;
  enabled: boolean;
  onToggle: () => void;
}

interface WorkspaceExplorerPreferencesDialogProps {
  open: boolean;
  onClose: () => void;
  items: PreferenceItem[];
}

export default function WorkspaceExplorerPreferencesDialog({
  open,
  onClose,
  items,
}: WorkspaceExplorerPreferencesDialogProps) {
  if (!open) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.42)' }}
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-title"
        style={{
          width: 360,
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--c-border)' }}>
          <div>
            <h2 id="preferences-title" style={{ margin: 0, fontSize: 15, lineHeight: 1.2, color: 'var(--c-text-hi)', fontWeight: 750 }}>
              Preferences
            </h2>
          </div>
          <ModalCloseButton onClick={onClose} ariaLabel="Close preferences" />
        </div>

        <div style={{ padding: 8 }}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              aria-pressed={item.enabled}
              onClick={item.onToggle}
              style={{
                width: '100%',
                minHeight: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 14,
                padding: '8px 10px',
                border: 'none',
                borderRadius: 10,
                background: 'transparent',
                color: 'var(--c-text-hi)',
                cursor: 'pointer',
                fontFamily: FONTS.ui,
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--c-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--c-text-hi)' }}>
                  {item.label}
                </span>
                <span style={{ display: 'block', marginTop: 2, fontSize: 10.5, fontWeight: 600, color: 'var(--c-text-lo)' }}>
                  {item.detail}
                </span>
              </span>
              <span
                aria-hidden="true"
                style={{
                  width: 34,
                  height: 20,
                  flexShrink: 0,
                  borderRadius: 999,
                  border: item.enabled ? '1px solid var(--c-line)' : '1px solid var(--c-border)',
                  background: item.enabled ? 'var(--c-line)' : 'var(--c-hover)',
                  position: 'relative',
                  transition: 'background 120ms, border-color 120ms',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: item.enabled ? 16 : 2,
                    width: 14,
                    height: 14,
                    borderRadius: 999,
                    background: item.enabled ? '#fff' : 'var(--c-text-lo)',
                    transition: 'left 120ms, background 120ms',
                  }}
                />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
