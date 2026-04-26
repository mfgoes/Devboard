/**
 * Shared formatting toolbar content used by both DocumentToolbar (floating)
 * and FocusMode (inline). Parent must be a flex container.
 *
 * All buttons use onMouseDown e.preventDefault() so the contentEditable
 * keeps focus while formatting is applied.
 */
import { useState, useRef } from 'react';
import { saveAs } from 'file-saver';
import { useBoardStore } from '../store/boardStore';
import { DocumentNode } from '../types';
import { documentToMarkdown, generateMarkdownFilename } from '../utils/exportMarkdown';
import { hasWorkspaceHandle, saveTextFileToWorkspace } from '../utils/workspaceManager';
import { toast } from '../utils/toast';
import { IconSaveFile, IconList, IconListOrdered, IconAlignLeft, IconAlignCenter, IconAlignRight } from './icons';

// ── Shared colour palette ────────────────────────────────────────────────────

const TEXT_COLORS = [
  { label: 'Auto',   hex: 'auto',    display: 'linear-gradient(135deg, #18181b 50%, #e2e8f0 50%)' },
  { label: 'White',  hex: '#e2e8f0', display: '#e2e8f0' },
  { label: 'Yellow', hex: '#fbbf24', display: '#fbbf24' },
  { label: 'Green',  hex: '#4ade80', display: '#4ade80' },
  { label: 'Cyan',   hex: '#67e8f9', display: '#67e8f9' },
  { label: 'Blue',   hex: '#60a5fa', display: '#60a5fa' },
  { label: 'Purple', hex: '#a78bfa', display: '#a78bfa' },
  { label: 'Red',    hex: '#f87171', display: '#f87171' },
];

// ── DocFormattingBar ─────────────────────────────────────────────────────────

interface Props {
  nodeId: string;
}

