/**
 * Hook to manage the workspace explorer panel's position and size.
 */
import { useState, useEffect, useCallback } from 'react';

// Module-level persistent state (survives panel open/close cycles)
let _savedPos: { x: number; y: number } | null = null;
let _savedWidth: number | null = null;

const DEFAULT_POS = { x: 8, y: 52 };
const DEFAULT_WIDTH = 260;

export function usePanelGeometry() {
  const [pos, setPos] = useState(_savedPos ?? DEFAULT_POS);
  const [width, setWidth] = useState(_savedWidth ?? DEFAULT_WIDTH);

  // Persist position across open/close
  useEffect(() => {
    _savedPos = pos;
  }, [pos]);

  // Persist width across open/close
  useEffect(() => {
    _savedWidth = width;
  }, [width]);

  const onMouseDownHeader = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const start = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    const onMove = (me: MouseEvent) => {
      setPos({ x: start.origX + me.clientX - start.startX, y: start.origY + me.clientY - start.startY });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos]);

  const onMouseDownResizer = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const origW = width;
    const onMove = (me: MouseEvent) => {
      const newW = Math.max(160, origW + me.clientX - startX);
      setWidth(newW);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [width]);

  return { pos, width, onMouseDownHeader, onMouseDownResizer };
}
