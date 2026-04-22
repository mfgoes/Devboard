import { useRef, useState, useEffect } from 'react';
import { useBoardStore } from '../store/boardStore';
import { Tool, ShapeKind } from '../types';
import StickerPicker from './StickerPicker';
import { resolveCssColor } from '../utils/palette';

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
function IconLink() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6.5 9.5L9.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 5L10.5 3.5a2.12 2.12 0 013 3L12 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 11L5.5 12.5a2.12 2.12 0 01-3-3L4 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconTask() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="3" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
      <line x1="9.5" y1="8.5" x2="15" y2="8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="6" cy="13" r="1.5" stroke="currentColor" strokeWidth="1.3" />
      <line x1="9.5" y1="13" x2="15" y2="13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function IconDocument() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1.5" width="12" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2" y1="4.5" x2="14" y2="4.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="4" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1" />
      <line x1="4" y1="9.5" x2="12" y2="9.5" stroke="currentColor" strokeWidth="1" />
      <line x1="4" y1="12" x2="10" y2="12" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

// Main toolbar tools (no code/image/task — those live in the + menu)
// NOTE: line tool hidden from toolbar — anchor connectors already provide this functionality
// TODO: Upgrade to intentional diagramming mode (flexible, powerful, grid-agnostic)
const TOOLS: ToolDef[] = [
  { id: 'select',   label: 'Select',   shortcut: 'V', icon: <IconSelect /> },
  { id: 'pan',      label: 'Pan',      shortcut: 'H', icon: <IconPan /> },
  { id: 'sticky',   label: 'Sticky',   shortcut: 'S', icon: <IconSticky /> },
  { id: 'shape',    label: 'Shape',    shortcut: 'R', icon: <IconShape /> },
  { id: 'text',     label: 'Text',     shortcut: 'T', icon: <IconText /> },
  { id: 'document', label: 'Note', shortcut: 'D', icon: <IconDocument />, mobileHidden: true },
  { id: 'section',  label: 'Section',  shortcut: 'F', icon: <IconSection />, mobileHidden: true },
  { id: 'image',    label: 'Image',    shortcut: 'I', icon: <IconImage />,   mobileHidden: true },
  { id: 'table',    label: 'Table',    shortcut: 'G', icon: <IconTable />,   mobileHidden: true },
  { id: 'link',     label: 'Link',     shortcut: 'U', icon: <IconLink />,    mobileHidden: true },
];

// Items in the + insert menu
interface InsertItem {
  id: Tool;
  label: string;
  description: string;
  shortcut?: string;
  icon: React.ReactNode;
  color: string; // icon background accent
}

