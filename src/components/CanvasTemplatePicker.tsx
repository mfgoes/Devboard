import { CANVAS_TEMPLATES, type Template } from '../templates';
import { IconCanvasDoc } from './icons';

interface CanvasTemplatePickerProps {
  open: boolean;
  onClose: () => void;
  /** Called with the chosen template, or null for a blank canvas. */
  onSelect: (template: Template | null) => void;
}

function IconBlank() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 4.5v5M4.5 7h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IconTemplate() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.5 5.5h11M5.5 5.5v7" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export default function CanvasTemplatePicker({ open, onClose, onSelect }: CanvasTemplatePickerProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        className="relative w-[420px] max-w-[calc(100vw-32px)] max-h-[70vh] flex flex-col rounded-2xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl overflow-hidden font-sans"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--c-border)] shrink-0">
          <span className="font-sans text-[13px] font-semibold text-[var(--c-text-hi)] tracking-wide">New canvas</span>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {/* Scrollable list */}
        <div className="overflow-y-auto py-2">
          {/* Blank canvas */}
          <button
            onClick={() => onSelect(null)}
            className="w-full flex items-start gap-3 px-5 py-3 text-left hover:bg-[var(--c-hover)] transition-colors group"
          >
            <span className="mt-0.5 shrink-0 text-[var(--c-line)]"><IconBlank /></span>
            <div className="min-w-0">
              <div className="font-sans text-[12px] text-[var(--c-text-hi)]">Blank canvas</div>
              <div className="font-sans text-[10px] text-[var(--c-text-lo)] mt-0.5 leading-snug">Start with an empty freeform canvas</div>
            </div>
          </button>

          {CANVAS_TEMPLATES.length > 0 && (
            <div className="px-5 pt-2 pb-1">
              <span className="font-sans text-[10px] uppercase tracking-wider text-[var(--c-text-lo)]">Templates</span>
            </div>
          )}

          {CANVAS_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className="w-full flex items-start gap-3 px-5 py-3 text-left hover:bg-[var(--c-hover)] transition-colors group"
            >
              <span className="mt-0.5 shrink-0 text-[var(--c-line)]">{t.id === 'scratch' ? <IconCanvasDoc size={14} /> : <IconTemplate />}</span>
              <div className="min-w-0">
                <div className="font-sans text-[12px] text-[var(--c-text-hi)]">{t.name}</div>
                <div className="font-sans text-[10px] text-[var(--c-text-lo)] mt-0.5 leading-snug">{t.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
