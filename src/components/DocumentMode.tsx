import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useBoardStore } from '../store/boardStore';
import { CanvasNode, Document } from '../types';
import { htmlToMarkdown, markdownToHtml } from '../utils/exportMarkdown';
import { saveAs } from 'file-saver';
import { hasWorkspaceHandle, readWorkspaceFileAsUrl, saveImageAsset, saveTextFileToWorkspace } from '../utils/workspaceManager';
import { toast } from '../utils/toast';
import { focusNode } from '../utils/focusNode';
import { IconAlignCenter, IconAlignLeft, IconAlignRight, IconCode, IconCodeBlock, IconCopy, IconDoc, IconEye, IconHorizontalRule, IconLink, IconList, IconListOrdered, IconNodeLink, IconQuote, IconSaveFile, IconTextWrap } from './icons';
import { useDocumentAutoSave } from '../hooks/useDocumentAutoSave';
import { type DocumentCommandDefinition, getDocumentCommandsForSurface, runDocumentCommand } from './documentCommands';

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

function wordCountFromHtml(html: string): number {
  const text = stripHtml(html)
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/@node:([a-zA-Z0-9_-]+)/g, '$1')
    .trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function readingTimeLabel(words: number): string {
  if (words <= 0) return '0 min read';
  return `${Math.max(1, Math.ceil(words / 200))} min read`;
}

function documentOutlineFromHtml(html: string): Array<{ id: string; level: 'h1' | 'h2'; text: string }> {
  const div = document.createElement('div');
  div.innerHTML = html;
  return Array.from(div.querySelectorAll<HTMLElement>('h1, h2'))
    .map((heading, index) => ({
      id: heading.id || `outline-${index}`,
      level: heading.tagName.toLowerCase() as 'h1' | 'h2',
      text: (heading.textContent ?? '').trim(),
    }))
    .filter((entry) => entry.text);
}

