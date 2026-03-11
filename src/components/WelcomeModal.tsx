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
      <div className="bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 font-mono">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="text-[#6366f1] text-[10px] font-semibold tracking-[0.2em] uppercase">
              DevBoard
            </span>
            <span className="text-[10px] text-[var(--c-text-off)] border border-[var(--c-border)] rounded px-1.5 py-0.5">
              WIP
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--c-text-off)] hover:text-[var(--c-text-hi)] text-xl leading-none transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Title */}
        <h2 className="text-[var(--c-text-hi)] text-lg font-semibold leading-snug mb-3">
          An infinite canvas for developer thinking
        </h2>

        {/* Description */}
        <p className="text-[var(--c-text-lo)] text-[13px] leading-relaxed mb-4">
          DevBoard is a lightweight FigJam-style whiteboard built for solo devs
          and small teams — system design, sprint planning, debug flows, feature
          mapping. No accounts, no backend. Everything lives in your browser.
        </p>

        {/* What's live */}
        <div className="bg-[var(--c-hover)] rounded-lg p-3 mb-4 text-[11px] leading-relaxed space-y-1">
          <div className="flex gap-2">
            <span className="text-[#86efac]">✓</span>
            <span className="text-[var(--c-text-md)]">Infinite canvas — pan, zoom, dot grid</span>
          </div>
          <div className="flex gap-2">
            <span className="text-[#86efac]">✓</span>
            <span className="text-[var(--c-text-md)]">Sticky notes — color, edit, resize, copy/paste</span>
          </div>
          <div className="flex gap-2">
            <span className="text-[#86efac]">✓</span>
            <span className="text-[var(--c-text-md)]">Smart connector lines — bezier curves between notes</span>
          </div>
          <div className="flex gap-2">
            <span className="text-[#fde68a]">◌</span>
            <span className="text-[var(--c-text-off)]">Shapes, text blocks, pen, sections — coming next</span>
          </div>
        </div>

        {/* Keyboard cheat sheet */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-5 text-[10px] text-[var(--c-text-off)]">
          {[
            ['V', 'Select'],
            ['H', 'Pan'],
            ['S', 'Sticky'],
            ['L', 'Line'],
            ['Space+drag', 'Pan'],
            ['⌘C / ⌘V', 'Copy/Paste'],
            ['⌘D', 'Duplicate'],
            ['Del', 'Delete'],
          ].map(([key, label]) => (
            <span key={key}>
              <span className="text-[#6366f1]">{key}</span>{' '}
              <span>{label}</span>
            </span>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <a
            href="https://x.com/MishoWave"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-[var(--c-text-lo)] hover:text-[#6366f1] transition-colors"
          >
            @MishoWave on X — feedback welcome ↗
          </a>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#6366f1] hover:bg-[#4f46e5] text-white text-xs rounded-lg transition-colors font-semibold"
          >
            Start drawing
          </button>
        </div>
      </div>
    </div>
  );
}
