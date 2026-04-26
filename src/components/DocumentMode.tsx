import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useBoardStore } from '../store/boardStore';
import { CanvasNode, Document } from '../types';
import { htmlToMarkdown, markdownToHtml } from '../utils/exportMarkdown';
import { saveAs } from 'file-saver';
import { hasWorkspaceHandle, saveTextFileToWorkspace } from '../utils/workspaceManager';
import { toast } from '../utils/toast';
import { focusNode } from '../utils/focusNode';
import { IconAlignCenter, IconAlignLeft, IconAlignRight, IconCode, IconCodeBlock, IconCopy, IconDoc, IconEye, IconHorizontalRule, IconNodeLink, IconQuote, IconSaveFile, IconTextWrap } from './icons';

// ── Inline chip utilities ─────────────────────────────────────────────────────

const CHIP_PATTERN = /(\[\[[^\]]+\]\])|(@node:[a-zA-Z0-9_-]+)|(#[a-zA-Z][a-zA-Z0-9_-]*)/g;

function applyChipsToDOM(container: HTMLElement): void {
  const textNodes: Text[] = [];
  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) { textNodes.push(node as Text); return; }
    if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).dataset.chip) return;
    node.childNodes.forEach(walk);
  }
  walk(container);

  for (const textNode of textNodes) {
    const text = textNode.textContent ?? '';
    CHIP_PATTERN.lastIndex = 0;
    if (!CHIP_PATTERN.test(text)) continue;
    CHIP_PATTERN.lastIndex = 0;

    const parent = textNode.parentNode;
    if (!parent) continue;

    const frag = document.createDocumentFragment();
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = CHIP_PATTERN.exec(text)) !== null) {
      if (match.index > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));

      const span = document.createElement('span');
      span.contentEditable = 'false';

      if (match[1]) {
        const title = match[1].slice(2, -2);
        span.className = 'chip-wiki';
        span.dataset.chip = 'wiki';
        span.dataset.title = title;
        span.textContent = title;
      } else if (match[2]) {
        const nodeId = match[2].slice(6);
        span.className = 'chip-node';
        span.dataset.chip = 'node';
        span.dataset.nodeid = nodeId;
        span.textContent = nodeId;
      } else if (match[3]) {
        span.className = 'chip-tag';
        span.dataset.chip = 'tag';
        span.textContent = match[3];
      }
      frag.appendChild(span);
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    parent.replaceChild(frag, textNode);
  }
}

function stripChipsFromHTML(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('[data-chip]').forEach((el) => {
    const chip = el as HTMLElement;
    const type = chip.dataset.chip;
    let raw = '';
    if (type === 'wiki') raw = `[[${chip.dataset.title ?? chip.textContent}]]`;
    else if (type === 'node') raw = `@node:${chip.dataset.nodeid ?? chip.textContent}`;
    else raw = chip.textContent ?? '';
    chip.replaceWith(document.createTextNode(raw));
  });
  return div.innerHTML;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function generateMarkdownFilename(title: string): string {
  return (title.trim() || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '.md';
}

function getNodeLabel(node: CanvasNode, docs: Document[]): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = node as any;
  switch (node.type) {
    case 'sticky': return (n.text as string).split('\n')[0].slice(0, 60) || 'Sticky';
    case 'textblock': return (n.text as string).slice(0, 60) || 'Text block';
    case 'shape': return n.text || n.kind || 'Shape';
    case 'document': {
      const linked = docs.find((d) => d.id === n.docId);
      return linked?.title || n.title || 'Note';
    }
    case 'section': return n.name || 'Section';
    case 'taskcard': return n.title || 'Task card';
    case 'codeblock': return n.title || 'Code block';
    default: return node.type;
  }
}

// ── Formatting toolbar ───────────────────────────────────────────────────────

const BLOCK_LABELS: Record<string, string> = {
  p: 'Paragraph', h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3',
};

function getBlockType(savedRange: Range | null): string {
  const range = savedRange ?? (window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null);
  if (!range) return 'p';
  let el: Node | null = range.startContainer;
  while (el && !(el as HTMLElement).contentEditable) {
    const tag = (el as HTMLElement).tagName?.toLowerCase();
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'p') return tag;
    el = el.parentElement;
  }
  return 'p';
}

function applyBlock(format: string, savedRange: Range | null) {
  const range = savedRange;
  if (!range) return;
  const sel = window.getSelection();
  if (sel) { sel.removeAllRanges(); sel.addRange(range); }

  let node: Node | null = range.startContainer;
  while (node && (node as HTMLElement).contentEditable !== 'true') node = node.parentElement;
  const root = node as HTMLElement | null;
  if (!root) return;

  let block: HTMLElement | null = range.startContainer as HTMLElement;
  if (block.nodeType === Node.TEXT_NODE) block = block.parentElement;
  while (block && block.parentElement !== root) block = block.parentElement;
  if (!block || block === root) return;

  const newEl = document.createElement(format);
  while (block.firstChild) newEl.appendChild(block.firstChild);
  block.replaceWith(newEl);
  newEl.dispatchEvent(new Event('input', { bubbles: true }));
}

// Find the contentEditable root from a range
function rangeRoot(range: Range): HTMLElement | null {
  let n: Node | null = range.startContainer;
  while (n && (n as HTMLElement).contentEditable !== 'true') n = n.parentElement;
  return n as HTMLElement | null;
}

// Find the closest ancestor block that is a direct child of the editable root
function rangeBlock(range: Range, root: HTMLElement): HTMLElement | null {
  let block: HTMLElement | null = range.startContainer as HTMLElement;
  if (block.nodeType === Node.TEXT_NODE) block = block.parentElement;
  while (block && block.parentElement !== root) block = block.parentElement;
  return block && block !== root ? block : null;
}

