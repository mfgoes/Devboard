interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Extra secondary-choice buttons rendered below the primary confirm button. */
  extraActions?: Array<{ label: string; onClick: () => void }>;
}

export default function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  extraActions,
}: ConfirmDialogProps) {
  const hasExtras = extraActions && extraActions.length > 0;
  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Dialog */}
      <div className="relative z-10 w-80 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl p-5 flex flex-col gap-4">
        <p className="font-sans text-[13px] text-[var(--c-text-hi)] leading-relaxed">
          {message}
        </p>

        {hasExtras ? (
          /* Multi-choice layout: stacked buttons + cancel at bottom */
          <div className="flex flex-col gap-1.5">
            <button
              onClick={onConfirm}
              className="w-full px-3 h-8 rounded font-sans text-[11px] tracking-wide bg-[var(--c-line)] text-white hover:opacity-80 transition-colors text-left pl-3"
            >
              {confirmLabel}
            </button>
            {extraActions!.map((action) => (
              <button
                key={action.label}
                onClick={action.onClick}
                className="w-full px-3 h-8 rounded font-sans text-[11px] tracking-wide border border-[var(--c-border)] text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors text-left"
              >
                {action.label}
              </button>
            ))}
            <div className="flex justify-end pt-1">
              <button
                onClick={onCancel}
                className="px-3 h-7 rounded font-sans text-[11px] tracking-wide text-[var(--c-text-md)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
              >
                {cancelLabel}
              </button>
            </div>
          </div>
        ) : (
          /* Simple two-button layout */
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="px-3 h-7 rounded font-sans text-[11px] tracking-wide text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className="px-3 h-7 rounded font-sans text-[11px] tracking-wide bg-[var(--c-line)] text-white hover:opacity-80 transition-colors"
            >
              {confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
