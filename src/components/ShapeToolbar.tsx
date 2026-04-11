import { useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { ShapeNode, ShapeKind } from '../types';
import { useToolbarPosition } from '../utils/useToolbarPosition';
import ColorSwatches from './ColorSwatches';

const TEXT_COLORS = [
  { label: 'Auto',   hex: '' },
  { label: 'White',  hex: '#e2e8f0' },
  { label: 'Dark',   hex: '#1a1a2e' },
  { label: 'Yellow', hex: '#fbbf24' },
  { label: 'Green',  hex: '#4ade80' },
  { label: 'Cyan',   hex: '#67e8f9' },
  { label: 'Blue',   hex: '#60a5fa' },
  { label: 'Red',    hex: '#f87171' },
];

const FONT_SIZE_PRESETS = [
  { label: 'Small',       value: 12 },
  { label: 'Medium',      value: 14 },
  { label: 'Large',       value: 18 },
  { label: 'Extra large', value: 24 },
];

const SHAPE_FILLS = [
  { hex: '#E1BEE7', label: 'Dusty Lavender' },
  { hex: '#BBDEFB', label: 'Airy Blue' },
  { hex: '#CFD8DC', label: 'Cool Slate' },
  { hex: '#FFF9C4', label: 'Soft Cream' },
  { hex: '#FFE0B2', label: 'Muted Apricot' },
  { hex: '#C8E6C9', label: 'Pale Mint' },
  { hex: '#F8BBD0', label: 'Blush Rose' },
  { hex: '#e2e8f0', label: 'White' },
  { hex: '#334155', label: 'Dark' },
  { hex: 'var(--c-line)', label: 'Indigo' },
  { hex: '#22c55e', label: 'Green' },
  { hex: 'transparent', label: 'No fill' },
];

const SHAPE_STROKES = [
  { hex: 'transparent', label: 'No stroke' },
  { hex: '#90CAF9', label: 'Blue' },
  { hex: '#CE93D8', label: 'Lavender' },
  { hex: '#A5D6A7', label: 'Mint' },
  { hex: 'var(--c-line)', label: 'Indigo' },
  { hex: '#334155', label: 'Dark' },
  { hex: '#e2e8f0', label: 'White' },
  { hex: '#F48FB1', label: 'Rose' },
];

const KIND_DEFS: { kind: ShapeKind; label: string; icon: React.ReactNode }[] = [
  {
    kind: 'rect',
    label: 'Rectangle',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="4" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    kind: 'ellipse',
    label: 'Ellipse',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <ellipse cx="8" cy="8" rx="6" ry="4.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    kind: 'diamond',
    label: 'Diamond',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2L14 8L8 14L2 8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    kind: 'triangle',
    label: 'Triangle',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
];

function AlignIcon({ align }: { align: 'left' | 'center' | 'right' }) {
  return (
    <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
      {align === 'left' && <>
        <rect x="0" y="0" width="12" height="1.5" rx="0.75" fill="currentColor" />
        <rect x="0" y="4" width="8"  height="1.5" rx="0.75" fill="currentColor" />
        <rect x="0" y="8" width="10" height="1.5" rx="0.75" fill="currentColor" />
      </>}
      {align === 'center' && <>
        <rect x="0" y="0" width="12" height="1.5" rx="0.75" fill="currentColor" />
        <rect x="2" y="4" width="8"  height="1.5" rx="0.75" fill="currentColor" />
        <rect x="1" y="8" width="10" height="1.5" rx="0.75" fill="currentColor" />
      </>}
      {align === 'right' && <>
        <rect x="0" y="0" width="12" height="1.5" rx="0.75" fill="currentColor" />
        <rect x="4" y="4" width="8"  height="1.5" rx="0.75" fill="currentColor" />
        <rect x="2" y="8" width="10" height="1.5" rx="0.75" fill="currentColor" />
      </>}
    </svg>
  );
}

interface Props {
  nodeId: string;
}

export default function ShapeToolbar({ nodeId }: Props) {
  const { nodes, updateNode, camera, saveHistory } = useBoardStore();
  const node = nodes.find((n) => n.id === nodeId) as ShapeNode | undefined;

  const [customSize, setCustomSize] = useState('');
  const [showKind, setShowKind] = useState(false);
  const [showFills, setShowFills] = useState(false);
  const [showStrokes, setShowStrokes] = useState(false);
  const [showTextColors, setShowTextColors] = useState(false);
  const [showFontSizes, setShowFontSizes] = useState(false);
  const [showAlign, setShowAlign] = useState(false);

  const sx = node ? node.x * camera.scale + camera.x : 0;
  const sy = node ? node.y * camera.scale + camera.y : 0;
  const sw = node ? node.width * camera.scale : 0;
  const sh = node ? node.height * camera.scale : 0;
  const anchorDotY = sy - 20 * camera.scale;
  const toolbarTop = anchorDotY - 40 - 8;

  const { ref: tbRef, style: tbStyle } = useToolbarPosition({
    centerX: sx + sw / 2,
    preferredTop: toolbarTop,
    nodeScreenBottom: sy + sh,
  });

  if (!node) return null;

  const update = (updates: Partial<ShapeNode>) => {
    saveHistory();
    updateNode(nodeId, updates as Parameters<typeof updateNode>[1]);
  };

  const closeAll = () => { setShowKind(false); setShowFills(false); setShowStrokes(false); setShowTextColors(false); setShowFontSizes(false); setShowAlign(false); };

  return (
    <div
      ref={tbRef}
      style={tbStyle}
      className="flex items-center gap-0 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl overflow-visible"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ── Kind dropdown ──────────────────────────────────────────── */}
      <div className="relative px-1 py-1">
        {(() => {
          const current = KIND_DEFS.find((d) => d.kind === node.kind) ?? KIND_DEFS[0];
          return (
            <button
              title="Shape type"
              onClick={() => { closeAll(); setShowKind((v) => !v); }}
              className="flex items-center gap-1.5 h-8 px-2 rounded-lg text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
            >
              {current.icon}
              <span className="font-mono text-[11px] text-[var(--c-text-lo)]">{current.label}</span>
              <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor" className="text-[var(--c-text-lo)]">
                <path d="M0 0l4 5 4-5z" />
              </svg>
            </button>
          );
        })()}
        {showKind && (
          <div className="absolute top-full left-0 mt-1 py-1.5 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50 min-w-[140px]">
            {KIND_DEFS.map(({ kind, label, icon }) => (
              <button
                key={kind}
                onClick={() => { update({ kind }); setShowKind(false); }}
                className={[
                  'w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-mono transition-colors',
                  node.kind === kind
                    ? 'bg-[var(--c-line)] text-white'
                    : 'text-[var(--c-text-md)] hover:bg-[var(--c-hover)]',
                ].join(' ')}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-[var(--c-border)]" />

      {/* ── Fill color ─────────────────────────────────────────────── */}
      <div className="relative px-1 py-1">
        <button
          title="Fill color"
          onClick={() => { closeAll(); setShowFills((v) => !v); }}
          className="flex items-center gap-1.5 h-8 px-2 rounded-lg text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
        >
          <span
            className="w-3.5 h-3.5 rounded-sm border border-white/20 relative"
            style={{
              background: node.fill === 'transparent' ? 'transparent' : node.fill,
              outline: node.fill === 'transparent' ? '1px dashed #666' : 'none',
            }}
          />
          <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor" className="text-[var(--c-text-lo)]">
            <path d="M0 0l4 5 4-5z" />
          </svg>
        </button>
        {showFills && (
          <div className="absolute top-full left-0 mt-1 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50">
            <ColorSwatches
              colors={SHAPE_FILLS}
              activeColor={node.fill}
              onSelect={(hex) => { update({ fill: hex }); setShowFills(false); }}
              columns={4}
            />
          </div>
        )}
      </div>

      {/* ── Stroke color ───────────────────────────────────────────── */}
      <div className="relative px-1 py-1">
        <button
          title="Stroke color"
          onClick={() => { closeAll(); setShowStrokes((v) => !v); }}
          className="flex items-center gap-1.5 h-8 px-2 rounded-lg text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
        >
          <span className="relative w-3.5 h-3.5 flex items-center justify-center">
            <span
              className="absolute inset-0 rounded-sm"
              style={{
                border: `2px solid ${node.stroke === 'transparent' ? '#555' : node.stroke}`,
                borderStyle: node.stroke === 'transparent' ? 'dashed' : 'solid',
              }}
            />
          </span>
          <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor" className="text-[var(--c-text-lo)]">
            <path d="M0 0l4 5 4-5z" />
          </svg>
        </button>
        {showStrokes && (
          <div className="absolute top-full left-0 mt-1 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50">
            <ColorSwatches
              colors={SHAPE_STROKES}
              activeColor={node.stroke}
              onSelect={(hex) => { update({ stroke: hex }); setShowStrokes(false); }}
              columns={4}
            />
          </div>
        )}
      </div>

      {/* ── Stroke width ───────────────────────────────────────────── */}
      {node.stroke !== 'transparent' && (
        <>
          <div className="w-px h-6 bg-[var(--c-border)]" />
          <div className="flex items-center gap-1 px-2 py-1">
            {[1, 2, 3].map((sw) => (
              <button
                key={sw}
                title={`Stroke width ${sw}`}
                onClick={() => update({ strokeWidth: sw })}
                className={[
                  'w-7 h-7 flex items-center justify-center rounded-lg transition-colors',
                  node.strokeWidth === sw
                    ? 'bg-[var(--c-line)] text-white'
                    : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
                ].join(' ')}
              >
                <span
                  style={{
                    display: 'block',
                    width: 12,
                    height: sw,
                    background: 'currentColor',
                    borderRadius: 1,
                  }}
                />
              </button>
            ))}
          </div>
        </>
      )}

      <div className="w-px h-6 bg-[var(--c-border)]" />

      {/* ── Text color ─────────────────────────────────────────────── */}
      <div className="relative px-1 py-1">
        <button
          title="Text color"
          onClick={() => { closeAll(); setShowTextColors((v) => !v); }}
          className="w-8 h-8 flex flex-col items-center justify-center gap-px rounded-lg text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
        >
          <span style={{ fontFamily: 'serif', fontSize: 13, fontWeight: 700, lineHeight: 1 }}>A</span>
          <span style={{ width: 12, height: 3, borderRadius: 2, background: node.fontColor ?? '#e2e8f0', opacity: node.fontColor ? 1 : 0.35, display: 'block' }} />
        </button>
        {showTextColors && (
          <div
            className="absolute top-full left-0 mt-1 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: 10 }}
          >
            {TEXT_COLORS.map((c) => (
              <button
                key={c.hex || 'auto'}
                title={c.label}
                onClick={() => { update({ fontColor: c.hex || undefined }); setShowTextColors(false); }}
                style={{
                  width: 28, height: 28,
                  borderRadius: 6,
                  border: `2px solid ${(node.fontColor ?? '') === c.hex ? 'var(--c-line)' : 'transparent'}`,
                  background: c.hex || '#2e2e46',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'transform 0.1s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.15)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                {!c.hex && (
                  <span style={{ fontSize: 9, color: '#8888aa', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>auto</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Font size ──────────────────────────────────────────────── */}
      <div className="relative px-1 py-1">
        <button
          title="Font size"
          onClick={() => { closeAll(); setShowFontSizes((v) => !v); }}
          className="h-8 px-2 rounded-lg text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors font-mono text-[11px] tabular-nums"
        >
          {node.fontSize ?? 14}px
        </button>
        {showFontSizes && (
          <div className="absolute top-full left-0 mt-1 py-1.5 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50 min-w-[164px]">
            {FONT_SIZE_PRESETS.map((preset) => {
              const active = (node.fontSize ?? 14) === preset.value;
              return (
                <button
                  key={preset.label}
                  onClick={() => { update({ fontSize: preset.value }); setCustomSize(''); setShowFontSizes(false); }}
                  className={[
                    'w-full text-left px-4 py-2 font-mono text-[13px] transition-colors flex items-center gap-2',
                    active ? 'bg-[var(--c-line)] text-white' : 'text-[var(--c-text-md)] hover:bg-[var(--c-hover)]',
                  ].join(' ')}
                >
                  <span className="w-4 text-center">{active ? '✓' : ''}</span>
                  {preset.label}
                </button>
              );
            })}
            <div className="border-t border-[var(--c-border)] mt-1.5 pt-1.5 px-2">
              <input
                type="number"
                min={8}
                max={200}
                value={customSize}
                placeholder={String(node.fontSize ?? 14)}
                onChange={(e) => setCustomSize(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = parseInt(customSize, 10);
                    if (v >= 8 && v <= 200) { update({ fontSize: v }); setCustomSize(''); setShowFontSizes(false); }
                  }
                  if (e.key === 'Escape') setShowFontSizes(false);
                  e.stopPropagation();
                }}
                className="w-full bg-[var(--c-canvas)] border border-[var(--c-border)] rounded-lg px-3 py-1.5 text-[var(--c-text-hi)] font-mono text-[12px] outline-none focus:border-[var(--c-line)]"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Bold / Italic ───────────────────────────────────────────── */}
      <div className="px-0.5 py-1">
        <button
          title="Bold"
          onClick={() => update({ bold: !node.bold })}
          className={[
            'w-8 h-8 flex items-center justify-center rounded-lg transition-colors font-bold text-[14px]',
            node.bold ? 'bg-[var(--c-line)] text-white' : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
          ].join(' ')}
          style={{ fontFamily: 'serif' }}
        >
          B
        </button>
      </div>
      <div className="px-0.5 py-1">
        <button
          title="Italic"
          onClick={() => update({ italic: !node.italic })}
          className={[
            'w-8 h-8 flex items-center justify-center rounded-lg transition-colors italic text-[14px]',
            node.italic ? 'bg-[var(--c-line)] text-white' : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
          ].join(' ')}
          style={{ fontFamily: 'serif' }}
        >
          I
        </button>
      </div>

      {/* ── Text align dropdown ─────────────────────────────────────── */}
      <div className="relative px-1 py-1">
        {(() => {
          const activeAlign = node.textAlign ?? 'center';
          return (
            <button
              title="Text alignment"
              onClick={() => { closeAll(); setShowAlign((v) => !v); }}
              className="flex items-center gap-1 h-8 px-2 rounded-lg text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
            >
              <AlignIcon align={activeAlign} />
              <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor">
                <path d="M0 0l4 5 4-5z" />
              </svg>
            </button>
          );
        })()}
        {showAlign && (
          <div className="absolute top-full left-0 mt-1 py-1.5 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50 min-w-[110px]">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                onClick={() => { update({ textAlign: align }); setShowAlign(false); }}
                className={[
                  'w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-mono transition-colors capitalize',
                  (node.textAlign ?? 'center') === align
                    ? 'bg-[var(--c-line)] text-white'
                    : 'text-[var(--c-text-md)] hover:bg-[var(--c-hover)]',
                ].join(' ')}
              >
                <AlignIcon align={align} />
                {align}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
