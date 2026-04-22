interface Props {
  onClose: () => void;
}

export default function WelcomeModal({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 font-sans">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-[var(--c-line)] text-[10px] font-semibold tracking-[0.2em] uppercase">
              DevBoard
            </span>
            <span className="text-[10px] text-[var(--c-text-off)] border border-[var(--c-border)] rounded px-1.5 py-0.5">
              WIP
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--c-text-md)] hover:text-[var(--c-text-hi)] text-xl leading-none transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Title */}
        <p className="text-[var(--c-text-lo)] text-[12px] leading-relaxed mb-3">
          Infinite canvas for developer thinking — stickies, connectors, shapes, code blocks, tables, and more.
        </p>

        {/* Manual hint */}
        <p className="text-[11px] text-[var(--c-text-lo)] mb-4">
          See the{' '}
          <a
            href="https://mfgoes.github.io/Devboard/manual.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--c-line)] hover:underline"
          >
            manual
          </a>{' '}
          for keyboard shortcuts and tips.
        </p>

        {/* Footer */}
        <div className="pt-4 border-t border-[var(--c-border)] flex flex-col gap-3">
          {/* Ko-fi banner — prominent support CTA */}
          <a
            href="https://ko-fi.com/devboardapp"
            target="_blank"
            rel="noopener noreferrer"
            className="kofi-banner group flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-base leading-none" aria-hidden="true">☕</span>
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold text-[var(--c-line-pre)]">Enjoying DevBoard? Support on Ko-fi</span>
                <span className="text-[10px] text-[var(--c-text-lo)]">It's free — a small tip keeps updates coming.</span>
              </div>
            </div>
            <span className="text-[var(--c-line-pre)] text-[11px] font-semibold group-hover:translate-x-0.5 transition-transform">→</span>
          </a>
          {/* Secondary links + start CTA */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 text-[11px] text-[var(--c-text-lo)]">
              <a
                href="https://mfgoes.github.io/Devboard/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[var(--c-text-hi)] transition-colors"
              >
                Site
              </a>
              <span className="text-[var(--c-border)]">·</span>
              <a
                href="https://x.com/MishoWave"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[var(--c-text-hi)] transition-colors"
              >
                @MishoWave
              </a>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-[var(--c-line)] hover:opacity-80 text-white text-xs rounded-lg transition-colors font-semibold"
            >
              Start drawing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