// Toggle blockquote wrap on the current block
function toggleBlockquote(savedRange: Range | null) {
  const range = savedRange;
  if (!range) return;
  const sel = window.getSelection();
  if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  const root = rangeRoot(range);
  if (!root) return;
  const block = rangeBlock(range, root);
  if (!block) return;
  if (block.tagName.toLowerCase() === 'blockquote') {
    // Unwrap — replace blockquote with a div containing its inner content
    const div = document.createElement('div');
    while (block.firstChild) div.appendChild(block.firstChild);
    block.replaceWith(div);
    div.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    const bq = document.createElement('blockquote');
    block.replaceWith(bq);
    bq.appendChild(block);
    bq.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// Toggle <pre><code> code block on the current block
function toggleCodeBlock(savedRange: Range | null) {
  const range = savedRange;
  if (!range) return;
  const sel = window.getSelection();
  if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  const root = rangeRoot(range);
  if (!root) return;
  const block = rangeBlock(range, root);
  if (!block) return;
  if (block.tagName.toLowerCase() === 'pre') {
    const div = document.createElement('div');
    div.textContent = block.textContent ?? '';
    block.replaceWith(div);
    div.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = block.textContent ?? '';
    pre.appendChild(code);
    block.replaceWith(pre);
    pre.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// Wrap or unwrap the current selection in <code>
function toggleInlineCode(savedRange: Range | null) {
  const range = savedRange;
  if (!range) return;
  const sel = window.getSelection();
  if (sel) { sel.removeAllRanges(); sel.addRange(range); }

  // If the selection is collapsed inside an existing <code>, unwrap it
  let parent: Node | null = range.startContainer;
  while (parent && (parent as HTMLElement).tagName?.toLowerCase() !== 'code') parent = parent.parentElement;
  if (parent) {
    const code = parent as HTMLElement;
    const frag = document.createDocumentFragment();
    while (code.firstChild) frag.appendChild(code.firstChild);
    code.replaceWith(frag);
    code.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  if (range.collapsed) return;
  const code = document.createElement('code');
  try { range.surroundContents(code); }
  catch {
    const text = range.toString();
    range.deleteContents();
    code.textContent = text;
    range.insertNode(code);
  }
  code.dispatchEvent(new Event('input', { bubbles: true }));
}

// Insert <hr> after the current block
function insertHorizontalRule(savedRange: Range | null) {
  const range = savedRange;
  if (!range) return;
  const sel = window.getSelection();
  if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  const root = rangeRoot(range);
  if (!root) return;
  const block = rangeBlock(range, root);
  const hr = document.createElement('hr');
  if (block) {
    block.after(hr);
    const next = document.createElement('div');
    next.innerHTML = '<br>';
    hr.after(next);
  } else {
    root.appendChild(hr);
  }
  hr.dispatchEvent(new Event('input', { bubbles: true }));
}

function isInBlock(savedRange: Range | null, tagName: string): boolean {
  const range = savedRange ?? (window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null);
  if (!range) return false;
  let n: Node | null = range.startContainer;
  while (n && (n as HTMLElement).contentEditable !== 'true') {
    if ((n as HTMLElement).tagName?.toLowerCase() === tagName) return true;
    n = n.parentElement;
  }
  return false;
}

interface FmtBarProps {
  viewMode: 'edit' | 'source';
  onToggleSource: () => void;
  onToggleEdit: () => void;
  onSave: () => void;
  onWikilinkClick: (rect: DOMRect) => void;
  onNodeLinkClick: (rect: DOMRect) => void;
  onSourceInsert: (syntax: string) => void;
  sourceWrap: boolean;
  setSourceWrap: React.Dispatch<React.SetStateAction<boolean>>;
  onCopySource: () => void;
  saveStatusText: string | null;
}

function FormattingBar({ viewMode, onToggleSource, onToggleEdit, onSave, onWikilinkClick, onNodeLinkClick, onSourceInsert, sourceWrap, setSourceWrap, onCopySource, saveStatusText }: FmtBarProps) {
  const [showBlock, setShowBlock] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [hoveredControl, setHoveredControl] = useState<string | null>(null);
  const [toolbarWidth, setToolbarWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1440));
  const isMobileNarrow = toolbarWidth < 520;
  const savedRangeRef = useRef<Range | null>(null);
  const [, tick] = useState(0);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const blockBtnRef = useRef<HTMLButtonElement>(null);
  const wikilinkBtnRef = useRef<HTMLButtonElement>(null);
  const nodeBtnRef = useRef<HTMLButtonElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
  };

  const restoreSelection = () => {
    const r = savedRangeRef.current;
    if (!r) return;
    const sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(r); }
  };

  const fmt = (cmd: string, val?: string) => {
    restoreSelection();
    document.execCommand(cmd, false, val);
    document.activeElement?.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const isActive = (cmd: string) => {
    try { return document.queryCommandState(cmd); } catch { return false; }
  };

  const currentBlock = getBlockType(showBlock ? savedRangeRef.current : null);

  const btnStyle = (active: boolean, hovered = false): React.CSSProperties => ({
    height: isMobileNarrow ? 32 : 26,
    minWidth: isMobileNarrow ? 32 : 26,
    padding: '0 7px',
    background: active
      ? (hovered ? 'rgba(184,119,80,0.33)' : 'rgba(184,119,80,0.25)')
      : (hovered ? 'var(--c-hover)' : 'transparent'),
    border: active
      ? `1px solid ${hovered ? 'rgba(184,119,80,0.72)' : 'rgba(184,119,80,0.5)'}`
      : `1px solid ${hovered ? 'var(--c-border)' : 'transparent'}`,
    borderRadius: 5,
    color: active ? 'var(--c-line)' : (hovered ? 'var(--c-text-hi)' : 'var(--c-text-lo)'),
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
    fontWeight: active ? 600 : 400,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: hovered && !active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
    transition: 'background 0.12s, border-color 0.12s, color 0.12s, box-shadow 0.12s',
  });

  const hoverHandlers = (id: string) => ({
    onMouseEnter: () => setHoveredControl(id),
    onMouseLeave: () => setHoveredControl((current) => (current === id ? null : current)),
  });

  const modeButtonStyle = (active: boolean, side: 'left' | 'right'): React.CSSProperties => ({
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: 86,
    height: 34,
    padding: '0 12px',
    borderRadius: side === 'left' ? '7px 5px 5px 7px' : '5px 7px 7px 5px',
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
    fontWeight: active ? 700 : 600,
    background: 'transparent',
    color: active ? 'var(--c-text-hi)' : 'var(--c-text-lo)',
    transform: active ? 'translateY(-0.5px)' : 'translateY(0)',
    transition: 'color 0.16s ease, transform 0.16s ease',
  });

  const sourceShortcutStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 26,
    padding: '0 8px',
    borderRadius: 6,
    border: '1px solid var(--c-border)',
    background: 'rgba(255,255,255,0.025)',
    color: 'var(--c-text-lo)',
    fontSize: 11,
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  };

  const sourceActionButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 26,
    padding: '0 10px',
    borderRadius: 6,
    border: '1px solid var(--c-border)',
    background: 'rgba(255,255,255,0.025)',
    color: 'var(--c-text-lo)',
    fontSize: 11,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'background 0.12s, border-color 0.12s, color 0.12s',
  };

  const overflowMenuButtonStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 10px',
    border: 'none',
    background: 'transparent',
    color: 'var(--c-text-md)',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
    textAlign: 'left',
    borderRadius: 8,
    transition: 'background 0.12s, color 0.12s',
  };

  const sourceShortcuts = [
    ['### ', 'Heading'],
    ['*text*', 'Italic'],
    ['**bold**', 'Bold'],
    ['- ', 'List'],
    ['1. ', 'Ordered'],
    ['> ', 'Quote'],
    ['`code`', 'Inline code'],
    ['```\ncode\n```', 'Code block'],
    ['[](url)', 'Link'],
    ['![](url)', 'Image'],
    ['---', 'Rule'],
    ['~~text~~', 'Strike'],
    ['[[Note]]', 'Note'],
    ['@node:', 'Node'],
  ];
  const blockMenuRect = showBlock && blockBtnRef.current ? blockBtnRef.current.getBoundingClientRect() : null;
  const moreMenuRect = showMoreMenu && moreBtnRef.current ? moreBtnRef.current.getBoundingClientRect() : null;
  const collapseSecondaryFormatting = isMobileNarrow || toolbarWidth < 1320;
  const collapseTertiaryFormatting = isMobileNarrow || toolbarWidth < 1160;
  const collapseLinkActions = isMobileNarrow || toolbarWidth < 960;
  const hideSaveStatus = isMobileNarrow || toolbarWidth < 1180;

  useEffect(() => {
    if (!showBlock) return;
    const handleWindowPointer = () => setShowBlock(false);
    window.addEventListener('mousedown', handleWindowPointer);
    return () => window.removeEventListener('mousedown', handleWindowPointer);
  }, [showBlock]);

  useEffect(() => {
    if (!showMoreMenu) return;
    const handleWindowPointer = () => setShowMoreMenu(false);
    window.addEventListener('mousedown', handleWindowPointer);
    window.addEventListener('touchstart', handleWindowPointer);
    return () => {
      window.removeEventListener('mousedown', handleWindowPointer);
      window.removeEventListener('touchstart', handleWindowPointer);
    };
  }, [showMoreMenu]);

  useEffect(() => {
    const el = toolbarRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => setToolbarWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const openWikilinkPicker = () => {
    if (wikilinkBtnRef.current) onWikilinkClick(wikilinkBtnRef.current.getBoundingClientRect());
    else if (moreBtnRef.current) onWikilinkClick(moreBtnRef.current.getBoundingClientRect());
  };

  const openNodePicker = () => {
    if (nodeBtnRef.current) onNodeLinkClick(nodeBtnRef.current.getBoundingClientRect());
    else if (moreBtnRef.current) onNodeLinkClick(moreBtnRef.current.getBoundingClientRect());
  };

  return (
    <div
      ref={toolbarRef}
      style={{
        position: 'relative',
        padding: '8px 24px 8px 24px',
        borderBottom: '1px solid var(--c-border)',
        background: 'rgba(255,255,255,0.02)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexShrink: 0,
        boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          overflowX: 'auto',
          overflowY: 'visible',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          paddingBottom: 2,
          whiteSpace: 'nowrap',
        }}
      >
      {viewMode === 'edit' && (
        <>
          {/* Block format dropdown */}
          <div style={{ flexShrink: 0 }}>
            <button
              ref={blockBtnRef}
              style={{ ...btnStyle(false, hoveredControl === 'block-style'), width: 98, justifyContent: 'space-between', paddingRight: 6 }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                saveSelection();
                setShowBlock((v) => !v);
                tick((n) => n + 1);
              }}
              {...hoverHandlers('block-style')}
            >
              <span>{BLOCK_LABELS[currentBlock] ?? 'Paragraph'}</span>
              <span style={{ fontSize: 9, opacity: 0.6 }}>▼</span>
            </button>
          </div>

          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', margin: '0 2px', flexShrink: 0 }} />

          {/* Bold / Italic / Underline / Strike */}
          <button style={btnStyle(isActive('bold'), hoveredControl === 'bold')} onMouseDown={(e) => { e.preventDefault(); saveSelection(); fmt('bold'); tick(n=>n+1); }} onTouchStart={(e) => { e.preventDefault(); saveSelection(); fmt('bold'); tick(n=>n+1); }} title="Bold (⌘B)" {...hoverHandlers('bold')}><b>B</b></button>
          <button style={{ ...btnStyle(isActive('italic'), hoveredControl === 'italic'), fontStyle: 'italic' }} onMouseDown={(e) => { e.preventDefault(); saveSelection(); fmt('italic'); tick(n=>n+1); }} onTouchStart={(e) => { e.preventDefault(); saveSelection(); fmt('italic'); tick(n=>n+1); }} title="Italic (⌘I)" {...hoverHandlers('italic')}><i>I</i></button>
          <button style={{ ...btnStyle(isActive('underline'), hoveredControl === 'underline'), textDecoration: 'underline' }} onMouseDown={(e) => { e.preventDefault(); saveSelection(); fmt('underline'); tick(n=>n+1); }} onTouchStart={(e) => { e.preventDefault(); saveSelection(); fmt('underline'); tick(n=>n+1); }} title="Underline (⌘U)" {...hoverHandlers('underline')}>U</button>
          <button style={btnStyle(isActive('strikeThrough'), hoveredControl === 'strike')} onMouseDown={(e) => { e.preventDefault(); saveSelection(); fmt('strikeThrough'); tick(n=>n+1); }} onTouchStart={(e) => { e.preventDefault(); saveSelection(); fmt('strikeThrough'); tick(n=>n+1); }} title="Strikethrough" {...hoverHandlers('strike')}><s>S</s></button>

          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', margin: '0 2px', flexShrink: 0 }} />

          {/* Lists */}
          <button style={btnStyle(isActive('insertUnorderedList'), hoveredControl === 'bullet-list')} onMouseDown={(e) => { e.preventDefault(); saveSelection(); fmt('insertUnorderedList'); tick(n=>n+1); }} onTouchStart={(e) => { e.preventDefault(); saveSelection(); fmt('insertUnorderedList'); tick(n=>n+1); }} title="Bullet list" {...hoverHandlers('bullet-list')}>• List</button>
          <button style={btnStyle(isActive('insertOrderedList'), hoveredControl === 'numbered-list')} onMouseDown={(e) => { e.preventDefault(); saveSelection(); fmt('insertOrderedList'); tick(n=>n+1); }} onTouchStart={(e) => { e.preventDefault(); saveSelection(); fmt('insertOrderedList'); tick(n=>n+1); }} title="Numbered list" {...hoverHandlers('numbered-list')}>1. List</button>

          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', margin: '0 2px', flexShrink: 0 }} />

          {!collapseSecondaryFormatting && (
            <>
              <button style={btnStyle(isInBlock(savedRangeRef.current, 'pre'), hoveredControl === 'code-block')} onMouseDown={(e) => { e.preventDefault(); saveSelection(); toggleCodeBlock(savedRangeRef.current); tick(n=>n+1); }} title="Code block" {...hoverHandlers('code-block')}><IconCodeBlock /></button>
              <button style={btnStyle(false, hoveredControl === 'hr')} onMouseDown={(e) => { e.preventDefault(); saveSelection(); insertHorizontalRule(savedRangeRef.current); tick(n=>n+1); }} title="Horizontal rule" {...hoverHandlers('hr')}><IconHorizontalRule /></button>
            </>
          )}

          {!collapseTertiaryFormatting && (
            <>
              <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', margin: '0 2px', flexShrink: 0 }} />
              <button style={btnStyle(isActive('justifyLeft'), hoveredControl === 'align-left')} onMouseDown={(e) => { e.preventDefault(); saveSelection(); fmt('justifyLeft'); tick(n=>n+1); }} title="Align left" {...hoverHandlers('align-left')}>
                <IconAlignLeft />
              </button>
              <button style={btnStyle(isActive('justifyCenter'), hoveredControl === 'align-center')} onMouseDown={(e) => { e.preventDefault(); saveSelection(); fmt('justifyCenter'); tick(n=>n+1); }} title="Align center" {...hoverHandlers('align-center')}>
                <IconAlignCenter />
              </button>
              <button style={btnStyle(isActive('justifyRight'), hoveredControl === 'align-right')} onMouseDown={(e) => { e.preventDefault(); saveSelection(); fmt('justifyRight'); tick(n=>n+1); }} title="Align right" {...hoverHandlers('align-right')}>
                <IconAlignRight />
              </button>
            </>
          )}

          {!collapseLinkActions && (
            <>
              <button
                ref={wikilinkBtnRef}
                style={{ ...btnStyle(false, hoveredControl === 'wikilink'), gap: 5, fontSize: 11 }}
                title="Link to a note"
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                  openWikilinkPicker();
                }}
                {...hoverHandlers('wikilink')}
              >
                <IconDoc />
                Note
              </button>

              <button
                ref={nodeBtnRef}
                style={{
                  ...btnStyle(false, hoveredControl === 'node-link'),
                  gap: 5,
                  fontSize: 11,
                }}
                title="Link to a canvas node"
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                  openNodePicker();
                }}
                {...hoverHandlers('node-link')}
              >
                <IconNodeLink />
                Node
              </button>
            </>
          )}

          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              ref={moreBtnRef}
              style={{ ...btnStyle(showMoreMenu, hoveredControl === 'more'), gap: 5, fontSize: 11, padding: '0 9px' }}
              title="More note actions"
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
                setShowMoreMenu((v) => !v);
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                saveSelection();
                setShowMoreMenu((v) => !v);
              }}
              {...hoverHandlers('more')}
            >
              More
              <span style={{ fontSize: 12, lineHeight: 1 }}>⋯</span>
            </button>
          </div>
        </>
      )}

      {viewMode === 'source' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            minHeight: 34,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--c-text-off)', marginRight: 2, whiteSpace: 'nowrap' }}>
            Markdown
          </span>
          {sourceShortcuts.map(([syntax, label]) => (
            <button
              key={syntax}
              type="button"
              title={`Insert ${label.toLowerCase()} syntax`}
              onMouseDown={(e) => {
                e.preventDefault();
                onSourceInsert(syntax);
              }}
              style={{
                ...sourceShortcutStyle,
                cursor: 'pointer',
                transition: 'background 0.12s, border-color 0.12s, color 0.12s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--c-hover)';
                e.currentTarget.style.borderColor = 'rgba(184,119,80,0.28)';
                e.currentTarget.style.color = 'var(--c-text-hi)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.025)';
                e.currentTarget.style.borderColor = 'var(--c-border)';
                e.currentTarget.style.color = 'var(--c-text-lo)';
              }}
            >
              <code
                style={{
                  color: 'var(--c-text-hi)',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11,
                  background: 'rgba(0,0,0,0.08)',
                  borderRadius: 4,
                  padding: '1px 5px',
                }}
              >
                {syntax}
              </code>
              <span>{label}</span>
            </button>
          ))}
          <button
            type="button"
            title={sourceWrap ? 'Disable line wrap' : 'Enable line wrap'}
            onMouseDown={(e) => {
              e.preventDefault();
              setSourceWrap((v) => !v);
            }}
            style={{
              ...sourceActionButtonStyle,
              background: sourceWrap ? 'rgba(184,119,80,0.12)' : 'rgba(255,255,255,0.025)',
              borderColor: sourceWrap ? 'rgba(184,119,80,0.28)' : 'var(--c-border)',
              color: sourceWrap ? 'var(--c-text-hi)' : 'var(--c-text-lo)',
            }}
            onMouseEnter={(e) => {
              if (sourceWrap) {
                e.currentTarget.style.background = 'rgba(184,119,80,0.16)';
                e.currentTarget.style.borderColor = 'rgba(184,119,80,0.36)';
              } else {
                e.currentTarget.style.background = 'var(--c-hover)';
                e.currentTarget.style.borderColor = 'rgba(184,119,80,0.28)';
                e.currentTarget.style.color = 'var(--c-text-hi)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = sourceWrap ? 'rgba(184,119,80,0.12)' : 'rgba(255,255,255,0.025)';
              e.currentTarget.style.borderColor = sourceWrap ? 'rgba(184,119,80,0.28)' : 'var(--c-border)';
              e.currentTarget.style.color = sourceWrap ? 'var(--c-text-hi)' : 'var(--c-text-lo)';
            }}
          >
            <IconTextWrap />
            Wrap
          </button>
          <button
            type="button"
            title="Copy raw markdown"
            onMouseDown={(e) => {
              e.preventDefault();
              onCopySource();
            }}
            style={sourceActionButtonStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--c-hover)';
              e.currentTarget.style.borderColor = 'rgba(184,119,80,0.28)';
              e.currentTarget.style.color = 'var(--c-text-hi)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.025)';
              e.currentTarget.style.borderColor = 'var(--c-border)';
              e.currentTarget.style.color = 'var(--c-text-lo)';
            }}
          >
            <IconCopy />
            Copy
          </button>
        </div>
      )}
      </div>

      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginLeft: 'auto',
          paddingLeft: 8,
          background: 'linear-gradient(90deg, rgba(246,241,234,0) 0%, var(--c-canvas) 18px)',
        }}
      >
      {viewMode === 'edit' && (
        <>
          {saveStatusText && !hideSaveStatus && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--c-text-lo)',
                userSelect: 'none',
                whiteSpace: 'nowrap',
                maxWidth: 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={saveStatusText}
            >
              {saveStatusText}
            </span>
          )}
          <button
            style={btnStyle(false, hoveredControl === 'save')}
            title="Save Note (⌘S)"
            aria-label="Save Note (Command+S)"
            onMouseDown={(e) => { e.preventDefault(); onSave(); }}
            {...hoverHandlers('save')}
          >
            <IconSaveFile />
          </button>
          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', margin: '0 2px 0 2px', flexShrink: 0 }} />
        </>
      )}

      {/* Preview / Source toggle */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          gap: 2,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid var(--c-border)',
          borderRadius: 10,
          padding: 3,
          flexShrink: 0,
          boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.04)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 3,
            bottom: 3,
            left: 3,
            width: 86,
            borderRadius: 7,
            background: 'var(--c-panel)',
            boxShadow: '0 1px 5px rgba(0,0,0,0.2)',
            transform: viewMode === 'source' ? 'translateX(88px)' : 'translateX(0)',
            transition: 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
            pointerEvents: 'none',
          }}
        />
        <button
          title="Rich text editor"
          onMouseDown={(e) => { e.preventDefault(); if (viewMode === 'source') onToggleEdit(); }}
          style={modeButtonStyle(viewMode === 'edit', 'left')}
          onMouseEnter={(e) => { if (viewMode !== 'edit') e.currentTarget.style.color = 'var(--c-text-md)'; }}
          onMouseLeave={(e) => { if (viewMode !== 'edit') e.currentTarget.style.color = 'var(--c-text-lo)'; }}
        ><IconEye /> Preview</button>
        <button
          title="Markdown source"
          onMouseDown={(e) => { e.preventDefault(); if (viewMode === 'edit') onToggleSource(); }}
          style={modeButtonStyle(viewMode === 'source', 'right')}
          onMouseEnter={(e) => { if (viewMode !== 'source') e.currentTarget.style.color = 'var(--c-text-md)'; }}
          onMouseLeave={(e) => { if (viewMode !== 'source') e.currentTarget.style.color = 'var(--c-text-lo)'; }}
        ><IconCode /> Source</button>
      </div>
      </div>

      {blockMenuRect && (
        <div
          style={{
            position: 'fixed',
            top: Math.min(blockMenuRect.bottom + 6, window.innerHeight - 170),
            left: Math.min(blockMenuRect.left, window.innerWidth - 138),
            zIndex: 520,
            minWidth: 130,
            overflow: 'hidden',
            background: 'var(--c-panel)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 7,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {(['p', 'h1', 'h2', 'h3'] as const).map((tag) => (
            <div
              key={tag}
              onMouseDown={(e) => {
                e.preventDefault();
                applyBlock(tag, savedRangeRef.current);
                setShowBlock(false);
              }}
              style={{
                padding: '7px 12px',
                cursor: 'pointer',
                background: currentBlock === tag ? 'rgba(184,119,80,0.15)' : 'transparent',
                color: currentBlock === tag ? 'var(--c-line)' : 'var(--c-text-hi)',
                fontSize: tag === 'h1' ? 16 : tag === 'h2' ? 14 : tag === 'h3' ? 13 : 13,
                fontWeight: tag !== 'p' ? 700 : 400,
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { if (currentBlock !== tag) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = currentBlock === tag ? 'rgba(184,119,80,0.15)' : 'transparent'; }}
            >
              {BLOCK_LABELS[tag]}
            </div>
          ))}
        </div>
      )}

      {showMoreMenu && (isMobileNarrow || moreMenuRect) && (
        <div
          style={isMobileNarrow
            ? {
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 520,
                padding: 6,
                background: 'var(--c-panel)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '0 0 10px 10px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
              }
            : {
                position: 'fixed',
                top: Math.min(moreMenuRect!.bottom + 6, window.innerHeight - 110),
                left: Math.min(moreMenuRect!.right - 170, window.innerWidth - 178),
                zIndex: 520,
                minWidth: 170,
                padding: 6,
                background: 'var(--c-panel)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
              }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <button
            style={overflowMenuButtonStyle}
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
              setShowMoreMenu(false);
              toggleBlockquote(savedRangeRef.current);
              tick(n=>n+1);
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--c-hover)';
              e.currentTarget.style.color = 'var(--c-text-hi)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--c-text-md)';
            }}
          >
            <IconQuote />
            <span>Blockquote</span>
          </button>
          <button
            style={overflowMenuButtonStyle}
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
              setShowMoreMenu(false);
              toggleInlineCode(savedRangeRef.current);
              tick(n=>n+1);
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--c-hover)';
              e.currentTarget.style.color = 'var(--c-text-hi)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--c-text-md)';
            }}
          >
            <IconCode />
            <span>Inline Code</span>
          </button>
          {collapseSecondaryFormatting && (
            <>
              <button
                style={overflowMenuButtonStyle}
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                  setShowMoreMenu(false);
                  toggleCodeBlock(savedRangeRef.current);
                  tick(n=>n+1);
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--c-hover)';
                  e.currentTarget.style.color = 'var(--c-text-hi)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--c-text-md)';
                }}
              >
                <IconCodeBlock />
                <span>Code Block</span>
              </button>
              <button
                style={overflowMenuButtonStyle}
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                  setShowMoreMenu(false);
                  insertHorizontalRule(savedRangeRef.current);
                  tick(n=>n+1);
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--c-hover)';
                  e.currentTarget.style.color = 'var(--c-text-hi)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--c-text-md)';
                }}
              >
                <IconHorizontalRule />
                <span>Horizontal Rule</span>
              </button>
            </>
          )}
          {collapseTertiaryFormatting && (
            <>
              <button
                style={overflowMenuButtonStyle}
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                  setShowMoreMenu(false);
                  fmt('justifyLeft');
                  tick(n=>n+1);
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--c-hover)';
                  e.currentTarget.style.color = 'var(--c-text-hi)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--c-text-md)';
                }}
              >
                <IconAlignLeft />
                <span>Align Left</span>
              </button>
              <button
                style={overflowMenuButtonStyle}
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                  setShowMoreMenu(false);
                  fmt('justifyCenter');
                  tick(n=>n+1);
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--c-hover)';
                  e.currentTarget.style.color = 'var(--c-text-hi)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--c-text-md)';
                }}
              >
                <IconAlignCenter />
                <span>Align Center</span>
              </button>
              <button
                style={overflowMenuButtonStyle}
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                  setShowMoreMenu(false);
                  fmt('justifyRight');
                  tick(n=>n+1);
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--c-hover)';
                  e.currentTarget.style.color = 'var(--c-text-hi)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--c-text-md)';
                }}
              >
                <IconAlignRight />
                <span>Align Right</span>
              </button>
            </>
          )}
          {collapseLinkActions && (
            <>
              <button
                style={overflowMenuButtonStyle}
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                  setShowMoreMenu(false);
                  openWikilinkPicker();
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--c-hover)';
                  e.currentTarget.style.color = 'var(--c-text-hi)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--c-text-md)';
                }}
              >
                <IconDoc />
                <span>Insert Note Link</span>
              </button>
              <button
                style={overflowMenuButtonStyle}
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                  setShowMoreMenu(false);
                  openNodePicker();
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--c-hover)';
                  e.currentTarget.style.color = 'var(--c-text-hi)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--c-text-md)';
                }}
              >
                <IconNodeLink />
                <span>Insert Node Link</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Picker components ─────────────────────────────────────────────────────────

