import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface DocumentHeadingRailItem {
  id: string;
  level: 'h1' | 'h2';
  text: string;
}

interface DocumentHeadingRailProps {
  outline: DocumentHeadingRailItem[];
  activeId: string | null;
  onJump: (id: string) => void;
  inset: number;
}

// A slim, always-on stack of heading tick marks pinned to the page's right
// edge as you scroll (Notion-style). Positioned with CSS `position: sticky`
// nested inside the page div — this rides the page's own horizontal box
// (so it naturally sits wherever the page is, centered or edge-to-edge)
// while staying pinned vertically within the scroll container, with no JS
// rect-tracking needed for that part. Hovering reveals a portaled popover
// listing heading titles for click-to-jump.
const POPOVER_GAP = 10;
const POPOVER_WIDTH = 220;

export function DocumentHeadingRail({ outline, activeId, onJump, inset }: DocumentHeadingRailProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });

  const updatePopoverPos = useCallback(() => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect) return;
    const fitsRight = rect.right + POPOVER_GAP + POPOVER_WIDTH <= window.innerWidth;
    setPopoverPos({
      // When there's no room beside the rail (narrow/mobile viewports), overlap
      // the popover over the pills instead of flinging it across the screen —
      // keeps it next to the cursor so the hover zone stays reachable.
      x: fitsRight ? rect.right + POPOVER_GAP : Math.max(8, rect.right - POPOVER_WIDTH),
      y: Math.min(Math.max(rect.top + rect.height / 2, 80), window.innerHeight - 80),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePopoverPos();
    window.addEventListener('resize', updatePopoverPos);
    // Capture phase: `scroll` doesn't bubble, but a capture-phase listener on
    // window still fires for scroll on a descendant (the editor's own
    // scroll container), so this keeps the popover glued to the rail even
    // if a scroll happens while it's open.
    window.addEventListener('scroll', updatePopoverPos, true);
    return () => {
      window.removeEventListener('resize', updatePopoverPos);
      window.removeEventListener('scroll', updatePopoverPos, true);
    };
  }, [open, updatePopoverPos]);

  if (outline.length === 0) return null;

  return (
    <div
      ref={wrapperRef}
      style={{ position: 'sticky', top: 24, height: 0, pointerEvents: 'none' }}
    >
      <div
        ref={railRef}
        style={{
          position: 'absolute',
          top: 0,
          right: inset,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 5,
          pointerEvents: 'auto',
        }}
        onMouseEnter={() => { updatePopoverPos(); setOpen(true); }}
        onMouseLeave={() => setOpen(false)}
      >
        {outline.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              onClick={() => onJump(item.id)}
              aria-label={item.text}
              style={{
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                background: 'transparent',
                display: 'block',
              }}
            >
              <span
                style={{
                  display: 'block',
                  height: 3,
                  width: item.level === 'h1' ? 14 : 8,
                  marginRight: item.level === 'h1' ? 0 : 6,
                  borderRadius: 999,
                  background: isActive ? 'var(--c-line)' : 'var(--c-border)',
                  opacity: isActive ? 1 : 0.7,
                  transition: 'background 0.15s ease, opacity 0.15s ease, width 0.15s ease',
                }}
              />
            </button>
          );
        })}
      </div>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            left: popoverPos.x,
            top: popoverPos.y,
            zIndex: 99999,
            transform: 'translateY(-50%)',
            pointerEvents: 'auto',
          }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <div
            style={{
              width: POPOVER_WIDTH,
              padding: 6,
              borderRadius: 10,
              background: 'var(--c-panel)',
              border: '1px solid var(--c-border)',
              boxShadow: '0 12px 28px rgba(0,0,0,0.22)',
              fontFamily: 'inherit',
            }}
          >
            {outline.map((item) => {
              const isActive = item.id === activeId;
              return (
                <button
                  key={item.id}
                  onClick={() => { onJump(item.id); setOpen(false); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    background: isActive ? 'var(--c-hover)' : 'transparent',
                    color: isActive ? 'var(--c-text-hi)' : 'var(--c-text-md)',
                    cursor: 'pointer',
                    padding: item.level === 'h2' ? '6px 8px 6px 18px' : '6px 8px',
                    borderRadius: 6,
                    fontSize: item.level === 'h1' ? 12.5 : 12,
                    fontWeight: item.level === 'h1' ? 600 : 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--c-hover)'; e.currentTarget.style.color = 'var(--c-text-hi)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? 'var(--c-hover)' : 'transparent'; e.currentTarget.style.color = isActive ? 'var(--c-text-hi)' : 'var(--c-text-md)'; }}
                >
                  {item.text}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
