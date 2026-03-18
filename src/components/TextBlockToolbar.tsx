import { useState, useRef, useEffect } from 'react';
import { useBoardStore } from '../store/boardStore';
import { TextBlockNode } from '../types';

const TEXT_COLORS = [
  { label: 'Auto',   hex: 'auto' },
  { label: 'White',  hex: '#e2e8f0' },
  { label: 'Yellow', hex: '#fbbf24' },
  { label: 'Green',  hex: '#4ade80' },
  { label: 'Cyan',   hex: '#67e8f9' },
  { label: 'Blue',   hex: '#60a5fa' },
  { label: 'Purple', hex: '#a78bfa' },
  { label: 'Red',    hex: '#f87171' },
  { label: 'Orange', hex: '#fb923c' },
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

const SIZE_PRESETS = [
  { label: 'Small',       value: 14 },
  { label: 'Medium',      value: 20 },
  { label: 'Large',       value: 28 },
  { label: 'Extra large', value: 40 },
];

export default function TextBlockToolbar({ nodeId }: { nodeId: string }) {
  const { nodes, updateNode, saveHistory } = useBoardStore();
  const node = nodes.find((n) => n.id === nodeId) as TextBlockNode | undefined;

  const [showColors, setShowColors] = useState(false);
  const [showSizes, setShowSizes]   = useState(false);
  const [showLink, setShowLink]     = useState(false);
  const [showAlign, setShowAlign]   = useState(false);
  const [customSize, setCustomSize] = useState('');
  const [linkValue, setLinkValue]   = useState('');

  const linkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showLink && linkInputRef.current) {
      linkInputRef.current.focus();
      setLinkValue(node?.link ?? '');
    }
  }, [showLink]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!node) return null;

  const update = (updates: Partial<TextBlockNode>) => {
    saveHistory();
    updateNode(nodeId, updates as Parameters<typeof updateNode>[1]);
  };

  const closeAll = () => { setShowColors(false); setShowSizes(false); setShowLink(false); setShowAlign(false); };

  const matchedPreset = SIZE_PRESETS.find((p) => p.value === node.fontSize);
  const sizeLabel = matchedPreset?.label ?? `${node.fontSize}px`;

  const fontStyle = [node.bold ? 'bold' : '', node.italic ? 'italic' : ''].filter(Boolean).join(' ') || 'normal';

  return (
    <div
      className="absolute top-14 left-1/2 -translate-x-1/2 z-50 flex items-center rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ── Color ──────────────────────────────────────────────────── */}
      <div className="relative px-1 py-1">
        <button
          title="Text color"
          onClick={() => { closeAll(); setShowColors((v) => !v); }}
          className="w-9 h-9 flex flex-col items-center justify-center gap-px rounded-lg text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
        >
          <span style={{ fontFamily: 'serif', fontSize: 13, fontWeight: 700, lineHeight: 1 }}>A</span>
          <span style={{ width: 14, height: 3, borderRadius: 2, background: node.color === 'auto' ? 'linear-gradient(90deg, #18181b 50%, #e2e8f0 50%)' : node.color, display: 'block' }} />
        </button>
        {showColors && (
          <div
            className="absolute top-full left-0 mt-1 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: 12 }}
          >
            {TEXT_COLORS.map((c) => (
              <button
                key={c.hex}
                title={c.label}
                onClick={() => { update({ color: c.hex }); setShowColors(false); }}
                style={{
                  width: 32, height: 32,
                  borderRadius: 8,
                  border: `2px solid ${node.color === c.hex ? '#6366f1' : 'transparent'}`,
                  background: c.hex === 'auto'
                    ? 'linear-gradient(135deg, #18181b 50%, #e2e8f0 50%)'
                    : c.hex,
                  cursor: 'pointer',
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.15)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              />
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-[var(--c-border)]" />

      {/* ── Size ───────────────────────────────────────────────────── */}
      <div className="relative px-1 py-1">
        <button
          title="Text size"
          onClick={() => { closeAll(); setShowSizes((v) => !v); }}
          className="h-9 px-2.5 rounded-lg text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors font-mono text-[11px] tabular-nums"
        >
          {node.fontSize}px
        </button>
        {showSizes && (
          <div className="absolute top-full left-0 mt-1 py-1.5 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50 min-w-[164px]">
            {SIZE_PRESETS.map((preset) => {
              const active = node.fontSize === preset.value;
              return (
                <button
                  key={preset.label}
                  onClick={() => { update({ fontSize: preset.value }); setCustomSize(''); setShowSizes(false); }}
                  className={[
                    'w-full text-left px-4 py-2 font-mono text-[13px] transition-colors flex items-center gap-2',
                    active
                      ? 'bg-[#6366f1] text-white'
                      : 'text-[var(--c-text-md)] hover:bg-[var(--c-hover)]',
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
                placeholder={String(node.fontSize)}
                onChange={(e) => setCustomSize(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = parseInt(customSize, 10);
                    if (v >= 8 && v <= 200) { update({ fontSize: v }); setShowSizes(false); }
                  }
                  if (e.key === 'Escape') setShowSizes(false);
                  e.stopPropagation();
                }}
                className="w-full bg-[var(--c-canvas)] border border-[var(--c-border)] rounded-lg px-3 py-1.5 text-[var(--c-text-hi)] font-mono text-[12px] outline-none focus:border-[#6366f1]"
              />
            </div>
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-[var(--c-border)]" />

      {/* ── Bold ───────────────────────────────────────────────────── */}
      <div className="px-0.5 py-1">
        <button
          title="Bold"
          onClick={() => update({ bold: !node.bold })}
          className={[
            'w-9 h-9 flex items-center justify-center rounded-lg transition-colors font-bold text-[14px]',
            node.bold
              ? 'bg-[#6366f1] text-white'
              : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
          ].join(' ')}
          style={{ fontFamily: 'serif' }}
        >
          B
        </button>
      </div>

      {/* ── Italic ─────────────────────────────────────────────────── */}
      <div className="px-0.5 py-1">
        <button
          title="Italic"
          onClick={() => update({ italic: !node.italic })}
          className={[
            'w-9 h-9 flex items-center justify-center rounded-lg transition-colors text-[14px] italic',
            node.italic
              ? 'bg-[#6366f1] text-white'
              : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
          ].join(' ')}
          style={{ fontFamily: 'serif' }}
        >
          I
        </button>
      </div>

      {/* ── Underline ──────────────────────────────────────────────── */}
      <div className="px-0.5 py-1">
        <button
          title="Underline"
          onClick={() => update({ underline: !node.underline })}
          className={[
            'w-9 h-9 flex items-center justify-center rounded-lg transition-colors text-[14px] underline',
            node.underline
              ? 'bg-[#6366f1] text-white'
              : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
          ].join(' ')}
          style={{ fontFamily: 'serif', fontStyle }}
        >
          U
        </button>
      </div>

      {/* ── Bullet list ────────────────────────────────────────────── */}
      <div className="px-0.5 py-1">
        <button
          title="Bullet list"
          onClick={() => {
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
            update({ bulletList: next, text: newText });
          }}
          className={[
            'w-9 h-9 flex items-center justify-center rounded-lg transition-colors',
            node.bulletList
              ? 'bg-[#6366f1] text-white'
              : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
          ].join(' ')}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="2" cy="3.5" r="1.2" fill="currentColor" />
            <circle cx="2" cy="7" r="1.2" fill="currentColor" />
            <circle cx="2" cy="10.5" r="1.2" fill="currentColor" />
            <rect x="5" y="2.8" width="8" height="1.4" rx="0.7" fill="currentColor" />
            <rect x="5" y="6.3" width="8" height="1.4" rx="0.7" fill="currentColor" />
            <rect x="5" y="9.8" width="8" height="1.4" rx="0.7" fill="currentColor" />
          </svg>
        </button>
      </div>

      <div className="w-px h-6 bg-[var(--c-border)]" />

      {/* ── Text alignment dropdown ─────────────────────────────────── */}
      <div className="relative px-1 py-1">
        <button
          title="Text alignment"
          onClick={() => { closeAll(); setShowAlign((v) => !v); }}
          className="flex items-center gap-1 h-8 px-2 rounded-lg text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
        >
          <AlignIcon align={node.textAlign ?? 'left'} />
          <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor">
            <path d="M0 0l4 5 4-5z" />
          </svg>
        </button>
        {showAlign && (
          <div className="absolute top-full left-0 mt-1 py-1.5 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50 min-w-[110px]">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                onClick={() => { update({ textAlign: align }); setShowAlign(false); }}
                className={[
                  'w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-mono transition-colors capitalize',
                  (node.textAlign ?? 'left') === align
                    ? 'bg-[#6366f1] text-white'
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

      <div className="w-px h-6 bg-[var(--c-border)]" />

      {/* ── Link ───────────────────────────────────────────────────── */}
      <div className="relative px-1 py-1">
        <button
          title={node.link ? `Link: ${node.link}` : 'Add link'}
          onClick={() => { closeAll(); setShowLink((v) => !v); }}
          className={[
            'w-9 h-9 flex items-center justify-center rounded-lg transition-colors',
            showLink || node.link
              ? 'bg-[#6366f1] text-white'
              : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
          ].join(' ')}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M6.5 9.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1 1"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            />
            <path
              d="M9.5 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1-1"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            />
          </svg>
        </button>
        {showLink && (
          <div className="absolute top-full right-0 mt-1 p-2 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50 flex gap-2 items-center min-w-[260px]">
            <input
              ref={linkInputRef}
              type="url"
              value={linkValue}
              placeholder="https://..."
              onChange={(e) => setLinkValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { update({ link: linkValue || undefined }); setShowLink(false); }
                if (e.key === 'Escape') setShowLink(false);
                e.stopPropagation();
              }}
              className="flex-1 bg-[var(--c-canvas)] border border-[var(--c-border)] rounded-lg px-3 py-1.5 text-[var(--c-text-hi)] font-mono text-[12px] outline-none focus:border-[#6366f1]"
            />
            <button
              onClick={() => { update({ link: linkValue || undefined }); setShowLink(false); }}
              className="px-3 py-1.5 bg-[#6366f1] text-white rounded-lg text-[12px] font-mono hover:bg-[#4f51c7] transition-colors whitespace-nowrap"
            >
              Set
            </button>
            {node.link && (
              <button
                title="Remove link"
                onClick={() => { update({ link: undefined }); setShowLink(false); }}
                className="w-7 h-7 flex items-center justify-center text-[#f87171] rounded-lg hover:bg-[var(--c-hover)] transition-colors flex-shrink-0"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
