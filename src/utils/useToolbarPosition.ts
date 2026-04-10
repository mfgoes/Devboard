import { useRef, useLayoutEffect, useState } from 'react';

const MARGIN = 8;

interface Options {
  /** Screen-space X of the toolbar's horizontal center */
  centerX: number;
  /** Preferred Y (above the node) */
  preferredTop: number;
  /** Screen-space Y of the bottom of the node (used as fallback placement) */
  nodeScreenBottom: number;
  /**
   * When true, prefer placing the toolbar below the node (nodeScreenBottom + margin)
   * and only flip above when there isn't enough room at the bottom.
   * Useful when controls like rotation handles occupy the top of the selection.
   */
  preferBelow?: boolean;
}

/**
 * Shared hook for floating node toolbars.
 *
 * Returns a `ref` to attach to the toolbar div and a `style` object with
 * clamped screen-space position.  On first render the toolbar is invisible
 * (visibility:hidden) while the measurement runs; it becomes visible after
 * the layout effect fires — no perceptible flicker at normal frame rates.
 */
export function useToolbarPosition({ centerX, preferredTop, nodeScreenBottom, preferBelow = false }: Options) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({
    position: 'absolute',
    left: centerX,
    top: preferredTop,
    transform: 'translateX(-50%)',
    zIndex: 200,
    visibility: 'hidden',
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const { width: toolbarW, height: toolbarH } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const halfW = toolbarW / 2;

    // ── Horizontal: keep the toolbar inside the viewport ──────────────────
    let left = centerX;
    left = Math.max(MARGIN + halfW, left);
    left = Math.min(vw - MARGIN - halfW, left);

    // ── Vertical: prefer above or below, flip to the other side if clipped ──
    let top: number;
    if (preferBelow) {
      top = nodeScreenBottom + MARGIN;
      if (top + toolbarH > vh - MARGIN) {
        // Not enough room below — flip above
        top = preferredTop;
      }
    } else {
      top = preferredTop;
      if (top < MARGIN) {
        top = nodeScreenBottom + MARGIN;
      }
    }
    // Final clamp — don't bleed off the bottom either
    top = Math.min(top, vh - MARGIN - toolbarH);

    setStyle({
      position: 'absolute',
      left,
      top,
      transform: 'translateX(-50%)',
      zIndex: 200,
      visibility: 'visible',
    });
  }, [centerX, preferredTop, nodeScreenBottom]);

  return { ref, style };
}