const PICKER_WIDTH = 280;

interface WikilinkPickerProps {
  pos: { x: number; y: number };
  documents: Document[];
  activeDocId: string | null;
  onSelect: (title: string) => void;
  onCreate: (title: string) => void;
  onClose: () => void;
}

function WikilinkPicker({ pos, documents, activeDocId, onSelect, onCreate, onClose }: WikilinkPickerProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return documents
      .filter((d) => d.id !== activeDocId && (!q || d.title.toLowerCase().includes(q) || stripHtml(d.content).toLowerCase().includes(q)))
      .slice(0, 8);
  }, [query, documents, activeDocId]);

  const exactMatch = documents.some((d) => d.title.toLowerCase() === query.toLowerCase().trim() && d.id !== activeDocId);
  const left = Math.min(pos.x, window.innerWidth - PICKER_WIDTH - 12);

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onMouseDown={onClose} />
      <div style={{
        position: 'fixed', left, top: pos.y, width: PICKER_WIDTH, zIndex: 9999,
        background: 'var(--c-panel)', border: '1px solid var(--c-border)',
        borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.4)', overflow: 'hidden',
      }}>
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
            <rect x="1" y="1" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M3 4.5h6M3 6.5h6M3 8.5h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); onClose(); }
              if (e.key === 'Enter') {
                e.preventDefault();
                if (filtered.length > 0) onSelect(filtered[0].title);
                else if (query.trim()) onCreate(query.trim());
              }
            }}
            placeholder="Search notes…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--c-text-hi)', fontSize: 13, fontFamily: 'inherit' }}
          />
        </div>
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          {filtered.map((d) => (
            <div
              key={d.id}
              onMouseDown={(e) => { e.preventDefault(); onSelect(d.title); }}
              style={{ padding: '8px 12px', cursor: 'pointer', transition: 'background 0.1s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--c-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text-hi)', marginBottom: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {d.title || 'Untitled'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--c-text-lo)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {stripHtml(d.content).slice(0, 80) || 'Empty'}
              </div>
            </div>
          ))}
          {query.trim() && !exactMatch && (
            <div
              onMouseDown={(e) => { e.preventDefault(); onCreate(query.trim()); }}
              style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, borderTop: filtered.length > 0 ? '1px solid var(--c-border)' : 'none', transition: 'background 0.1s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--c-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 15, lineHeight: 1, color: 'var(--c-line)' }}>+</span>
              <span style={{ fontSize: 13, color: 'var(--c-text-md)' }}>New note: <b style={{ color: 'var(--c-text-hi)' }}>"{query.trim()}"</b></span>
            </div>
          )}
          {filtered.length === 0 && !query.trim() && (
            <div style={{ padding: '12px', fontSize: 12, color: 'var(--c-text-lo)', textAlign: 'center' }}>No other notes yet</div>
          )}
        </div>
      </div>
    </>
  );
}

