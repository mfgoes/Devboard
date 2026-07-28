import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DARK_MENU_COLORS } from './darkMenuTheme';

/**
 * Dark pill tooltip with a pointer. Used by the collapsed rail (pointing right)
 * and by top-row icon buttons (pointing up).
 */
export function CollapsedRailTooltip({
  label,
  children,
  style,
  placement = 'right',
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  placement?: 'right' | 'bottom';
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const isBottom = placement === 'bottom';

  const updatePosition = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(isBottom
      ? { x: rect.left + rect.width / 2, y: rect.bottom }
      : { x: rect.right, y: rect.top + rect.height / 2 });
  }, [isBottom]);

  useEffect(() => {
    if (!open) return;

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  return (
    <div
      ref={anchorRef}
      style={{ position: 'relative', display: 'inline-flex', ...style }}
      onMouseEnter={() => { updatePosition(); setOpen(true); }}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => { updatePosition(); setOpen(true); }}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      {children}
      {open && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            left: position.x,
            top: position.y,
            zIndex: 99999,
            transform: isBottom ? 'translate(-50%, 8px)' : 'translate(10px, -50%)',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              position: 'relative',
              padding: '6px 10px',
              borderRadius: 8,
              background: DARK_MENU_COLORS.surface,
              color: DARK_MENU_COLORS.textHi,
              fontFamily: 'var(--font-ui)',
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1,
              whiteSpace: 'nowrap',
              boxShadow: '0 12px 28px rgba(0,0,0,0.28)',
              border: `1px solid ${DARK_MENU_COLORS.border}`,
            }}
          >
            {label}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                width: 8,
                height: 8,
                background: DARK_MENU_COLORS.surface,
                borderRadius: 1,
                ...(isBottom
                  ? {
                      bottom: '100%',
                      left: '50%',
                      transform: 'translate(-50%, 4px) rotate(45deg)',
                      borderLeft: `1px solid ${DARK_MENU_COLORS.border}`,
                      borderTop: `1px solid ${DARK_MENU_COLORS.border}`,
                    }
                  : {
                      right: '100%',
                      top: '50%',
                      transform: 'translate(4px, -50%) rotate(45deg)',
                      borderLeft: `1px solid ${DARK_MENU_COLORS.border}`,
                      borderBottom: `1px solid ${DARK_MENU_COLORS.border}`,
                    }),
              }}
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