const INSERT_ITEMS: InsertItem[] = [
  {
    id: 'task',
    label: 'Task Card',
    description: 'Checklist with subtasks',
    icon: <IconTask />,
    color: resolveCssColor('--c-line-default'),
  },
  {
    id: 'code',
    label: 'Code Block',
    description: 'Syntax-highlighted snippet',
    shortcut: 'K',
    icon: <IconCode />,
    color: '#0ea5e9',
  },
  {
    id: 'sticker',
    label: 'Sticker',
    description: 'Emoji & icon stickers',
    icon: <IconSticker />,
    color: '#f59e0b',
  },
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
  const { activeTool, setActiveTool, activeShapeKind, setActiveShapeKind, focusDocumentId, appMode } = useBoardStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showGradient, setShowGradient] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const insertRef = useRef<HTMLDivElement>(null);

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

  // Close insert panel when clicking outside
  useEffect(() => {
    if (!insertOpen) return;
    const handler = (e: MouseEvent) => {
      if (insertRef.current && !insertRef.current.contains(e.target as Node)) {
        setInsertOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [insertOpen]);

  // Close insert panel if a tool from it becomes active then user switches away
  useEffect(() => {
    if (!INSERT_ITEMS.some((i) => i.id === activeTool)) {
      // don't close — user might be hovering; let them click again
    }
  }, [activeTool]);

  const handleInsertSelect = (id: Tool) => {
    setActiveTool(id);
    setInsertOpen(false);
  };

  const insertActive = INSERT_ITEMS.some((i) => i.id === activeTool);

  return (
    <div
      className="absolute bottom-5 left-0 right-0 z-[500] flex flex-col items-center gap-2 pointer-events-none"
      style={{
        transform: focusDocumentId || appMode === 'document' ? 'translateY(120%)' : 'translateY(0)',
        transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
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
                  ? 'bg-[var(--c-line)] text-white'
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

      {/* ── Toolbar row ─────────────────────────────────────────────────────── */}
      {/* Outer flex row: scroll area + insert button sit side-by-side.
          The insert button MUST be outside the overflow-x-auto container,
          otherwise the popup panel gets clipped. */}
      <div className="pointer-events-auto w-full flex sm:justify-center">

        {/* Scrollable tools pill */}
        <div
          ref={scrollRef}
          className="overflow-x-auto flex"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
        >
          <div className="flex items-center gap-0 rounded-xl sm:rounded-r-none border sm:border-r-0 border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl ml-4 sm:ml-0 mr-4 sm:mr-0 shrink-0">
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
                      'relative flex-col items-center justify-center rounded-lg transition-all duration-100 font-sans text-[10px] gap-0.5',
                      'w-12 h-12 sm:w-10 sm:h-10 focus:outline-none',
                      isActive
                        ? 'bg-[var(--c-line)] text-white shadow-sm'
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

        {/* + Insert button — kept OUTSIDE overflow-x-auto so the popup is never clipped */}
        <div ref={insertRef} className="relative hidden sm:flex items-stretch mr-4">
          <div className="flex items-center rounded-r-xl border-t border-r border-b border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl px-1 py-1 gap-0.5">
            <div className="w-px h-6 bg-[var(--c-border)]" />
            <button
              title="Insert (Task, Code, Image…)"
              onClick={() => setInsertOpen((o) => !o)}
              className={[
                'flex flex-col items-center justify-center rounded-lg transition-all duration-100 font-sans text-[10px] gap-0.5',
                'w-10 h-10 focus:outline-none',
                insertOpen || insertActive
                  ? 'bg-[var(--c-line)] text-white shadow-sm'
                  : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
              ].join(' ')}
            >
              <svg
                width="14" height="14" viewBox="0 0 14 14" fill="none"
                style={{
                  transform: insertOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              >
                <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="leading-none">Add</span>
            </button>
          </div>

          {/* Insert popup panel — renders above the button, unclipped */}
          {insertOpen && (
            <div
              className="absolute bottom-full mb-3 right-0 w-72 rounded-2xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl overflow-hidden"
              style={{ zIndex: 9999 }}
            >
              {/* Panel header */}
              <div className="px-4 py-3 border-b border-[var(--c-border)]">
                <p className="font-sans text-xs font-semibold text-[var(--c-text-hi)] tracking-wide uppercase">Insert</p>
                <p className="font-sans text-[10px] text-[var(--c-text-lo)] mt-0.5">Click a block, then click the canvas</p>
              </div>

              {/* Grid of insert items */}
              <div className="p-3 flex flex-col gap-1.5">
                {INSERT_ITEMS.map((item) => {
                  const isActive = activeTool === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleInsertSelect(item.id)}
                      className={[
                        'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-all duration-100 group',
                        isActive
                          ? 'bg-[var(--c-line)]/10 ring-1 ring-[var(--c-line)]/40'
                          : 'hover:bg-[var(--c-hover)]',
                      ].join(' ')}
                    >
                      {/* Icon swatch */}
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: item.color + '22', color: item.color }}
                      >
                        {item.icon}
                      </div>
                      {/* Labels */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={[
                            'font-sans text-[12px] font-semibold leading-tight',
                            isActive ? 'text-[var(--c-line)]' : 'text-[var(--c-text-hi)]',
                          ].join(' ')}>
                            {item.label}
                          </span>
                          {item.shortcut && (
                            <span className="font-sans text-[9px] text-[var(--c-text-off)] bg-[var(--c-hover)] px-1 rounded">
                              {item.shortcut}
                            </span>
                          )}
                        </div>
                        <span className="font-sans text-[10px] text-[var(--c-text-lo)] leading-tight block mt-0.5">
                          {item.description}
                        </span>
                      </div>
                      {isActive && (
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--c-line)] flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