interface NodePickerProps {
  pos: { x: number; y: number };
  nodes: CanvasNode[];
  documents: Document[];
  onSelect: (nodeId: string, label: string) => void;
  onClose: () => void;
}

function NodePicker({ pos, nodes, documents, onSelect, onClose }: NodePickerProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const SKIP_TYPES = new Set(['connector']);
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return nodes
      .filter((n) => !SKIP_TYPES.has(n.type))
      .map((n) => ({ node: n, label: getNodeLabel(n, documents) }))
      .filter(({ label }) => !q || label.toLowerCase().includes(q))
      .slice(0, 10);
  }, [query, nodes, documents]);

  const left = Math.min(pos.x, window.innerWidth - PICKER_WIDTH - 12);

  const typeIcon = (type: string) => {
    if (type === 'sticky') return '📌';
    if (type === 'document') return '📄';
    if (type === 'shape') return '◻';
    if (type === 'section') return '□';
    if (type === 'taskcard') return '☑';
    if (type === 'codeblock') return '{}';
    if (type === 'textblock') return 'T';
    return '·';
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onMouseDown={onClose} />
      <div style={{
        position: 'fixed', left, top: pos.y, width: PICKER_WIDTH, zIndex: 9999,
        background: 'var(--c-panel)', border: '1px solid var(--c-border)',
        borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.4)', overflow: 'hidden',
      }}>
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
            <rect x="1" y="2" width="10" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); onClose(); }
              if (e.key === 'Enter' && filtered.length > 0) {
                e.preventDefault();
                onSelect(filtered[0].node.id, filtered[0].label);
              }
            }}
            placeholder="Search canvas nodes…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--c-text-hi)', fontSize: 13, fontFamily: 'inherit' }}
          />
        </div>
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          {filtered.map(({ node, label }) => (
            <div
              key={node.id}
              onMouseDown={(e) => { e.preventDefault(); onSelect(node.id, label); }}
              style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.1s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--c-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 12, opacity: 0.6, flexShrink: 0, fontFamily: 'monospace' }}>{typeIcon(node.type)}</span>
              <span style={{ fontSize: 13, color: 'var(--c-text-hi)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{label}</span>
              <span style={{ fontSize: 10, color: 'var(--c-text-lo)', flexShrink: 0, marginLeft: 'auto' }}>{node.type}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '12px', fontSize: 12, color: 'var(--c-text-lo)', textAlign: 'center' }}>No canvas nodes found</div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Doc emoji picker ─────────────────────────────────────────────────────────

const DOC_EMOJIS = [
  '📝','📋','📌','📍','📎','📁','🗂️','🗒️','🗓️','📅',
  '💡','🔦','🕯️','🔍','🔎','🔑','🔒','🔓','⚙️','🛠️',
  '🚀','🛸','🌍','🌙','☀️','⭐','🌟','✨','💫','🌈',
  '🔥','⚡','❄️','💧','🌊','🍀','🌸','🌺','🌻','🍁',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💎','🏆',
  '🎯','🎨','🎮','🎵','🎸','🎲','🧩','⚽','🎉','🎊',
  '😀','😊','🤔','😎','🥳','🫡','👀','🦁','🐯','🦄',
  '✅','❌','⚠️','💬','📈','📉','💻','📡','🧪','🔭',
];

interface DocEmojiPickerProps {
  pos: { x: number; y: number };
  current?: string;
  onSelect: (emoji: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

function DocEmojiPicker({ pos, current, onSelect, onRemove, onClose }: DocEmojiPickerProps) {
  const COLS = 10;
  const left = Math.min(pos.x, window.innerWidth - COLS * 34 - 24);
  const top = Math.min(pos.y, window.innerHeight - 260 - 12);
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onMouseDown={onClose} />
      <div style={{
        position: 'fixed', left, top, zIndex: 9999,
        background: 'var(--c-panel)', border: '1px solid var(--c-border)',
        borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        padding: 10,
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, width: COLS * 34 }}>
          {DOC_EMOJIS.map((e) => (
            <button
              key={e}
              onMouseDown={(ev) => { ev.preventDefault(); onSelect(e); }}
              style={{
                width: 32, height: 32, fontSize: 18, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6, cursor: 'pointer', transition: 'background 0.1s',
                border: e === current ? '1.5px solid var(--c-line)' : '1.5px solid transparent',
                background: e === current ? 'rgba(184,119,80,0.15)' : 'transparent',
              }}
              onMouseEnter={(ev) => { if (e !== current) (ev.currentTarget as HTMLElement).style.background = 'var(--c-hover)'; }}
              onMouseLeave={(ev) => { (ev.currentTarget as HTMLElement).style.background = e === current ? 'rgba(184,119,80,0.15)' : 'transparent'; }}
            >{e}</button>
          ))}
        </div>
        {current && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--c-border)' }}>
            <button
              onMouseDown={(e) => { e.preventDefault(); onRemove(); }}
              style={{
                width: '100%', padding: '6px', background: 'transparent',
                border: '1px solid var(--c-border)', borderRadius: 7,
                color: 'var(--c-text-lo)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
                transition: 'background 0.1s, color 0.1s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--c-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--c-red)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--c-text-lo)'; }}
            >Remove icon</button>
          </div>
        )}
      </div>
    </>
  );
}

