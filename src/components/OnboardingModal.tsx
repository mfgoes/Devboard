interface Props {
  onClose: () => void;
}

export default function OnboardingModal({ onClose }: Props) {
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
      <div className="bg-[var(--c-panel)] border border-[var(--c-border)] rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8 font-sans">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--c-text-md)] hover:text-[var(--c-text-hi)] text-xl leading-none transition-colors"
          aria-label="Close"
        >
          ×
        </button>

        {/* Logo */}
        <div className="mb-6">
          <span className="text-[var(--c-line)] text-[11px] font-semibold tracking-[0.15em] uppercase">
            DevBoard
          </span>
        </div>

        {/* Main heading */}
        <h1 className="text-[var(--c-text-hi)] text-[20px] font-bold leading-tight mb-3">
          An infinite canvas for your thinking
        </h1>

        {/* Tagline */}
        <p className="text-[var(--c-text-lo)] text-[13px] leading-relaxed mb-6">
          Build worlds, map ideas, design systems — all in one place.
        </p>

        {/* Features grid */}
        <div className="space-y-3 mb-7">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5">
                <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--c-line)]" />
                <path d="M6 8.5l1.5 1.5L10.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--c-line)]" />
              </svg>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-[var(--c-text-md)] mb-0.5">Local-first, no account</p>
              <p className="text-[11px] text-[var(--c-text-lo)]">Everything lives on your device. No sign-ups, no cloud.</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5">
                <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--c-line)]" />
                <path d="M6 8.5l1.5 1.5L10.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--c-line)]" />
              </svg>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-[var(--c-text-md)] mb-0.5">Multi-page canvases</p>
              <p className="text-[11px] text-[var(--c-text-lo)]">Organize with a file browser. Switch between projects instantly.</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5">
                <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--c-line)]" />
                <path d="M6 8.5l1.5 1.5L10.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--c-line)]" />
              </svg>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-[var(--c-text-md)] mb-0.5">FigJam-style tools</p>
              <p className="text-[11px] text-[var(--c-text-lo)]">Stickies, shapes, connectors, tables, code blocks, and more.</p>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex flex-col gap-2 pt-4 border-t border-[var(--c-border)]">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 bg-[var(--c-line)] hover:opacity-80 text-white text-sm rounded-lg transition-colors font-semibold"
          >
            Start drawing
          </button>
          <button
            onClick={handleDontShowAgain}
            className="w-full px-4 py-2 text-[var(--c-text-lo)] hover:text-[var(--c-text-md)] text-xs rounded-lg transition-colors"
          >
            Don't show again
          </button>
        </div>
      </div>
    </div>
  );
}
