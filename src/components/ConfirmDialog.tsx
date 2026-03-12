interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}

export default function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
}: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Dialog */}
      <div className="relative z-10 w-80 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl p-5 flex flex-col gap-4">
        <p className="font-mono text-[13px] text-[var(--c-text-hi)] leading-relaxed">
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 h-7 rounded font-mono text-[11px] tracking-wide text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-3 h-7 rounded font-mono text-[11px] tracking-wide bg-[#6366f1] text-white hover:bg-[#4f46e5] transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
