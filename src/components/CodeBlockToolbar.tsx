import { useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { CodeBlockNode } from '../types';
import { CodeLanguage } from '../utils/syntaxHighlight';

const LANGUAGES: { value: CodeLanguage; label: string }[] = [
  { value: 'sql',        label: 'SQL' },
  { value: 'python',     label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'gdscript',   label: 'GDScript' },
  { value: 'csharp',     label: 'C#' },
  { value: 'json',       label: 'JSON' },
  { value: 'bash',       label: 'Bash' },
  { value: 'text',       label: 'Plain' },
];

function IconCopy() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <rect x="4" y="4" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 10V2h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconHash() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <line x1="4" y1="2" x2="3" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="10" y1="2" x2="9" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="1.5" y1="5.5" x2="12.5" y2="5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="1" y1="9" x2="12" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M2 4h10M5 4V2h4v2M6 6.5v4M8 6.5v4M3 4l1 8h6l1-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface Props {
  nodeId: string;
}

export default function CodeBlockToolbar({ nodeId }: Props) {
  const { nodes, updateNode, deleteSelected, selectIds, camera } = useBoardStore();
  const node = nodes.find((n) => n.id === nodeId) as CodeBlockNode | undefined;

  const [copied, setCopied] = useState(false);
  const [showLang, setShowLang] = useState(false);

  if (!node) return null;

  const update = (updates: Partial<CodeBlockNode>) =>
    updateNode(nodeId, updates as Parameters<typeof updateNode>[1]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(node.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const handleDelete = () => {
    selectIds([nodeId]);
    deleteSelected();
  };

  const sx = node.x * camera.scale + camera.x;
  const sy = node.y * camera.scale + camera.y;
  const sw = node.width * camera.scale;
  const toolbarTop = sy - 48;

  const currentLang = LANGUAGES.find((l) => l.value === node.language) ?? LANGUAGES[0];

  return (
    <div
      style={{
        position: 'absolute',
        left: sx + sw / 2,
        top: toolbarTop,
        transform: 'translateX(-50%)',
        zIndex: 200,
      }}
      className="flex items-center gap-0 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl overflow-visible"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ── Language picker ──────────────────────────────────────────── */}
      <div className="relative px-1 py-1">
        <button
          title="Language"
          onClick={() => setShowLang((v) => !v)}
          className="flex items-center gap-1.5 h-8 px-2 rounded-lg text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
        >
          <span className="font-mono text-[11px] text-[#79b8ff]">{currentLang.label}</span>
          <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor" className="text-[var(--c-text-lo)]">
            <path d="M0 0l4 5 4-5z" />
          </svg>
        </button>
        {showLang && (
          <div className="absolute top-full left-0 mt-1 py-1.5 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50 min-w-[130px]">
            {LANGUAGES.map((l) => (
              <button
                key={l.value}
                onClick={() => { update({ language: l.value }); setShowLang(false); }}
                className={[
                  'w-full text-left px-3 py-2 font-mono text-[12px] transition-colors',
                  node.language === l.value
                    ? 'bg-[#6366f1] text-white'
                    : 'text-[var(--c-text-md)] hover:bg-[var(--c-hover)]',
                ].join(' ')}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-[var(--c-border)]" />

      {/* ── Copy ─────────────────────────────────────────────────────── */}
      <div className="px-1 py-1">
        <button
          title={copied ? 'Copied!' : 'Copy code'}
          onClick={handleCopy}
          className={[
            'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
            copied
              ? 'bg-[rgba(99,102,241,0.2)] text-[#6366f1]'
              : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
          ].join(' ')}
        >
          <IconCopy />
        </button>
      </div>

      {/* ── Line numbers toggle ───────────────────────────────────────── */}
      <div className="px-1 py-1">
        <button
          title={node.showLineNumbers ? 'Hide line numbers' : 'Show line numbers'}
          onClick={() => update({ showLineNumbers: !node.showLineNumbers })}
          className={[
            'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
            node.showLineNumbers
              ? 'bg-[rgba(99,102,241,0.2)] text-[#6366f1]'
              : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
          ].join(' ')}
        >
          <IconHash />
        </button>
      </div>

      <div className="w-px h-6 bg-[var(--c-border)]" />

      {/* ── Delete ───────────────────────────────────────────────────── */}
      <div className="px-1 py-1">
        <button
          title="Delete"
          onClick={handleDelete}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--c-text-lo)] hover:text-[#f97583] hover:bg-[var(--c-hover)] transition-colors"
        >
          <IconTrash />
        </button>
      </div>
    </div>
  );
}
