import { useRef, useState, useEffect } from 'react';
import { useBoardStore } from '../store/boardStore';
import { Tool, ShapeKind } from '../types';
import StickerPicker from './StickerPicker';

interface ToolDef {
  id: Tool;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
  mobileHidden?: boolean;
}

// Minimal SVG icons — dev-tool aesthetic
function IconSelect() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 2L3 12L6.5 9L8.5 13.5L10 12.8L8 8.5L12 8L3 2Z" fill="currentColor" />
    </svg>
  );
}
function IconPan() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1v2M8 13v2M1 8h2M13 8h2M4.2 4.2l1.4 1.4M10.4 10.4l1.4 1.4M4.2 11.8l1.4-1.4M10.4 5.6l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function IconSticky() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 2v4l2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5" y1="10.5" x2="9" y2="10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function IconShape() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="2.5" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="11" cy="11" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function IconText() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 4h10M8 4v9M5 13h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
function IconLine() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11 3h2v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconPen() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M9.5 4.5l2 2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function IconSticker() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6" cy="7" r="1" fill="currentColor" />
      <circle cx="10" cy="7" r="1" fill="currentColor" />
      <path d="M5.5 10c.7 1 4.3 1 5 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function IconTable() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="1.5" y1="5.5" x2="14.5" y2="5.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="1.5" y1="9.5" x2="14.5" y2="9.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="6" y1="5.5" x2="6" y2="14.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="10.5" y1="5.5" x2="10.5" y2="14.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function IconSection() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect
        x="1.5"
        y="1.5"
        width="13"
        height="13"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <line x1="1.5" y1="5.5" x2="14.5" y2="5.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function IconCode() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M5 4L1.5 8L5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 4L14.5 8L11 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="9.5" y1="3" x2="6.5" y2="13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function IconImage() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5.5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.5 11L5 7.5L8 10.5L10.5 8L14.5 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const TOOLS: ToolDef[] = [
  { id: 'select',  label: 'Select',  shortcut: 'V', icon: <IconSelect /> },
  { id: 'pan',     label: 'Pan',     shortcut: 'H', icon: <IconPan /> },
  { id: 'sticky',  label: 'Sticky',  shortcut: 'S', icon: <IconSticky /> },
  { id: 'shape',   label: 'Shape',   shortcut: 'R', icon: <IconShape /> },
  { id: 'text',    label: 'Text',    shortcut: 'T', icon: <IconText /> },
  { id: 'line',    label: 'Line',    shortcut: 'L', icon: <IconLine /> },
  { id: 'section', label: 'Section', shortcut: 'F', icon: <IconSection />, mobileHidden: true },
  { id: 'sticker', label: 'Sticker', shortcut: '',  icon: <IconSticker />, mobileHidden: true },
  { id: 'table',   label: 'Table',   shortcut: 'G', icon: <IconTable />,  mobileHidden: true },
  { id: 'code',    label: 'Code',    shortcut: 'K', icon: <IconCode />,   mobileHidden: true },
  { id: 'image',   label: 'Image',   shortcut: 'I', icon: <IconImage />,  mobileHidden: true },
];

type ShapeKindDef = { kind: ShapeKind; label: string; icon: React.ReactNode };
const SHAPE_KINDS: ShapeKindDef[] = [
  {
    kind: 'rect',
    label: 'Rectangle',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="3" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    kind: 'ellipse',
    label: 'Ellipse',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <ellipse cx="7" cy="7" rx="6" ry="4" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    kind: 'diamond',
    label: 'Diamond',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 1L13 7L7 13L1 7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    kind: 'triangle',
    label: 'Triangle',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 1L13 13H1L7 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function Toolbar() {
  const { activeTool, setActiveTool, activeShapeKind, setActiveShapeKind } = useBoardStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showGradient, setShowGradient] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setShowGradient(el.scrollWidth > el.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener('scroll', check);
    return () => { ro.disconnect(); el.removeEventListener('scroll', check); };
  }, []);

  return (
    <div className="absolute bottom-5 left-0 right-0 z-50 flex flex-col items-center gap-2 pointer-events-none">
      {/* Shape kind sub-picker */}
      {activeTool === 'shape' && (
        <div className="pointer-events-auto flex items-center gap-0.5 px-2 py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-lg">
          {SHAPE_KINDS.map(({ kind, label, icon }) => (
            <button
              key={kind}
              title={label}
              onClick={() => setActiveShapeKind(kind)}
              className={[
                'w-11 h-11 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg transition-colors',
                activeShapeKind === kind
                  ? 'bg-[#6366f1] text-white'
                  : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
              ].join(' ')}
            >
              {icon}
            </button>
          ))}
        </div>
      )}

      {/* Sticker picker */}
      {activeTool === 'sticker' && <StickerPicker />}

    {/* Toolbar row */}
    <div ref={scrollRef} className="pointer-events-auto w-full overflow-x-auto flex sm:justify-center"
      style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
    >
      {/* Pill — shrink-0 prevents compression; ml-4 gives left breathing room */}
      <div className="flex items-center gap-0 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl overflow-hidden ml-4 mr-4 shrink-0">
        <div className="flex items-center px-1 py-1 gap-0.5">
          {TOOLS.map((tool) => {
            const isActive = activeTool === tool.id;
            const isComingSoon = tool.id === 'pen';
            return (
              <button
                key={tool.id}
                title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}${isComingSoon ? ' — coming soon' : ''}`}
                onClick={() => !isComingSoon && setActiveTool(tool.id)}
                className={[
                  tool.mobileHidden ? 'hidden sm:flex' : 'flex',
                  'relative flex-col items-center justify-center rounded-lg transition-all duration-100 font-mono text-[10px] gap-0.5',
                  'w-12 h-12 sm:w-10 sm:h-10 focus:outline-none',
                  isActive
                    ? 'bg-[#6366f1] text-white shadow-sm'
                    : isComingSoon
                    ? 'text-[var(--c-text-off)] cursor-not-allowed'
                    : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
                ].join(' ')}
                disabled={isComingSoon}
              >
                {tool.icon}
                <span className="leading-none">{tool.label.slice(0, 3)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right-side padding spacer — gives the pill breathing room on mobile */}
      <div className="sm:hidden w-4 shrink-0" />

      {/* Sticky gradient — stays at right viewport edge, exactly as tall as the pill.
          Lives inside the scroll container so it never bleeds outside. */}
      {showGradient && (
        <div
          className="sm:hidden sticky right-0 self-stretch w-14 shrink-0 -ml-14 pointer-events-none"
          style={{ background: 'linear-gradient(to right, transparent, var(--c-panel) 80%)' }}
        />
      )}
    </div>
    </div>
  );
}
