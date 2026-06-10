import ModalCloseButton from './ModalCloseButton';

interface Props {
  onClose: () => void;
  onStartWriting?: () => void;
  onStartMapping?: () => void;
  onShowTemplates?: () => void;
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--c-line)]" />
      <path d="M6 8.5l1.5 1.5L10.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--c-line)]" />
    </svg>
  );
}

export default function OnboardingModal({ onClose, onStartWriting, onStartMapping, onShowTemplates }: Props) {
  const handleDontShowAgain = () => {
    localStorage.setItem('devboard-onboarding-dismissed', '1');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative bg-[var(--c-panel)] border border-[var(--c-border)] rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8 font-sans">
        <ModalCloseButton onClick={onClose} className="absolute right-4 top-4" />

        {/* Logo */}
        <div className="mb-6">
          <span className="text-[var(--c-line)] text-[11px] font-semibold tracking-[0.15em] uppercase">
            DevBoard
          </span>
        </div>

        {/* Main heading */}
        <h1 className="text-[var(--c-text-hi)] text-[20px] font-bold leading-tight mb-3">
          Start with notes. Map what matters.
        </h1>

        {/* Tagline */}
        <p className="text-[var(--c-text-lo)] text-[13px] leading-relaxed mb-6">
          A private workspace for connected notes, visual thinking, and local files.
        </p>

        {/* Features grid */}
        <div className="space-y-3 mb-7">
          <div className="flex gap-3">
            <div className="flex-shrink-0"><CheckIcon /></div>
            <div>
              <p className="text-[12px] font-semibold text-[var(--c-text-md)] mb-0.5">Notes that connect</p>
              <p className="text-[11px] text-[var(--c-text-lo)]">Stack pages, wikilinks, backlinks, and focus mode for writing.</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0"><CheckIcon /></div>
            <div>
              <p className="text-[12px] font-semibold text-[var(--c-text-md)] mb-0.5">Visual maps when you need them</p>
              <p className="text-[11px] text-[var(--c-text-lo)]">Switch to canvas pages for flows, systems, and relationships.</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0"><CheckIcon /></div>
            <div>
              <p className="text-[12px] font-semibold text-[var(--c-text-md)] mb-0.5">Local-first, private</p>
              <p className="text-[11px] text-[var(--c-text-lo)]">Lives on your device. No account, no cloud.</p>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex flex-col gap-2 pt-4 border-t border-[var(--c-border)]">
          <button
            onClick={() => (onStartWriting ? onStartWriting() : onClose())}
            className="w-full px-4 py-2.5 bg-[var(--c-line)] hover:opacity-80 text-white text-sm rounded-lg transition-colors font-semibold"
          >
            Start a note
          </button>
          <button
            onClick={() => (onShowTemplates ? onShowTemplates() : onClose())}
            className="w-full px-4 py-2 border border-[var(--c-border)] hover:border-[var(--c-line)] text-[var(--c-text-hi)] text-sm rounded-lg transition-colors font-medium"
          >
            Use a starter workspace
          </button>
          <button
            onClick={() => (onStartMapping ? onStartMapping() : onClose())}
            className="w-full px-4 py-1.5 text-[var(--c-text-lo)] hover:text-[var(--c-text-md)] text-xs rounded-lg transition-colors"
          >
            Map ideas on canvas
          </button>

          {/* Minimalist getting-started hint */}
          <p className="text-[var(--c-text-lo)] text-[11px] text-center mt-2 leading-relaxed">
            Tip: press <kbd className="px-1 py-px rounded border border-[var(--c-border)] text-[10px] font-mono">⌘N</kbd> for a new note · <kbd className="px-1 py-px rounded border border-[var(--c-border)] text-[10px] font-mono">⌘K</kbd> to search
          </p>

          <button
            onClick={handleDontShowAgain}
            className="w-full px-4 py-1 text-[var(--c-text-lo)] hover:text-[var(--c-text-md)] text-[11px] rounded-lg transition-colors mt-1"
          >
            Don't show again
          </button>
        </div>
      </div>
    </div>
  );
}
