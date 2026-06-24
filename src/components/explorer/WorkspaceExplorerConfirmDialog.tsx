import type { ReactNode } from 'react';

import { FONTS } from '../../utils/fonts';

interface WorkspaceExplorerConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmBackground: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function WorkspaceExplorerConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmBackground,
  onConfirm,
  onCancel,
}: WorkspaceExplorerConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 24px', maxWidth: 340, boxShadow: '0 16px 48px rgba(0,0,0,0.4)' }}>
        <p style={{ fontFamily: FONTS.ui, fontSize: 12, fontWeight: 700, color: 'var(--c-text-hi)', margin: '0 0 8px' }}>
          {title}
        </p>
        <div style={{ fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-lo)', margin: '0 0 16px', lineHeight: 1.5 }}>
          {children}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onConfirm}
            style={{ flex: 1, padding: '7px 0', background: confirmBackground, border: 'none', borderRadius: 8, fontFamily: FONTS.ui, fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: '7px 0', background: 'var(--c-hover)', border: 'none', borderRadius: 8, fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-hi)', cursor: 'pointer' }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
