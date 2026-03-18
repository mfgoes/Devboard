interface Props {
  onClose: () => void;
}

function IconPages() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="3.5" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 3.5V2.5A1.5 1.5 0 0 1 5.5 1h4A1.5 1.5 0 0 1 11 2.5v1" stroke="currentColor" strokeWidth="1.3" />
      <line x1="4" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="4" y1="9.5" x2="9" y2="9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function IconSticky() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="1" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9 1v5.5H14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconShape() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11" cy="4" r="3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1 14l3.5-6 3.5 6H1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="8" y="9" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function IconCode() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="1" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 5.5L2.5 7.5l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.5 5.5l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="6.5" y1="10" x2="8.5" y2="5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function IconTable() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="1" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <line x1="1" y1="5" x2="14" y2="5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="6" y1="1" x2="6" y2="14" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function IconLock() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="2.5" y="6.5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 6.5V4.5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="7.5" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}

const FEATURES: { Icon: () => JSX.Element; title: string; desc: string }[] = [
  {
    Icon: IconPages,
    title: 'Multi-page boards',
    desc: 'Organise work across named pages — sprint, retro, architecture, all in one file.',
  },
  {
    Icon: IconSticky,
    title: 'Stickies & connectors',
    desc: 'Color-coded stickies with smart bezier lines, emoji reactions, and formatting.',
  },
  {
    Icon: IconShape,
    title: 'Shapes & text blocks',
    desc: 'Rectangles, ellipses, diamonds and triangles with fill, stroke, and inline labels.',
  },
  {
    Icon: IconCode,
    title: 'Code snippets',
    desc: 'Syntax-highlighted code blocks on the canvas — SQL, JS, Python, TypeScript and more.',
  },
  {
    Icon: IconTable,
    title: 'Tables & sections',
    desc: 'Drag-to-size tables with CSV import/export. Sections to frame and group ideas.',
  },
  {
    Icon: IconLock,
    title: 'No account needed',
    desc: 'Everything lives in your browser or saves as a single portable JSON file.',
  },
];

export default function WelcomeModal({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 font-mono">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
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
        <h2 className="text-[var(--c-text-hi)] text-lg font-semibold leading-snug mb-2">
          The infinite canvas built for developers
        </h2>
        <p className="text-[var(--c-text-lo)] text-[12px] leading-relaxed mb-5">
          System design, sprint planning, debug flows, feature mapping — no accounts,
          no backend. Your board stays in your browser or exports as a single file.
        </p>

        {/* Feature grid */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          {FEATURES.map(({ Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-lg p-3 flex flex-col gap-1.5 border border-[var(--c-border)] bg-[var(--c-hover)]"
            >
              <div className="flex items-center gap-2">
                <span className="text-[#6366f1] shrink-0">
                  <Icon />
                </span>
                <span className="text-[11px] font-semibold text-[var(--c-text-hi)] leading-tight">
                  {title}
                </span>
              </div>
              <p className="text-[10.5px] text-[var(--c-text-md)] leading-relaxed pl-[23px]">
                {desc}
              </p>
            </div>
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
