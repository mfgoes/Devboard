interface Props {
  onClose: () => void;
}

const TOOLS = [
  { key: 'V', label: 'Select' },
  { key: 'H', label: 'Pan' },
  { key: 'S', label: 'Sticky' },
  { key: 'R', label: 'Shape' },
  { key: 'T', label: 'Text' },
  { key: 'L', label: 'Connector' },
  { key: 'K', label: 'Code block' },
  { key: 'G', label: 'Table' },
  { key: 'F', label: 'Section' },
  { key: 'I', label: 'Image' },
  { key: 'U', label: 'Link' },
];

const ACTIONS = [
  { key: '⌘Z', label: 'Undo' },
  { key: '⌘⇧Z', label: 'Redo' },
  { key: '⌘C / ⌘V', label: 'Copy / Paste' },
  { key: '⌘D', label: 'Duplicate' },
  { key: '⌫', label: 'Delete selected' },
  { key: '⌘S', label: 'Save JSON' },
  { key: '⌘F', label: 'Search' },
  { key: 'Esc', label: 'Cancel / Deselect' },
];

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
        <p className="text-[var(--c-text-lo)] text-[12px] leading-relaxed mb-4">
          Infinite canvas for developer thinking — stickies, connectors, shapes, code blocks, tables, and more.
        </p>

        {/* Shortcuts */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-0 mb-5">
          <div>
            <p className="text-[10px] text-[var(--c-text-lo)] uppercase tracking-widest mb-2">Tools</p>
            {TOOLS.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between py-[3px]">
                <span className="text-[11px] text-[var(--c-text-md)]">{label}</span>
                <kbd className="text-[10px] text-[var(--c-text-lo)] bg-[var(--c-hover)] border border-[var(--c-border)] rounded px-1.5 py-0.5 ml-3">{key}</kbd>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[10px] text-[var(--c-text-lo)] uppercase tracking-widest mb-2">Actions</p>
            {ACTIONS.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between py-[3px]">
                <span className="text-[11px] text-[var(--c-text-md)]">{label}</span>
                <kbd className="text-[10px] text-[var(--c-text-lo)] bg-[var(--c-hover)] border border-[var(--c-border)] rounded px-1.5 py-0.5 ml-3 whitespace-nowrap">{key}</kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-[var(--c-border)] flex flex-col gap-3">
          {/* Link row */}
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href="https://mfgoes.github.io/Devboard/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-hover)] text-[11px] text-[var(--c-text-md)] hover:border-[var(--c-line)] hover:text-[var(--c-line)] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h5v2H4v8h8v-3h2v5H2V2zm7 0h5v5h-2V4.414L6.707 9.707 5.293 8.293 10.586 3H8V1h1z"/></svg>
              DevBoard site
            </a>
            <a
              href="https://mischa.itch.io/kosmograd"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-hover)] text-[11px] text-[var(--c-text-md)] hover:border-[#4ade80] hover:text-[#4ade80] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.22 3.22l1.42 1.42M11.36 11.36l1.42 1.42M3.22 12.78l1.42-1.42M11.36 4.64l1.42-1.42"/></svg>
              Kosmograd — lunar colony sim
            </a>
            <a
              href="https://x.com/MishoWave"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-hover)] text-[11px] text-[var(--c-text-md)] hover:border-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M12.6 0h2.454l-5.36 6.778L16 16h-4.937l-3.867-5.594L2.771 16H.316l5.733-7.25L0 0h5.063l3.495 5.114L12.6 0zm-.86 14.376h1.36L4.323 1.39H2.865l8.875 12.986z"/></svg>
              @MishoWave
            </a>
          </div>
          {/* Actions row */}
          <div className="flex justify-end">
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