// ── DocumentMode ─────────────────────────────────────────────────────────────

interface DocumentModeProps {
  onClose?: () => void;
}

export default function DocumentMode({ onClose }: DocumentModeProps) {
  const { documents, activeDocId, updateDocument, addDocument, closeDocument, openDocumentWithMorph, nodes, pages, activePageId, boardTitle } = useBoardStore();
  const contentRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const [viewMode, setViewMode] = useState<'edit' | 'source'>('edit');
  const [sourceText, setSourceText] = useState('');
  const [sourceWrap, setSourceWrap] = useState(true);
  const [, forceUpdate] = useState(0);
  const [docHistory, setDocHistory] = useState<string[]>([]);
  const [wikiPreview, setWikiPreview] = useState<{ x: number; y: number; doc: Document } | null>(null);
  const wikiPreviewTitle = useRef<string | null>(null);
  const [wikilinkPicker, setWikilinkPicker] = useState<{ x: number; y: number } | null>(null);
  const [nodePicker, setNodePicker] = useState<{ x: number; y: number } | null>(null);
  const [emojiPicker, setEmojiPicker] = useState<{ x: number; y: number } | null>(null);
  const [isHoveringDoc, setIsHoveringDoc] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [hasEditedSinceOpen, setHasEditedSinceOpen] = useState(false);
  const [dirtySinceSave, setDirtySinceSave] = useState(false);
  const [, forceSaveStatusTick] = useState(0);
  const savedSelectionRef = useRef<Range | null>(null);

  const doc = documents.find((d) => d.id === activeDocId) as Document | undefined;
  const activePage = pages.find((p) => p.id === activePageId);
  const pageBackLabel = activePage?.layoutMode === 'freeform' ? 'Back to canvas' : 'Back to page';
  const pageBackTitle = activePage?.layoutMode === 'freeform'
    ? `Return to ${activePage?.name ?? boardTitle} canvas`
    : `Return to ${activePage?.name ?? boardTitle} page`;
  const handleClose = onClose ?? closeDocument;

  // Backlinks: other docs that reference [[this doc's title]]
  const backlinks = useMemo(() => {
    if (!doc?.title?.trim()) return [];
    const esc = doc.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pat = new RegExp(`\\[\\[${esc}\\]\\]`, 'gi');
    return documents
      .filter((d) => d.id !== doc.id && pat.test(d.content.replace(/<[^>]+>/g, ' ')))
      .map((d) => {
        const text = d.content.replace(/<[^>]+>/g, ' ');
        const idx = text.search(pat);
        const start = Math.max(0, idx - 70);
        const end = Math.min(text.length, idx + 70);
        return { from: d, context: '…' + text.slice(start, end).trim() + '…' };
      });
  }, [doc?.id, doc?.title, documents]);

  // Canvas node mentions: @node:id patterns found in this doc
  const mentionedNodes = useMemo(() => {
    if (!doc?.content) return [];
    const ids = new Set<string>();
    const re = /@node:([a-zA-Z0-9_-]+)/g;
    let m: RegExpExecArray | null;
    const text = doc.content.replace(/<[^>]+>/g, ' ');
    while ((m = re.exec(text)) !== null) ids.add(m[1]);
    return nodes.filter((n) => ids.has(n.id));
  }, [doc?.id, doc?.content, nodes]);

  const getSourceCursorOffset = useCallback((syntax: string) => {
    const placeholders = ['text', 'bold', 'code', 'url', 'alt', 'Note'];
    for (const placeholder of placeholders) {
      const idx = syntax.indexOf(placeholder);
      if (idx >= 0) return idx;
    }
    return syntax.length;
  }, []);

  // Sync content to DOM when switching documents; auto-bootstrap H1 for new docs
  useEffect(() => {
    if (!doc || !contentRef.current) return;
    let content = doc.content ?? '';
    if (!content.trim() && doc.title) {
      content = `<h1>${doc.title}</h1><p><br></p>`;
      updateDocument(doc.id, { content });
    }
    contentRef.current.innerHTML = content;
    applyChipsToDOM(contentRef.current);
    setViewMode('edit');
    // Place cursor at end of H1 if it was just created
    const h1 = contentRef.current.querySelector('h1');
    if (h1) {
      const range = document.createRange();
      range.selectNodeContents(h1);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } else {
      contentRef.current.focus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  // Keep formatting button states updated on selection change
  useEffect(() => {
    const onSel = () => forceUpdate((n) => n + 1);
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  useEffect(() => {
    setLastSavedAt(null);
    setHasEditedSinceOpen(false);
    setDirtySinceSave(false);
  }, [doc?.id]);

  useEffect(() => {
    if (!lastSavedAt) return;
    const interval = window.setInterval(() => forceSaveStatusTick((n) => n + 1), 30_000);
    return () => window.clearInterval(interval);
  }, [lastSavedAt]);

  const markDirty = useCallback(() => {
    setHasEditedSinceOpen(true);
    setDirtySinceSave(true);
  }, []);

  // When H1 in editor changes, sync to doc.title
  const handleInput = useCallback(() => {
    if (!contentRef.current || !doc) return;
    const firstBlock = contentRef.current.firstElementChild as HTMLElement | null;
    const updates: Partial<Document> = { content: stripChipsFromHTML(contentRef.current.innerHTML) };
    if (firstBlock?.tagName === 'H1') {
      const h1Text = firstBlock.textContent ?? '';
      if (h1Text && h1Text !== doc.title) updates.title = h1Text;
    }
    markDirty();
    updateDocument(doc.id, updates);
  }, [doc?.id, doc?.title, markDirty, updateDocument]);

  const switchToSource = () => {
    if (!doc) return;
    setSourceText(htmlToMarkdown(doc.content ?? ''));
    setViewMode('source');
  };

  const switchToEdit = () => {
    if (!doc) return;
    const html = markdownToHtml(sourceText);
    markDirty();
    updateDocument(doc.id, { content: html });
    setViewMode('edit');
    requestAnimationFrame(() => {
      if (contentRef.current) {
        contentRef.current.innerHTML = html;
        applyChipsToDOM(contentRef.current);
      }
    });
  };

  const insertSourceSyntax = useCallback((syntax: string) => {
    const textarea = sourceRef.current;
    const start = textarea?.selectionStart ?? sourceText.length;
    const end = textarea?.selectionEnd ?? sourceText.length;
    const selected = sourceText.slice(start, end);
    const nextText = sourceText.slice(0, start) + syntax + sourceText.slice(end);
    const cursorOffset = selected ? syntax.length : getSourceCursorOffset(syntax);
    setSourceText(nextText);
    markDirty();
    requestAnimationFrame(() => {
      sourceRef.current?.focus();
      const cursor = start + cursorOffset;
      sourceRef.current?.setSelectionRange(cursor, selected ? cursor + selected.length : cursor);
    });
  }, [markDirty, sourceText]);

  const copySourceText = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sourceText);
      toast('Copied source');
    } catch (err) {
      try {
        const temp = document.createElement('textarea');
        temp.value = sourceText;
        temp.readOnly = true;
        temp.style.position = 'fixed';
        temp.style.left = '-9999px';
        temp.style.top = '0';
        document.body.appendChild(temp);
        temp.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(temp);
        toast(ok ? 'Copied source' : 'Copy failed');
      } catch (copyErr) {
        console.error(err, copyErr);
        toast('Copy failed');
      }
    }
  }, [sourceText]);

  const handleSave = async () => {
    if (!doc) return;
    const md = htmlToMarkdown(doc.content ?? '');
    const filename = generateMarkdownFilename(doc.title);
    if (hasWorkspaceHandle()) {
      try {
        const linkedFile = doc.linkedFile ?? `notes/${filename}`;
        const parts = linkedFile.split('/').filter(Boolean);
        const file = parts.pop() ?? filename;
        const folder = parts.join('/');
        await saveTextFileToWorkspace(folder, file, md);
        if (!doc.linkedFile) updateDocument(doc.id, { linkedFile });
        setLastSavedAt(Date.now());
        setHasEditedSinceOpen(true);
        setDirtySinceSave(false);
        toast(`Saved: ${linkedFile}`);
      } catch (err) {
        console.error(err);
        toast('Save failed');
      }
    } else {
      saveAs(new Blob([md], { type: 'text/markdown;charset=utf-8' }), filename);
      setLastSavedAt(Date.now());
      setHasEditedSinceOpen(true);
      setDirtySinceSave(false);
    }
  };

  useEffect(() => {
    const onSaveActiveDocument = () => { void handleSave(); };
    window.addEventListener('devboard:save-active-document', onSaveActiveDocument);
    return () => window.removeEventListener('devboard:save-active-document', onSaveActiveDocument);
  }, [handleSave]);

  const saveStatusText = !hasEditedSinceOpen
    ? null
    : dirtySinceSave
      ? (lastSavedAt ? `Unsaved changes, saved ${relativeTime(lastSavedAt)}` : 'Unsaved changes')
      : (lastSavedAt ? `Last saved ${relativeTime(lastSavedAt)}` : null);

  // ── Chip insertion ────────────────────────────────────────────────────────

  const insertChipInEditor = useCallback((chipEl: HTMLElement) => {
    if (!contentRef.current) return;
    contentRef.current.focus();
    const sel = window.getSelection();
    if (!sel) return;

    if (savedSelectionRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedSelectionRef.current);
      savedSelectionRef.current = null;
    }

    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(chipEl);
      const space = document.createTextNode(' ');
      range.setStartAfter(chipEl);
      range.insertNode(space);
      range.setStartAfter(space);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    contentRef.current.dispatchEvent(new Event('input', { bubbles: true }));
  }, []);

  const insertWikiChip = useCallback((title: string) => {
    const span = document.createElement('span');
    span.className = 'chip-wiki';
    span.dataset.chip = 'wiki';
    span.dataset.title = title;
    span.textContent = title;
    span.contentEditable = 'false';
    insertChipInEditor(span);
    setWikilinkPicker(null);
  }, [insertChipInEditor]);

  const insertNodeChip = useCallback((nodeId: string, label: string) => {
    const span = document.createElement('span');
    span.className = 'chip-node';
    span.dataset.chip = 'node';
    span.dataset.nodeid = nodeId;
    span.textContent = label;
    span.contentEditable = 'false';
    insertChipInEditor(span);
    setNodePicker(null);
  }, [insertChipInEditor]);

  const handleCreateAndLink = useCallback((title: string) => {
    const newId = addDocument({ title, content: `<h1>${title}</h1><p><br></p>` });
    void newId;
    insertWikiChip(title);
  }, [addDocument, insertWikiChip]);

  // ── Toolbar callbacks ─────────────────────────────────────────────────────

  const handleWikilinkClick = useCallback((rect: DOMRect) => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
    setNodePicker(null);
    setWikilinkPicker({ x: rect.left, y: rect.bottom + 6 });
  }, []);

  const handleNodeLinkClick = useCallback((rect: DOMRect) => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
    setWikilinkPicker(null);
    setNodePicker({ x: rect.left, y: rect.bottom + 6 });
  }, []);

  if (!doc) return null;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--c-canvas)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          height: 44,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'var(--c-panel)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 8,
          flexShrink: 0,
        }}
      >
        {/* Back through wikilink history */}
        {docHistory.length > 0 && (() => {
          const prevDoc = documents.find((d) => d.id === docHistory[docHistory.length - 1]);
          return (
            <button
              title={`Back to: ${prevDoc?.title || 'previous note'}`}
              onClick={() => {
                const prevId = docHistory[docHistory.length - 1];
                setDocHistory((h) => h.slice(0, -1));
                openDocumentWithMorph(prevId);
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '0 8px', height: 28,
                background: 'rgba(184,119,80,0.12)', border: '1px solid rgba(184,119,80,0.3)',
                borderRadius: 6, color: 'var(--c-line)', cursor: 'pointer', fontSize: 11,
                fontFamily: 'inherit', flexShrink: 0, transition: 'background 0.12s',
                maxWidth: 180,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(184,119,80,0.22)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(184,119,80,0.12)'; }}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M7 2L4 5.5L7 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {prevDoc?.title || 'Back'}
              </span>
            </button>
          );
        })()}

        {/* Breadcrumb */}
        <button
          onClick={handleClose}
          title={pageBackTitle}
          style={{
            padding: 0,
            background: 'transparent',
            border: 'none',
            fontSize: 12,
            color: 'var(--c-text-lo)',
            cursor: 'pointer',
            userSelect: 'none',
            flexShrink: 0,
            transition: 'color 0.12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--c-text-hi)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--c-text-lo)'; }}
        >
          {activePage?.name ?? boardTitle}
        </button>
        <span style={{ fontSize: 12, color: 'var(--c-text-lo)', opacity: 0.4, flexShrink: 0 }}>›</span>
        <input
          type="text"
          value={doc.title}
          onChange={(e) => {
            const newTitle = e.target.value;
            markDirty();
            updateDocument(doc.id, { title: newTitle });
            if (contentRef.current) {
              const firstBlock = contentRef.current.firstElementChild;
              if (firstBlock?.tagName === 'H1') firstBlock.textContent = newTitle;
            }
          }}
          placeholder="Untitled note"
          style={{
            flex: 1,
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--c-text-hi)',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            minWidth: 0,
          }}
        />
      </div>

      {/* Body: editor */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <FormattingBar
            viewMode={viewMode}
            onToggleSource={switchToSource}
            onToggleEdit={switchToEdit}
            onSave={handleSave}
            onWikilinkClick={handleWikilinkClick}
            onNodeLinkClick={handleNodeLinkClick}
            onSourceInsert={insertSourceSyntax}
            sourceWrap={sourceWrap}
            setSourceWrap={setSourceWrap}
            onCopySource={copySourceText}
            saveStatusText={saveStatusText}
          />

          {viewMode === 'edit' && (
            <div
              style={{ flex: 1, overflowY: 'auto', position: 'relative' }}
              onMouseLeave={() => { wikiPreviewTitle.current = null; setWikiPreview(null); }}
              onMouseMove={(e) => {
                const chip = (e.target as HTMLElement).closest?.('[data-chip="wiki"]') as HTMLElement | null;
                if (chip) {
                  const title = chip.dataset.title ?? '';
                  if (wikiPreviewTitle.current !== title) {
                    wikiPreviewTitle.current = title;
                    const linked = documents.find((d) => d.title === title);
                    if (linked) {
                      const rect = chip.getBoundingClientRect();
                      setWikiPreview({ x: Math.min(rect.left, window.innerWidth - 340), y: rect.bottom + 10, doc: linked });
                    } else {
                      setWikiPreview(null);
                    }
                  }
                } else if (wikiPreviewTitle.current !== null) {
                  wikiPreviewTitle.current = null;
                  setWikiPreview(null);
                }
              }}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                const chip = target.closest('[data-chip]') as HTMLElement | null;
                if (!chip) return;
                const type = chip.dataset.chip;
                if (type === 'wiki') {
                  const title = chip.dataset.title;
                  const linked = documents.find((d) => d.title === title);
                  if (linked && doc) {
                    setDocHistory((prev) => [...prev, doc.id]);
                    openDocumentWithMorph(linked.id);
                  }
                } else if (type === 'node') {
                  const nodeId = chip.dataset.nodeid;
                  if (nodeId) { handleClose(); focusNode(nodeId, 420); }
                }
              }}
            >
              {/* Emoji area — above the H1, hover-zone scoped to this div */}
              <div
                style={{ padding: '40px max(48px, calc(50% - 380px)) 0' }}
                onMouseEnter={() => setIsHoveringDoc(true)}
                onMouseLeave={() => setIsHoveringDoc(false)}
              >
                {doc.emoji ? (
                  <button
                    title="Change icon"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setEmojiPicker({ x: rect.left, y: rect.bottom + 8 });
                    }}
                    style={{
                      fontSize: 52, lineHeight: 1, display: 'block', marginBottom: 12,
                      background: 'none', border: '1.5px solid transparent', borderRadius: 10,
                      cursor: 'pointer', padding: '4px 6px', transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; }}
                  >{doc.emoji}</button>
                ) : (
                  <button
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setEmojiPicker({ x: rect.left, y: rect.bottom + 8 });
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12,
                      padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12,
                      fontFamily: 'inherit', background: 'transparent',
                      border: '1px solid var(--c-border)', color: 'var(--c-text-lo)',
                      opacity: isHoveringDoc ? 1 : 0, transition: 'opacity 0.15s',
                      pointerEvents: isHoveringDoc ? 'auto' : 'none',
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
                      <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2" />
                      <circle cx="4.5" cy="5.5" r="0.8" fill="currentColor" />
                      <circle cx="8.5" cy="5.5" r="0.8" fill="currentColor" />
                      <path d="M4 8C4.5 9.2 8.5 9.2 9 8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                    </svg>
                    Add icon
                  </button>
                )}
              </div>

              <div
                ref={contentRef}
                contentEditable
                suppressContentEditableWarning
                className="doc-content"
                onInput={handleInput}
                style={{
                  padding: '12px max(48px, calc(50% - 380px)) 48px',
                  color: 'var(--c-text-hi)',
                  fontSize: '16px',
                  lineHeight: 1.8,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  outline: 'none',
                  wordWrap: 'break-word',
                  minHeight: '100%',
                }}
              />

              {/* Canvas node mentions panel */}
              {mentionedNodes.length > 0 && (
                <div style={{ margin: '0 max(48px, calc(50% - 380px)) 32px', padding: '14px 16px', background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-text-lo)', marginBottom: 8 }}>
                    Mentioned on canvas
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {mentionedNodes.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => { handleClose(); focusNode(n.id, 420); }}
                        className="chip-node"
                        style={{ cursor: 'pointer', border: 'none', fontFamily: 'inherit', fontSize: 12 }}
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginRight: 4, flexShrink: 0 }}>
                          <rect x="1" y="1.5" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.1"/>
                        </svg>
                        {getNodeLabel(n, documents)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Backlinks panel */}
              <div style={{ margin: '0 max(48px, calc(50% - 380px)) 80px', borderTop: '1px solid var(--c-border)', paddingTop: 24 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-text-lo)', marginBottom: 12 }}>
                  Linked mentions ({backlinks.length})
                </div>
                {backlinks.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--c-text-lo)' }}>No other notes reference this one yet.</div>
                )}
                {backlinks.map((bl) => (
                  <div
                    key={bl.from.id}
                    onClick={() => { if (doc) setDocHistory((h) => [...h, doc.id]); openDocumentWithMorph(bl.from.id); }}
                    style={{ padding: '10px 14px', marginBottom: 8, background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 8, cursor: 'pointer', transition: 'background 120ms' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--c-hover)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--c-panel)'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--c-text-hi)', marginBottom: 4 }}>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1" y="1" width="9" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.1"/><path d="M3 4h5M3 6h5M3 8h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
                      {bl.from.title || 'Untitled'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--c-text-md)', lineHeight: 1.5 }}>{bl.context}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viewMode === 'source' && (
            <textarea
              ref={sourceRef}
              value={sourceText}
              wrap={sourceWrap ? 'soft' : 'off'}
              onChange={(e) => {
                markDirty();
                setSourceText(e.target.value);
              }}
              spellCheck={false}
              style={{
                flex: 1,
                padding: '48px max(48px, calc(50% - 380px))',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                color: 'var(--c-text-hi)',
                fontSize: '14px',
                lineHeight: 1.7,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                overflowY: 'auto',
                overflowX: sourceWrap ? 'hidden' : 'auto',
                opacity: 0.85,
              }}
            />
          )}
        </div>
      </div>

      {/* Wiki hover preview card */}
      {wikiPreview && (
        <div
          style={{
            position: 'fixed',
            left: wikiPreview.x,
            top: wikiPreview.y,
            width: 320,
            background: 'var(--c-panel)',
            border: '1px solid var(--c-border)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
            padding: '14px 16px',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0, opacity: 0.6 }}>
              <rect x="1" y="1" width="11" height="11" rx="1.5" stroke="var(--c-text-lo)" strokeWidth="1.2"/>
              <path d="M3.5 4.5h6M3.5 6.5h6M3.5 8.5h4" stroke="var(--c-text-lo)" strokeWidth="1" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text-hi)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {wikiPreview.doc.title || 'Untitled'}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--c-text-md)', lineHeight: 1.6, marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {stripHtml(wikiPreview.doc.content).slice(0, 200) || 'Empty note'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--c-text-lo)' }}>
            <span>{relativeTime(wikiPreview.doc.updatedAt)}</span>
            {wikiPreview.doc.tags && wikiPreview.doc.tags.length > 0 && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>{wikiPreview.doc.tags.map((t) => `#${t}`).join(' ')}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Wikilink picker */}
      {wikilinkPicker && (
        <WikilinkPicker
          pos={wikilinkPicker}
          documents={documents}
          activeDocId={activeDocId}
          onSelect={insertWikiChip}
          onCreate={handleCreateAndLink}
          onClose={() => setWikilinkPicker(null)}
        />
      )}

      {/* Node picker */}
      {nodePicker && (
        <NodePicker
          pos={nodePicker}
          nodes={nodes}
          documents={documents}
          onSelect={insertNodeChip}
          onClose={() => setNodePicker(null)}
        />
      )}

      {/* Emoji picker */}
      {emojiPicker && doc && (
        <DocEmojiPicker
          pos={emojiPicker}
          current={doc.emoji}
          onSelect={(e) => { updateDocument(doc.id, { emoji: e }); setEmojiPicker(null); }}
          onRemove={() => { updateDocument(doc.id, { emoji: undefined }); setEmojiPicker(null); }}
          onClose={() => setEmojiPicker(null)}
        />
      )}
    </div>
  );
}
