import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DARK_MENU_COLORS } from './darkMenuTheme';

export function CollapsedRailTooltip({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const updatePosition = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      x: rect.right,
      y: rect.top + rect.height / 2,
    });
  }, []);

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
            transform: 'translate(10px, -50%)',
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
                right: '100%',
                top: '50%',
                width: 8,
                height: 8,
                transform: 'translate(4px, -50%) rotate(45deg)',
                borderLeft: `1px solid ${DARK_MENU_COLORS.border}`,
                borderBottom: `1px solid ${DARK_MENU_COLORS.border}`,
                background: DARK_MENU_COLORS.surface,
                borderRadius: 1,
              }}
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
