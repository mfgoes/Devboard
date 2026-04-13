import { useState, useRef, useEffect } from 'react';
import { useBoardStore } from '../store/boardStore';
import { LinkNode, LinkDisplayMode, TextBlockNode } from '../types';
import { fetchMeta } from '../utils/fetchMeta';
import { useToolbarPosition } from '../utils/useToolbarPosition';

function generateId() { return Math.random().toString(36).slice(2, 11); }

/* ── Tiny icons ──────────────────────────────────────────────────────── */

function IconCompact() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="4" width="11" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 7h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconEmbed() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.5 5h11" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 8h6M4 10.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconText() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M2 3h10M7 3v9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <rect x="4" y="4" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 10V2h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconTurnInto() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M11.5 5.5A4.5 4.5 0 0 0 3 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M2.5 8.5A4.5 4.5 0 0 0 11 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5 2L3 4l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12l2-2-2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Types for the "Turn into" menu ──────────────────────────────────── */

type TurnIntoOption = 'compact' | 'embed' | 'text';

const TURN_INTO_OPTIONS: { key: TurnIntoOption; label: string; icon: React.ReactNode }[] = [
  { key: 'compact', label: 'Compact link', icon: <IconCompact /> },
  { key: 'embed',   label: 'Embed preview', icon: <IconEmbed /> },
  { key: 'text',    label: 'Text block',    icon: <IconText /> },
];

/* ── Component ───────────────────────────────────────────────────────── */

interface Props {
  nodeId: string;
}

export default function LinkToolbar({ nodeId }: Props) {
  const { nodes, updateNode, camera, saveHistory, addNode, selectIds, deleteSelected } = useBoardStore();
  const node = nodes.find((n) => n.id === nodeId) as LinkNode | undefined;
  const [copied, setCopied] = useState(false);
  const [showTurnInto, setShowTurnInto] = useState(false);
  const [showUrlEdit, setShowUrlEdit] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const urlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showUrlEdit && urlInputRef.current) {
      urlInputRef.current.focus();
      urlInputRef.current.select();
      setUrlDraft(node?.url ?? '');
    }
  }, [showUrlEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const sx = node ? node.x * camera.scale + camera.x : 0;
  const sy = node ? node.y * camera.scale + camera.y : 0;
  const sw = node ? node.width * camera.scale : 0;
  const sh = node ? node.height * camera.scale : 0;
  const { ref: tbRef, style: tbStyle } = useToolbarPosition({
    centerX: sx + sw / 2,
    preferredTop: sy - 48,
    nodeScreenBottom: sy + sh,
  });

  if (!node) return null;

  const update = (updates: Partial<LinkNode>) =>
    updateNode(nodeId, updates as Parameters<typeof updateNode>[1]);

  const closeAll = () => { setShowTurnInto(false); setShowUrlEdit(false); };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(node.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const commitUrl = async () => {
    const trimmed = urlDraft.trim();
    if (trimmed && trimmed !== node.url) {
      saveHistory();
      update({ url: trimmed, title: undefined, description: undefined, image: undefined, siteName: undefined });
      // Auto-fetch metadata for new URL
      const meta = await fetchMeta(trimmed);
      if (meta.title || meta.description || meta.image || meta.siteName) {
        update({ title: meta.title, description: meta.description, image: meta.image, siteName: meta.siteName });
      }
    }
    setShowUrlEdit(false);
  };

  const currentKey: TurnIntoOption = node.displayMode === 'embed' ? 'embed' : 'compact';

  const handleTurnInto = async (option: TurnIntoOption) => {
    setShowTurnInto(false);

    if (option === 'text') {
      // Convert to TextBlockNode
      saveHistory();
      const textId = generateId();
      addNode({
        id: textId,
        type: 'textblock',
        x: node.x,
        y: node.y,
        width: node.width,
        text: node.title || node.url,
        fontSize: 16,
        color: 'auto',
        bold: false,
        italic: false,
        underline: false,
        link: node.url,
      } as TextBlockNode);
      selectIds([nodeId]);
      deleteSelected();
      selectIds([textId]);
      return;
    }

    // Switch display mode
    const mode: LinkDisplayMode = option;
    update({ displayMode: mode });
    if (mode === 'embed' && !node.title) {
      const meta = await fetchMeta(node.url);
      update({
        title: meta.title || node.title,
        description: meta.description || node.description,
        image: meta.image || node.image,
        siteName: meta.siteName || node.siteName,
      });
    }
  };

  const btnClass = (active?: boolean) =>
    `flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${
      active
        ? 'bg-[var(--c-line)] text-white'
        : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]'
    }`;

  return (
    <div
      ref={tbRef}
      style={tbStyle}
      className="flex items-center gap-0 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl overflow-visible"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center px-1 py-1 gap-0.5">
        {/* ── Turn into dropdown ──────────────────────────────────────── */}
        <div className="relative">
          <button
            title="Turn into"
            onClick={() => { closeAll(); setShowTurnInto((v) => !v); }}
            className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg transition-colors font-sans text-[11px] ${
              showTurnInto
                ? 'bg-[var(--c-line)] text-white'
                : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]'
            }`}
          >
            <IconTurnInto />
            <span>Turn into</span>
            <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor">
              <path d="M0 0l4 5 4-5z" />
            </svg>
          </button>
          {showTurnInto && (
            <div
              className="absolute top-full left-0 mt-1 py-1.5 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50 min-w-[160px]"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {TURN_INTO_OPTIONS.map(({ key, label, icon }) => {
                const active = key === currentKey;
                return (
                  <button
                    key={key}
                    onClick={() => handleTurnInto(key)}
                    className={[
                      'w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-sans transition-colors',
                      active
                        ? 'bg-[var(--c-line)] text-white'
                        : 'text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]',
                    ].join(' ')}
                  >
                    <span className="w-4 flex items-center justify-center">{icon}</span>
                    <span>{label}</span>
                    {active && <span className="ml-auto text-[10px]">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-[var(--c-border)] mx-0.5" />

        {/* ── Edit URL ───────────────────────────────────────────────── */}
        <div className="relative">
          <button
            title="Edit URL"
            onClick={() => { closeAll(); setShowUrlEdit((v) => !v); }}
            className={btnClass(showUrlEdit)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6.5 9.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M9.5 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          {showUrlEdit && (
            <div
              className="absolute top-full right-0 mt-1 p-2 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50 flex gap-2 items-center min-w-[280px]"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <input
                ref={urlInputRef}
                type="url"
                value={urlDraft}
                placeholder="https://..."
                onChange={(e) => setUrlDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitUrl();
                  if (e.key === 'Escape') setShowUrlEdit(false);
                  e.stopPropagation();
                }}
                className="flex-1 bg-[var(--c-canvas)] border border-[var(--c-border)] rounded-lg px-3 py-1.5 text-[var(--c-text-hi)] font-sans text-[12px] outline-none focus:border-[var(--c-line)]"
              />
              <button
                onClick={commitUrl}
                className="px-3 py-1.5 bg-[var(--c-line)] text-white rounded-lg text-[12px] font-sans hover:bg-[#4f51c7] transition-colors whitespace-nowrap"
              >
                Set
              </button>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-[var(--c-border)] mx-0.5" />

        {/* ── Copy URL ────────────────────────────────────────────────── */}
        <div className="relative">
          <button title="Copy URL" onClick={handleCopy} className={btnClass()}>
            <IconCopy />
          </button>
          {copied && (
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-[var(--c-line)] text-white text-[10px] font-sans whitespace-nowrap pointer-events-none shadow-lg">
              Copied
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
