import { useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { StickyNoteNode } from '../types';
import ColorSwatches from './ColorSwatches';
import { PALETTE } from '../utils/palette';

const STICKY_COLORS = PALETTE.map((p) => ({ hex: p.sticky, label: p.label }));

export { STICKY_COLORS };

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

  if (!node) return null;

  const sx = node.x * camera.scale + camera.x;
  const sy = node.y * camera.scale + camera.y;
  const sw = node.width * camera.scale;

  // Anchor dot sits DOT_OFFSET (20) world-units above the node top edge.
  const anchorDotY = sy - 20 * camera.scale;
  const toolbarTop = anchorDotY - 36 - 8;

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
          ? 'bg-[#6366f1] text-white'
          : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
      ].join(' ')}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: sx + sw / 2,
        top: toolbarTop,
        transform: 'translateX(-50%)',
        zIndex: 200,
      }}
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
            ? 'bg-[#6366f1] text-white'
            : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
        ].join(' ')}
      >
        <BulletListIcon />
      </button>

      <div className="w-px h-4 bg-[var(--c-border)]" />

      {/* Color dropdown */}
      <div className="relative">
        <button
          title="Note color"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShowColors((v) => !v)}
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
