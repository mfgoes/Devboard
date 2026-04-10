import { useState, useRef, useEffect } from 'react';
import { useBoardStore } from '../store/boardStore';
import { SectionNode } from '../types';
import { PALETTE } from '../utils/palette';
import { useToolbarPosition } from '../utils/useToolbarPosition';

const SECTION_COLORS = ['neutral', ...PALETTE.map((p) => p.section)];

export default function SectionToolbar({ nodeId }: { nodeId: string }) {
  const { nodes, updateNode, saveHistory, camera } = useBoardStore();
  const node = nodes.find((n) => n.id === nodeId) as SectionNode | undefined;
  const [colorOpen, setColorOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!colorOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setColorOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [colorOpen]);

  const sx = node ? node.x * camera.scale + camera.x : 0;
  const sy = node ? node.y * camera.scale + camera.y : 0;
  const sw = node ? node.width * camera.scale : 0;
  const sh = node ? node.height * camera.scale : 0;

  const { ref: tbRef, style: tbStyle } = useToolbarPosition({
    centerX: sx + sw / 2,
    preferredTop: sy - 52,
    nodeScreenBottom: sy + sh,
  });

  if (!node) return null;

  const activeColor = node.color === 'neutral' ? 'var(--c-text-lo)' : node.color;

  return (
    <div
      ref={tbRef}
      style={tbStyle}
      className="flex items-center gap-1.5 px-2 py-1.5 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Color picker — compact trigger + dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          title="Section color"
          onClick={() => setColorOpen((v) => !v)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-[var(--c-hover)] transition-colors"
        >
          <span
            style={{ background: activeColor, width: 14, height: 14, borderRadius: 4, display: 'inline-block', flexShrink: 0 }}
          />
          <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{ opacity: 0.5 }}>
            <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {colorOpen && (
          <div
            className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 flex gap-1 p-2 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl"
            style={{ zIndex: 201 }}
          >
            {SECTION_COLORS.map((color) => {
              const isNeutral = color === 'neutral';
              const bg = isNeutral ? 'var(--c-text-lo)' : color;
              const isActive = node.color === color;
              return (
                <button
                  key={color}
                  title={isNeutral ? 'Neutral' : color}
                  onClick={() => {
                    saveHistory();
                    updateNode(nodeId, { color } as Parameters<typeof updateNode>[1]);
                    setColorOpen(false);
                  }}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    background: bg,
                    border: isActive ? '2px solid white' : '2px solid transparent',
                    outline: isActive ? `2px solid ${isNeutral ? 'var(--c-text-lo)' : color}` : 'none',
                    cursor: 'pointer',
                    transition: 'transform 0.1s',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.transform = 'scale(1.2)')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.transform = 'scale(1)')}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 18, background: 'var(--c-border)', flexShrink: 0 }} />

      {/* Match stickies toggle */}
      <button
        title="Auto-recolor stickies dropped into this section"
        onClick={() => {
          saveHistory();
          updateNode(nodeId, { matchStickies: !node.matchStickies } as Parameters<typeof updateNode>[1]);
        }}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors text-xs font-medium"
        style={{
          background: node.matchStickies ? activeColor : 'transparent',
          color: node.matchStickies ? '#fff' : 'var(--c-text-lo)',
          border: node.matchStickies ? 'none' : '1px solid var(--c-border)',
        }}
        onMouseEnter={(e) => {
          if (!node.matchStickies) (e.currentTarget as HTMLElement).style.background = 'var(--c-hover)';
        }}
        onMouseLeave={(e) => {
          if (!node.matchStickies) (e.currentTarget as HTMLElement).style.background = 'transparent';
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="1" y="1" width="4.5" height="4.5" rx="1" fill="currentColor" opacity="0.9" />
          <rect x="6.5" y="1" width="4.5" height="4.5" rx="1" fill="currentColor" opacity="0.5" />
          <rect x="1" y="6.5" width="4.5" height="4.5" rx="1" fill="currentColor" opacity="0.5" />
          <rect x="6.5" y="6.5" width="4.5" height="4.5" rx="1" fill="currentColor" opacity="0.9" />
        </svg>
        Match stickies
      </button>
    </div>
  );
}
