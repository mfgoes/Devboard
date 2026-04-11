import { useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { CanvasNode } from '../types';

const FONT_SIZE_PRESETS = [
  { label: 'Small',       value: 12 },
  { label: 'Medium',      value: 14 },
  { label: 'Large',       value: 18 },
  { label: 'Extra large', value: 24 },
];

// ── Alignment SVG icons ────────────────────────────────────────────────────────

function AlignLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="2" y1="2" x2="2" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="4" y="3.5" width="9" height="2.5" rx="0.75" fill="currentColor" />
      <rect x="4" y="7"   width="6" height="2.5" rx="0.75" fill="currentColor" />
      <rect x="4" y="10.5" width="8" height="2.5" rx="0.75" fill="currentColor" />
    </svg>
  );
}
function AlignCenterHIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="3" y="3.5" width="10" height="2.5" rx="0.75" fill="currentColor" />
      <rect x="5" y="7"   width="6"  height="2.5" rx="0.75" fill="currentColor" />
      <rect x="4" y="10.5" width="8" height="2.5" rx="0.75" fill="currentColor" />
    </svg>
  );
}
function AlignRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="14" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="3"  y="3.5"  width="9" height="2.5" rx="0.75" fill="currentColor" />
      <rect x="6"  y="7"    width="6" height="2.5" rx="0.75" fill="currentColor" />
      <rect x="4"  y="10.5" width="8" height="2.5" rx="0.75" fill="currentColor" />
    </svg>
  );
}
function AlignTopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="2" y1="2" x2="14" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="3.5"  y="4" width="2.5" height="9" rx="0.75" fill="currentColor" />
      <rect x="7"    y="4" width="2.5" height="6" rx="0.75" fill="currentColor" />
      <rect x="10.5" y="4" width="2.5" height="8" rx="0.75" fill="currentColor" />
    </svg>
  );
}
function AlignMiddleVIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="3.5"  y="3" width="2.5" height="10" rx="0.75" fill="currentColor" />
      <rect x="7"    y="5" width="2.5" height="6"  rx="0.75" fill="currentColor" />
      <rect x="10.5" y="4" width="2.5" height="8"  rx="0.75" fill="currentColor" />
    </svg>
  );
}
function AlignBottomIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="2" y1="14" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="3.5"  y="3" width="2.5" height="9" rx="0.75" fill="currentColor" />
      <rect x="7"    y="6" width="2.5" height="6" rx="0.75" fill="currentColor" />
      <rect x="10.5" y="4" width="2.5" height="8" rx="0.75" fill="currentColor" />
    </svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function MultiSelectToolbar() {
  const { nodes, selectedIds, updateNodes } = useBoardStore();
  const [showFontSizes, setShowFontSizes] = useState(false);

  const selected = nodes.filter((n) => selectedIds.includes(n.id) && n.type !== 'connector');
  if (selected.length < 2) return null;

  // Bounding boxes for alignment
  type Sized = { id: string; x: number; y: number; w: number; h: number };
  const sized: Sized[] = selected.map((n) => ({
    id:  n.id,
    x:   (n as { x: number }).x,
    y:   (n as { y: number }).y,
    w:   (n as { width?: number }).width  ?? 0,
    h:   (n as { height?: number }).height ?? 0,
  }));

  const minX = Math.min(...sized.map((s) => s.x));
  const maxX = Math.max(...sized.map((s) => s.x + s.w));
  const minY = Math.min(...sized.map((s) => s.y));
  const maxY = Math.max(...sized.map((s) => s.y + s.h));
  const cx   = (minX + maxX) / 2;
  const cy   = (minY + maxY) / 2;

  // Text-capable nodes (shape + textblock)
  const textNodes = selected.filter((n) => n.type === 'textblock' || n.type === 'shape' || n.type === 'sticky');
  const hasText   = textNodes.length > 0;
  const allBold   = hasText && textNodes.every((n) => !!(n as { bold?: boolean }).bold);
  const allItalic = hasText && textNodes.every((n) => !!(n as { italic?: boolean }).italic);
  const fontSizes = textNodes.map((n) => (n as { fontSize?: number }).fontSize ?? 14);
  const commonFontSize = fontSizes.length > 0 && fontSizes.every((s) => s === fontSizes[0]) ? fontSizes[0] : null;

  // ── Helpers ────────────────────────────────────────────────────────────────

  const applyPositions = (fn: (s: Sized) => { x?: number; y?: number }) =>
    updateNodes(sized.map((s) => ({ id: s.id, updates: fn(s) as Partial<CanvasNode> })));

  const applyText = (updates: Partial<CanvasNode>) =>
    updateNodes(textNodes.map((n) => ({ id: n.id, updates })));

  // ── Icon button helper ─────────────────────────────────────────────────────

  const IconBtn = ({
    title, onClick, active = false, children,
  }: { title: string; onClick: () => void; active?: boolean; children: React.ReactNode }) => (
    <button
      title={title}
      onClick={onClick}
      className={[
        'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
        active
          ? 'bg-[var(--c-line)] text-white'
          : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
      ].join(' ')}
    >
      {children}
    </button>
  );

  return (
    <div
      className="absolute top-14 left-1/2 -translate-x-1/2 z-50 flex items-center rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ── Horizontal alignment ──────────────────────────────────────────── */}
      <div className="flex items-center gap-0 px-1 py-1">
        <IconBtn title="Align left edges"       onClick={() => applyPositions(() => ({ x: minX }))}>
          <AlignLeftIcon />
        </IconBtn>
        <IconBtn title="Align centers (horizontal)" onClick={() => applyPositions((s) => ({ x: cx - s.w / 2 }))}>
          <AlignCenterHIcon />
        </IconBtn>
        <IconBtn title="Align right edges"      onClick={() => applyPositions((s) => ({ x: maxX - s.w }))}>
          <AlignRightIcon />
        </IconBtn>
      </div>

      <div className="w-px h-6 bg-[var(--c-border)]" />

      {/* ── Vertical alignment ────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 px-1 py-1">
        <IconBtn title="Align top edges"        onClick={() => applyPositions(() => ({ y: minY }))}>
          <AlignTopIcon />
        </IconBtn>
        <IconBtn title="Align centers (vertical)" onClick={() => applyPositions((s) => ({ y: cy - s.h / 2 }))}>
          <AlignMiddleVIcon />
        </IconBtn>
        <IconBtn title="Align bottom edges"     onClick={() => applyPositions((s) => ({ y: maxY - s.h }))}>
          <AlignBottomIcon />
        </IconBtn>
      </div>

      {/* ── Text styling (only when text-capable nodes are selected) ──────── */}
      {hasText && (
        <>
          <div className="w-px h-6 bg-[var(--c-border)]" />

          {/* Bold */}
          <div className="px-0.5 py-1">
            <IconBtn title="Toggle bold" active={allBold} onClick={() => applyText({ bold: !allBold } as Partial<CanvasNode>)}>
              <span style={{ fontFamily: 'serif', fontSize: 14, fontWeight: 700 }}>B</span>
            </IconBtn>
          </div>

          {/* Italic */}
          <div className="px-0.5 py-1">
            <IconBtn title="Toggle italic" active={allItalic} onClick={() => applyText({ italic: !allItalic } as Partial<CanvasNode>)}>
              <span style={{ fontFamily: 'serif', fontSize: 14, fontStyle: 'italic' }}>I</span>
            </IconBtn>
          </div>

          {/* Font size */}
          <div className="relative px-1 py-1">
            <button
              title="Font size"
              onClick={() => setShowFontSizes((v) => !v)}
              className="h-8 px-2 rounded-lg text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors font-mono text-[11px] tabular-nums"
            >
              {commonFontSize !== null ? `${commonFontSize}px` : 'mixed'}
            </button>
            {showFontSizes && (
              <div className="absolute top-full left-0 mt-1 py-1.5 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50 min-w-[140px]">
                {FONT_SIZE_PRESETS.map((preset) => {
                  const active = commonFontSize === preset.value;
                  return (
                    <button
                      key={preset.value}
                      onClick={() => { applyText({ fontSize: preset.value } as Partial<CanvasNode>); setShowFontSizes(false); }}
                      className={[
                        'w-full flex items-center gap-2 px-4 py-2 font-mono text-[12px] transition-colors',
                        active ? 'bg-[var(--c-line)] text-white' : 'text-[var(--c-text-md)] hover:bg-[var(--c-hover)]',
                      ].join(' ')}
                    >
                      <span className="w-4 text-center">{active ? '✓' : ''}</span>
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Count badge */}
      <div className="px-2 py-1 text-[10px] font-mono text-[var(--c-text-off)]">
        {selected.length} selected
      </div>
    </div>
  );
}