function generateMarkdownFilename(title: string): string {
  return (title.trim() || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '.md';
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeInlineHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isRenderableExternalImageSrc(src: string): boolean {
  return /^(blob:|data:|https?:\/\/)/i.test(src);
}

function normalizeAssetStem(name: string): string {
  const stem = name.replace(/\.[^.]+$/, '').trim() || 'image';
  return stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'image';
}

function ensureImageExtension(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return ext;
  return 'png';
}

function buildImageAssetName(name: string): string {
  const stem = normalizeAssetStem(name);
  const ext = ensureImageExtension(name);
  return `${stem}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });
}

function getDocumentHistorySignature(doc: Pick<Document, 'title' | 'content' | 'emoji' | 'linkedFile'> | null | undefined): string {
  if (!doc) return '';
  return [doc.title ?? '', doc.content ?? '', doc.emoji ?? '', doc.linkedFile ?? ''].join('\u0001');
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

const BLOCK_SHORT_LABELS: Record<string, string> = {
  p: 'P', h1: 'H1', h2: 'H2', h3: 'H3',
};

const DOCUMENT_TEXT_COLORS = [
  { label: 'Default', value: 'auto', swatch: 'var(--c-text-hi)' },
  { label: 'Accent', value: '--c-line', swatch: 'var(--c-line)' },
  { label: 'Green', value: '--c-green', swatch: 'var(--c-green)' },
  { label: 'Orange', value: '--c-orange', swatch: 'var(--c-orange)' },
  { label: 'Red', value: '--c-red', swatch: 'var(--c-red)' },
  { label: 'Yellow', value: '--c-yellow', swatch: 'var(--c-yellow)' },
] as const;

function resolveDocumentColorValue(value: string): string {
  if (value === 'auto' || !value.startsWith('--')) return value;
  return getComputedStyle(document.documentElement).getPropertyValue(value).trim() || value;
}

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

function dispatchEditableInput(savedRange: Range | null): void {
  const fallbackRange = savedRange ?? (window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null);
  if (!fallbackRange) return;
  rangeRoot(fallbackRange)?.dispatchEvent(new Event('input', { bubbles: true }));
}

function updatePlaceholderVisibility(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-placeholder]').forEach((el) => {
    const text = (el.textContent ?? '').replace(/\u00a0/g, ' ').trim();
    const media = el.querySelector('img, .chip-wiki, .chip-node');
    const hasMeaningfulContent = !!text || !!media;
    el.setAttribute('data-placeholder-visible', hasMeaningfulContent ? 'false' : 'true');
  });
}

function ensureDocImageIds(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('figure[data-doc-image="true"]').forEach((figure) => {
    if (!figure.dataset.docImageId) {
      figure.dataset.docImageId = `docimg_${Math.random().toString(36).slice(2, 10)}`;
    }
  });
}

function ensureDocumentHeadingIds(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('h1, h2').forEach((heading, index) => {
    if (!heading.id) {
      const base = (heading.textContent ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || `section-${index + 1}`;
      heading.id = `doc-${base}-${index + 1}`;
    }
  });
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

function insertCalloutBlock(savedRange: Range | null, emoji = '💡') {
  const range = savedRange;
  if (!range) return;
  const sel = window.getSelection();
  if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  const root = rangeRoot(range);
  if (!root) return;
  const block = rangeBlock(range, root);
  if (!block) return;

  if (block.tagName.toLowerCase() === 'blockquote' && block.classList.contains('doc-callout')) {
    const body = block.querySelector('.doc-callout__body');
    const div = document.createElement('div');
    if (body) {
      while (body.firstChild) div.appendChild(body.firstChild);
    } else {
      while (block.firstChild) div.appendChild(block.firstChild);
    }
    block.replaceWith(div);
    div.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  const callout = document.createElement('blockquote');
  callout.className = 'doc-callout';
  callout.dataset.callout = 'true';
  callout.dataset.calloutEmoji = emoji;

  const emojiEl = document.createElement('span');
  emojiEl.className = 'doc-callout__emoji';
  emojiEl.contentEditable = 'false';
  emojiEl.textContent = emoji;

  const body = document.createElement('div');
  body.className = 'doc-callout__body';

  if (block.tagName.toLowerCase() === 'blockquote') {
    while (block.firstChild) body.appendChild(block.firstChild);
    block.replaceWith(callout);
  } else {
    block.replaceWith(callout);
    body.appendChild(block);
  }

  callout.append(emojiEl, body);
  callout.dispatchEvent(new Event('input', { bubbles: true }));
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

function getLinkHref(savedRange: Range | null): string {
  const range = savedRange ?? (window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null);
  if (!range) return '';
  let node: Node | null = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
  while (node && (node as HTMLElement).contentEditable !== 'true') {
    if ((node as HTMLElement).tagName?.toLowerCase() === 'a') {
      return (node as HTMLAnchorElement).getAttribute('href') ?? '';
    }
    node = node.parentElement;
  }
  return '';
}

interface FmtBarProps {
  viewMode: 'edit' | 'source';
  compactMode?: boolean;
  onToggleSource: () => void;
  onToggleEdit: () => void;
  onSave: () => void;
  onSourceInsert: (syntax: string) => void;
  sourceWrap: boolean;
  setSourceWrap: React.Dispatch<React.SetStateAction<boolean>>;
  onCopySource: () => void;
  saveStatusText: string | null;
  onOpenOutline: () => void;
  onOpenProperties: () => void;
  onFindReplace: () => void;
  onShowWordCount: () => void;
  wordCount: number;
  readingTime: string;
}

interface SelectionToolbarAnchor {
  left: number;
  top: number;
}

interface FloatingPalettePosition {
  x: number;
  y: number;
  bounds?: { left: number; right: number; top: number; bottom: number };
}

function FormattingBar({
  viewMode,
  compactMode = false,
  onToggleSource,
  onToggleEdit,
  onSave,
  onSourceInsert,
  sourceWrap,
  setSourceWrap,
  onCopySource,
  saveStatusText,
  onOpenOutline,
  onOpenProperties,
  onFindReplace,
  onShowWordCount,
  wordCount,
  readingTime,
}: FmtBarProps) {
  const [showFormatMenu, setShowFormatMenu] = useState(false);
  const [showAlignMenu, setShowAlignMenu] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [hoveredControl, setHoveredControl] = useState<string | null>(null);
  const [toolbarWidth, setToolbarWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1440));
  const isMobileNarrow = toolbarWidth < 520;
  const useCompactToolbar = compactMode || toolbarWidth < 760;
  const useUltraCompactToolbar = toolbarWidth < 620;
  const savedRangeRef = useRef<Range | null>(null);
  const [, tick] = useState(0);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const formatBtnRef = useRef<HTMLButtonElement>(null);
  const alignBtnRef = useRef<HTMLButtonElement>(null);
  const toolsBtnRef = useRef<HTMLButtonElement>(null);
  const formatMenuRef = useRef<HTMLDivElement>(null);
  const alignMenuRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

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
    dispatchEditableInput(savedRangeRef.current);
    tick((n) => n + 1);
  };

  const currentBlock = getBlockType(showFormatMenu ? savedRangeRef.current : null);

  const btnStyle = (active: boolean, hovered = false): React.CSSProperties => ({
    height: isMobileNarrow ? 30 : 26,
    minWidth: isMobileNarrow ? 30 : 26,
    padding: '0 8px',
    background: active
      ? (hovered ? 'rgba(184,119,80,0.33)' : 'rgba(184,119,80,0.22)')
      : (hovered ? 'var(--c-hover)' : 'transparent'),
    border: active
      ? `1px solid ${hovered ? 'rgba(184,119,80,0.72)' : 'rgba(184,119,80,0.46)'}`
      : `1px solid ${hovered ? 'var(--c-border)' : 'transparent'}`,
    borderRadius: 6,
    color: active ? 'var(--c-line)' : (hovered ? 'var(--c-text-hi)' : 'var(--c-text-lo)'),
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: 'inherit',
    fontWeight: active ? 600 : 500,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    boxShadow: hovered && !active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
    transition: 'background 0.12s, border-color 0.12s, color 0.12s, box-shadow 0.12s',
  });

  const hoverHandlers = (id: string) => ({
    onMouseEnter: () => setHoveredControl(id),
    onMouseLeave: () => setHoveredControl((current) => (current === id ? null : current)),
  });

  const modeButtonWidth = useCompactToolbar ? 32 : 72;
  const modeButtonHeight = useCompactToolbar ? 28 : 30;
  const modeButtonGap = useCompactToolbar ? 0 : 5;

  const modeButtonStyle = (active: boolean, side: 'left' | 'right'): React.CSSProperties => ({
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: modeButtonGap,
    width: modeButtonWidth,
    height: modeButtonHeight,
    padding: useCompactToolbar ? '0' : '0 10px',
    borderRadius: side === 'left' ? '7px 5px 5px 7px' : '5px 7px 7px 5px',
    border: 'none',
    cursor: 'pointer',
    fontSize: useCompactToolbar ? 0 : 11,
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
    gap: useCompactToolbar ? 0 : 6,
    minHeight: 26,
    padding: useCompactToolbar ? '0 8px' : '0 10px',
    borderRadius: 6,
    border: '1px solid var(--c-border)',
    background: 'rgba(255,255,255,0.025)',
    color: 'var(--c-text-lo)',
    fontSize: 11,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'background 0.12s, border-color 0.12s, color 0.12s',
  };

  const menuButtonStyle: React.CSSProperties = {
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
    ['> [!callout] 💡 ', 'Callout'],
    ['`code`', 'Inline code'],
    ['```\ncode\n```', 'Code block'],
    ['[](url)', 'Link'],
    ['![](url)', 'Image'],
    ['---', 'Rule'],
    ['~~text~~', 'Strike'],
    ['[[Note]]', 'Wiki link'],
    ['@node:', 'Node'],
  ];
  const visibleSourceShortcuts = useUltraCompactToolbar ? sourceShortcuts.slice(0, 6) : sourceShortcuts;

  const hideSaveStatus = isMobileNarrow || toolbarWidth < 980;
  const formatMenuRect = showFormatMenu && formatBtnRef.current ? formatBtnRef.current.getBoundingClientRect() : null;
  const alignMenuRect = showAlignMenu && alignBtnRef.current ? alignBtnRef.current.getBoundingClientRect() : null;
  const toolsMenuRect = showToolsMenu && toolsBtnRef.current ? toolsBtnRef.current.getBoundingClientRect() : null;

  const closeMenus = () => {
    setShowFormatMenu(false);
    setShowAlignMenu(false);
    setShowToolsMenu(false);
  };

  useEffect(() => {
    if (!showFormatMenu && !showAlignMenu && !showToolsMenu) return;
    const handleWindowPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (
        toolbarRef.current?.contains(target) ||
        formatMenuRef.current?.contains(target) ||
        alignMenuRef.current?.contains(target) ||
        toolsMenuRef.current?.contains(target)
      ) {
        return;
      }
      closeMenus();
    };
    window.addEventListener('mousedown', handleWindowPointer);
    window.addEventListener('touchstart', handleWindowPointer);
    return () => {
      window.removeEventListener('mousedown', handleWindowPointer);
      window.removeEventListener('touchstart', handleWindowPointer);
    };
  }, [showFormatMenu, showAlignMenu, showToolsMenu]);

  useEffect(() => {
    const el = toolbarRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => setToolbarWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const menuShell = (rect: DOMRect | null, width = 190): React.CSSProperties => ({
    position: 'fixed',
    top: Math.min((rect?.bottom ?? 0) + 6, window.innerHeight - 240),
    left: Math.min(rect?.left ?? 0, window.innerWidth - width - 12),
    zIndex: 520,
    minWidth: width,
    padding: 6,
    background: 'var(--c-panel)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
  });

  const menuHover = {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = 'var(--c-hover)';
      e.currentTarget.style.color = 'var(--c-text-hi)';
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.color = 'var(--c-text-md)';
    },
  };

  return (
    <div
      ref={toolbarRef}
      style={{
        position: 'relative',
        padding: compactMode ? '6px 14px' : '6px 24px',
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
            <button
              ref={formatBtnRef}
              style={{
                ...btnStyle(showFormatMenu, hoveredControl === 'format'),
                minWidth: useCompactToolbar ? 46 : 118,
                justifyContent: 'space-between',
                border: `1px solid ${showFormatMenu ? 'rgba(184,119,80,0.52)' : 'rgba(184,119,80,0.32)'}`,
                background: showFormatMenu ? 'rgba(184,119,80,0.14)' : 'rgba(255,255,255,0.03)',
                color: showFormatMenu ? 'var(--c-line)' : 'var(--c-text-hi)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
                setShowFormatMenu((v) => !v);
                setShowAlignMenu(false);
                setShowToolsMenu(false);
                tick((n) => n + 1);
              }}
              {...hoverHandlers('format')}
              title="Paragraph style"
            >
              <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {useCompactToolbar
                  ? (BLOCK_SHORT_LABELS[currentBlock] ?? 'P')
                  : currentBlock === 'h1'
                    ? 'Heading 1'
                    : currentBlock === 'h2'
                      ? 'Heading 2'
                      : currentBlock === 'h3'
                        ? 'Heading 3'
                        : 'Paragraph'}
              </span>
              <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
            </button>
            <button
              ref={alignBtnRef}
              style={btnStyle(showAlignMenu, hoveredControl === 'align')}
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
                setShowAlignMenu((v) => !v);
                setShowFormatMenu(false);
                setShowToolsMenu(false);
              }}
              {...hoverHandlers('align')}
              title="Alignment"
            >
              <IconAlignLeft />
              {!useCompactToolbar && <span style={{ fontSize: 11 }}>Align</span>}
              <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
            </button>
            <button
              ref={toolsBtnRef}
              style={btnStyle(showToolsMenu, hoveredControl === 'tools')}
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
                setShowToolsMenu((v) => !v);
                setShowFormatMenu(false);
                setShowAlignMenu(false);
              }}
              {...hoverHandlers('tools')}
              title="Document tools"
            >
              {!useCompactToolbar && <span style={{ fontSize: 11 }}>Tools</span>}
              {useCompactToolbar ? '+' : null}
              <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
            </button>
          </>
        )}

        {viewMode === 'source' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minHeight: 30,
              flexShrink: 0,
            }}
          >
            {!useCompactToolbar && (
              <span style={{ fontSize: 11, color: 'var(--c-text-off)', marginRight: 2, whiteSpace: 'nowrap' }}>
              Markdown
              </span>
            )}
            {visibleSourceShortcuts.map(([syntax, label]) => (
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
                {!useCompactToolbar && <span>{label}</span>}
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
              {!useCompactToolbar && 'Wrap'}
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
              {!useCompactToolbar && 'Copy'}
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
              title="Save Note (Cmd+S)"
              aria-label="Save Note (Command+S)"
              onMouseDown={(e) => { e.preventDefault(); onSave(); }}
              {...hoverHandlers('save')}
            >
              <IconSaveFile />
            </button>
            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', margin: '0 2px 0 2px', flexShrink: 0 }} />
          </>
        )}

        <div
          style={{
            position: 'relative',
            display: 'flex',
            gap: 2,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid var(--c-border)',
            borderRadius: 9,
            padding: 2,
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
              width: modeButtonWidth,
              borderRadius: 7,
              background: 'var(--c-panel)',
              boxShadow: '0 1px 5px rgba(0,0,0,0.2)',
              transform: viewMode === 'source' ? `translateX(${modeButtonWidth + 2}px)` : 'translateX(0)',
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
          ><IconEye />{!useCompactToolbar && ' Preview'}</button>
          <button
            title="Markdown source"
            onMouseDown={(e) => { e.preventDefault(); if (viewMode === 'edit') onToggleSource(); }}
            style={modeButtonStyle(viewMode === 'source', 'right')}
            onMouseEnter={(e) => { if (viewMode !== 'source') e.currentTarget.style.color = 'var(--c-text-md)'; }}
            onMouseLeave={(e) => { if (viewMode !== 'source') e.currentTarget.style.color = 'var(--c-text-lo)'; }}
          ><IconCode />{!useCompactToolbar && ' Source'}</button>
        </div>
      </div>

      {formatMenuRect && (
        <div ref={formatMenuRef} style={menuShell(formatMenuRect)} onMouseDown={(e) => e.stopPropagation()}>
          {(['p', 'h1', 'h2', 'h3'] as const).map((tag) => (
            <button
              key={tag}
              style={{ ...menuButtonStyle, background: currentBlock === tag ? 'rgba(184,119,80,0.15)' : 'transparent', color: currentBlock === tag ? 'var(--c-line)' : 'var(--c-text-md)' }}
              onMouseDown={(e) => {
                e.preventDefault();
                restoreSelection();
                applyBlock(tag, savedRangeRef.current);
                closeMenus();
                tick((n) => n + 1);
              }}
              {...menuHover}
            >
              <span>{BLOCK_LABELS[tag]}</span>
            </button>
          ))}
        </div>
      )}

      {toolsMenuRect && (
        <div ref={toolsMenuRef} style={menuShell(toolsMenuRect, 220)} onMouseDown={(e) => e.stopPropagation()}>
          <button
            style={menuButtonStyle}
            onMouseDown={(e) => {
              e.preventDefault();
              closeMenus();
              onFindReplace();
            }}
            {...menuHover}
          >
            <span>Find / Replace</span>
          </button>
          <button
            style={menuButtonStyle}
            onMouseDown={(e) => {
              e.preventDefault();
              closeMenus();
              onShowWordCount();
            }}
            {...menuHover}
          >
            <span>Word count</span>
            <span style={{ marginLeft: 'auto', color: 'var(--c-text-lo)', fontSize: 11 }}>{wordCount} words</span>
          </button>
          <button style={menuButtonStyle} onMouseDown={(e) => { e.preventDefault(); closeMenus(); onSave(); }} {...menuHover}><span>Export</span></button>
          <button style={menuButtonStyle} onMouseDown={(e) => { e.preventDefault(); closeMenus(); onOpenOutline(); }} {...menuHover}><span>Outline</span></button>
          <button style={menuButtonStyle} onMouseDown={(e) => { e.preventDefault(); closeMenus(); onOpenProperties(); }} {...menuHover}><span>Properties</span></button>
          <div style={{ height: 1, background: 'var(--c-border)', margin: '6px 4px' }} />
          <div style={{ padding: '7px 10px', color: 'var(--c-text-lo)', fontSize: 11 }}>
            {readingTime}
          </div>
        </div>
      )}

      {alignMenuRect && (
        <div ref={alignMenuRef} style={menuShell(alignMenuRect, 168)} onMouseDown={(e) => e.stopPropagation()}>
          <button style={menuButtonStyle} onMouseDown={(e) => { e.preventDefault(); fmt('justifyLeft'); closeMenus(); }} {...menuHover}><IconAlignLeft /><span>Align left</span></button>
          <button style={menuButtonStyle} onMouseDown={(e) => { e.preventDefault(); fmt('justifyCenter'); closeMenus(); }} {...menuHover}><IconAlignCenter /><span>Align center</span></button>
          <button style={menuButtonStyle} onMouseDown={(e) => { e.preventDefault(); fmt('justifyRight'); closeMenus(); }} {...menuHover}><IconAlignRight /><span>Align right</span></button>
        </div>
      )}

    </div>
  );
}

interface SelectionFormattingToolbarProps {
  anchor: SelectionToolbarAnchor | null;
  onWikilinkClick: (rect: DOMRect) => void;
}

function SelectionFormattingToolbar({ anchor, onWikilinkClick }: SelectionFormattingToolbarProps) {
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showLinkMenu, setShowLinkMenu] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [hoveredControl, setHoveredControl] = useState<string | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [, tick] = useState(0);
  const blockBtnRef = useRef<HTMLButtonElement>(null);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const linkBtnRef = useRef<HTMLButtonElement>(null);
  const floatingToolbarRef = useRef<HTMLDivElement>(null);
  const blockMenuRef = useRef<HTMLDivElement>(null);
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const linkMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchor) {
      setShowBlockMenu(false);
      setShowColorMenu(false);
      setShowLinkMenu(false);
    }
  }, [anchor]);

  useEffect(() => {
    if (!showBlockMenu && !showColorMenu && !showLinkMenu) return;
    const handleWindowPointer = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (
        floatingToolbarRef.current?.contains(target) ||
        blockMenuRef.current?.contains(target) ||
        colorMenuRef.current?.contains(target) ||
        linkMenuRef.current?.contains(target)
      ) {
        return;
      }
      setShowBlockMenu(false);
      setShowColorMenu(false);
      setShowLinkMenu(false);
    };
    window.addEventListener('mousedown', handleWindowPointer);
    return () => window.removeEventListener('mousedown', handleWindowPointer);
  }, [showBlockMenu, showColorMenu, showLinkMenu]);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
  };

  const restoreSelection = () => {
    const r = savedRangeRef.current ?? (window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0).cloneRange() : null);
    if (!r) return;
    const sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(r); }
  };

  const execAndTick = (action: () => void) => {
    restoreSelection();
    action();
    dispatchEditableInput(savedRangeRef.current);
    tick((n) => n + 1);
  };

  const dispatchEditorInput = () => {
    const root = savedRangeRef.current ? rangeRoot(savedRangeRef.current) : null;
    root?.dispatchEvent(new Event('input', { bubbles: true }));
    tick((n) => n + 1);
  };

  const hoverHandlers = (id: string) => ({
    onMouseEnter: () => setHoveredControl(id),
    onMouseLeave: () => setHoveredControl((current) => (current === id ? null : current)),
  });

  const currentBlock = getBlockType(showBlockMenu ? savedRangeRef.current : null);
  const blockMenuRect = showBlockMenu && blockBtnRef.current ? blockBtnRef.current.getBoundingClientRect() : null;
  const colorMenuRect = showColorMenu && colorBtnRef.current ? colorBtnRef.current.getBoundingClientRect() : null;
  const linkMenuRect = showLinkMenu && linkBtnRef.current ? linkBtnRef.current.getBoundingClientRect() : null;
  const activeLinkHref = getLinkHref(savedRangeRef.current);

  const toolbarButtonStyle = (active: boolean, hovered = false): React.CSSProperties => ({
    width: 30,
    height: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    border: active ? '1px solid rgba(184,119,80,0.46)' : '1px solid transparent',
    background: active
      ? (hovered ? 'rgba(184,119,80,0.3)' : 'rgba(184,119,80,0.2)')
      : (hovered ? 'var(--c-hover)' : 'transparent'),
    color: active ? 'var(--c-line)' : (hovered ? 'var(--c-text-hi)' : 'var(--c-text-lo)'),
    cursor: 'pointer',
    transition: 'background 0.12s, border-color 0.12s, color 0.12s',
    flexShrink: 0,
  });

  const currentBlockLabel = BLOCK_LABELS[currentBlock] ?? 'Paragraph';
  const menuShell = (rect: DOMRect | null, width = 176): React.CSSProperties => ({
    position: 'fixed',
    top: Math.min((rect?.bottom ?? 0) + 6, window.innerHeight - 220),
    left: Math.min((rect?.left ?? 0), window.innerWidth - width - 12),
    zIndex: 560,
    minWidth: width,
    padding: 6,
    background: 'var(--c-panel)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
  });
  const menuButtonStyle: React.CSSProperties = {
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
  const menuHover = {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = 'var(--c-hover)';
      e.currentTarget.style.color = 'var(--c-text-hi)';
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.color = 'var(--c-text-md)';
    },
  };

  if (!anchor) return null;

  return (
    <>
      <div
        ref={floatingToolbarRef}
        style={{
          position: 'fixed',
          left: anchor.left,
          top: anchor.top,
          transform: 'translateX(-50%)',
          zIndex: 555,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: 4,
          borderRadius: 12,
          background: 'var(--c-panel)',
          border: '1px solid var(--c-border)',
          boxShadow: '0 16px 38px rgba(0,0,0,0.34)',
          maxWidth: 'min(92vw, 640px)',
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          ref={blockBtnRef}
          style={{ ...toolbarButtonStyle(false, hoveredControl === 'block'), width: 84, justifyContent: 'space-between', padding: '0 8px', fontSize: 11 }}
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
            setShowBlockMenu((v) => !v);
            setShowColorMenu(false);
            setShowLinkMenu(false);
          }}
          {...hoverHandlers('block')}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentBlockLabel}</span>
          <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
        </button>
        <button style={toolbarButtonStyle(document.queryCommandState('bold'), hoveredControl === 'bold')} onMouseDown={(e) => { e.preventDefault(); saveSelection(); execAndTick(() => document.execCommand('bold')); }} {...hoverHandlers('bold')}><b>B</b></button>
        <button style={{ ...toolbarButtonStyle(document.queryCommandState('italic'), hoveredControl === 'italic'), fontStyle: 'italic' }} onMouseDown={(e) => { e.preventDefault(); saveSelection(); execAndTick(() => document.execCommand('italic')); }} {...hoverHandlers('italic')}><i>I</i></button>
        <button style={{ ...toolbarButtonStyle(document.queryCommandState('underline'), hoveredControl === 'underline'), textDecoration: 'underline' }} onMouseDown={(e) => { e.preventDefault(); saveSelection(); execAndTick(() => document.execCommand('underline')); }} {...hoverHandlers('underline')}>U</button>
        <button style={{ ...toolbarButtonStyle(document.queryCommandState('strikeThrough'), hoveredControl === 'strike'), textDecoration: 'line-through' }} onMouseDown={(e) => { e.preventDefault(); saveSelection(); execAndTick(() => document.execCommand('strikeThrough')); }} {...hoverHandlers('strike')}>S</button>
        <button
          ref={colorBtnRef}
          style={toolbarButtonStyle(showColorMenu, hoveredControl === 'color')}
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
            setShowColorMenu((v) => !v);
            setShowBlockMenu(false);
            setShowLinkMenu(false);
          }}
          {...hoverHandlers('color')}
          title="Text color and highlight"
        >
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <span style={{ fontFamily: 'serif', fontSize: 12, fontWeight: 700, lineHeight: 1 }}>A</span>
            <span style={{ width: 12, height: 2.5, borderRadius: 999, background: 'currentColor', display: 'block' }} />
          </span>
        </button>
        <button style={toolbarButtonStyle(false, hoveredControl === 'inline-code')} onMouseDown={(e) => { e.preventDefault(); saveSelection(); restoreSelection(); toggleInlineCode(savedRangeRef.current); tick((n) => n + 1); }} {...hoverHandlers('inline-code')}><IconCode /></button>
        <button
          ref={linkBtnRef}
          style={toolbarButtonStyle(!!activeLinkHref || showLinkMenu, hoveredControl === 'link')}
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
            setLinkValue(getLinkHref(savedRangeRef.current));
            setShowLinkMenu((v) => !v);
            setShowBlockMenu(false);
            setShowColorMenu(false);
          }}
          {...hoverHandlers('link')}
          title="External link"
        >
          <IconLink />
        </button>
        <button style={toolbarButtonStyle(false, hoveredControl === 'wiki-link')} onMouseDown={(e) => { e.preventDefault(); saveSelection(); restoreSelection(); onWikilinkClick((e.currentTarget as HTMLButtonElement).getBoundingClientRect()); }} {...hoverHandlers('wiki-link')}><IconDoc /></button>
      </div>

      {blockMenuRect && (
        <div ref={blockMenuRef} style={menuShell(blockMenuRect)} onMouseDown={(e) => e.stopPropagation()}>
          {(['p', 'h1', 'h2', 'h3'] as const).map((tag) => (
            <button
              key={tag}
              style={{ ...menuButtonStyle, background: currentBlock === tag ? 'rgba(184,119,80,0.15)' : 'transparent', color: currentBlock === tag ? 'var(--c-line)' : 'var(--c-text-md)' }}
              onMouseDown={(e) => {
                e.preventDefault();
                restoreSelection();
                applyBlock(tag, savedRangeRef.current);
                setShowBlockMenu(false);
                tick((n) => n + 1);
              }}
              {...menuHover}
            >
              {BLOCK_LABELS[tag]}
            </button>
          ))}
        </div>
      )}

      {colorMenuRect && (
        <div ref={colorMenuRef} style={{ ...menuShell(colorMenuRect, 220), padding: 8 }} onMouseDown={(e) => e.stopPropagation()}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text-lo)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '2px 2px 8px' }}>
            Text color
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
            {DOCUMENT_TEXT_COLORS.map((colorOption) => (
              <button
                key={colorOption.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 34,
                  padding: '0 8px',
                  borderRadius: 8,
                  border: '1px solid transparent',
                  background: 'transparent',
                  color: 'var(--c-text-md)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: 'inherit',
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  restoreSelection();
                  if (colorOption.value === 'auto') document.execCommand('removeFormat', false);
                  else document.execCommand('foreColor', false, resolveDocumentColorValue(colorOption.value));
                  dispatchEditorInput();
                  setShowColorMenu(false);
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--c-hover)';
                  e.currentTarget.style.borderColor = 'var(--c-border)';
                  e.currentTarget.style.color = 'var(--c-text-hi)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.color = 'var(--c-text-md)';
                }}
                title={colorOption.label}
              >
                <span style={{ width: 12, height: 12, borderRadius: 999, background: colorOption.swatch, border: '1px solid rgba(255,255,255,0.18)', flexShrink: 0 }} />
                <span style={{ whiteSpace: 'nowrap' }}>{colorOption.label}</span>
              </button>
            ))}
          </div>
          <div style={{ height: 1, background: 'var(--c-border)', margin: '10px 2px 8px' }} />
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text-lo)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 2px 8px' }}>
            Highlight
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
            {[
              { label: 'Clear', value: 'transparent', swatch: 'transparent', border: '1px dashed var(--c-border)' },
              { label: 'Yellow', value: '#facc15', swatch: '#facc15' },
              { label: 'Green', value: '#86efac', swatch: '#86efac' },
              { label: 'Blue', value: '#93c5fd', swatch: '#93c5fd' },
            ].map((option) => (
              <button
                key={option.label}
                title={option.label}
                onMouseDown={(e) => {
                  e.preventDefault();
                  restoreSelection();
                  document.execCommand('styleWithCSS', false, 'true');
                  document.execCommand('hiliteColor', false, option.value);
                  dispatchEditorInput();
                  setShowColorMenu(false);
                }}
                style={{
                  minHeight: 30,
                  borderRadius: 8,
                  border: option.border ?? '1px solid rgba(255,255,255,0.12)',
                  background: option.swatch,
                  color: option.label === 'Clear' ? 'var(--c-text-lo)' : '#111827',
                  cursor: 'pointer',
                  fontSize: 10.5,
                  fontFamily: 'inherit',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {linkMenuRect && (
        <div ref={linkMenuRef} style={{ ...menuShell(linkMenuRect, 260), padding: 8 }} onMouseDown={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              value={linkValue}
              placeholder="https://example.com"
              onChange={(e) => setLinkValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  restoreSelection();
                  const href = linkValue.trim();
                  if (href) document.execCommand('createLink', false, href);
                  else document.execCommand('unlink', false);
                  dispatchEditorInput();
                  setShowLinkMenu(false);
                }
              }}
              style={{
                width: '100%',
                height: 34,
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid var(--c-border)',
                background: 'rgba(255,255,255,0.03)',
                color: 'var(--c-text-hi)',
                fontSize: 12,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                style={{
                  ...menuButtonStyle,
                  width: 'auto',
                  justifyContent: 'center',
                  padding: '7px 12px',
                  background: 'rgba(184,119,80,0.16)',
                  color: 'var(--c-line)',
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  restoreSelection();
                  const href = linkValue.trim();
                  if (href) document.execCommand('createLink', false, href);
                  else document.execCommand('unlink', false);
                  dispatchEditorInput();
                  setShowLinkMenu(false);
                }}
              >
                Apply link
              </button>
              {activeLinkHref && (
                <button
                  style={{ ...menuButtonStyle, width: 'auto', justifyContent: 'center', padding: '7px 12px' }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    restoreSelection();
                    document.execCommand('unlink', false);
                    dispatchEditorInput();
                    setLinkValue('');
                    setShowLinkMenu(false);
                  }}
                  {...menuHover}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
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

type SlashCommand = DocumentCommandDefinition;

interface SlashCommandPaletteProps {
  pos: { x: number; y: number; bounds?: { left: number; right: number; top: number; bottom: number } };
  commands: SlashCommand[];
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

function SlashCommandPalette({ pos, commands, onSelect, onClose }: SlashCommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((command) => command.search.includes(q));
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (activeIndex < filtered.length) return;
    setActiveIndex(filtered.length > 0 ? filtered.length - 1 : 0);
  }, [activeIndex, filtered.length]);

  const grouped = useMemo(() => {
    return filtered.reduce<Record<string, SlashCommand[]>>((acc, command) => {
      if (!acc[command.group]) acc[command.group] = [];
      acc[command.group].push(command);
      return acc;
    }, {});
  }, [filtered]);

  const activeCommand = filtered[activeIndex] ?? null;
  const paletteWidth = 318;
  const paletteHeight = 360;
  const previewWidth = 196;
  const bounds = pos.bounds;
  const minLeft = bounds ? bounds.left + 8 : 12;
  const maxLeft = bounds ? bounds.right - paletteWidth - 8 : window.innerWidth - paletteWidth - 12;
  const left = Math.max(minLeft, Math.min(pos.x - 18, maxLeft));
  const top = Math.max(bounds ? bounds.top + 8 : 16, Math.min(pos.y - 16, window.innerHeight - paletteHeight - 12));
  const previewLeftCandidate = left + paletteWidth + 12;
  const previewMaxRight = bounds ? bounds.right - 8 : window.innerWidth - 12;
  const previewFitsRight = previewLeftCandidate + previewWidth <= previewMaxRight;
  const previewLeft = previewFitsRight ? previewLeftCandidate : null;
  let absoluteIndex = -1;

  const renderSlashIcon = (command: SlashCommand) => {
    switch (command.id) {
      case 'text': return <span style={{ fontSize: 12, fontWeight: 700 }}>T</span>;
      case 'heading-1': return <span style={{ fontSize: 10, fontWeight: 700 }}>H1</span>;
      case 'heading-2': return <span style={{ fontSize: 10, fontWeight: 700 }}>H2</span>;
      case 'bullet-list': return <IconList />;
      case 'numbered-list': return <IconListOrdered />;
      case 'todo-list': return <span style={{ fontSize: 11, fontWeight: 700 }}>☐</span>;
      case 'quote': return <IconQuote />;
      case 'callout': return <IconQuote />;
      case 'code-block': return <IconCodeBlock />;
      case 'divider': return <IconHorizontalRule />;
      case 'external-link': return <IconLink />;
      case 'wiki-link': return <IconDoc />;
      case 'node-link': return <IconNodeLink />;
      case 'tag': return <span style={{ fontSize: 11, fontWeight: 700 }}>#</span>;
      case 'image-upload':
        return (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <rect x="1.2" y="1.8" width="10.6" height="8.4" rx="1.6" stroke="currentColor" strokeWidth="1.1" />
            <path d="M2.5 8.5 5.1 6l1.8 1.8 1.7-1.5 1.9 2.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="4.1" cy="4.5" r="0.8" fill="currentColor" />
          </svg>
        );
      default: return <span style={{ fontSize: 12, fontWeight: 700 }}>{command.glyph}</span>;
    }
  };

  const renderPreview = (command: SlashCommand | null) => {
    if (!command) return null;
    if (command.id === 'heading-2') {
      return <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, color: 'var(--c-text-hi)' }}>Heading 2</div>;
    }
    if (command.id === 'bullet-list') {
      return <div style={{ color: 'var(--c-text-hi)', lineHeight: 1.6 }}>• First item<br />• Second item</div>;
    }
    if (command.id === 'numbered-list') {
      return <div style={{ color: 'var(--c-text-hi)', lineHeight: 1.6 }}>1. First step<br />2. Second step</div>;
    }
    if (command.id === 'todo-list') {
      return <div style={{ color: 'var(--c-text-hi)', lineHeight: 1.6 }}>☐ First task<br />☐ Second task</div>;
    }
    if (command.id === 'quote') {
      return <div style={{ padding: '10px 12px', borderLeft: '3px solid var(--c-line)', color: 'var(--c-text-md)' }}>Quoted idea or passage</div>;
    }
    if (command.id === 'callout') {
      return <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', color: 'var(--c-text-hi)' }}>Callout block</div>;
    }
    if (command.id === 'code-block') {
      return <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.22)', fontFamily: 'var(--font-code)', fontSize: 12, color: 'var(--c-text-hi)' }}>const note = "code";</div>;
    }
    if (command.id === 'divider') {
      return <div style={{ borderTop: '1px solid var(--c-border)', marginTop: 12 }} />;
    }
    if (command.id === 'external-link') {
      return <div style={{ color: 'var(--c-line)', textDecoration: 'underline' }}>https://example.com</div>;
    }
    if (command.id === 'tag') {
      return <div style={{ color: 'var(--c-line)', fontWeight: 600 }}>#tag</div>;
    }
    if (command.id === 'image-upload') {
      return <div style={{ padding: '16px 12px', borderRadius: 12, border: '1px dashed var(--c-border)', color: 'var(--c-text-lo)', textAlign: 'center' }}>Paste, drop, or pick an image</div>;
    }
    return <div style={{ color: 'var(--c-text-hi)' }}>{command.label}</div>;
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onMouseDown={onClose} />
      <div
        style={{
          position: 'fixed',
          left,
          top,
          width: paletteWidth,
          maxHeight: paletteHeight,
          zIndex: 9999,
          background: 'var(--c-panel)',
          border: '1px solid var(--c-border)',
          borderRadius: 14,
          boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
          overflow: 'hidden',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
                return;
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((current) => (filtered.length === 0 ? 0 : Math.min(current + 1, filtered.length - 1)));
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((current) => (filtered.length === 0 ? 0 : Math.max(current - 1, 0)));
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                const active = filtered[activeIndex];
                if (active) onSelect(active);
              }
            }}
            placeholder="Type to search"
            style={{
              flex: 1,
              height: 32,
              padding: '0 10px',
              borderRadius: 9,
              border: '1px solid var(--c-border)',
              background: 'rgba(255,255,255,0.03)',
              color: 'var(--c-text-hi)',
              fontSize: 13,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              onClose();
            }}
            style={{
              width: 28,
              height: 28,
              padding: 0,
              border: '1px solid var(--c-border)',
              borderRadius: 8,
              background: 'transparent',
              color: 'var(--c-text-lo)',
              cursor: 'pointer',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
            title="Close menu"
          >
            ×
          </button>
        </div>
        <div style={{ maxHeight: 308, overflowY: 'auto', padding: 6 }}>
          {(['Basic', 'Link', 'Media', 'Meta'] as const).map((group) => {
            const groupCommands = grouped[group] ?? [];
            if (groupCommands.length === 0) return null;
            return (
              <div key={group} style={{ marginBottom: 8 }}>
                <div style={{ padding: '5px 8px', fontSize: 10, fontWeight: 700, color: 'var(--c-text-lo)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {group}
                </div>
                {groupCommands.map((command) => {
                  absoluteIndex += 1;
                  const commandIndex = absoluteIndex;
                  const active = commandIndex === activeIndex;
                  return (
                    <button
                      key={command.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onSelect(command);
                      }}
                      onMouseEnter={() => setActiveIndex(commandIndex)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        minHeight: 36,
                        padding: '0 9px',
                        border: 'none',
                        borderRadius: 9,
                        background: active ? 'rgba(184,119,80,0.16)' : 'transparent',
                        color: active ? 'var(--c-text-hi)' : 'var(--c-text-md)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'background 0.12s ease, color 0.12s ease',
                      }}
                    >
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 6,
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: active ? 'rgba(184,119,80,0.16)' : 'rgba(255,255,255,0.03)',
                          color: active ? 'var(--c-line)' : 'var(--c-text-lo)',
                          fontSize: 10,
                          flexShrink: 0,
                        }}
                      >
                        {renderSlashIcon(command)}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, color: active ? 'var(--c-text-hi)' : 'inherit' }}>
                        {command.label}
                      </span>
                      {command.hint && (
                        <span style={{ fontSize: 10.5, color: 'var(--c-text-lo)', flexShrink: 0 }}>
                          {command.hint}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: '16px 12px', textAlign: 'center', fontSize: 12, color: 'var(--c-text-lo)' }}>
              No matching blocks
            </div>
          )}
        </div>
        <div style={{ padding: '7px 10px', borderTop: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--c-text-lo)' }}>
          <span>Enter to insert</span>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              onClose();
            }}
            style={{ border: 'none', background: 'transparent', color: 'var(--c-text-lo)', cursor: 'pointer', padding: 0, fontSize: 10.5, fontFamily: 'inherit' }}
          >
            Close menu · Esc
          </button>
        </div>
      </div>
      {previewLeft !== null && activeCommand && (
        <div
          style={{
            position: 'fixed',
            left: previewLeft,
            top: Math.min(top + 88, (bounds ? bounds.bottom : window.innerHeight) - 188),
            width: previewWidth,
            zIndex: 9999,
            background: 'var(--c-panel)',
            border: '1px solid var(--c-border)',
            borderRadius: 14,
            boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-lo)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Preview
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text-hi)' }}>{activeCommand.label}</div>
          <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--c-text-lo)' }}>{activeCommand.description}</div>
          <div style={{ marginTop: 2 }}>{renderPreview(activeCommand)}</div>
        </div>
      )}
    </>
  );
}

// ── DocumentMode ─────────────────────────────────────────────────────────────

interface DocumentModeProps {
  onClose?: () => void;
  onExpand?: () => void;
  onCollapseToPanel?: () => void;
  panelMode?: boolean;
}

export default function DocumentMode({ onClose, onExpand, onCollapseToPanel, panelMode = false }: DocumentModeProps) {
  const { documents, activeDocId, updateDocument, addDocument, closeDocument, openDocumentWithMorph, nodes, pages, activePageId, boardTitle, saveHistory, undo, redo, noteAutosaveEnabled, imageAssetFolder } = useBoardStore();
  const contentRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editHistoryTimerRef = useRef<number | null>(null);
  const canStartEditHistoryGroupRef = useRef(true);
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
  const [slashPalette, setSlashPalette] = useState<FloatingPalettePosition | null>(null);
  const [selectionToolbarAnchor, setSelectionToolbarAnchor] = useState<SelectionToolbarAnchor | null>(null);
  const [sidebarPanel, setSidebarPanel] = useState<'outline' | 'properties' | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [selectedImageRect, setSelectedImageRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [, forceSaveStatusTick] = useState(0);
  const savedSelectionRef = useRef<Range | null>(null);
  const hydrationVersionRef = useRef(0);
  const imageResizeStateRef = useRef<{ imageId: string; startX: number; startWidth: number } | null>(null);

  const doc = documents.find((d) => d.id === activeDocId) as Document | undefined;
  const activePage = pages.find((p) => p.id === activePageId);
  const pageBackLabel = activePage?.layoutMode === 'freeform' ? 'Back to canvas' : 'Back to page';
  const pageBackTitle = activePage?.layoutMode === 'freeform'
    ? `Return to ${activePage?.name ?? boardTitle} canvas`
    : `Return to ${activePage?.name ?? boardTitle} page`;
  const handleClose = onClose ?? closeDocument;

  const panelNavBtn = (disabled: boolean): React.CSSProperties => ({
    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', borderRadius: 6,
    cursor: disabled ? 'default' : 'pointer',
    color: disabled ? 'var(--c-text-lo)' : 'var(--c-text-md)',
    opacity: disabled ? 0.35 : 1,
    transition: 'background 0.1s',
    flexShrink: 0,
  });

  const pageDocs = useMemo(() =>
    documents
      .filter((d) => d.pageId === activePageId)
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || a.updatedAt - b.updatedAt),
    [documents, activePageId]
  );
  const currentDocIdx = pageDocs.findIndex((d) => d.id === activeDocId);
  const prevPageDoc = currentDocIdx > 0 ? pageDocs[currentDocIdx - 1] : null;
  const nextPageDoc = currentDocIdx >= 0 && currentDocIdx < pageDocs.length - 1 ? pageDocs[currentDocIdx + 1] : null;

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

  const docWordCount = useMemo(() => wordCountFromHtml(doc?.content ?? ''), [doc?.content]);
  const docReadingTime = useMemo(() => readingTimeLabel(docWordCount), [docWordCount]);
  const docOutline = useMemo(() => documentOutlineFromHtml(doc?.content ?? ''), [doc?.content]);

  const getSourceCursorOffset = useCallback((syntax: string) => {
    const placeholders = ['text', 'bold', 'code', 'url', 'alt', 'Note'];
    for (const placeholder of placeholders) {
      const idx = syntax.indexOf(placeholder);
      if (idx >= 0) return idx;
    }
    return syntax.length;
  }, []);

  const hydrateDocumentImages = useCallback(async (html: string) => {
    if (!html) return html;
    const root = document.createElement('div');
    root.innerHTML = html;
    const images = Array.from(root.querySelectorAll('img'));
    await Promise.all(images.map(async (image) => {
      const persistedSrc = image.getAttribute('data-workspace-src') ?? image.getAttribute('src') ?? '';
      if (!persistedSrc || isRenderableExternalImageSrc(persistedSrc)) return;
      const resolved = await readWorkspaceFileAsUrl(persistedSrc);
      if (!resolved) return;
      image.setAttribute('data-workspace-src', persistedSrc);
      image.setAttribute('src', resolved);
    }));
    return root.innerHTML;
  }, []);

  const restoreSavedSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel) return null;
    const nextRange = savedSelectionRef.current;
    if (nextRange) {
      sel.removeAllRanges();
      sel.addRange(nextRange);
      return nextRange;
    }
    if (sel.rangeCount > 0) return sel.getRangeAt(0);
    return null;
  }, []);

  const syncSelectedImageOverlay = useCallback((imageId: string | null) => {
    if (!contentRef.current || !editorScrollRef.current) {
      setSelectedImageRect(null);
      return;
    }

    contentRef.current.querySelectorAll<HTMLElement>('figure[data-doc-image="true"]').forEach((figure) => {
      figure.dataset.selected = figure.dataset.docImageId === imageId ? 'true' : 'false';
    });

    if (!imageId) {
      setSelectedImageRect(null);
      return;
    }

    const figure = contentRef.current.querySelector<HTMLElement>(`figure[data-doc-image-id="${imageId}"]`);
    if (!figure) {
      setSelectedImageRect(null);
      return;
    }
    const scrollRect = editorScrollRef.current.getBoundingClientRect();
    const figureRect = figure.getBoundingClientRect();
    setSelectedImageRect({
      left: figureRect.left,
      top: figureRect.top,
      width: figureRect.width,
      height: figureRect.height,
    });
    if (figureRect.bottom < scrollRect.top || figureRect.top > scrollRect.bottom) {
      setSelectedImageRect(null);
    }
  }, []);

  const clearSelectedImage = useCallback(() => {
    setSelectedImageId(null);
    syncSelectedImageOverlay(null);
  }, [syncSelectedImageOverlay]);

  const removeSelectedImage = useCallback(() => {
    if (!contentRef.current || !selectedImageId) return;
    const figure = contentRef.current.querySelector<HTMLElement>(`figure[data-doc-image-id="${selectedImageId}"]`);
    if (!figure) {
      clearSelectedImage();
      return;
    }
    saveHistory();
    const next = document.createElement('div');
    next.innerHTML = '<br>';
    figure.replaceWith(next);
    contentRef.current.focus();
    const range = document.createRange();
    range.selectNodeContents(next);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    savedSelectionRef.current = range.cloneRange();
    clearSelectedImage();
    contentRef.current.dispatchEvent(new Event('input', { bubbles: true }));
  }, [clearSelectedImage, saveHistory, selectedImageId]);

  const insertBlockHtmlAtSelection = useCallback((html: string, options?: { replaceCurrentBlock?: boolean }) => {
    if (!contentRef.current || !doc) return;
    contentRef.current.focus();
    const range = restoreSavedSelection();
    const root = contentRef.current;
    const fragment = document.createRange().createContextualFragment(html);
    const insertedElements = Array.from(fragment.childNodes).filter((node): node is HTMLElement => node.nodeType === Node.ELEMENT_NODE);
    const firstInsertedElement = insertedElements[0] ?? null;

    if (range) {
      const block = rangeBlock(range, root);
      if (block && options?.replaceCurrentBlock) block.replaceWith(fragment);
      else if (block) block.after(fragment);
      else root.appendChild(fragment);
    } else {
      root.appendChild(fragment);
    }

    if (firstInsertedElement) {
      const caretHost = firstInsertedElement.matches('[data-placeholder]')
        ? firstInsertedElement
        : firstInsertedElement.querySelector('[data-placeholder]') as HTMLElement | null;
      if (caretHost) {
        const nextRange = document.createRange();
        nextRange.selectNodeContents(caretHost);
        nextRange.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(nextRange);
        savedSelectionRef.current = nextRange.cloneRange();
      }
    }

    root.dispatchEvent(new Event('input', { bubbles: true }));
  }, [doc, restoreSavedSelection]);

  const insertImageFile = useCallback(async (file: File) => {
    if (!doc) return;
    const isImage = file.type.startsWith('image/');
    if (!isImage) {
      toast('Drop or paste an image file');
      return;
    }

    let renderSrc = '';
    let persistedSrc = '';

    if (hasWorkspaceHandle()) {
      const assetName = buildImageAssetName(file.name);
      const folder = imageAssetFolder || 'assets';
      await saveImageAsset(assetName, file, folder);
      renderSrc = URL.createObjectURL(file);
      persistedSrc = folder ? `${folder}/${assetName}` : assetName;
    } else {
      renderSrc = await fileToDataUrl(file);
      persistedSrc = renderSrc;
    }

    const alt = (file.name.replace(/\.[^.]+$/, '') || 'Reference image').trim();
    const persistedAttr = persistedSrc !== renderSrc ? ` data-workspace-src="${escapeHtmlAttr(persistedSrc)}"` : '';

    saveHistory();
    insertBlockHtmlAtSelection(
      `<figure data-doc-image="true" style="margin:20px 0;">` +
        `<img src="${escapeHtmlAttr(renderSrc)}" alt="${escapeHtmlAttr(alt)}"${persistedAttr} style="display:block;max-width:100%;height:auto;border-radius:14px;border:1px solid rgba(255,255,255,0.12);" />` +
        `<figcaption style="margin-top:8px;font-size:12px;line-height:1.5;color:var(--c-text-lo);">${escapeInlineHtml(alt)}</figcaption>` +
      `</figure><div><br></div>`,
    );
    toast(`Inserted image${hasWorkspaceHandle() ? ` into ${imageAssetFolder || 'assets'}/` : ''}`);
  }, [doc, imageAssetFolder, insertBlockHtmlAtSelection, saveHistory]);

  const slashCommands = useMemo<SlashCommand[]>(() => {
    return getDocumentCommandsForSurface('slash');
  }, []);

  // Sync content to DOM when switching documents; auto-bootstrap H1 for new docs
  useEffect(() => {
    if (!doc || !contentRef.current) return;
    let cancelled = false;
    const run = async () => {
      let content = doc.content ?? '';
      if (!content.trim() && doc.title) {
        content = `<h1>${doc.title}</h1><p><br></p>`;
        updateDocument(doc.id, { content });
      }
      const hydrated = await hydrateDocumentImages(content);
      if (cancelled || !contentRef.current) return;
      contentRef.current.innerHTML = hydrated;
      applyChipsToDOM(contentRef.current);
      ensureDocImageIds(contentRef.current);
      ensureDocumentHeadingIds(contentRef.current);
      updatePlaceholderVisibility(contentRef.current);
      setViewMode('edit');
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
    };
    void run();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  const updateSelectionToolbar = useCallback(() => {
    if (viewMode !== 'edit' || !contentRef.current) {
      setSelectionToolbarAnchor(null);
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setSelectionToolbarAnchor(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const startNode = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentNode : range.startContainer;
    const endNode = range.endContainer.nodeType === Node.TEXT_NODE ? range.endContainer.parentNode : range.endContainer;

    if (!startNode || !endNode || !contentRef.current.contains(startNode) || !contentRef.current.contains(endNode)) {
      setSelectionToolbarAnchor(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      setSelectionToolbarAnchor(null);
      return;
    }

    const editorRect = editorScrollRef.current?.getBoundingClientRect();
    const desiredTop = rect.top - 50;
    const unclampedLeft = rect.left + rect.width / 2;
    const clampedLeft = editorRect
      ? Math.max(editorRect.left + 24, Math.min(editorRect.right - 24, unclampedLeft))
      : unclampedLeft;
    setSelectionToolbarAnchor({
      left: clampedLeft,
      top: desiredTop > 16 ? desiredTop : rect.bottom + 10,
    });
  }, [viewMode]);

  useEffect(() => {
    const handleSelectionChange = () => {
      forceUpdate((n) => n + 1);
      updateSelectionToolbar();
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    window.addEventListener('resize', updateSelectionToolbar);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      window.removeEventListener('resize', updateSelectionToolbar);
    };
  }, [updateSelectionToolbar]);

  useEffect(() => {
    syncSelectedImageOverlay(selectedImageId);
  }, [selectedImageId, syncSelectedImageOverlay]);

  useEffect(() => {
    const handleWindowResize = () => syncSelectedImageOverlay(selectedImageId);
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [selectedImageId, syncSelectedImageOverlay]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const resizeState = imageResizeStateRef.current;
      if (!resizeState || !contentRef.current) return;
      const figure = contentRef.current.querySelector<HTMLElement>(`figure[data-doc-image-id="${resizeState.imageId}"]`);
      const image = figure?.querySelector<HTMLImageElement>('img');
      if (!figure || !image) return;
      const nextWidth = Math.max(160, resizeState.startWidth + (event.clientX - resizeState.startX));
      image.style.width = `${nextWidth}px`;
      image.style.maxWidth = '100%';
      image.style.height = 'auto';
      syncSelectedImageOverlay(resizeState.imageId);
    };

    const onPointerUp = () => {
      if (!imageResizeStateRef.current || !contentRef.current) return;
      imageResizeStateRef.current = null;
      document.body.style.userSelect = '';
      contentRef.current.dispatchEvent(new Event('input', { bubbles: true }));
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [syncSelectedImageOverlay]);

  useEffect(() => {
    setLastSavedAt(null);
    setHasEditedSinceOpen(false);
    setDirtySinceSave(false);
  }, [doc?.id]);

  useEffect(() => {
    setSelectionToolbarAnchor(null);
  }, [doc?.id, viewMode]);

  useEffect(() => {
    if (!lastSavedAt) return;
    const interval = window.setInterval(() => forceSaveStatusTick((n) => n + 1), 30_000);
    return () => window.clearInterval(interval);
  }, [lastSavedAt]);

  const markDirty = useCallback(() => {
    setHasEditedSinceOpen(true);
    setDirtySinceSave(true);
  }, []);

  const handleAutoSaveSuccess = useCallback(() => {
    setLastSavedAt(Date.now());
    setHasEditedSinceOpen(true);
    setDirtySinceSave(false);
  }, []);

  useDocumentAutoSave({
    docId: doc?.id ?? null,
    enabled: noteAutosaveEnabled && dirtySinceSave,
    onSaved: handleAutoSaveSuccess,
  });

  const scheduleEditHistoryReset = useCallback(() => {
    if (editHistoryTimerRef.current !== null) window.clearTimeout(editHistoryTimerRef.current);
    editHistoryTimerRef.current = window.setTimeout(() => {
      canStartEditHistoryGroupRef.current = true;
    }, 900);
  }, []);

  const checkpointDocumentHistory = useCallback(() => {
    if (!doc) return;
    if (canStartEditHistoryGroupRef.current) {
      saveHistory();
      canStartEditHistoryGroupRef.current = false;
    }
    scheduleEditHistoryReset();
  }, [doc, saveHistory, scheduleEditHistoryReset]);

  useEffect(() => {
    canStartEditHistoryGroupRef.current = true;
    if (editHistoryTimerRef.current !== null) {
      window.clearTimeout(editHistoryTimerRef.current);
      editHistoryTimerRef.current = null;
    }
  }, [doc?.id]);

  useEffect(() => () => {
    if (editHistoryTimerRef.current !== null) window.clearTimeout(editHistoryTimerRef.current);
  }, []);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    const version = ++hydrationVersionRef.current;
    const run = async () => {
      const hydrated = await hydrateDocumentImages(doc.content ?? '');
      if (cancelled || version !== hydrationVersionRef.current) return;

      if (viewMode === 'edit' && contentRef.current) {
        const currentHtml = stripChipsFromHTML(contentRef.current.innerHTML);
        if (currentHtml !== hydrated) {
          contentRef.current.innerHTML = hydrated;
          applyChipsToDOM(contentRef.current);
          ensureDocImageIds(contentRef.current);
          ensureDocumentHeadingIds(contentRef.current);
          updatePlaceholderVisibility(contentRef.current);
        }
      }

      if (viewMode === 'source') {
        const nextSource = htmlToMarkdown(hydrated);
        setSourceText((current) => current === nextSource ? current : nextSource);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [doc?.content, doc?.id, hydrateDocumentImages, viewMode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (viewMode !== 'edit') return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const key = e.key.toLowerCase();
      const wantsUndo = key === 'z' && !e.shiftKey;
      const wantsRedo = (key === 'z' && e.shiftKey) || key === 'y';
      if (!wantsUndo && !wantsRedo) return;

      const active = document.activeElement as HTMLElement | null;
      const selection = window.getSelection();
      const anchorNode = selection?.anchorNode?.nodeType === Node.TEXT_NODE
        ? selection.anchorNode.parentNode
        : selection?.anchorNode;
      const withinNoteEditor = !!(
        (active && (active === titleInputRef.current || contentRef.current?.contains(active))) ||
        (anchorNode && contentRef.current?.contains(anchorNode))
      );

      if (!withinNoteEditor) return;

      e.preventDefault();
      canStartEditHistoryGroupRef.current = true;
      if (editHistoryTimerRef.current !== null) {
        window.clearTimeout(editHistoryTimerRef.current);
        editHistoryTimerRef.current = null;
      }
      if (wantsRedo) redo();
      else undo();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, undo, viewMode]);

  // When H1 in editor changes, sync to doc.title
  const handleInput = useCallback(() => {
    if (!contentRef.current || !doc) return;
    ensureDocImageIds(contentRef.current);
    ensureDocumentHeadingIds(contentRef.current);
    updatePlaceholderVisibility(contentRef.current);
    const firstBlock = contentRef.current.firstElementChild as HTMLElement | null;
    const updates: Partial<Document> = { content: stripChipsFromHTML(contentRef.current.innerHTML) };
    if (firstBlock?.tagName === 'H1') {
      const h1Text = firstBlock.textContent ?? '';
      if (h1Text && h1Text !== doc.title) updates.title = h1Text;
    }
    if (getDocumentHistorySignature({ title: doc.title, content: doc.content, emoji: doc.emoji, linkedFile: doc.linkedFile }) !== getDocumentHistorySignature({ title: updates.title ?? doc.title, content: updates.content ?? doc.content, emoji: doc.emoji, linkedFile: doc.linkedFile })) {
      checkpointDocumentHistory();
    }
    markDirty();
    updateDocument(doc.id, updates);
  }, [checkpointDocumentHistory, doc, markDirty, updateDocument]);

  const switchToSource = () => {
    if (!doc) return;
    setSourceText(htmlToMarkdown(doc.content ?? ''));
    setViewMode('source');
  };

  const switchToEdit = () => {
    if (!doc) return;
    const html = markdownToHtml(sourceText);
    if (html !== (doc.content ?? '')) checkpointDocumentHistory();
    markDirty();
    updateDocument(doc.id, { content: html });
    setViewMode('edit');
    requestAnimationFrame(() => {
      if (contentRef.current) {
        contentRef.current.innerHTML = html;
        applyChipsToDOM(contentRef.current);
        ensureDocImageIds(contentRef.current);
        ensureDocumentHeadingIds(contentRef.current);
        updatePlaceholderVisibility(contentRef.current);
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

  const handleShowWordCount = useCallback(() => {
    toast(`${docWordCount} words · ${docReadingTime}`);
  }, [docReadingTime, docWordCount]);

  const handleFindReplace = useCallback(() => {
    if (!doc) return;
    const search = window.prompt('Find text', '');
    if (!search) return;
    const replace = window.prompt('Replace with (leave empty to only find)', '');

    if (replace === null || replace === '') {
      if (viewMode === 'source' && sourceRef.current) {
        const index = sourceText.toLowerCase().indexOf(search.toLowerCase());
        if (index >= 0) {
          sourceRef.current.focus();
          sourceRef.current.setSelectionRange(index, index + search.length);
          toast(`Found "${search}"`);
        } else {
          toast(`No matches for "${search}"`);
        }
        return;
      }

      const root = contentRef.current;
      const text = root?.textContent ?? '';
      const index = text.toLowerCase().indexOf(search.toLowerCase());
      toast(index >= 0 ? `Found "${search}"` : `No matches for "${search}"`);
      return;
    }

    if (viewMode === 'source') {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const next = sourceText.replace(new RegExp(escaped, 'gi'), replace);
      if (next !== sourceText) {
        markDirty();
        setSourceText(next);
        toast(`Replaced "${search}"`);
      } else {
        toast(`No matches for "${search}"`);
      }
      return;
    }

    if (!contentRef.current) return;
    const html = stripChipsFromHTML(contentRef.current.innerHTML);
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nextHtml = html.replace(new RegExp(escaped, 'gi'), replace);
    if (nextHtml === html) {
      toast(`No matches for "${search}"`);
      return;
    }
    checkpointDocumentHistory();
    markDirty();
    contentRef.current.innerHTML = nextHtml;
    applyChipsToDOM(contentRef.current);
    ensureDocImageIds(contentRef.current);
    ensureDocumentHeadingIds(contentRef.current);
    updatePlaceholderVisibility(contentRef.current);
    contentRef.current.dispatchEvent(new Event('input', { bubbles: true }));
    toast(`Replaced "${search}"`);
  }, [checkpointDocumentHistory, doc, markDirty, sourceText, viewMode]);

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

  const openSlashPalette = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0).cloneRange();
    savedSelectionRef.current = range;
    const rect = range.getBoundingClientRect();
    const editorRect = editorScrollRef.current?.getBoundingClientRect();
    setSlashPalette({
      x: rect.left || window.innerWidth / 2 - 180,
      y: (rect.bottom || window.innerHeight / 2) + 8,
      bounds: editorRect
        ? {
            left: editorRect.left,
            right: editorRect.right,
            top: editorRect.top,
            bottom: editorRect.bottom,
          }
        : undefined,
    });
  }, []);

  const closeSlashPalette = useCallback(() => {
    setSlashPalette(null);
  }, []);

  const handleSlashCommandSelect = useCallback((command: SlashCommand) => {
    closeSlashPalette();
    if (command.id !== 'image-upload') checkpointDocumentHistory();
    const linkedTitle = documents.find((entry) => entry.id !== doc?.id)?.title || 'Related Note';
    const linkedNode = nodes.find((entry) => entry.type !== 'connector');
    const linkedNodeLabel = linkedNode ? getNodeLabel(linkedNode, documents) : 'Canvas Node';
    const linkedNodeId = linkedNode?.id ?? 'node-id';

    runDocumentCommand(command.id, {
      insertTextBlock: () => insertBlockHtmlAtSelection('<div data-placeholder="Type something…" data-placeholder-visible="true"><br></div>', { replaceCurrentBlock: true }),
      insertHeading1: () => insertBlockHtmlAtSelection('<h1 data-placeholder="Heading 1" data-placeholder-visible="true"><br></h1>', { replaceCurrentBlock: true }),
      insertHeading2: () => insertBlockHtmlAtSelection('<h2 data-placeholder="Heading 2" data-placeholder-visible="true"><br></h2>', { replaceCurrentBlock: true }),
      insertBulletList: () => insertBlockHtmlAtSelection('<ul><li data-placeholder="List item" data-placeholder-visible="true"><br></li></ul>', { replaceCurrentBlock: true }),
      insertNumberedList: () => insertBlockHtmlAtSelection('<ol><li data-placeholder="List item" data-placeholder-visible="true"><br></li></ol>', { replaceCurrentBlock: true }),
      insertTodoList: () => insertBlockHtmlAtSelection('<div data-placeholder="Todo item" data-placeholder-visible="true">☐ <br></div>', { replaceCurrentBlock: true }),
      insertQuote: () => insertBlockHtmlAtSelection('<blockquote data-placeholder="Quoted text…" data-placeholder-visible="true"><br></blockquote>', { replaceCurrentBlock: true }),
      insertCallout: () => insertBlockHtmlAtSelection(
        '<blockquote class="doc-callout" data-callout="true" data-callout-emoji="💡">' +
          '<span class="doc-callout__emoji" contenteditable="false">💡</span>' +
          '<div class="doc-callout__body" data-placeholder="Type a callout…" data-placeholder-visible="true"><br></div>' +
        '</blockquote>',
        { replaceCurrentBlock: true },
      ),
      insertCodeBlock: () => insertBlockHtmlAtSelection('<pre><code data-placeholder="Write some code…" data-placeholder-visible="true"><br></code></pre>', { replaceCurrentBlock: true }),
      insertDivider: () => insertBlockHtmlAtSelection('<hr><div data-placeholder="Type something…" data-placeholder-visible="true"><br></div>', { replaceCurrentBlock: true }),
      insertExternalLink: () => insertBlockHtmlAtSelection('<div><a href="https://example.com" data-placeholder="Paste a link…" data-placeholder-visible="true"><br></a></div>', { replaceCurrentBlock: true }),
      insertWikiLink: () => insertBlockHtmlAtSelection(
        `<div><span class="chip-wiki" data-chip="wiki" data-title="${escapeHtmlAttr(linkedTitle)}" contenteditable="false">${escapeInlineHtml(linkedTitle)}</span></div><div><br></div>`,
      ),
      insertNodeLink: () => insertBlockHtmlAtSelection(
        `<div><span class="chip-node" data-chip="node" data-nodeid="${escapeHtmlAttr(linkedNodeId)}" contenteditable="false">${escapeInlineHtml(linkedNodeLabel)}</span></div><div><br></div>`,
      ),
      insertImageUpload: () => imageInputRef.current?.click(),
      insertTag: () => insertBlockHtmlAtSelection('<div><span class="chip-tag" data-chip="tag" contenteditable="false">#tag</span></div><div><br></div>'),
    });
  }, [checkpointDocumentHistory, closeSlashPalette, doc?.id, documents, insertBlockHtmlAtSelection, nodes]);

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
          ref={titleInputRef}
          type="text"
          value={doc.title}
          onChange={(e) => {
            const newTitle = e.target.value;
            if (newTitle !== doc.title) checkpointDocumentHistory();
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

        {/* Note view controls */}
        {(panelMode || onCollapseToPanel) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <>
              <button
                onClick={() => prevPageDoc && openDocumentWithMorph(prevPageDoc.id)}
                disabled={!prevPageDoc}
                title={prevPageDoc ? `Previous: ${prevPageDoc.title || 'Untitled'}` : 'No previous note'}
                style={panelNavBtn(!prevPageDoc)}
                onMouseEnter={(e) => { if (prevPageDoc) e.currentTarget.style.background = 'var(--c-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M8 2.5 4.5 6.5 8 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button
                onClick={() => nextPageDoc && openDocumentWithMorph(nextPageDoc.id)}
                disabled={!nextPageDoc}
                title={nextPageDoc ? `Next: ${nextPageDoc.title || 'Untitled'}` : 'No next note'}
                style={panelNavBtn(!nextPageDoc)}
                onMouseEnter={(e) => { if (nextPageDoc) e.currentTarget.style.background = 'var(--c-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M5 2.5 8.5 6.5 5 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </>
            {panelMode && (
              <>
              </>
            )}
            {onExpand && panelMode && (
              <button
                onClick={onExpand}
                title="Open in full page"
                style={panelNavBtn(false)}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--c-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2 8v3h3M11 5V2H8M2 5V2h3M11 8v3H8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            {onCollapseToPanel && !panelMode && (
              <button
                onClick={onCollapseToPanel}
                title="Show as side panel"
                style={panelNavBtn(false)}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--c-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <rect x="2" y="2" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M8 2v9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            )}
            <button
              onClick={handleClose}
              title={panelMode ? 'Close panel (Esc)' : 'Close note (Esc)'}
              style={panelNavBtn(false)}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--c-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M3 3L10 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M10 3L3 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Body: editor */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void insertImageFile(file);
            }}
          />
          <FormattingBar
            viewMode={viewMode}
            compactMode={panelMode}
            onToggleSource={switchToSource}
            onToggleEdit={switchToEdit}
            onSave={handleSave}
            onSourceInsert={insertSourceSyntax}
            sourceWrap={sourceWrap}
            setSourceWrap={setSourceWrap}
            onCopySource={copySourceText}
            saveStatusText={saveStatusText}
            onOpenOutline={() => setSidebarPanel((current) => current === 'outline' ? null : 'outline')}
            onOpenProperties={() => setSidebarPanel((current) => current === 'properties' ? null : 'properties')}
            onFindReplace={handleFindReplace}
            onShowWordCount={handleShowWordCount}
            wordCount={docWordCount}
            readingTime={docReadingTime}
          />

          {viewMode === 'edit' && (
            <SelectionFormattingToolbar
              anchor={selectionToolbarAnchor}
              onWikilinkClick={handleWikilinkClick}
            />
          )}

          {viewMode === 'edit' && (
            <div
              ref={editorScrollRef}
              style={{ flex: 1, overflowY: 'auto', position: 'relative' }}
              onScroll={() => {
                updateSelectionToolbar();
                syncSelectedImageOverlay(selectedImageId);
              }}
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
                const imageFigure = target.closest('figure[data-doc-image="true"]') as HTMLElement | null;
                if (imageFigure?.dataset.docImageId) {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedImageId(imageFigure.dataset.docImageId);
                  syncSelectedImageOverlay(imageFigure.dataset.docImageId);
                  return;
                }
                if (selectedImageId) clearSelectedImage();
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
                onKeyDown={(e) => {
                  if ((e.key === 'Backspace' || e.key === 'Delete') && selectedImageId) {
                    e.preventDefault();
                    removeSelectedImage();
                    return;
                  }
                  if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                    const sel = window.getSelection();
                    const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
                    const root = contentRef.current;
                    const block = range && root ? rangeBlock(range, root) : null;
                    const blockText = (block?.textContent ?? '').replace(/\u00a0/g, ' ').trim();
                    if (!blockText || blockText === '/') {
                      e.preventDefault();
                      openSlashPalette();
                      return;
                    }
                  }
                  if (e.key === 'Escape' && selectedImageId) {
                    e.preventDefault();
                    clearSelectedImage();
                    return;
                  }
                  if (e.key === 'Escape' && slashPalette) {
                    e.preventDefault();
                    closeSlashPalette();
                  }
                }}
                onPaste={(e) => {
                  const imageItem = Array.from(e.clipboardData?.items ?? []).find((item) => item.type.startsWith('image/'));
                  if (!imageItem) return;
                  const file = imageItem.getAsFile();
                  if (!file) return;
                  e.preventDefault();
                  void insertImageFile(file);
                }}
                onDragOver={(e) => {
                  const hasImage = Array.from(e.dataTransfer?.files ?? []).some((file) => file.type.startsWith('image/'));
                  if (!hasImage) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }}
                onDrop={(e) => {
                  const file = Array.from(e.dataTransfer?.files ?? []).find((entry) => entry.type.startsWith('image/'));
                  if (!file) return;
                  e.preventDefault();
                  void insertImageFile(file);
                }}
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

              <div
                style={{
                  position: 'fixed',
                  right: panelMode ? 16 : 28,
                  bottom: 20,
                  padding: '7px 10px',
                  borderRadius: 999,
                  background: 'color-mix(in srgb, var(--c-panel) 92%, transparent)',
                  border: '1px solid var(--c-border)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  zIndex: 40,
                  color: 'var(--c-text-lo)',
                  fontSize: 11,
                  pointerEvents: 'none',
                }}
              >
                <span>{docWordCount} words</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>{docReadingTime}</span>
              </div>

              {selectedImageRect && selectedImageId && (
                <div
                  style={{
                    position: 'fixed',
                    left: selectedImageRect.left,
                    top: selectedImageRect.top,
                    width: selectedImageRect.width,
                    height: selectedImageRect.height,
                    border: '1.5px solid rgba(184,119,80,0.7)',
                    borderRadius: 16,
                    pointerEvents: 'none',
                    zIndex: 60,
                    boxShadow: '0 0 0 1px rgba(184,119,80,0.18)',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: -34,
                      right: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 6px',
                      borderRadius: 10,
                      background: 'var(--c-panel)',
                      border: '1px solid var(--c-border)',
                      boxShadow: '0 10px 24px rgba(0,0,0,0.25)',
                      pointerEvents: 'auto',
                    }}
                  >
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeSelectedImage();
                      }}
                      style={{
                        height: 24,
                        padding: '0 8px',
                        borderRadius: 7,
                        border: '1px solid rgba(239,68,68,0.25)',
                        background: 'transparent',
                        color: '#f87171',
                        cursor: 'pointer',
                        fontSize: 11,
                        fontFamily: 'inherit',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const figure = contentRef.current?.querySelector<HTMLElement>(`figure[data-doc-image-id="${selectedImageId}"]`);
                      const image = figure?.querySelector<HTMLImageElement>('img');
                      if (!image) return;
                      imageResizeStateRef.current = {
                        imageId: selectedImageId,
                        startX: e.clientX,
                        startWidth: image.getBoundingClientRect().width,
                      };
                      document.body.style.userSelect = 'none';
                    }}
                    style={{
                      position: 'absolute',
                      right: -6,
                      bottom: -6,
                      width: 14,
                      height: 14,
                      borderRadius: 999,
                      background: 'var(--c-line)',
                      border: '2px solid var(--c-panel)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.28)',
                      cursor: 'nwse-resize',
                      pointerEvents: 'auto',
                    }}
                  />
                </div>
              )}

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

        {sidebarPanel && (
          <aside
            style={{
              width: 280,
              flexShrink: 0,
              borderLeft: '1px solid var(--c-border)',
              background: 'var(--c-panel)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px', borderBottom: '1px solid var(--c-border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-text-lo)' }}>
                {sidebarPanel === 'outline' ? 'Outline' : 'Properties'}
              </div>
              <button
                onClick={() => setSidebarPanel(null)}
                style={{ border: 'none', background: 'transparent', color: 'var(--c-text-lo)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                title="Close panel"
              >
                ×
              </button>
            </div>

            {sidebarPanel === 'outline' && (
              <div style={{ padding: 12, overflowY: 'auto' }}>
                {docOutline.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--c-text-lo)', lineHeight: 1.5 }}>
                    Add `H1` and `H2` blocks to build an outline for this note.
                  </div>
                )}
                {docOutline.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      const heading = contentRef.current?.querySelector<HTMLElement>(`#${CSS.escape(item.id)}`);
                      heading?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                    style={{
                      width: '100%',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--c-text-md)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      padding: item.level === 'h2' ? '8px 10px 8px 20px' : '8px 10px',
                      borderRadius: 8,
                      fontSize: item.level === 'h1' ? 12.5 : 12,
                      fontWeight: item.level === 'h1' ? 600 : 500,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--c-hover)'; e.currentTarget.style.color = 'var(--c-text-hi)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--c-text-md)'; }}
                  >
                    {item.text}
                  </button>
                ))}
              </div>
            )}

            {sidebarPanel === 'properties' && (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-text-lo)', marginBottom: 6 }}>Status</div>
                  <div style={{ fontSize: 12, color: 'var(--c-text-md)' }}>{dirtySinceSave ? 'Editing' : 'Saved'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-text-lo)', marginBottom: 6 }}>Tags</div>
                  <input
                    type="text"
                    value={(doc.tags ?? []).join(', ')}
                    placeholder="design, planning"
                    onChange={(e) => {
                      const tags = e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean);
                      checkpointDocumentHistory();
                      markDirty();
                      updateDocument(doc.id, { tags });
                    }}
                    style={{
                      width: '100%',
                      height: 34,
                      padding: '0 10px',
                      borderRadius: 8,
                      border: '1px solid var(--c-border)',
                      background: 'rgba(255,255,255,0.03)',
                      color: 'var(--c-text-hi)',
                      fontSize: 12,
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-text-lo)', marginBottom: 6 }}>Updated</div>
                  <div style={{ fontSize: 12, color: 'var(--c-text-md)' }}>{relativeTime(doc.updatedAt)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-text-lo)', marginBottom: 6 }}>Linked file</div>
                  <div style={{ fontSize: 12, color: 'var(--c-text-md)', wordBreak: 'break-word' }}>{doc.linkedFile ?? 'Not saved to workspace yet'}</div>
                </div>
              </div>
            )}
          </aside>
        )}
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

      {slashPalette && (
        <SlashCommandPalette
          pos={slashPalette}
          commands={slashCommands}
          onSelect={handleSlashCommandSelect}
          onClose={closeSlashPalette}
        />
      )}

      {/* Emoji picker */}
      {emojiPicker && doc && (
        <DocEmojiPicker
          pos={emojiPicker}
          current={doc.emoji}
          onSelect={(e) => {
            if (e !== doc.emoji) checkpointDocumentHistory();
            updateDocument(doc.id, { emoji: e });
            setEmojiPicker(null);
          }}
          onRemove={() => {
            if (doc.emoji) checkpointDocumentHistory();
            updateDocument(doc.id, { emoji: undefined });
            setEmojiPicker(null);
          }}
          onClose={() => setEmojiPicker(null)}
        />
      )}
    </div>
  );
}