export default function DocFormattingBar({ nodeId }: Props) {
  const { nodes, workspaceName, documents } = useBoardStore();
  const node = nodes.find((n) => n.id === nodeId) as DocumentNode | undefined;
  const doc = node?.docId ? documents.find((d) => d.id === node.docId) : undefined;

  const [showHeadings, setShowHeadings] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const [showAlign, setShowAlign] = useState(false);
  const savedRangeRef = useRef<Range | null>(null);

  if (!node) return null;

  const closeAll = () => { setShowHeadings(false); setShowColors(false); setShowAlign(false); };

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
  };

  const restoreSelection = () => {
    const range = savedRangeRef.current;
    if (!range) return;
    const sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  };

  // ── DOM state (selection-based) ──────────────────────────────────────────
  const getCurrentBlockType = (): 0 | 1 | 2 | 3 => {
    const range = showHeadings ? savedRangeRef.current : (window.getSelection?.()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null);
    if (!range) return 0;
    let node: Node | null = range.startContainer;
    while (node) {
      const parent = node.parentNode as HTMLElement | null;
      if (!parent) break;
      if (parent.contentEditable === 'true') break;
      node = parent;
    }
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return 0;
    const tag = (node as HTMLElement).tagName?.toLowerCase();
    if (tag === 'h1') return 1;
    if (tag === 'h2') return 2;
    if (tag === 'h3') return 3;
    return 0;
  };

  const isBold      = document.queryCommandState('bold');
  const isItalic    = document.queryCommandState('italic');
  const isUnderline = document.queryCommandState('underline');
  const blockType   = getCurrentBlockType();

  const styleToolButtonClass = (active: boolean, extra = '') => [
    'w-9 h-9 flex items-center justify-center rounded-lg transition-colors text-[14px]',
    active
      ? 'bg-[var(--c-line)] text-white hover:bg-[var(--c-line-pre)]'
      : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
    extra,
  ].join(' ');

  // ── Format actions ───────────────────────────────────────────────────────
  const applyBlockFormat = (format: 'p' | 'h1' | 'h2' | 'h3') => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) { closeAll(); return; }

    const range = sel.getRangeAt(0);
    // Walk up from the start container to find the direct child of the contentEditable root
    let node: Node | null = range.startContainer;
    while (node) {
      const parent = node.parentNode as HTMLElement | null;
      if (!parent) break;
      if (parent.contentEditable === 'true') break;
      node = parent;
    }

    if (node && node.nodeType === Node.ELEMENT_NODE) {
      const block = node as HTMLElement;
      const tag = format === 'p' ? 'div' : format;
      if (block.tagName.toLowerCase() !== tag) {
        const newEl = document.createElement(tag);
        while (block.firstChild) newEl.appendChild(block.firstChild);
        block.parentNode?.replaceChild(newEl, block);

        // Restore caret at end of new block
        const newRange = document.createRange();
        newRange.selectNodeContents(newEl);
        newRange.collapse(false);
        sel.removeAllRanges();
        sel.addRange(newRange);

        // Notify React
        newEl.closest('[contenteditable="true"]')?.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }
    }
    closeAll();
  };

  const applyList = (type: 'ul' | 'ol') => {
    if (type === 'ul') document.execCommand('insertUnorderedList', false);
    else document.execCommand('insertOrderedList', false);
  };

  const applyAlign = (align: 'left' | 'center' | 'right') => {
    const cmd = align === 'left' ? 'justifyLeft' : align === 'center' ? 'justifyCenter' : 'justifyRight';
    document.execCommand(cmd, false);
    closeAll();
  };

  const applyColor = (hex: string) => {
    if (hex === 'auto') document.execCommand('removeFormat', false);
    else document.execCommand('foreColor', false, hex);
    closeAll();
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const md       = documentToMarkdown(node, documents);
    const filename = generateMarkdownFilename(doc?.title ?? node.title);
    if (hasWorkspaceHandle()) {
      const linkedFile = doc?.linkedFile ?? node.linkedFile ?? `notes/${filename}`;
      const parts = linkedFile.split('/').filter(Boolean);
      const file = parts.pop() ?? filename;
      const folder = parts.join('/');
      const ok = await saveTextFileToWorkspace(folder, file, md);
      toast(ok ? `Saved to ${linkedFile}` : 'Failed to save to workspace');
    } else {
      saveAs(new Blob([md], { type: 'text/markdown;charset=utf-8' }), filename);
    }
  };

  const saveTitle = hasWorkspaceHandle()
    ? `Save to workspace/${doc?.linkedFile ?? node.linkedFile ?? `notes/${generateMarkdownFilename(doc?.title ?? node.title)}`}`
    : 'Download as Markdown';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      overflowX: 'auto',
      overflowY: 'hidden',
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
      WebkitOverflowScrolling: 'touch',
      flex: 1,
      minWidth: 0,
    }}>
      {/* ── Text color ────────────────────────────────────────────────── */}
      <div className="relative px-1 py-1">
        <button
          title="Text color"
          onMouseDown={(e) => { e.preventDefault(); setShowColors(v => !v); setShowHeadings(false); setShowAlign(false); }}
          className="w-9 h-9 flex flex-col items-center justify-center gap-px rounded-lg text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
        >
          <span style={{ fontFamily: 'serif', fontSize: 13, fontWeight: 700, lineHeight: 1 }}>A</span>
          <span style={{ width: 14, height: 3, borderRadius: 2, background: 'var(--c-text-hi)', display: 'block' }} />
        </button>
        {showColors && (
          <div
            className="absolute top-full left-0 mt-1 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: 10 }}
          >
            {TEXT_COLORS.map((c) => (
              <button
                key={c.hex}
                title={c.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyColor(c.hex)}
                style={{
                  width: 28, height: 28, borderRadius: 6,
                  border: '2px solid transparent',
                  background: c.display, cursor: 'pointer',
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

      {/* ── Bold ────────────────────────────────────────────────────────── */}
      <div className="px-0.5 py-1">
        <button
          title="Bold"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => document.execCommand('bold')}
          className={styleToolButtonClass(isBold, 'font-bold')}
          style={{ fontFamily: 'serif' }}
        >B</button>
      </div>

      {/* ── Italic ──────────────────────────────────────────────────────── */}
      <div className="px-0.5 py-1">
        <button
          title="Italic"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => document.execCommand('italic')}
          className={styleToolButtonClass(isItalic, 'italic')}
          style={{ fontFamily: 'serif' }}
        >I</button>
      </div>

      {/* ── Underline ───────────────────────────────────────────────────── */}
      <div className="px-0.5 py-1">
        <button
          title="Underline"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => document.execCommand('underline')}
          className={styleToolButtonClass(isUnderline, 'underline')}
          style={{ fontFamily: 'serif' }}
        >U</button>
      </div>

      <div className="w-px h-6 bg-[var(--c-border)]" />

      {/* ── Heading / Paragraph dropdown ────────────────────────────────── */}
      <div className="relative px-1 py-1">
        <button
          title="Paragraph style"
          onMouseDown={(e) => { e.preventDefault(); saveSelection(); setShowHeadings(v => !v); setShowColors(false); setShowAlign(false); }}
          className={[
            'h-9 px-3 rounded-lg transition-colors flex items-center gap-1.5 font-sans text-[13px] font-medium border',
            showHeadings
              ? 'bg-[var(--c-hover)] text-[var(--c-text-hi)] border-[var(--c-line)]'
              : 'text-[var(--c-text-hi)] border-[var(--c-border)] hover:border-[var(--c-line)]/50 hover:bg-[var(--c-hover)]',
          ].join(' ')}
          style={{ minWidth: 110 }}
        >
          <span className="flex-1 text-left">
            {blockType === 0 ? 'Paragraph' : `Heading ${blockType}`}
          </span>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="opacity-50 flex-shrink-0">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {showHeadings && (
          <div className="absolute top-full left-0 mt-1 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-xl py-1 z-50 min-w-[140px]">
            {(['p', 'h1', 'h2', 'h3'] as const).map((format) => {
              const label = format === 'p' ? 'Paragraph' : `Heading ${format[1]}`;
              const isActive = (format === 'p' && blockType === 0) || (format !== 'p' && blockType === parseInt(format[1]));
              return (
                <button
                  key={format}
                  onMouseDown={(e) => { e.preventDefault(); applyBlockFormat(format); }}
                  className={[
                    'w-full px-3 py-2 text-left text-[12px] transition-colors flex items-center gap-2',
                    isActive
                      ? 'bg-[var(--c-line)]/10 text-[var(--c-line)] font-medium'
                      : 'text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]',
                  ].join(' ')}
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-[var(--c-line)]' : ''}`} />
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-[var(--c-border)]" />

      {/* ── Alignment dropdown ──────────────────────────────────────────── */}
      <div className="relative px-1 py-1">
        <button
          title="Text alignment"
          onMouseDown={(e) => { e.preventDefault(); setShowAlign(v => !v); setShowHeadings(false); setShowColors(false); }}
          className="flex items-center gap-1 h-9 px-2 rounded-lg text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
        >
          <IconAlignLeft />
          <svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor">
            <path d="M0 0l4 5 4-5z" />
          </svg>
        </button>
        {showAlign && (
          <div className="absolute top-full left-0 mt-1 py-1.5 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50 min-w-[110px]">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyAlign(align)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-sans transition-colors capitalize text-[var(--c-text-md)] hover:bg-[var(--c-hover)]"
              >
                {align === 'left' && <IconAlignLeft />}
                {align === 'center' && <IconAlignCenter />}
                {align === 'right' && <IconAlignRight />}
                {align}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-[var(--c-border)]" />

      {/* ── Bullet list ─────────────────────────────────────────────────── */}
      <div className="px-0.5 py-1">
        <button
          title="Bullet list"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyList('ul')}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
        >
          <IconList />
        </button>
      </div>

      {/* ── Numbered list ───────────────────────────────────────────────── */}
      <div className="px-0.5 py-1">
        <button
          title="Numbered list"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyList('ol')}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
        >
          <IconListOrdered />
        </button>
      </div>

      <div className="w-px h-6 bg-[var(--c-border)]" />

      {/* ── Save (workspace-aware) ───────────────────────────────────────── */}
      <div className="px-1 py-1">
        <button
          onClick={handleSave}
          title={saveTitle}
          className="h-9 px-2.5 rounded-lg text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors flex items-center gap-1.5 text-[11px] font-medium"
        >
          <IconSaveFile />
          {workspaceName ? 'Save' : 'Save .md'}
        </button>
      </div>
    </div>
  );
}
