import { useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { StickyNoteNode } from '../types';
import ColorSwatches from './ColorSwatches';
import { PALETTE } from '../utils/palette';
import { useToolbarPosition } from '../utils/useToolbarPosition';

const STICKY_COLORS = PALETTE.map((p) => ({ hex: p.sticky, label: p.label }));

export { STICKY_COLORS };

const FONT_SIZE_PRESETS = [
  { label: 'Small',       value: 10 },
  { label: 'Medium',      value: 16 },
  { label: 'Large',       value: 22 },
  { label: 'Extra large', value: 48 },
];

interface Props {
  nodeId: string;
  isEditing?: boolean;
}

function BulletListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="2" cy="3.5" r="1.2" fill="currentColor" />
      <circle cx="2" cy="7" r="1.2" fill="currentColor" />
      <circle cx="2" cy="10.5" r="1.2" fill="currentColor" />
      <rect x="5" y="2.8" width="8" height="1.4" rx="0.7" fill="currentColor" />
      <rect x="5" y="6.3" width="8" height="1.4" rx="0.7" fill="currentColor" />
      <rect x="5" y="9.8" width="8" height="1.4" rx="0.7" fill="currentColor" />
    </svg>
  );
}

export default function StickyColorPicker({ nodeId, isEditing = false }: Props) {
  const { nodes, updateNode, camera, saveHistory } = useBoardStore();
  const node = nodes.find((n) => n.id === nodeId) as StickyNoteNode | undefined;
  const [showColors, setShowColors] = useState(false);
  const [showFontSizes, setShowFontSizes] = useState(false);
  const [customSize, setCustomSize] = useState('');

  const sx = node ? node.x * camera.scale + camera.x : 0;
  const sy = node ? node.y * camera.scale + camera.y : 0;
  const sw = node ? node.width * camera.scale : 0;
  const sh = node ? node.height * camera.scale : 0;
  const anchorDotY = sy - 20 * camera.scale;
  const toolbarTop = anchorDotY - 36 - 8;

  const { ref: tbRef, style: tbStyle } = useToolbarPosition({
    centerX: sx + sw / 2,
    preferredTop: toolbarTop,
    nodeScreenBottom: sy + sh,
  });

  if (!node) return null;

  // ── Sync helper: read innerHTML from the active contenteditable ──────────────
  const syncAfterExec = () => {
    const div = document.querySelector<HTMLDivElement>('[data-sticky-editor="true"]');
    if (!div) return;
    updateNode(nodeId, { text: div.innerHTML });
  };

  // ── Formatting buttons — preventDefault keeps focus + selection in editor ───
  const execFormat = (command: string) => {
    if (isEditing) {
      document.execCommand(command);
      syncAfterExec();
    } else {
      saveHistory();
      if (command === 'bold')      updateNode(nodeId, { bold: !node.bold });
      if (command === 'italic')    updateNode(nodeId, { italic: !node.italic });
      if (command === 'underline') updateNode(nodeId, { underline: !node.underline });
    }
  };

  // Detect active format at cursor (when editing)
  const isBold      = isEditing ? document.queryCommandState('bold')      : (node.bold ?? false);
  const isItalic    = isEditing ? document.queryCommandState('italic')    : (node.italic ?? false);
  const isUnderline = isEditing ? document.queryCommandState('underline') : (node.underline ?? false);

  const toggleBulletList = () => {
    saveHistory();
    const next = !node.bulletList;
    let newText = node.text;
    if (next) {
      newText = newText
        .split('\n')
        .map((line) => (line.trim() !== '' && !line.startsWith('• ') ? '• ' + line : line))
        .join('\n');
      if (newText.trim() === '') newText = '• ';
    } else {
      newText = newText
        .split('\n')
        .map((line) => (line.startsWith('• ') ? line.slice(2) : line))
        .join('\n');
    }
    updateNode(nodeId, { bulletList: next, text: newText });
  };

  const fmtBtn = (label: React.ReactNode, command: string, active: boolean, title: string) => (
    <button
      title={title}
      onMouseDown={(e) => e.preventDefault()} // keep focus + selection
      onClick={() => execFormat(command)}
      className={[
        'w-6 h-6 flex items-center justify-center rounded transition-colors text-[13px]',
        active
          ? 'bg-[var(--c-line)] text-white'
          : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
      ].join(' ')}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={tbRef}
      style={tbStyle}
      className="flex items-center gap-1 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-md px-2 py-1.5 shadow-lg"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Bold */}
      {fmtBtn(<span style={{ fontFamily: 'serif', fontWeight: 700 }}>B</span>, 'bold', isBold, 'Bold')}
      {/* Italic */}
      {fmtBtn(<span style={{ fontFamily: 'serif', fontStyle: 'italic' }}>I</span>, 'italic', isItalic, 'Italic')}
      {/* Underline */}
      {fmtBtn(<span style={{ fontFamily: 'serif', textDecoration: 'underline' }}>U</span>, 'underline', isUnderline, 'Underline')}

      <div className="w-px h-4 bg-[var(--c-border)]" />

      {/* Bullet list toggle */}
      <button
        title={node.bulletList ? 'Remove bullet list' : 'Bullet list'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggleBulletList}
        className={[
          'w-6 h-6 flex items-center justify-center rounded transition-colors',
          node.bulletList
            ? 'bg-[var(--c-line)] text-white'
            : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
        ].join(' ')}
      >
        <BulletListIcon />
      </button>

      <div className="w-px h-4 bg-[var(--c-border)]" />

      {/* Font size dropdown */}
      <div className="relative">
        <button
          title="Font size"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { setShowColors(false); setShowFontSizes((v) => !v); }}
          className="h-6 px-2 rounded text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors font-sans text-[11px] tabular-nums"
        >
          {node.fontSize ?? 13}px
        </button>
        {showFontSizes && (
          <div className="absolute top-full left-0 mt-1 py-1.5 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50 min-w-[164px]">
            {FONT_SIZE_PRESETS.map((preset) => {
              const active = (node.fontSize ?? 13) === preset.value;
              return (
                <button
                  key={preset.label}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { saveHistory(); updateNode(nodeId, { fontSize: preset.value }); setCustomSize(''); setShowFontSizes(false); }}
                  className={[
                    'w-full text-left px-4 py-2 font-sans text-[13px] transition-colors flex items-center gap-2',
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
                placeholder={String(node.fontSize ?? 13)}
                onChange={(e) => setCustomSize(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = parseInt(customSize, 10);
                    if (v >= 8 && v <= 200) { saveHistory(); updateNode(nodeId, { fontSize: v }); setCustomSize(''); setShowFontSizes(false); }
                  }
                  if (e.key === 'Escape') setShowFontSizes(false);
                  e.stopPropagation();
                }}
                className="w-full bg-[var(--c-canvas)] border border-[var(--c-border)] rounded-lg px-3 py-1.5 text-[var(--c-text-hi)] font-sans text-[12px] outline-none focus:border-[var(--c-line)]"
              />
            </div>
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-[var(--c-border)]" />

      {/* Color dropdown */}
      <div className="relative">
        <button
          title="Note color"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { setShowFontSizes(false); setShowColors((v) => !v); }}
          className="flex items-center gap-1.5 h-6 px-2 rounded text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
        >
          <span
            className="w-3.5 h-3.5 rounded-sm border border-white/20"
            style={{ background: node.color }}
          />
          <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor" className="text-[var(--c-text-lo)]">
            <path d="M0 0l4 5 4-5z" />
          </svg>
        </button>

        {showColors && (
          <div className="absolute top-full left-0 mt-1 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50">
            <ColorSwatches
              colors={STICKY_COLORS}
              activeColor={node.color}
              onSelect={(hex) => { saveHistory(); updateNode(nodeId, { color: hex }); setShowColors(false); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
