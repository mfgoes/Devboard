import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useBoardStore } from '../store/boardStore';
import { CanvasNode, Document } from '../types';
import { documentMarkdownFromParts, htmlToMarkdown, markdownToHtml } from '../utils/exportMarkdown';
import { saveAs } from 'file-saver';
import { hasWorkspaceHandle, readWorkspaceFileAsUrl, saveImageAsset, saveTextFileToWorkspace } from '../utils/workspaceManager';
import { toast } from '../utils/toast';
import { focusNode } from '../utils/focusNode';
import { IconArrowRight, IconCode, IconCodeBlock, IconCopy, IconEye, IconHorizontalRule, IconLink, IconList, IconListOrdered, IconMoreHorizontal, IconNodeLink, IconQuote, IconStar, IconTextWrap, IconUnlink, IconWikiLink } from './icons';
import { useDocumentAutoSave } from '../hooks/useDocumentAutoSave';
import { type DocumentCommandDefinition, type DocumentCommandGroup, type DocumentCommandId, getDocumentCommandsForSurface, runDocumentCommand } from './documentCommands';
import { caretHostForConvertedBlock, isConvertibleDocumentCommand, isSupportedTurnIntoBlock, restoreCaretAtEnd, turnBlockInto } from './documentBlockTransforms';
import DocumentLineHandle, { type LineHandleState } from './DocumentLineHandle';
import { sanitizeClipboardHtml } from '../utils/richText';
import { describeNoteSaveStatus, saveLinkedWorkspaceToCloud, type NoteSavePresentation } from '../utils/saveStatus';
import { taskListItemHtml } from '../utils/taskListHtml';
import AssetDrawer from './AssetDrawer';
import {
  activeWikiChipFromRange,
  applyChipsToDOM,
  buildImageAssetName,
  copyPlainText,
  documentOutlineFromHtml,
  documentTextWithRawLinks,
  escapeHtmlAttr,
  escapeInlineHtml,
  fileToDataUrl,
  findDocumentByTitle,
  generateMarkdownFilename,
  getDocumentHistorySignature,
  getNodeLabel,
  getWikiChipTitle,
  isRenderableExternalImageSrc,
  normalizeMarkdownTablesInHtml,
  normalizeTitleText,
  parseWikiLink,
  isBlankEditorBlock,
  readingTimeLabel,
  relativeTime,
  resizeDocumentTitleTextarea,
  stripChipsFromHTML,
  stripHtml,
  stripLeadingHtmlTitle,
  syncWikiChipState,
  wikiLinkRaw,
  wordCountFromHtml,
} from './documentModeUtils';
import './DocumentMode.css';

const TODO_LIST_ITEM_HTML = taskListItemHtml({ placeholder: 'Todo item' });
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
  const root = restoreRangeSelection(range);
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

function rangeBlocks(range: Range, root: HTMLElement): HTMLElement[] {
  const blocks = Array.from(root.children).filter((child): child is HTMLElement => {
    try {
      return range.intersectsNode(child);
    } catch {
      return false;
    }
  });
  const fallback = rangeBlock(range, root);
  return blocks.length ? blocks : fallback ? [fallback] : [];
}

function restoreRangeSelection(range: Range | null): HTMLElement | null {
  if (!range) return null;
  const root = rangeRoot(range);
  if (!root) return null;
  root.focus({ preventScroll: true });
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
  return root;
}

function applyTextAlignment(align: 'left' | 'center' | 'right', savedRange: Range | null) {
  const range = savedRange;
  const root = restoreRangeSelection(range);
  if (!range || !root) return;

  const command = align === 'left' ? 'justifyLeft' : align === 'center' ? 'justifyCenter' : 'justifyRight';
  document.execCommand(command, false);
  rangeBlocks(range, root).forEach((block) => {
    if (align === 'left') block.style.removeProperty('text-align');
    else block.style.textAlign = align;
  });
  root.dispatchEvent(new Event('input', { bubbles: true }));
}

// Toggle blockquote wrap on the current block
function toggleBlockquote(savedRange: Range | null) {
  const range = savedRange;
  if (!range) return;
  const root = restoreRangeSelection(range);
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
  const root = restoreRangeSelection(range);
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
  const root = restoreRangeSelection(range);
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
  const root = restoreRangeSelection(range);
  if (!root) return;
  const sel = window.getSelection();

  const closestCode = (node: Node | null): HTMLElement | null => {
    let current = node;
    if (current?.nodeType === Node.TEXT_NODE) current = current.parentNode;
    while (current && (current as HTMLElement).contentEditable !== 'true') {
      if ((current as HTMLElement).tagName?.toLowerCase() === 'code') return current as HTMLElement;
      current = current.parentNode;
    }
    return null;
  };

  const unwrapCodeElements = (codes: HTMLElement[]) => {
    const unwrappedTextNodes: Text[] = [];
    codes.forEach((code) => {
      const unwrapped = document.createTextNode(code.textContent ?? '');
      code.replaceWith(unwrapped);
      unwrappedTextNodes.push(unwrapped);
    });

    const nextRange = document.createRange();
    const first = unwrappedTextNodes[0];
    const last = unwrappedTextNodes[unwrappedTextNodes.length - 1];
    if (first && last) {
      nextRange.setStart(first, 0);
      nextRange.setEnd(last, last.length);
      sel?.removeAllRanges();
      sel?.addRange(nextRange);
    }

    root.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const codeParent =
    closestCode(range.startContainer) ||
    closestCode(range.commonAncestorContainer);

  if (codeParent) {
    unwrapCodeElements([codeParent]);
    return;
  }

  const intersectingCodes = Array.from(root.querySelectorAll<HTMLElement>('code'))
    .filter((code) => {
      try {
        return range.intersectsNode(code);
      } catch {
        return false;
      }
    });
  if (intersectingCodes.length > 0) {
    unwrapCodeElements(intersectingCodes);
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
  root.dispatchEvent(new Event('input', { bubbles: true }));
}

// Insert <hr> after the current block
function insertHorizontalRule(savedRange: Range | null) {
  const range = savedRange;
  if (!range) return;
  const root = restoreRangeSelection(range);
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
  onExportMarkdown: () => void;
  onSourceInsert: (syntax: string) => void;
  sourceWrap: boolean;
  setSourceWrap: React.Dispatch<React.SetStateAction<boolean>>;
  onCopySource: () => void;
  saveStatus?: NoteSavePresentation;
  onOpenOutline: () => void;
  onOpenProperties: () => void;
  onFindReplace: () => void;
  onShowWordCount: () => void;
  wordCount: number;
  readingTime: string;
  insertCommands: DocumentCommandDefinition[];
  turnIntoCommands: DocumentCommandDefinition[];
  onInsertCommand: (command: DocumentCommandDefinition) => void;
  onTurnIntoCommand: (command: DocumentCommandDefinition) => void;
  onCaptureSelection: () => void;
  onOpenSlashCommands: () => void;
  onMenuOpenChange?: (open: boolean) => void;
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
  onSourceInsert,
  sourceWrap,
  setSourceWrap,
  onCopySource,
  insertCommands,
  turnIntoCommands,
  onInsertCommand,
  onTurnIntoCommand,
  onCaptureSelection,
  onOpenSlashCommands,
  onMenuOpenChange,
}: FmtBarProps) {
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [hoveredControl, setHoveredControl] = useState<string | null>(null);
  const [toolbarWidth, setToolbarWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1440));
  const isMobileNarrow = toolbarWidth < 520;
  const useCompactToolbar = compactMode || toolbarWidth < 760;
  const useUltraCompactToolbar = toolbarWidth < 620;
  const savedRangeRef = useRef<Range | null>(null);
  const [, tick] = useState(0);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const toolsBtnRef = useRef<HTMLButtonElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    onCaptureSelection();
  };

  const restoreSelection = () => {
    restoreRangeSelection(savedRangeRef.current);
  };

  const fmt = (cmd: string, val?: string) => {
    restoreSelection();
    document.execCommand(cmd, false, val);
    dispatchEditableInput(savedRangeRef.current);
    tick((n) => n + 1);
  };

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

  const primaryMenuButtonStyle = (active: boolean, hovered = false): React.CSSProperties => ({
    ...btnStyle(active, hovered),
    minWidth: useCompactToolbar ? 96 : 116,
    height: isMobileNarrow ? 34 : 32,
    padding: '0 12px',
    justifyContent: 'space-between',
    border: `1px solid ${active ? 'rgba(184,119,80,0.52)' : 'rgba(184,119,80,0.32)'}`,
    background: active ? 'rgba(184,119,80,0.14)' : 'rgba(255,255,255,0.03)',
    color: active ? 'var(--c-line)' : 'var(--c-text-hi)',
    fontSize: useCompactToolbar ? 12 : 13,
    fontWeight: 700,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  });

  const compactIconButtonStyle = (active: boolean, hovered = false): React.CSSProperties => ({
    ...btnStyle(active, hovered),
    height: isMobileNarrow ? 34 : 32,
    minWidth: isMobileNarrow ? 34 : 32,
    padding: '0 8px',
    fontSize: 13,
    fontWeight: active ? 800 : 700,
    color: active ? 'var(--c-line)' : (hovered ? 'var(--c-text-hi)' : 'var(--c-text-md)'),
  });

  const toolbarDividerStyle: React.CSSProperties = {
    width: 1,
    height: 24,
    background: 'var(--c-border)',
    margin: '0 6px',
    flexShrink: 0,
  };

  const todoGlyph = (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 8.15 7.05 10.1 11.1 5.8" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const hoverHandlers = (id: string) => ({
    onMouseEnter: () => setHoveredControl(id),
    onMouseLeave: () => setHoveredControl((current) => (current === id ? null : current)),
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

  const toolsMenuRect = showToolsMenu && toolsBtnRef.current ? toolsBtnRef.current.getBoundingClientRect() : null;
  const groupedInsertCommands = insertCommands.reduce<Record<DocumentCommandGroup, DocumentCommandDefinition[]>>((acc, command) => {
    (acc[command.group] ||= []).push(command);
    return acc;
  }, {} as Record<DocumentCommandGroup, DocumentCommandDefinition[]>);
  const groupedTurnIntoCommands = turnIntoCommands.reduce<Record<DocumentCommandGroup, DocumentCommandDefinition[]>>((acc, command) => {
    (acc[command.group] ||= []).push(command);
    return acc;
  }, {} as Record<DocumentCommandGroup, DocumentCommandDefinition[]>);

  const closeMenus = () => {
    setShowToolsMenu(false);
  };

  const runTurnIntoCommand = (id: DocumentCommandId) => {
    const command = turnIntoCommands.find((candidate) => candidate.id === id);
    if (!command) return;
    restoreSelection();
    onCaptureSelection();
    closeMenus();
    onTurnIntoCommand(command);
    tick((n) => n + 1);
  };

  const runToolbarCommand = (id: DocumentCommandId) => {
    const command = insertCommands.find((candidate) => candidate.id === id);
    if (!command) return;
    restoreSelection();
    onCaptureSelection();
    closeMenus();
    onInsertCommand(command);
  };

  const openSlashCommands = () => {
    restoreSelection();
    onCaptureSelection();
    closeMenus();
    onOpenSlashCommands();
  };

  useEffect(() => {
    onMenuOpenChange?.(showToolsMenu);
    return () => onMenuOpenChange?.(false);
  }, [onMenuOpenChange, showToolsMenu]);

  useEffect(() => {
    if (!showToolsMenu) return;
    const handleWindowPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (
        toolbarRef.current?.contains(target) ||
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
  }, [showToolsMenu]);

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
        padding: compactMode ? '8px 14px' : '9px 28px',
        borderBottom: '1px solid var(--c-border)',
        background: 'var(--c-panel)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
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
              ref={toolsBtnRef}
              type="button"
              style={primaryMenuButtonStyle(showToolsMenu, hoveredControl === 'tools')}
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => {
                setShowToolsMenu((v) => !v);
              }}
              {...hoverHandlers('tools')}
              title="Insert block or link"
            >
              <span style={{ fontSize: 18, fontWeight: 500, lineHeight: 1 }}>+</span>
              <span style={{ marginRight: 2 }}>Insert</span>
              <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
            </button>
            <div style={toolbarDividerStyle} />
            <button
              type="button"
              style={compactIconButtonStyle(false, hoveredControl === 'h1')}
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => runTurnIntoCommand('heading-1')}
              {...hoverHandlers('h1')}
              title="Heading 1"
            >
              H1
            </button>
            <button
              type="button"
              style={compactIconButtonStyle(false, hoveredControl === 'h2')}
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => runTurnIntoCommand('heading-2')}
              {...hoverHandlers('h2')}
              title="Heading 2"
            >
              H2
            </button>
            <button
              type="button"
              style={compactIconButtonStyle(false, hoveredControl === 'bullet-list')}
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => runTurnIntoCommand('bullet-list')}
              {...hoverHandlers('bullet-list')}
              title="Bullet list"
            >
              <IconList />
            </button>
            <button
              type="button"
              style={compactIconButtonStyle(false, hoveredControl === 'todo-list')}
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => runTurnIntoCommand('todo-list')}
              {...hoverHandlers('todo-list')}
              title="Todo list"
            >
              {todoGlyph}
            </button>
            <button
              type="button"
              style={compactIconButtonStyle(false, hoveredControl === 'quote')}
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => runTurnIntoCommand('quote')}
              {...hoverHandlers('quote')}
              title="Quote"
            >
              <IconQuote />
            </button>
            <div style={toolbarDividerStyle} />
            <button
              type="button"
              style={{
                ...btnStyle(false, hoveredControl === 'slash-commands'),
                height: isMobileNarrow ? 34 : 32,
                minWidth: useCompactToolbar ? 42 : 154,
                padding: useCompactToolbar ? '0 9px' : '0 12px',
                borderRadius: 999,
                border: '1px dashed var(--c-border)',
                color: hoveredControl === 'slash-commands' ? 'var(--c-text-hi)' : 'var(--c-text-md)',
                fontSize: 13,
                fontWeight: 600,
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={openSlashCommands}
              {...hoverHandlers('slash-commands')}
              title="Slash commands"
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 7,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'var(--c-text-hi)',
                  fontSize: 15,
                  lineHeight: 1,
                }}
              >
                /
              </span>
              {!useCompactToolbar && <span>slash commands</span>}
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

      {toolsMenuRect && (
        <div
          ref={toolsMenuRef}
          style={{ ...menuShell(toolsMenuRect, 260), maxHeight: 'min(72vh, 620px)', overflowY: 'auto' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {(Object.keys(groupedTurnIntoCommands) as DocumentCommandGroup[]).map((group) => (
            <div key={`turn-${group}`}>
              <div style={{ padding: '7px 10px 4px', color: 'var(--c-text-off)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0 }}>
                Turn into
              </div>
              {groupedTurnIntoCommands[group].map((command) => (
                <button
                  key={command.id}
                  style={menuButtonStyle}
                  title={`Turn current line into ${command.label.toLowerCase()}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    restoreSelection();
                    onCaptureSelection();
                    closeMenus();
                    onTurnIntoCommand(command);
                  }}
                  {...menuHover}
                >
                  <span
                    style={{
                      width: 24,
                      height: 22,
                      borderRadius: 6,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      background: 'rgba(184,119,80,0.12)',
                      color: 'var(--c-line)',
                      fontSize: 11,
                      fontWeight: 800,
                      fontFamily: command.id === 'code-block' ? 'JetBrains Mono, monospace' : 'inherit',
                    }}
                  >
                    {command.glyph}
                  </span>
                  <span>{command.label}</span>
                </button>
              ))}
              <div style={{ height: 1, background: 'var(--c-border)', margin: '6px 4px' }} />
            </div>
          ))}
          {(Object.keys(groupedInsertCommands) as DocumentCommandGroup[]).map((group) => (
            <div key={group}>
              <div style={{ padding: '7px 10px 4px', color: 'var(--c-text-off)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0 }}>
                {group}
              </div>
              {groupedInsertCommands[group].map((command) => (
                <button
                  key={command.id}
                  style={menuButtonStyle}
                  title={command.description}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    restoreSelection();
                    onCaptureSelection();
                    closeMenus();
                    onInsertCommand(command);
                  }}
                  {...menuHover}
                >
                  <span
                    style={{
                      width: 24,
                      height: 22,
                      borderRadius: 6,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      background: 'rgba(184,119,80,0.12)',
                      color: 'var(--c-line)',
                      fontSize: 11,
                      fontWeight: 800,
                      fontFamily: command.id === 'code-block' ? 'JetBrains Mono, monospace' : 'inherit',
                    }}
                  >
                    {command.glyph}
                  </span>
                  <span>{command.label}</span>
                  {command.hint && (
                    <span style={{ marginLeft: 'auto', color: 'var(--c-text-lo)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>
                      {command.hint}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

interface SelectionFormattingToolbarProps {
  anchor: SelectionToolbarAnchor | null;
  isWikiLinkActive: boolean;
  onWikilinkClick: (rect: DOMRect) => void;
  onInteractionStart: () => void;
}

function SelectionFormattingToolbar({ anchor, isWikiLinkActive, onWikilinkClick, onInteractionStart }: SelectionFormattingToolbarProps) {
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showLinkMenu, setShowLinkMenu] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [hoveredControl, setHoveredControl] = useState<string | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [, tick] = useState(0);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const linkBtnRef = useRef<HTMLButtonElement>(null);
  const floatingToolbarRef = useRef<HTMLDivElement>(null);
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const linkMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchor) {
      setShowColorMenu(false);
      setShowLinkMenu(false);
    }
  }, [anchor]);

  useEffect(() => {
    if (!showColorMenu && !showLinkMenu) return;
    const handleWindowPointer = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (
        floatingToolbarRef.current?.contains(target) ||
        colorMenuRef.current?.contains(target) ||
        linkMenuRef.current?.contains(target)
      ) {
        return;
      }
      setShowColorMenu(false);
      setShowLinkMenu(false);
    };
    window.addEventListener('mousedown', handleWindowPointer);
    return () => window.removeEventListener('mousedown', handleWindowPointer);
  }, [showColorMenu, showLinkMenu]);

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

  const colorMenuRect = showColorMenu && colorBtnRef.current ? colorBtnRef.current.getBoundingClientRect() : null;
  const linkMenuRect = showLinkMenu && linkBtnRef.current ? linkBtnRef.current.getBoundingClientRect() : null;
  const activeLinkHref = getLinkHref(savedRangeRef.current);

  const toolbarButtonStyle = (active: boolean, hovered = false): React.CSSProperties => ({
    width: 32,
    height: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    border: active ? '1px solid rgba(184,119,80,0.46)' : '1px solid transparent',
    background: active
      ? (hovered ? 'rgba(184,119,80,0.3)' : 'rgba(184,119,80,0.2)')
      : (hovered ? 'var(--c-hover)' : 'transparent'),
    color: active ? 'var(--c-line)' : (hovered ? 'var(--c-text-hi)' : 'var(--c-text-lo)'),
    cursor: 'pointer',
    transition: 'background 0.12s, border-color 0.12s, color 0.12s',
    flexShrink: 0,
  });
  const toolbarInsertButtonStyle = (active: boolean, hovered = false): React.CSSProperties => ({
    ...toolbarButtonStyle(active, hovered),
    width: 'auto',
    minWidth: 116,
    justifyContent: 'flex-start',
    gap: 8,
    padding: '0 10px',
    fontSize: 12,
    fontWeight: 700,
  });

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
        data-selection-toolbar="true"
        style={{
          position: 'fixed',
          left: anchor.left,
          top: anchor.top,
          transform: 'translateX(-50%)',
          zIndex: 555,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          padding: 6,
          borderRadius: 16,
          background: 'var(--c-panel)',
          border: '1px solid var(--c-border)',
          boxShadow: '0 16px 38px rgba(0,0,0,0.34)',
          maxWidth: 'min(92vw, 340px)',
          overflow: 'visible',
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseDownCapture={onInteractionStart}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <button style={toolbarButtonStyle(document.queryCommandState('bold'), hoveredControl === 'bold')} onMouseDown={(e) => { e.preventDefault(); saveSelection(); execAndTick(() => document.execCommand('bold')); }} {...hoverHandlers('bold')} title="Bold"><b>B</b></button>
          <button style={{ ...toolbarButtonStyle(document.queryCommandState('italic'), hoveredControl === 'italic'), fontStyle: 'italic' }} onMouseDown={(e) => { e.preventDefault(); saveSelection(); execAndTick(() => document.execCommand('italic')); }} {...hoverHandlers('italic')} title="Italic"><i>I</i></button>
          <button style={{ ...toolbarButtonStyle(document.queryCommandState('underline'), hoveredControl === 'underline'), textDecoration: 'underline' }} onMouseDown={(e) => { e.preventDefault(); saveSelection(); execAndTick(() => document.execCommand('underline')); }} {...hoverHandlers('underline')} title="Underline">U</button>
          <button style={{ ...toolbarButtonStyle(document.queryCommandState('strikeThrough'), hoveredControl === 'strike'), textDecoration: 'line-through' }} onMouseDown={(e) => { e.preventDefault(); saveSelection(); execAndTick(() => document.execCommand('strikeThrough')); }} {...hoverHandlers('strike')} title="Strikethrough">S</button>
          <button
            ref={colorBtnRef}
            style={toolbarButtonStyle(showColorMenu, hoveredControl === 'color')}
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
              setShowColorMenu((v) => !v);
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
        </div>

        <div style={{ width: '100%', height: 1, background: 'var(--c-border)', opacity: 0.72 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <button
            style={toolbarInsertButtonStyle(isWikiLinkActive, hoveredControl === 'wiki-link')}
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
              restoreSelection();
              onWikilinkClick((e.currentTarget as HTMLButtonElement).getBoundingClientRect());
            }}
            {...hoverHandlers('wiki-link')}
            title={isWikiLinkActive ? 'Edit note link' : 'Link note'}
          >
            <IconWikiLink />
            <span>Link note</span>
          </button>
          <div style={{ width: 1, height: 24, background: 'var(--c-border)', opacity: 0.72, margin: '0 4px' }} />
          <button
            ref={linkBtnRef}
            style={toolbarButtonStyle(!!activeLinkHref || showLinkMenu, hoveredControl === 'link')}
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
              setLinkValue(getLinkHref(savedRangeRef.current));
              setShowLinkMenu((v) => !v);
              setShowColorMenu(false);
            }}
            {...hoverHandlers('link')}
            title="External link"
          >
            <IconLink />
          </button>
          <button style={toolbarButtonStyle(false, hoveredControl === 'inline-code')} onMouseDown={(e) => { e.preventDefault(); saveSelection(); restoreSelection(); toggleInlineCode(savedRangeRef.current); tick((n) => n + 1); }} {...hoverHandlers('inline-code')} title="Inline code"><IconCode /></button>
        </div>
      </div>

      {colorMenuRect && (
        <div ref={colorMenuRef} data-selection-toolbar="true" style={{ ...menuShell(colorMenuRect, 220), padding: 8 }} onMouseDown={(e) => e.stopPropagation()} onMouseDownCapture={onInteractionStart}>
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
        <div ref={linkMenuRef} data-selection-toolbar="true" style={{ ...menuShell(linkMenuRect, 260), padding: 8 }} onMouseDown={(e) => e.stopPropagation()} onMouseDownCapture={onInteractionStart}>
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
  initialQuery?: string;
  onSelect: (title: string) => void;
  onCreate: (title: string) => void;
  onClose: () => void;
}

function WikilinkPicker({ pos, documents, activeDocId, initialQuery = '', onSelect, onCreate, onClose }: WikilinkPickerProps) {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    if (initialQuery) inputRef.current?.select();
  }, [initialQuery]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return documents
      .filter((d) => d.id !== activeDocId && (!q || d.title.toLowerCase().includes(q) || stripHtml(d.content).toLowerCase().includes(q)))
      .slice(0, 8);
  }, [query, documents, activeDocId]);

  const exactMatch = documents.some((d) => d.title.toLowerCase() === query.toLowerCase().trim() && d.id !== activeDocId);
  const width = Math.min(PICKER_WIDTH, Math.max(180, window.innerWidth - 24));
  const left = Math.max(12, Math.min(pos.x, window.innerWidth - width - 12));
  const top = Math.max(12, Math.min(pos.y, window.innerHeight - 280));

  return (
    <>
      <div className="document-mode-overlay" onMouseDown={onClose} />
      <div className="document-picker" style={{ left, top, width }}>
        <div className="document-picker__header">
          <svg className="document-picker__header-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
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
            className="document-picker__input"
          />
        </div>
        <div className="document-picker__list">
          {filtered.map((d) => (
            <div
              key={d.id}
              onMouseDown={(e) => { e.preventDefault(); onSelect(d.title); }}
              className="document-picker__row"
            >
              <div className="document-picker__title">
                {d.title || 'Untitled'}
              </div>
              <div className="document-picker__subtitle">
                {stripHtml(d.content).slice(0, 80) || 'Empty'}
              </div>
            </div>
          ))}
          {query.trim() && !exactMatch && (
            <div
              onMouseDown={(e) => { e.preventDefault(); onCreate(query.trim()); }}
              className="document-picker__row document-picker__row--create"
              data-has-results={filtered.length > 0}
            >
              <span className="document-picker__create-icon">+</span>
              <span className="document-picker__create-label">New note: <b className="document-picker__create-title">"{query.trim()}"</b></span>
            </div>
          )}
          {filtered.length === 0 && query.trim() && (
            <div className="document-picker__hint">
              No matching notes. Clear the search to browse existing notes.
            </div>
          )}
          {filtered.length === 0 && !query.trim() && (
            <div className="document-picker__empty">No other notes yet</div>
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

  const width = Math.min(PICKER_WIDTH, Math.max(180, window.innerWidth - 24));
  const pickerLeft = Math.max(12, Math.min(pos.x, window.innerWidth - width - 12));
  const pickerTop = Math.max(12, Math.min(pos.y, window.innerHeight - 280));

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
      <div className="document-mode-overlay" onMouseDown={onClose} />
      <div className="document-picker" style={{ left: pickerLeft, top: pickerTop, width }}>
        <div className="document-picker__header">
          <svg className="document-picker__header-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
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
            className="document-picker__input"
          />
        </div>
        <div className="document-picker__list">
          {filtered.map(({ node, label }) => (
            <div
              key={node.id}
              onMouseDown={(e) => { e.preventDefault(); onSelect(node.id, label); }}
              className="document-picker__row document-picker__row--node"
            >
              <span className="document-picker__node-type-icon">{typeIcon(node.type)}</span>
              <span className="document-picker__node-label">{label}</span>
              <span className="document-picker__node-type">{node.type}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="document-picker__empty">No canvas nodes found</div>
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
      <div className="document-mode-overlay" onMouseDown={onClose} />
      <div className="doc-emoji-picker" style={{ left, top }}>
        <div className="doc-emoji-picker__grid" style={{ width: COLS * 34 }}>
          {DOC_EMOJIS.map((e) => (
            <button
              key={e}
              onMouseDown={(ev) => { ev.preventDefault(); onSelect(e); }}
              className="doc-emoji-picker__button"
              data-current={e === current}
            >{e}</button>
          ))}
        </div>
        {current && (
          <div className="doc-emoji-picker__remove-wrap">
            <button
              onMouseDown={(e) => { e.preventDefault(); onRemove(); }}
              className="doc-emoji-picker__remove"
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
      case 'text': return <span className="doc-slash-icon-text doc-slash-icon-text--body">T</span>;
      case 'heading-1': return <span className="doc-slash-icon-text doc-slash-icon-text--heading">H1</span>;
      case 'heading-2': return <span className="doc-slash-icon-text doc-slash-icon-text--heading">H2</span>;
      case 'bullet-list': return <IconList />;
      case 'numbered-list': return <IconListOrdered />;
      case 'todo-list': return <span className="doc-slash-icon-text doc-slash-icon-text--todo">☐</span>;
      case 'quote': return <IconQuote />;
      case 'callout': return <IconQuote />;
      case 'code-block': return <IconCodeBlock />;
      case 'divider': return <IconHorizontalRule />;
      case 'external-link': return <IconLink />;
      case 'wiki-link': return <IconWikiLink />;
      case 'node-link': return <IconNodeLink />;
      case 'tag': return <span className="doc-slash-icon-text doc-slash-icon-text--tag">#</span>;
      case 'image-upload':
        return (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <rect x="1.2" y="1.8" width="10.6" height="8.4" rx="1.6" stroke="currentColor" strokeWidth="1.1" />
            <path d="M2.5 8.5 5.1 6l1.8 1.8 1.7-1.5 1.9 2.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="4.1" cy="4.5" r="0.8" fill="currentColor" />
          </svg>
        );
      default: return <span className="doc-slash-icon-text doc-slash-icon-text--default">{command.glyph}</span>;
    }
  };

  const renderPreview = (command: SlashCommand | null) => {
    if (!command) return null;
    if (command.id === 'heading-2') {
      return <div className="doc-slash-preview-heading">Heading 2</div>;
    }
    if (command.id === 'bullet-list') {
      return <div className="doc-slash-preview-list">• First item<br />• Second item</div>;
    }
    if (command.id === 'numbered-list') {
      return <div className="doc-slash-preview-list">1. First step<br />2. Second step</div>;
    }
    if (command.id === 'todo-list') {
      return <div className="doc-slash-preview-list">☐ First task<br />☐ Second task</div>;
    }
    if (command.id === 'quote') {
      return <div className="doc-slash-preview-quote">Quoted idea or passage</div>;
    }
    if (command.id === 'callout') {
      return <div className="doc-slash-preview-callout">Callout block</div>;
    }
    if (command.id === 'code-block') {
      return <div className="doc-slash-preview-code">const note = "code";</div>;
    }
    if (command.id === 'divider') {
      return <div className="doc-slash-preview-rule" />;
    }
    if (command.id === 'external-link') {
      return <div className="doc-slash-preview-link">https://example.com</div>;
    }
    if (command.id === 'tag') {
      return <div className="doc-slash-preview-tag">#tag</div>;
    }
    if (command.id === 'image-upload') {
      return <div className="doc-slash-preview-image">Paste, drop, or pick an image</div>;
    }
    return <div className="doc-slash-preview-default">{command.label}</div>;
  };

  return (
    <>
      <div className="document-mode-overlay" onMouseDown={onClose} />
      <div
        className="doc-slash-palette"
        style={{ left, top }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="doc-slash-palette__header">
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
            className="doc-slash-palette__input"
          />
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              onClose();
            }}
            className="doc-slash-palette__close"
            title="Close menu"
          >
            ×
          </button>
        </div>
        <div className="doc-slash-palette__list">
          {(['Basic', 'Link', 'Media', 'Meta'] as const).map((group) => {
            const groupCommands = grouped[group] ?? [];
            if (groupCommands.length === 0) return null;
            return (
              <div key={group} className="doc-slash-palette__group">
                <div className="doc-slash-palette__group-label">
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
                      className="doc-slash-palette__command"
                      data-active={active}
                    >
                      <span className="doc-slash-palette__command-icon">
                        {renderSlashIcon(command)}
                      </span>
                      <span className="doc-slash-palette__command-label">
                        {command.label}
                      </span>
                      {command.hint && (
                        <span className="doc-slash-palette__command-hint">
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
            <div className="doc-slash-palette__empty">
              No matching blocks
            </div>
          )}
        </div>
        <div className="doc-slash-palette__footer">
          <span>Enter to insert</span>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              onClose();
            }}
            className="doc-slash-palette__footer-close"
          >
            Close menu · Esc
          </button>
        </div>
      </div>
      {previewLeft !== null && activeCommand && (
        <div
          className="doc-slash-preview-card"
          style={{ left: previewLeft, top: Math.min(top + 88, (bounds ? bounds.bottom : window.innerHeight) - 188) }}
        >
          <div className="doc-slash-preview-card__eyebrow">
            Preview
          </div>
          <div className="doc-slash-preview-card__title">{activeCommand.label}</div>
          <div className="doc-slash-preview-card__description">{activeCommand.description}</div>
          <div className="doc-slash-preview-card__sample">{renderPreview(activeCommand)}</div>
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
  onClosePanel?: () => void;
  onOpenDocument?: (id: string) => void;
  documentId?: string;
  headerBreadcrumb?: {
    workspaceLabel: string;
    folderLabel: string;
    noteLabel: string;
    onFolderClick: () => void;
  };
  panelMode?: boolean;
}

export default function DocumentMode({
  onClose,
  onExpand,
  onCollapseToPanel,
  onClosePanel,
  onOpenDocument,
  documentId,
  headerBreadcrumb,
  panelMode = false,
}: DocumentModeProps) {
  const { documents, activeDocId, updateDocument, toggleFavoriteDocument, addDocument, closeDocument, openDocumentWithMorph, nodes, activePageId, pageSnapshots, saveHistory, undo, redo, noteAutosaveEnabled, imageAssetFolder } = useBoardStore();
  const contentRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const bodyTitleTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const editHistoryTimerRef = useRef<number | null>(null);
  const canStartEditHistoryGroupRef = useRef(true);
  const [viewMode, setViewMode] = useState<'edit' | 'source'>('edit');
  const [sourceText, setSourceText] = useState('');
  const [sourceWrap, setSourceWrap] = useState(true);
  const [, forceUpdate] = useState(0);
  const [docHistory, setDocHistory] = useState<string[]>([]);
  const [wikiPreview, setWikiPreview] = useState<{ x: number; y: number; doc: Document; chip: HTMLElement } | null>(null);
  const [wikiContextMenu, setWikiContextMenu] = useState<{ x: number; y: number; doc: Document; chip: HTMLElement } | null>(null);
  const [nodeContextMenu, setNodeContextMenu] = useState<{ x: number; y: number; nodeId: string; chip: HTMLElement } | null>(null);
  const [wikiRename, setWikiRename] = useState<{ chip: HTMLElement; originalText: string; value: string; rect: DOMRect } | null>(null);
  const wikiPreviewTitle = useRef<string | null>(null);
  const wikiPreviewCloseTimerRef = useRef<number | null>(null);
  const [wikilinkPicker, setWikilinkPicker] = useState<{ x: number; y: number; initialQuery?: string; chip?: HTMLElement } | null>(null);
  const [nodePicker, setNodePicker] = useState<{ x: number; y: number; chip?: HTMLElement } | null>(null);
  const [emojiPicker, setEmojiPicker] = useState<{ x: number; y: number } | null>(null);
  const [isHoveringDoc, setIsHoveringDoc] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [hasEditedSinceOpen, setHasEditedSinceOpen] = useState(false);
  const [dirtySinceSave, setDirtySinceSave] = useState(false);
  const [slashPalette, setSlashPalette] = useState<FloatingPalettePosition | null>(null);
  const [lineHandle, setLineHandle] = useState<LineHandleState | null>(null);
  const [lineHandleMenu, setLineHandleMenu] = useState<LineHandleState | null>(null);
  const [selectionToolbarAnchor, setSelectionToolbarAnchor] = useState<SelectionToolbarAnchor | null>(null);
  const [sidebarPanel, setSidebarPanel] = useState<'outline' | 'properties' | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [selectedImageRect, setSelectedImageRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [assetDrawerOpen, setAssetDrawerOpen] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [formattingMenuOpen, setFormattingMenuOpen] = useState(false);
  const [slashHintCount, setSlashHintCount] = useState(() => {
    if (typeof window === 'undefined') return 0;
    return Number(window.localStorage.getItem('devboard.slashCommandCount') ?? '0') || 0;
  });
  const [, forceSaveStatusTick] = useState(0);
  const savedSelectionRef = useRef<Range | null>(null);
  const wikiRenameInputRef = useRef<HTMLInputElement>(null);
  const suppressWikiRenameBlurRef = useRef(false);
  const hydrationVersionRef = useRef(0);
  const imageResizeStateRef = useRef<{ imageId: string; startX: number; startWidth: number } | null>(null);
  const wikiPointerDownRef = useRef<{ chip: HTMLElement; x: number; y: number } | null>(null);
  const selectionToolbarInteractingRef = useRef(false);
  const lineHandleHideTimerRef = useRef<number | null>(null);

  const currentDocumentId = documentId ?? activeDocId;
  const doc = documents.find((d) => d.id === currentDocumentId) as Document | undefined;
  const setBodyTitleTextarea = useCallback((el: HTMLTextAreaElement | null) => {
    bodyTitleTextareaRef.current = el;
    if (!el) return;
    resizeDocumentTitleTextarea(el);
    requestAnimationFrame(() => resizeDocumentTitleTextarea(el));
  }, []);
  const handleClose = onClosePanel ?? onClose ?? closeDocument;
  const openDocumentInSurface = useCallback((id: string) => {
    if (onOpenDocument) {
      onOpenDocument(id);
      return;
    }
    openDocumentWithMorph(id);
  }, [onOpenDocument, openDocumentWithMorph]);
  const docPageId = doc?.pageId ?? activePageId;

  const allCanvasNodes = useMemo(() => {
    const seen = new Set<string>();
    const collected: CanvasNode[] = [];
    const addNodes = (list: CanvasNode[] | undefined) => {
      for (const node of list ?? []) {
        if (seen.has(node.id)) continue;
        seen.add(node.id);
        collected.push(node);
      }
    };
    addNodes(nodes);
    Object.values(pageSnapshots).forEach((snapshot) => addNodes(snapshot.nodes));
    return collected;
  }, [nodes, pageSnapshots]);
  const isOverlayPanel = !!headerBreadcrumb;
  const simplifyPanelChrome = panelMode && isOverlayPanel;

  const panelNavBtn = (disabled: boolean): React.CSSProperties => ({
    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', borderRadius: 6,
    cursor: disabled ? 'default' : 'pointer',
    color: disabled ? 'var(--c-text-lo)' : 'var(--c-text-md)',
    opacity: disabled ? 0.35 : 1,
    transition: 'background 0.12s, color 0.12s, opacity 0.12s, transform 0.12s',
    flexShrink: 0,
  });

  const pageDocs = useMemo(() =>
    documents
      .filter((d) => d.pageId === docPageId)
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || a.updatedAt - b.updatedAt),
    [documents, docPageId]
  );
  const currentDocIdx = pageDocs.findIndex((d) => d.id === currentDocumentId);
  const prevPageDoc = currentDocIdx > 0 ? pageDocs[currentDocIdx - 1] : null;
  const nextPageDoc = currentDocIdx >= 0 && currentDocIdx < pageDocs.length - 1 ? pageDocs[currentDocIdx + 1] : null;

  // Backlinks: other docs that reference [[this doc's title]]
  const backlinks = useMemo(() => {
    if (!doc?.title?.trim()) return [];
    const esc = doc.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pat = new RegExp(`\\[\\[${esc}(?:\\|[^\\]]*)?\\]\\]`, 'i');
    return documents
      .filter((d) => d.id !== doc.id && pat.test(documentTextWithRawLinks(d.content)))
      .map((d) => {
        const text = documentTextWithRawLinks(d.content);
        const idx = text.search(pat);
        const start = Math.max(0, idx - 70);
        const end = Math.min(text.length, idx + 70);
        return { from: d, context: '…' + text.slice(start, end).trim() + '…' };
      });
  }, [doc?.id, doc?.title, documents]);

  const wikiResolutionSignature = useMemo(
    () => documents.map((entry) => normalizeTitleText(entry.title)).sort().join('\u0000'),
    [documents],
  );

  // Canvas node mentions: @node:id patterns found in this doc
  const mentionedNodes = useMemo(() => {
    if (!doc?.content) return [];
    const ids = new Set<string>();
    const re = /@node:([a-zA-Z0-9_-]+)/g;
    let m: RegExpExecArray | null;
    const chipRe = /data-nodeid=["']([^"']+)["']/g;
    while ((m = chipRe.exec(doc.content)) !== null) ids.add(m[1]);
    const text = doc.content.replace(/<[^>]+>/g, ' ');
    while ((m = re.exec(text)) !== null) ids.add(m[1]);
    return allCanvasNodes.filter((n) => ids.has(n.id));
  }, [allCanvasNodes, doc?.id, doc?.content]);

  useEffect(() => {
    if (viewMode !== 'edit' || !contentRef.current) return;
    applyChipsToDOM(contentRef.current, useBoardStore.getState().documents);
  }, [viewMode, wikiResolutionSignature]);

  useEffect(() => {
    setIsEditorFocused(false);
  }, [currentDocumentId, viewMode]);

  useEffect(() => {
    const titleEl = bodyTitleTextareaRef.current;
    if (!titleEl) return;
    resizeDocumentTitleTextarea(titleEl);
    const frame = requestAnimationFrame(() => resizeDocumentTitleTextarea(titleEl));
    const timeout = window.setTimeout(() => resizeDocumentTitleTextarea(titleEl), 260);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [currentDocumentId, doc?.title, panelMode]);

  const docWordCount = useMemo(() => wordCountFromHtml(doc?.content ?? ''), [doc?.content]);
  const docReadingTime = useMemo(() => readingTimeLabel(docWordCount), [docWordCount]);
  const docOutline = useMemo(() => documentOutlineFromHtml(doc?.content ?? ''), [doc?.content]);
  const currentDocAssetPaths = useMemo(() => {
    if (!doc?.content) return [];
    const root = document.createElement('div');
    root.innerHTML = doc.content;
    return Array.from(root.querySelectorAll('img'))
      .map((image) => image.getAttribute('data-workspace-src') ?? '')
      .filter(Boolean);
  }, [doc?.content]);

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

  const selectionBelongsToEditor = useCallback((range: Range | null) => {
    const root = contentRef.current;
    if (!root || !range) return false;
    const contains = (node: Node) => node === root || root.contains(node);
    return contains(range.startContainer) && contains(range.endContainer);
  }, []);

  const createEditorEndRange = useCallback(() => {
    const root = contentRef.current;
    if (!root) return null;
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    return range;
  }, []);

  const setEditorSelection = useCallback((range: Range | null) => {
    const root = contentRef.current;
    if (!root || !range) return null;
    root.focus({ preventScroll: true });
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    savedSelectionRef.current = range.cloneRange();
    return range;
  }, []);

  const getEditorInsertionRange = useCallback((preferSaved = true) => {
    const sel = window.getSelection();
    const liveRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    const savedRange = savedSelectionRef.current;
    const candidate = preferSaved && selectionBelongsToEditor(savedRange)
      ? savedRange
      : selectionBelongsToEditor(liveRange)
        ? liveRange
        : createEditorEndRange();
    if (!candidate) return null;
    return setEditorSelection(candidate.cloneRange());
  }, [createEditorEndRange, selectionBelongsToEditor, setEditorSelection]);

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
    const root = contentRef.current;
    const range = getEditorInsertionRange();
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
  }, [doc, getEditorInsertionRange]);

  const syncTaskCheckbox = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
    if (!contentRef.current?.contains(target)) return;
    if (target.checked) target.setAttribute('checked', '');
    else target.removeAttribute('checked');
    target.setAttribute('data-task-checkbox', 'true');
    target.setAttribute('contenteditable', 'false');
    contentRef.current.dispatchEvent(new Event('input', { bubbles: true }));
  }, []);

  const handleTaskItemEnter = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
    const root = contentRef.current;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!root || !range || !root.contains(range.startContainer)) return false;

    const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer as Element
      : range.startContainer.parentElement;
    const taskItem = startElement?.closest?.('[data-task-list-item="true"]') as HTMLElement | null;
    if (!taskItem || !root.contains(taskItem)) return false;

    event.preventDefault();

    const taskText = taskItem.querySelector<HTMLElement>('.doc-task-text') ?? taskItem;
    const isEmptyTask = (taskText.textContent ?? '').replace(/\u00a0/g, ' ').trim() === '';
    let focusTarget: HTMLElement | null = null;

    if (isEmptyTask) {
      const nextBlock = document.createElement('div');
      nextBlock.innerHTML = '<br>';
      taskItem.replaceWith(nextBlock);
      focusTarget = nextBlock;
    } else {
      const nextTask = document.createRange().createContextualFragment(TODO_LIST_ITEM_HTML).firstElementChild as HTMLElement | null;
      if (!nextTask) return true;
      taskItem.after(nextTask);
      focusTarget = nextTask.querySelector<HTMLElement>('.doc-task-text') ?? nextTask;
    }

    if (focusTarget) {
      const nextRange = document.createRange();
      nextRange.selectNodeContents(focusTarget);
      nextRange.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(nextRange);
      savedSelectionRef.current = nextRange.cloneRange();
    }

    root.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, []);

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

  const insertWorkspaceAsset = useCallback(async (relativePath: string) => {
    const resolvedUrl = await readWorkspaceFileAsUrl(relativePath);
    if (!resolvedUrl) {
      toast('Could not load that asset');
      return;
    }

    const assetName = relativePath.split('/').pop() ?? 'image';
    const alt = (assetName.replace(/\.[^.]+$/, '') || 'Reference image').trim();

    saveHistory();
    insertBlockHtmlAtSelection(
      `<figure data-doc-image="true" style="margin:20px 0;">` +
        `<img src="${escapeHtmlAttr(resolvedUrl)}" alt="${escapeHtmlAttr(alt)}" data-workspace-src="${escapeHtmlAttr(relativePath)}" style="display:block;max-width:100%;height:auto;border-radius:14px;border:1px solid rgba(255,255,255,0.12);" />` +
        `<figcaption style="margin-top:8px;font-size:12px;line-height:1.5;color:var(--c-text-lo);">${escapeInlineHtml(alt)}</figcaption>` +
      `</figure><div><br></div>`,
    );
    toast(`Inserted ${assetName}`);
  }, [insertBlockHtmlAtSelection, saveHistory]);

  const slashCommands = useMemo<SlashCommand[]>(() => {
    return getDocumentCommandsForSurface('slash');
  }, []);
  const turnIntoCommands = useMemo<DocumentCommandDefinition[]>(() => {
    return getDocumentCommandsForSurface('turn-into');
  }, []);

  const captureEditorSelection = useCallback(() => {
    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    if (range && selectionBelongsToEditor(range)) savedSelectionRef.current = range.cloneRange();
  }, [selectionBelongsToEditor]);

  const openAssetDrawer = useCallback(() => {
    captureEditorSelection();
    setAssetDrawerOpen(true);
  }, [captureEditorSelection]);

  useEffect(() => () => {
    if (wikiPreviewCloseTimerRef.current !== null) {
      window.clearTimeout(wikiPreviewCloseTimerRef.current);
    }
  }, []);

  // Sync content to DOM when switching documents; auto-bootstrap H1 for new docs
  useEffect(() => {
    if (!doc || !contentRef.current) return;
    let cancelled = false;
    const run = async () => {
      let content = doc.content ?? '';
      if (!content.trim()) {
        content = '<p><br></p>';
        updateDocument(doc.id, { content });
      }
      content = stripLeadingHtmlTitle(content, doc.title) || '<p><br></p>';
      const hydrated = await hydrateDocumentImages(content);
      if (cancelled || !contentRef.current) return;
      contentRef.current.innerHTML = hydrated;
      applyChipsToDOM(contentRef.current, documents);
      ensureDocImageIds(contentRef.current);
      ensureDocumentHeadingIds(contentRef.current);
      updatePlaceholderVisibility(contentRef.current);
      const resetEditorScroll = () => {
        if (!editorScrollRef.current) return;
        editorScrollRef.current.scrollTop = 0;
        editorScrollRef.current.scrollLeft = 0;
      };
      resetEditorScroll();
      requestAnimationFrame(resetEditorScroll);
      setViewMode('edit');
      contentRef.current.focus();
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

    if (selectionToolbarInteractingRef.current) return;

    const activeElement = document.activeElement as HTMLElement | null;
    if (activeElement?.closest('[data-selection-toolbar="true"]')) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      setSelectionToolbarAnchor(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const activeWikiChip = activeWikiChipFromRange(range, contentRef.current);
    const startNode = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentNode : range.startContainer;
    const endNode = range.endContainer.nodeType === Node.TEXT_NODE ? range.endContainer.parentNode : range.endContainer;

    if (
      !activeWikiChip &&
      (!startNode || !endNode || !contentRef.current.contains(startNode) || !contentRef.current.contains(endNode))
    ) {
      setSelectionToolbarAnchor(null);
      return;
    }

    if (!activeWikiChip && sel.isCollapsed) {
      setSelectionToolbarAnchor(null);
      return;
    }

    const rect = activeWikiChip?.getBoundingClientRect() ?? range.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      setSelectionToolbarAnchor(null);
      return;
    }

    const editorRect = editorScrollRef.current?.getBoundingClientRect();
    const toolbarHeight = 76;
    const verticalGap = 8;
    const desiredBelow = rect.bottom + verticalGap;
    const desiredAbove = rect.top - toolbarHeight - verticalGap;
    const hasRoomBelow = desiredBelow + toolbarHeight <= window.innerHeight - 12;
    const top = hasRoomBelow ? desiredBelow : Math.max(12, desiredAbove);
    const unclampedLeft = rect.left + rect.width / 2;
    const clampedLeft = editorRect
      ? Math.max(editorRect.left + 24, Math.min(editorRect.right - 24, unclampedLeft))
      : unclampedLeft;
    setSelectionToolbarAnchor({
      left: clampedLeft,
      top,
    });
  }, [viewMode]);

  const markSelectionToolbarInteraction = useCallback(() => {
    selectionToolbarInteractingRef.current = true;
    window.setTimeout(() => {
      selectionToolbarInteractingRef.current = false;
    }, 0);
  }, []);

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
    setLineHandle(null);
    setLineHandleMenu(null);
  }, [doc?.id, viewMode]);

  useEffect(() => {
    if (!lastSavedAt) return;
    const interval = window.setInterval(() => forceSaveStatusTick((n) => n + 1), 30_000);
    return () => window.clearInterval(interval);
  }, [lastSavedAt]);

  useEffect(() => {
    if (!showHeaderMenu) return;
    const closeOnOutsidePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (target && headerMenuRef.current?.contains(target)) return;
      setShowHeaderMenu(false);
    };
    window.addEventListener('mousedown', closeOnOutsidePointer);
    window.addEventListener('touchstart', closeOnOutsidePointer);
    return () => {
      window.removeEventListener('mousedown', closeOnOutsidePointer);
      window.removeEventListener('touchstart', closeOnOutsidePointer);
    };
  }, [showHeaderMenu]);

  const markDirty = useCallback(() => {
    setHasEditedSinceOpen(true);
    setDirtySinceSave(true);
  }, []);

  const handleAutoSaveSuccess = useCallback(() => {
    setLastSavedAt(Date.now());
    setHasEditedSinceOpen(true);
    setDirtySinceSave(false);
  }, []);

  const autoSaveStatus = useDocumentAutoSave({
    docId: doc?.id ?? null,
    enabled: noteAutosaveEnabled && dirtySinceSave,
    onSaved: handleAutoSaveSuccess,
  });
  const saveStatus = describeNoteSaveStatus(autoSaveStatus, noteAutosaveEnabled);

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
    if (lineHandleHideTimerRef.current !== null) window.clearTimeout(lineHandleHideTimerRef.current);
  }, []);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    const version = ++hydrationVersionRef.current;
    const run = async () => {
      const bodyContent = normalizeMarkdownTablesInHtml(stripLeadingHtmlTitle(doc.content ?? '', doc.title)) || '<p><br></p>';
      const hydrated = await hydrateDocumentImages(bodyContent);
      if (cancelled || version !== hydrationVersionRef.current) return;

      if (viewMode === 'edit' && contentRef.current) {
        const currentHtml = stripChipsFromHTML(contentRef.current.innerHTML);
        if (currentHtml !== hydrated) {
          contentRef.current.innerHTML = hydrated;
          applyChipsToDOM(contentRef.current, documents);
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

  // Keep the editable body separate from the note title shown above it.
  const handleInput = useCallback(() => {
    if (!contentRef.current || !doc) return;
    const normalizedHtml = normalizeMarkdownTablesInHtml(contentRef.current.innerHTML);
    if (normalizedHtml !== contentRef.current.innerHTML) {
      contentRef.current.innerHTML = normalizedHtml;
      applyChipsToDOM(contentRef.current, documents);
    }
    ensureDocImageIds(contentRef.current);
    ensureDocumentHeadingIds(contentRef.current);
    updatePlaceholderVisibility(contentRef.current);
    const updates: Partial<Document> = {
      content: stripLeadingHtmlTitle(stripChipsFromHTML(contentRef.current.innerHTML), doc.title),
    };
    if (getDocumentHistorySignature({ title: doc.title, content: doc.content, emoji: doc.emoji, linkedFile: doc.linkedFile }) !== getDocumentHistorySignature({ title: updates.title ?? doc.title, content: updates.content ?? doc.content, emoji: doc.emoji, linkedFile: doc.linkedFile })) {
      checkpointDocumentHistory();
    }
    markDirty();
    updateDocument(doc.id, updates);
  }, [checkpointDocumentHistory, doc, documents, markDirty, updateDocument]);

  const refreshEditorDomAfterBlockChange = useCallback((focusHost?: HTMLElement | null) => {
    if (!contentRef.current) return;
    applyChipsToDOM(contentRef.current, documents);
    ensureDocImageIds(contentRef.current);
    ensureDocumentHeadingIds(contentRef.current);
    updatePlaceholderVisibility(contentRef.current);
    if (focusHost && contentRef.current.contains(focusHost)) {
      contentRef.current.focus({ preventScroll: true });
      restoreCaretAtEnd(focusHost);
      const selection = window.getSelection();
      if (selection?.rangeCount) savedSelectionRef.current = selection.getRangeAt(0).cloneRange();
    }
    contentRef.current.dispatchEvent(new Event('input', { bubbles: true }));
  }, [documents]);

  const getCurrentEditorBlock = useCallback(() => {
    const root = contentRef.current;
    const range = getEditorInsertionRange();
    if (!root || !range) return null;
    return rangeBlock(range, root);
  }, [getEditorInsertionRange]);

  const applyTurnIntoCommand = useCallback((command: DocumentCommandDefinition, explicitBlock?: HTMLElement | null) => {
    const root = contentRef.current;
    if (!root || !isConvertibleDocumentCommand(command.id)) return false;
    const block = explicitBlock ?? getCurrentEditorBlock();
    if (!block || !root.contains(block) || !isSupportedTurnIntoBlock(block, root)) return false;

    checkpointDocumentHistory();
    const converted = turnBlockInto(command.id, block, root);
    if (!converted) return false;
    setLineHandle(null);
    setLineHandleMenu(null);
    refreshEditorDomAfterBlockChange(caretHostForConvertedBlock(converted));
    return true;
  }, [checkpointDocumentHistory, getCurrentEditorBlock, refreshEditorDomAfterBlockChange]);

  const findDirectEditorBlock = useCallback((target: EventTarget | null) => {
    const root = contentRef.current;
    if (!(target instanceof Node) || !root || !root.contains(target)) return null;
    let current: Node | null = target.nodeType === Node.ELEMENT_NODE ? target : target.parentNode;
    while (current && current !== root) {
      if (current.parentNode === root && current.nodeType === Node.ELEMENT_NODE) {
        const block = current as HTMLElement;
        return isSupportedTurnIntoBlock(block, root) ? block : null;
      }
      current = current.parentNode;
    }
    return null;
  }, []);

  const updateLineHandleForBlock = useCallback((block: HTMLElement | null) => {
    if (lineHandleHideTimerRef.current !== null) {
      window.clearTimeout(lineHandleHideTimerRef.current);
      lineHandleHideTimerRef.current = null;
    }
    if (!block || !contentRef.current || !editorScrollRef.current) {
      setLineHandle(null);
      return;
    }
    const blockRect = block.getBoundingClientRect();
    const editorRect = editorScrollRef.current.getBoundingClientRect();
    if (blockRect.bottom < editorRect.top || blockRect.top > editorRect.bottom) {
      setLineHandle(null);
      return;
    }
    setLineHandle({
      block,
      rect: {
        left: blockRect.left,
        top: blockRect.top,
        width: blockRect.width,
        height: blockRect.height,
      },
    });
  }, []);

  const cancelLineHandleHide = useCallback(() => {
    if (lineHandleHideTimerRef.current === null) return;
    window.clearTimeout(lineHandleHideTimerRef.current);
    lineHandleHideTimerRef.current = null;
  }, []);

  const scheduleLineHandleHide = useCallback(() => {
    if (lineHandleMenu) return;
    if (lineHandleHideTimerRef.current !== null) window.clearTimeout(lineHandleHideTimerRef.current);
    lineHandleHideTimerRef.current = window.setTimeout(() => {
      setLineHandle(null);
      lineHandleHideTimerRef.current = null;
    }, 650);
  }, [lineHandleMenu]);

  const beginLineHandlePointer = useCallback((event: React.PointerEvent<HTMLButtonElement>, handle: LineHandleState) => {
    const root = contentRef.current;
    if (!root || !root.contains(handle.block)) return;

    event.preventDefault();
    event.stopPropagation();

    const startY = event.clientY;
    let lastY = startY;
    let dragging = false;
    const originalUserSelect = document.body.style.userSelect;
    const originalCursor = document.body.style.cursor;

    const cleanup = () => {
      document.body.style.userSelect = originalUserSelect;
      document.body.style.cursor = originalCursor;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      lastY = moveEvent.clientY;
      if (Math.abs(lastY - startY) < 5) return;
      dragging = true;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
      setLineHandleMenu(null);
    };

    const onPointerCancel = () => {
      cleanup();
      setLineHandle(null);
    };

    const onPointerUp = () => {
      cleanup();

      if (!dragging) {
        setLineHandle(handle);
        setLineHandleMenu(handle);
        return;
      }

      const block = handle.block;
      if (!root.contains(block)) {
        setLineHandle(null);
        return;
      }

      const siblings = Array.from(root.children).filter((child) => child !== block) as HTMLElement[];
      const before = siblings.find((sibling) => {
        const rect = sibling.getBoundingClientRect();
        return lastY < rect.top + rect.height / 2;
      }) ?? null;
      const alreadyInPlace = before === block.nextElementSibling || (!before && block === root.lastElementChild);

      if (!alreadyInPlace) {
        checkpointDocumentHistory();
        root.insertBefore(block, before);
        refreshEditorDomAfterBlockChange(caretHostForConvertedBlock(block));
      }

      updateLineHandleForBlock(block);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  }, [checkpointDocumentHistory, refreshEditorDomAfterBlockChange, updateLineHandleForBlock]);

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
        applyChipsToDOM(contentRef.current, documents);
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
    const md = documentMarkdownFromParts(doc.title, doc.content);
    const filename = generateMarkdownFilename(doc.title);
    const cloudBoardId = useBoardStore.getState().cloudBoardId;
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
        if (cloudBoardId) {
          void saveLinkedWorkspaceToCloud('note', {
            successMessage: `Saved ${linkedFile} and cloud copy.`,
            failureMessage: `Saved ${linkedFile}. Cloud save failed.`,
          });
        } else {
          toast(`Saved: ${linkedFile}`);
        }
      } catch (err) {
        console.error(err);
        toast('Save failed');
      }
    } else if (cloudBoardId) {
      const ok = await saveLinkedWorkspaceToCloud('note', {
        successMessage: 'Saved to cloud.',
        failureMessage: 'Cloud save failed.',
      });
      if (!ok) return;
      setLastSavedAt(Date.now());
      setHasEditedSinceOpen(true);
      setDirtySinceSave(false);
    } else {
      saveAs(new Blob([md], { type: 'text/markdown;charset=utf-8' }), filename);
      setLastSavedAt(Date.now());
      setHasEditedSinceOpen(true);
      setDirtySinceSave(false);
    }
  };

  const handleExportMarkdown = useCallback(() => {
    if (!doc) return;
    const md = documentMarkdownFromParts(doc.title, doc.content);
    saveAs(new Blob([md], { type: 'text/markdown;charset=utf-8' }), generateMarkdownFilename(doc.title));
    toast('Exported Markdown note.');
  }, [doc]);

  useEffect(() => {
    const onSaveActiveDocument = () => { void handleSave(); };
    window.addEventListener('devboard:save-active-document', onSaveActiveDocument);
    return () => window.removeEventListener('devboard:save-active-document', onSaveActiveDocument);
  }, [handleSave]);

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
    applyChipsToDOM(contentRef.current, documents);
    ensureDocImageIds(contentRef.current);
    ensureDocumentHeadingIds(contentRef.current);
    updatePlaceholderVisibility(contentRef.current);
    contentRef.current.dispatchEvent(new Event('input', { bubbles: true }));
    toast(`Replaced "${search}"`);
  }, [checkpointDocumentHistory, doc, markDirty, sourceText, viewMode]);

  const closeWikiPreview = useCallback((delay = 120) => {
    if (wikiPreviewCloseTimerRef.current !== null) {
      window.clearTimeout(wikiPreviewCloseTimerRef.current);
    }
    wikiPreviewCloseTimerRef.current = window.setTimeout(() => {
      wikiPreviewTitle.current = null;
      setWikiPreview(null);
      wikiPreviewCloseTimerRef.current = null;
    }, delay);
  }, []);

  const keepWikiPreviewOpen = useCallback(() => {
    if (wikiPreviewCloseTimerRef.current === null) return;
    window.clearTimeout(wikiPreviewCloseTimerRef.current);
    wikiPreviewCloseTimerRef.current = null;
  }, []);

  useEffect(() => {
    if (!wikiContextMenu) return;
    const close = () => setWikiContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
    };
  }, [wikiContextMenu]);

  useEffect(() => {
    if (!nodeContextMenu) return;
    const close = () => setNodeContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
    };
  }, [nodeContextMenu]);

  useEffect(() => {
    if (!lineHandleMenu) return;
    const close = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('[data-line-turn-ui="true"]')) return;
      setLineHandleMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLineHandleMenu(null);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
    };
  }, [lineHandleMenu]);

  // ── Chip insertion ────────────────────────────────────────────────────────

  const insertChipInEditor = useCallback((chipEl: HTMLElement) => {
    if (!contentRef.current) return;
    const scrollEl = editorScrollRef.current;
    const previousScrollTop = scrollEl?.scrollTop ?? 0;
    contentRef.current.focus({ preventScroll: true });
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
    if (scrollEl) {
      scrollEl.scrollTop = previousScrollTop;
      requestAnimationFrame(() => {
        scrollEl.scrollTop = previousScrollTop;
      });
    }
  }, []);

  const insertWikiChip = useCallback((title: string) => {
    const currentDocuments = useBoardStore.getState().documents;
    const editingChip = wikilinkPicker?.chip;
    if (editingChip && contentRef.current?.contains(editingChip)) {
      const previousTitle = editingChip.dataset.title ?? '';
      const visibleText = editingChip.textContent?.trim() ?? '';
      const hasAlias = !!editingChip.dataset.alias || (!!visibleText && !!previousTitle && visibleText !== previousTitle);

      editingChip.dataset.title = title;
      if (hasAlias && visibleText && visibleText !== title) {
        editingChip.dataset.alias = visibleText;
        editingChip.textContent = visibleText;
      } else {
        delete editingChip.dataset.alias;
        editingChip.textContent = title;
      }
      syncWikiChipState(editingChip, currentDocuments);

      contentRef.current.focus();
      const range = document.createRange();
      range.setStartAfter(editingChip);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      savedSelectionRef.current = range.cloneRange();

      contentRef.current.dispatchEvent(new Event('input', { bubbles: true }));
      setSelectionToolbarAnchor(null);
      setWikilinkPicker(null);
      wikiPreviewTitle.current = null;
      setWikiPreview(null);
      return;
    }

    const alias = savedSelectionRef.current?.toString().trim();
    const span = document.createElement('span');
    span.className = 'chip-wiki';
    span.dataset.chip = 'wiki';
    span.dataset.title = title;
    if (alias && alias !== title) {
      span.dataset.alias = alias;
    }
    span.textContent = alias || title;
    syncWikiChipState(span, currentDocuments);
    insertChipInEditor(span);
    setWikilinkPicker(null);
  }, [insertChipInEditor, wikilinkPicker]);

  const insertNodeChip = useCallback((nodeId: string, label: string) => {
    if (nodePicker?.chip) {
      const chip = nodePicker.chip;
      chip.dataset.nodeid = nodeId;
      chip.textContent = label;
      contentRef.current?.dispatchEvent(new Event('input', { bubbles: true }));
      setNodePicker(null);
      setNodeContextMenu(null);
      return;
    }
    const span = document.createElement('span');
    span.className = 'chip-node';
    span.dataset.chip = 'node';
    span.dataset.nodeid = nodeId;
    span.textContent = label;
    span.contentEditable = 'false';
    insertChipInEditor(span);
    setNodePicker(null);
  }, [insertChipInEditor, nodePicker]);

  const handleCreateAndLink = useCallback((title: string) => {
    const newId = addDocument({ title, content: `<h1>${title}</h1><p><br></p>` });
    void newId;
    insertWikiChip(title);
  }, [addDocument, insertWikiChip]);

  const getActiveWikiChip = useCallback(() => {
    const root = contentRef.current;
    const sel = window.getSelection();
    const range = sel?.rangeCount ? sel.getRangeAt(0) : savedSelectionRef.current;
    return activeWikiChipFromRange(range, root);
  }, []);

  const unwrapWikiChip = useCallback((chip: HTMLElement | null) => {
    const root = contentRef.current;
    if (!root || !chip) return false;

    const replacement = document.createTextNode(chip.textContent ?? '');
    chip.replaceWith(replacement);

    const range = document.createRange();
    range.setStart(replacement, 0);
    range.setEnd(replacement, replacement.length);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    savedSelectionRef.current = range.cloneRange();

    root.dispatchEvent(new Event('input', { bubbles: true }));
    setWikilinkPicker(null);
    setSelectionToolbarAnchor(null);
    wikiPreviewTitle.current = null;
    setWikiPreview(null);
    return true;
  }, []);

  // ── Toolbar callbacks ─────────────────────────────────────────────────────

  const handleWikilinkClick = useCallback((rect: DOMRect) => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
    }
    const activeChip = getActiveWikiChip();
    if (activeChip) {
      setWikiPreview(null);
      wikiPreviewTitle.current = null;
      setWikiContextMenu(null);
      setNodePicker(null);
      setWikilinkPicker({
        x: rect.left,
        y: rect.bottom + 6,
        initialQuery: activeChip.dataset.title ?? activeChip.textContent ?? '',
        chip: activeChip,
      });
      return;
    }
    setNodePicker(null);
    setWikilinkPicker({ x: rect.left, y: rect.bottom + 6 });
  }, [getActiveWikiChip]);

  const handleNodeLinkClick = useCallback((rect: DOMRect) => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
    setWikilinkPicker(null);
    setNodePicker({ x: rect.left, y: rect.bottom + 6 });
  }, []);

  const openLinkedDocument = useCallback((targetDoc: Document) => {
    if (!doc) return;
    setDocHistory((prev) => [...prev, doc.id]);
    setWikiPreview(null);
    setWikiContextMenu(null);
    wikiPreviewTitle.current = null;
    openDocumentInSurface(targetDoc.id);
  }, [doc, openDocumentInSurface]);

  const openWikiPreviewDoc = useCallback(() => {
    if (!wikiPreview) return;
    openLinkedDocument(wikiPreview.doc);
  }, [openLinkedDocument, wikiPreview]);

  const openWikiContextDoc = useCallback(() => {
    if (!wikiContextMenu) return;
    openLinkedDocument(wikiContextMenu.doc);
  }, [openLinkedDocument, wikiContextMenu]);

  const focusAfterWikiChip = useCallback((chip: HTMLElement) => {
    contentRef.current?.focus();
    const range = document.createRange();
    range.setStartAfter(chip);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedSelectionRef.current = range.cloneRange();
  }, []);

  const changeWikiPreviewTarget = useCallback(() => {
    if (!wikiPreview || !contentRef.current) return;
    contentRef.current.focus();
    const range = document.createRange();
    range.selectNode(wikiPreview.chip);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    savedSelectionRef.current = range.cloneRange();

    const rect = wikiPreview.chip.getBoundingClientRect();
    setWikiPreview(null);
    wikiPreviewTitle.current = null;
    setNodePicker(null);
    setWikilinkPicker({
      x: Math.min(rect.left, window.innerWidth - PICKER_WIDTH - 12),
      y: rect.bottom + 6,
      initialQuery: wikiPreview.chip.dataset.title ?? wikiPreview.chip.textContent ?? '',
      chip: wikiPreview.chip,
    });
  }, [wikiPreview]);

  const removeWikiPreviewLink = useCallback(() => {
    if (!wikiPreview) return;
    unwrapWikiChip(wikiPreview.chip);
  }, [unwrapWikiChip, wikiPreview]);

  const removeWikiContextLink = useCallback(() => {
    if (!wikiContextMenu) return;
    unwrapWikiChip(wikiContextMenu.chip);
    setWikiContextMenu(null);
  }, [unwrapWikiChip, wikiContextMenu]);

  const openNodeContextTarget = useCallback(() => {
    if (!nodeContextMenu) return;
    const { nodeId } = nodeContextMenu;
    setNodeContextMenu(null);
    handleClose();
    focusNode(nodeId, 420);
  }, [handleClose, nodeContextMenu]);

  const changeNodeContextTarget = useCallback(() => {
    if (!nodeContextMenu) return;
    const rect = nodeContextMenu.chip.getBoundingClientRect();
    setWikiPreview(null);
    wikiPreviewTitle.current = null;
    setWikiContextMenu(null);
    setNodeContextMenu(null);
    setNodePicker({
      x: Math.min(rect.left, window.innerWidth - PICKER_WIDTH - 12),
      y: rect.bottom + 6,
      chip: nodeContextMenu.chip,
    });
  }, [nodeContextMenu]);

  const removeNodeContextLink = useCallback(() => {
    if (!nodeContextMenu) return;
    unwrapWikiChip(nodeContextMenu.chip);
    setNodeContextMenu(null);
  }, [nodeContextMenu, unwrapWikiChip]);

  const startWikiRename = useCallback((chip: HTMLElement, fallbackTitle: string) => {
    const originalText = chip.textContent ?? fallbackTitle;
    chip.style.visibility = 'hidden';
    setWikiRename({
      chip,
      originalText,
      value: originalText,
      rect: chip.getBoundingClientRect(),
    });
    setWikiContextMenu(null);
    setWikiPreview(null);
    wikiPreviewTitle.current = null;
  }, []);

  const startWikiPreviewRename = useCallback(() => {
    if (!wikiPreview) return;
    startWikiRename(wikiPreview.chip, wikiPreview.doc.title);
  }, [startWikiRename, wikiPreview]);

  const startWikiContextRename = useCallback(() => {
    if (!wikiContextMenu) return;
    startWikiRename(wikiContextMenu.chip, wikiContextMenu.doc.title);
  }, [startWikiRename, wikiContextMenu]);

  const cancelWikiRename = useCallback(() => {
    if (!wikiRename) return;
    suppressWikiRenameBlurRef.current = true;
    wikiRename.chip.style.visibility = '';
    focusAfterWikiChip(wikiRename.chip);
    setWikiRename(null);
  }, [focusAfterWikiChip, wikiRename]);

  const commitWikiRename = useCallback(() => {
    if (!wikiRename) return;
    const chip = wikiRename.chip;
    const title = chip.dataset.title ?? '';
    const nextText = wikiRename.value.trim() || wikiRename.originalText || title;

    chip.textContent = nextText;
    if (nextText && nextText !== title) chip.dataset.alias = nextText;
    else delete chip.dataset.alias;
    chip.style.visibility = '';

    focusAfterWikiChip(chip);
    contentRef.current?.dispatchEvent(new Event('input', { bubbles: true }));
    setWikiRename(null);
  }, [focusAfterWikiChip, wikiRename]);

  const copyWikiContextLink = useCallback(async () => {
    if (!wikiContextMenu) return;
    const title = wikiContextMenu.chip.dataset.title ?? wikiContextMenu.doc.title;
    const text = wikiContextMenu.chip.textContent ?? '';
    const alias = text && text !== title ? text : '';
    const rawLink = wikiLinkRaw(title, alias);

    if (copyPlainText(rawLink)) {
      toast('Copied wikilink.');
      setWikiContextMenu(null);
      return;
    }

    try {
      await navigator.clipboard.writeText(rawLink);
      toast('Copied wikilink.');
    } catch {
      toast('Could not copy wikilink.');
    } finally {
      setWikiContextMenu(null);
    }
  }, [wikiContextMenu]);

  useEffect(() => {
    if (!wikiRename) return;
    requestAnimationFrame(() => {
      wikiRenameInputRef.current?.focus();
      wikiRenameInputRef.current?.select();
    });
  }, [wikiRename?.chip]);

  const openSlashPalette = useCallback(() => {
    const range = getEditorInsertionRange();
    if (!range) return;
    const rect = range.getBoundingClientRect();
    const editorRect = editorScrollRef.current?.getBoundingClientRect();
    const fallbackX = editorRect ? editorRect.left + Math.min(editorRect.width / 2, 340) : window.innerWidth / 2 - 180;
    const fallbackY = editorRect ? Math.min(editorRect.top + 96, editorRect.bottom - 24) : window.innerHeight / 2;
    setSlashPalette({
      x: rect.left || fallbackX,
      y: (rect.bottom || fallbackY) + 8,
      bounds: editorRect
        ? {
            left: editorRect.left,
            right: editorRect.right,
            top: editorRect.top,
            bottom: editorRect.bottom,
          }
        : undefined,
    });
  }, [getEditorInsertionRange]);

  const handleSlashHintClick = useCallback(() => {
    getEditorInsertionRange();
    document.execCommand('insertText', false, '/');
    openSlashPalette();
    const nextCount = slashHintCount + 1;
    setSlashHintCount(nextCount);
    window.localStorage.setItem('devboard.slashCommandCount', String(nextCount));
  }, [getEditorInsertionRange, openSlashPalette, slashHintCount]);

  const closeSlashPalette = useCallback(() => {
    setSlashPalette(null);
  }, []);

  const handleSlashCommandSelect = useCallback((command: SlashCommand) => {
    closeSlashPalette();
    const currentBlock = getCurrentEditorBlock();
    const currentBlockText = (currentBlock?.textContent ?? '').replace(/\u00a0/g, ' ').trim();
    if (
      currentBlock &&
      isConvertibleDocumentCommand(command.id) &&
      !isBlankEditorBlock(currentBlock) &&
      currentBlockText !== '/'
    ) {
      if (applyTurnIntoCommand(command, currentBlock)) return;
    }
    if (command.id !== 'image-upload') checkpointDocumentHistory();
    const linkedTitle = documents.find((entry) => entry.id !== doc?.id)?.title || 'Related Note';
    const linkedNode = nodes.find((entry) => entry.type !== 'connector');
    const linkedNodeLabel = linkedNode ? getNodeLabel(linkedNode, documents) : '';

    runDocumentCommand(command.id, {
      insertTextBlock: () => insertBlockHtmlAtSelection('<div data-placeholder="Type something…" data-placeholder-visible="true"><br></div>', { replaceCurrentBlock: true }),
      insertHeading1: () => insertBlockHtmlAtSelection('<h1 data-placeholder="Heading 1" data-placeholder-visible="true"><br></h1>', { replaceCurrentBlock: true }),
      insertHeading2: () => insertBlockHtmlAtSelection('<h2 data-placeholder="Heading 2" data-placeholder-visible="true"><br></h2>', { replaceCurrentBlock: true }),
      insertBulletList: () => insertBlockHtmlAtSelection('<ul><li data-placeholder="List item" data-placeholder-visible="true"><br></li></ul>', { replaceCurrentBlock: true }),
      insertNumberedList: () => insertBlockHtmlAtSelection('<ol><li data-placeholder="List item" data-placeholder-visible="true"><br></li></ol>', { replaceCurrentBlock: true }),
      insertTodoList: () => insertBlockHtmlAtSelection(TODO_LIST_ITEM_HTML, { replaceCurrentBlock: true }),
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
        `<div><span class="chip-wiki" data-chip="wiki" data-title="${escapeHtmlAttr(linkedTitle)}">${escapeInlineHtml(linkedTitle)}</span></div><div><br></div>`,
      ),
      insertNodeLink: () => {
        if (!linkedNode) {
          toast('No canvas nodes to link yet.');
          return;
        }
        insertBlockHtmlAtSelection(
          `<div><span class="chip-node" data-chip="node" data-nodeid="${escapeHtmlAttr(linkedNode.id)}" contenteditable="false">${escapeInlineHtml(linkedNodeLabel)}</span></div><div><br></div>`,
        );
      },
      insertImageUpload: openAssetDrawer,
      insertTag: () => insertBlockHtmlAtSelection('<div><span class="chip-tag" data-chip="tag" contenteditable="false">#tag</span></div><div><br></div>'),
    });
  }, [applyTurnIntoCommand, checkpointDocumentHistory, closeSlashPalette, doc?.id, documents, getCurrentEditorBlock, insertBlockHtmlAtSelection, nodes, openAssetDrawer]);

  if (!doc) return null;

  const isWikiLinkActive = !!getActiveWikiChip();
  const wikiPreviewTitleText = wikiPreview?.doc.title || 'Untitled';
  const showOverlayHeader = !!headerBreadcrumb;
  const showSidePanelControl = !!onCollapseToPanel && !panelMode;
  const showPrimaryNavButton = !showOverlayHeader;
  const showLinkedMentionsColumn = mentionedNodes.length > 0 || backlinks.length > 0;
  const primaryNavTitle = panelMode
    ? 'Collapse note'
    : showSidePanelControl
      ? 'Show as side panel'
      : 'Close note';
  const onPrimaryNav = showSidePanelControl ? onCollapseToPanel : handleClose;
  const primaryNavDirection: 'left' | 'right' = panelMode ? 'right' : 'left';
  const showPageStepControls = !!onCollapseToPanel;
  const headerStatusLabel =
    saveStatus.tone === 'busy'
      ? 'Saving'
      : saveStatus.tone === 'danger'
        ? 'Save issue'
        : saveStatus.tone === 'warning'
          ? 'Unsaved'
          : 'Saved';
  const headerStatusColor =
    saveStatus.tone === 'busy'
      ? '#d97706'
      : saveStatus.tone === 'danger'
        ? '#ef4444'
        : saveStatus.tone === 'warning'
          ? '#f59e0b'
          : '#1fa37a';
  const headerModeButtonStyle = (active: boolean, side: 'left' | 'right'): React.CSSProperties => ({
    position: 'relative',
    zIndex: 1,
    height: 28,
    minWidth: panelMode ? 52 : 72,
    padding: '0 10px',
    border: 'none',
    borderRadius: side === 'left' ? '7px 0 0 7px' : '0 7px 7px 0',
    background: active ? '#1a1714' : 'var(--c-hover)',
    color: active ? '#fff' : 'var(--c-text-md)',
    boxShadow: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 12,
    fontWeight: active ? 760 : 600,
    transition: 'background 0.14s, color 0.14s, box-shadow 0.14s',
  });
  const headerMenuButtonStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    border: 'none',
    borderRadius: 8,
    background: 'transparent',
    color: 'var(--c-text-md)',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
    textAlign: 'left',
  };
  const headerMenuHover = {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = 'var(--c-hover)';
      e.currentTarget.style.color = 'var(--c-text-hi)';
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.color = 'var(--c-text-md)';
    },
  };
  const overlayBreadcrumbButtonStyle: React.CSSProperties = {
    border: 'none',
    background: 'transparent',
    padding: 0,
    color: 'var(--c-text-md)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 12,
    fontWeight: 600,
  };
  const showFormattingBar = viewMode === 'source';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        background: 'var(--c-canvas)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {showOverlayHeader && headerBreadcrumb && (
        <div
          style={{
            minHeight: 46,
            padding: '0 14px 0 16px',
            borderBottom: '0.5px solid var(--c-topbar-border)',
            background: 'var(--c-topbar)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--c-text-lo)',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{headerBreadcrumb.workspaceLabel}</span>
            <span style={{ opacity: 0.5 }}>/</span>
            <button
              type="button"
              onClick={headerBreadcrumb.onFolderClick}
              style={overlayBreadcrumbButtonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--c-text-hi)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--c-text-md)';
              }}
            >
              {headerBreadcrumb.folderLabel}
            </button>
            <span style={{ opacity: 0.5 }}>/</span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--c-text-hi)' }}>
              {headerBreadcrumb.noteLabel}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {simplifyPanelChrome && onExpand && (
              <button
                type="button"
                onClick={onExpand}
                title="Open in full page"
                aria-label="Open in full page"
                style={panelNavBtn(false)}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--c-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path d="M2 8v3h3M11 5V2H8M2 5V2h3M11 8v3H8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            {simplifyPanelChrome && (
              <button
                type="button"
                onClick={() => toggleFavoriteDocument(doc.id)}
                title={doc.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                aria-label={doc.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                style={{
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  color: doc.isFavorite ? '#d6a045' : 'var(--c-text-lo)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'background 0.12s, color 0.12s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--c-hover)';
                  e.currentTarget.style.color = doc.isFavorite ? '#d6a045' : 'var(--c-text-md)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = doc.isFavorite ? '#d6a045' : 'var(--c-text-lo)';
                }}
              >
                <IconStar filled={!!doc.isFavorite} size={16} />
              </button>
            )}
            {simplifyPanelChrome && (
              <div ref={headerMenuRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  title="More note actions"
                  aria-label="More note actions"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setShowHeaderMenu((v) => !v);
                  }}
                  style={{
                    width: 34,
                    height: 34,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 10,
                    border: showHeaderMenu ? '1px solid rgba(184,119,80,0.55)' : '1px solid var(--c-border)',
                    background: showHeaderMenu ? 'rgba(184,119,80,0.14)' : 'transparent',
                    color: showHeaderMenu ? 'var(--c-line)' : 'var(--c-text-md)',
                    cursor: 'pointer',
                    transition: 'background 0.12s, border-color 0.12s, color 0.12s',
                  }}
                >
                  <IconMoreHorizontal size={17} />
                </button>
                {showHeaderMenu && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      right: 0,
                      zIndex: 520,
                      width: 224,
                      padding: 6,
                      borderRadius: 10,
                      border: '1px solid var(--c-border)',
                      background: 'var(--c-panel)',
                      boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <button style={headerMenuButtonStyle} onMouseDown={(e) => { e.preventDefault(); setShowHeaderMenu(false); handleFindReplace(); }} {...headerMenuHover}>
                      <span>Find / Replace</span>
                    </button>
                    <button
                      style={headerMenuButtonStyle}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setShowHeaderMenu(false);
                        if (viewMode === 'edit') switchToSource();
                        else switchToEdit();
                      }}
                      {...headerMenuHover}
                    >
                      <span>{viewMode === 'edit' ? 'View source' : 'View preview'}</span>
                    </button>
                    <button style={headerMenuButtonStyle} onMouseDown={(e) => { e.preventDefault(); setShowHeaderMenu(false); handleShowWordCount(); }} {...headerMenuHover}>
                      <span>Word count</span>
                      <span style={{ marginLeft: 'auto', color: 'var(--c-text-lo)', fontSize: 11 }}>{docWordCount} words</span>
                    </button>
                    <button style={headerMenuButtonStyle} onMouseDown={(e) => { e.preventDefault(); setShowHeaderMenu(false); handleExportMarkdown(); }} {...headerMenuHover}>
                      <span>Export .md</span>
                    </button>
                    <button style={headerMenuButtonStyle} onMouseDown={(e) => { e.preventDefault(); setShowHeaderMenu(false); setSidebarPanel((current) => current === 'outline' ? null : 'outline'); }} {...headerMenuHover}>
                      <span>Outline</span>
                    </button>
                    <button style={headerMenuButtonStyle} onMouseDown={(e) => { e.preventDefault(); setShowHeaderMenu(false); setSidebarPanel((current) => current === 'properties' ? null : 'properties'); }} {...headerMenuHover}>
                      <span>Properties</span>
                    </button>
                    <div style={{ height: 1, background: 'var(--c-border)', margin: '6px 4px' }} />
                    <div style={{ padding: '7px 10px', color: 'var(--c-text-lo)', fontSize: 11 }}>
                      {docReadingTime}
                    </div>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={handleClose}
              title="Close note"
              aria-label="Close note"
              style={{
                width: 30,
                height: 30,
                border: 'none',
                borderRadius: 8,
                background: 'transparent',
                color: 'var(--c-text-md)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: 18,
                lineHeight: 1,
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
              ×
            </button>
          </div>
        </div>
      )}
      {/* Top bar */}
      {!simplifyPanelChrome && <div
        className="doc-editor-header"
        style={{
	          minHeight: 44,
          borderBottom: '0.5px solid #e8e6e2',
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          padding: simplifyPanelChrome ? '0 12px' : panelMode ? '0 12px' : '0 18px',
	          gap: 8,
          flexShrink: 0,
        }}
      >
        <div className="doc-top-left-controls" style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {showPrimaryNavButton && (
            <button
              onClick={onPrimaryNav}
              title={primaryNavTitle}
              style={panelNavBtn(false)}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--c-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                {showSidePanelControl ? (
                  <>
                    <rect x="2.2" y="2.4" width="10.6" height="10.2" rx="1.8" stroke="currentColor" strokeWidth="1.35" />
                    <path d="M9.3 2.4v10.2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
                    <path d="M4.8 5.1 7.2 7.5 4.8 9.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </>
                ) : primaryNavDirection === 'right' ? (
                  <>
                    <path d="M5.2 3.1 9.6 7.5l-4.4 4.4" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M2 3.1 6.4 7.5 2 11.9" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
                  </>
                ) : (
                  <>
                    <path d="M9.8 3.1 5.4 7.5l4.4 4.4" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M13 3.1 8.6 7.5 13 11.9" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
                  </>
                )}
              </svg>
            </button>
          )}
          {(panelMode || onCollapseToPanel) && (
            <>
              {onExpand && panelMode && (
                <button
                  onClick={onExpand}
                  title="Open in full page"
                  style={panelNavBtn(false)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--c-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                    <path d="M2 8v3h3M11 5V2H8M2 5V2h3M11 8v3H8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
            </>
          )}
          {!simplifyPanelChrome && docHistory.length > 0 && (() => {
            const prevDoc = documents.find((d) => d.id === docHistory[docHistory.length - 1]);
            return (
              <button
                title={`Back to: ${prevDoc?.title || 'previous note'}`}
                onClick={() => {
                  const prevId = docHistory[docHistory.length - 1];
                  setDocHistory((h) => h.slice(0, -1));
                  openDocumentInSurface(prevId);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '0 8px', height: 28,
                  background: 'rgba(184,119,80,0.12)', border: '1px solid rgba(184,119,80,0.3)',
                  borderRadius: 6, color: 'var(--c-line)', cursor: 'pointer', fontSize: 11,
                  fontFamily: 'inherit', flexShrink: 0, transition: 'background 0.12s',
                  maxWidth: 150,
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
        </div>

          {showPrimaryNavButton && <div style={{ width: 1, height: 28, background: 'var(--c-border)', opacity: 0.84, flexShrink: 0 }} />}

        <div
          className="doc-editor-title-group"
          style={{
            flex: simplifyPanelChrome ? 0 : 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginLeft: simplifyPanelChrome ? 2 : 0,
          }}
        >
	          {!simplifyPanelChrome && (
            <input
              className="doc-editor-title-input"
              ref={titleInputRef}
              type="text"
              value={doc.title}
              onChange={(e) => {
                const newTitle = e.target.value;
                if (newTitle !== doc.title) checkpointDocumentHistory();
                markDirty();
                updateDocument(doc.id, { title: newTitle });
              }}
              placeholder="Untitled note"
              style={{
                flex: 1,
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--c-text-hi)',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontFamily: 'inherit',
                minWidth: 0,
              }}
            />
          )}
        </div>

        <div
          className="doc-editor-header-actions"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: simplifyPanelChrome ? 8 : 12,
            flexShrink: 0,
            marginLeft: simplifyPanelChrome ? 'auto' : 0,
          }}
        >
          {!simplifyPanelChrome && showPageStepControls && (
            <div className="doc-editor-page-nav" style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
              <button
                onClick={() => prevPageDoc && openDocumentInSurface(prevPageDoc.id)}
                disabled={!prevPageDoc}
                title={prevPageDoc ? `Previous: ${prevPageDoc.title || 'Untitled'}` : 'No previous note'}
                style={panelNavBtn(!prevPageDoc)}
                onMouseEnter={(e) => { if (prevPageDoc) e.currentTarget.style.background = 'var(--c-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path d="M8 2.5 4.5 6.5 8 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button
                onClick={() => nextPageDoc && openDocumentInSurface(nextPageDoc.id)}
                disabled={!nextPageDoc}
                title={nextPageDoc ? `Next: ${nextPageDoc.title || 'Untitled'}` : 'No next note'}
                style={panelNavBtn(!nextPageDoc)}
                onMouseEnter={(e) => { if (nextPageDoc) e.currentTarget.style.background = 'var(--c-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path d="M5 2.5 8.5 6.5 5 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          )}
	          {!simplifyPanelChrome && viewMode === 'edit' && (
	            <button
	              type="button"
	              title="Insert block or link"
	              onMouseDown={(e) => {
	                e.preventDefault();
	                captureEditorSelection();
	                openSlashPalette();
	              }}
	              style={{
	                height: 28,
	                padding: '0 10px',
	                borderRadius: 7,
	                border: '0.5px solid var(--c-border)',
	                background: 'var(--c-hover)',
	                color: 'var(--c-text-hi)',
	                cursor: 'pointer',
	                fontFamily: 'inherit',
	                fontSize: 12,
	                fontWeight: 650,
	              }}
	              onMouseEnter={(e) => {
	                e.currentTarget.style.borderColor = '#c9895c';
	                e.currentTarget.style.background = '#fdf2ea';
	                e.currentTarget.style.color = '#b87750';
	              }}
	              onMouseLeave={(e) => {
	                e.currentTarget.style.borderColor = 'var(--c-border)';
	                e.currentTarget.style.background = 'var(--c-hover)';
	                e.currentTarget.style.color = 'var(--c-text-hi)';
	              }}
	            >
	              + Insert ▾
	            </button>
	          )}
	          {!simplifyPanelChrome && viewMode === 'edit' && slashHintCount < 5 && (
	            <button
	              type="button"
	              title="Trigger slash commands"
	              onMouseDown={(e) => e.preventDefault()}
	              onClick={handleSlashHintClick}
	              style={{
	                height: 26,
	                padding: '0 8px',
	                borderRadius: 7,
	                border: '0.5px dashed var(--c-border)',
	                background: 'transparent',
	                color: 'var(--c-text-md)',
	                cursor: 'pointer',
	                fontFamily: 'inherit',
	                fontSize: 12,
	                fontWeight: 600,
	              }}
	              onMouseEnter={(e) => {
	                e.currentTarget.style.borderColor = '#b87750';
	                e.currentTarget.style.color = '#b87750';
	              }}
	              onMouseLeave={(e) => {
	                e.currentTarget.style.borderColor = 'var(--c-border)';
	                e.currentTarget.style.color = 'var(--c-text-md)';
	              }}
	            >
	              <kbd style={{ fontFamily: 'inherit', fontSize: 11, padding: '0 3px' }}>/</kbd> slash
	            </button>
	          )}
			          {!simplifyPanelChrome && (
            <div
	            className="doc-editor-view-toggle"
	            style={{
	              display: 'flex',
	              alignItems: 'center',
	              gap: 0,
	              padding: 0,
	              borderRadius: 8,
	              border: '0.5px solid var(--c-border)',
	              background: 'var(--c-hover)',
	              overflow: 'hidden',
	            }}
            >
              <button
                className="doc-editor-view-button"
              title="Preview"
              onMouseDown={(e) => {
                e.preventDefault();
                if (viewMode === 'source') switchToEdit();
              }}
              style={headerModeButtonStyle(viewMode === 'edit', 'left')}
            >
              {panelMode ? <IconEye /> : 'Preview'}
            </button>
            <button
              className="doc-editor-view-button"
              title="Source"
              onMouseDown={(e) => {
                e.preventDefault();
                if (viewMode === 'edit') switchToSource();
              }}
              style={headerModeButtonStyle(viewMode === 'source', 'right')}
              >
                {panelMode ? <IconCode /> : 'Source'}
              </button>
            </div>
          )}
          <div ref={headerMenuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              title="More note actions"
              aria-label="More note actions"
              onMouseDown={(e) => {
                e.preventDefault();
                setShowHeaderMenu((v) => !v);
              }}
              style={{
                width: 34,
                height: 34,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 10,
                border: showHeaderMenu ? '1px solid rgba(184,119,80,0.55)' : '1px solid var(--c-border)',
                background: showHeaderMenu ? 'rgba(184,119,80,0.14)' : 'transparent',
                color: showHeaderMenu ? 'var(--c-line)' : 'var(--c-text-md)',
                cursor: 'pointer',
                transition: 'background 0.12s, border-color 0.12s, color 0.12s',
              }}
            >
              <IconMoreHorizontal size={17} />
            </button>
            {showHeaderMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  zIndex: 520,
                  width: 224,
                  padding: 6,
                  borderRadius: 10,
                  border: '1px solid var(--c-border)',
                  background: 'var(--c-panel)',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button style={headerMenuButtonStyle} onMouseDown={(e) => { e.preventDefault(); setShowHeaderMenu(false); handleFindReplace(); }} {...headerMenuHover}>
                  <span>Find / Replace</span>
                </button>
                <button
                  style={headerMenuButtonStyle}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setShowHeaderMenu(false);
                    if (viewMode === 'edit') switchToSource();
                    else switchToEdit();
                  }}
                  {...headerMenuHover}
                >
                  <span>{viewMode === 'edit' ? 'View source' : 'View preview'}</span>
                </button>
                <button style={headerMenuButtonStyle} onMouseDown={(e) => { e.preventDefault(); setShowHeaderMenu(false); handleShowWordCount(); }} {...headerMenuHover}>
                  <span>Word count</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--c-text-lo)', fontSize: 11 }}>{docWordCount} words</span>
                </button>
                <button style={headerMenuButtonStyle} onMouseDown={(e) => { e.preventDefault(); setShowHeaderMenu(false); handleExportMarkdown(); }} {...headerMenuHover}>
                  <span>Export .md</span>
                </button>
                <button style={headerMenuButtonStyle} onMouseDown={(e) => { e.preventDefault(); setShowHeaderMenu(false); setSidebarPanel((current) => current === 'outline' ? null : 'outline'); }} {...headerMenuHover}>
                  <span>Outline</span>
                </button>
                <button style={headerMenuButtonStyle} onMouseDown={(e) => { e.preventDefault(); setShowHeaderMenu(false); setSidebarPanel((current) => current === 'properties' ? null : 'properties'); }} {...headerMenuHover}>
                  <span>Properties</span>
                </button>
                <div style={{ height: 1, background: 'var(--c-border)', margin: '6px 4px' }} />
                <div style={{ padding: '7px 10px', color: 'var(--c-text-lo)', fontSize: 11 }}>
                  {docReadingTime}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>}

      {/* Body: editor */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
          <div
            style={{
              position: 'relative',
              zIndex: formattingMenuOpen ? 120 : 'auto',
              maxHeight: showFormattingBar ? 72 : 0,
              opacity: showFormattingBar ? 1 : 0,
              transform: 'none',
              overflow: formattingMenuOpen ? 'visible' : 'hidden',
              pointerEvents: showFormattingBar ? 'auto' : 'none',
              transition: 'max-height 180ms ease, opacity 140ms ease',
              flexShrink: 0,
            }}
          >
            <FormattingBar
              viewMode={viewMode}
              compactMode={panelMode}
              onToggleSource={switchToSource}
              onToggleEdit={switchToEdit}
              onExportMarkdown={handleExportMarkdown}
              onSourceInsert={insertSourceSyntax}
              sourceWrap={sourceWrap}
              setSourceWrap={setSourceWrap}
              onCopySource={copySourceText}
              onOpenOutline={() => setSidebarPanel((current) => current === 'outline' ? null : 'outline')}
              onOpenProperties={() => setSidebarPanel((current) => current === 'properties' ? null : 'properties')}
              onFindReplace={handleFindReplace}
              onShowWordCount={handleShowWordCount}
              wordCount={docWordCount}
              readingTime={docReadingTime}
              insertCommands={slashCommands}
              turnIntoCommands={turnIntoCommands}
              onInsertCommand={handleSlashCommandSelect}
              onTurnIntoCommand={applyTurnIntoCommand}
              onCaptureSelection={captureEditorSelection}
              onOpenSlashCommands={openSlashPalette}
              onMenuOpenChange={setFormattingMenuOpen}
            />
          </div>

          {viewMode === 'edit' && (
            <SelectionFormattingToolbar
              anchor={selectionToolbarAnchor}
              isWikiLinkActive={isWikiLinkActive}
              onWikilinkClick={handleWikilinkClick}
              onInteractionStart={markSelectionToolbarInteraction}
            />
          )}

          {viewMode === 'edit' && (
            <div
              ref={editorScrollRef}
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                position: 'relative',
                background: '#e6ded2',
                padding: panelMode ? '24px 14px 40px' : '40px 24px 60px',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
              }}
              onScroll={() => {
                updateSelectionToolbar();
                syncSelectedImageOverlay(selectedImageId);
                setWikiContextMenu(null);
                setLineHandle(null);
                setLineHandleMenu(null);
              }}
              onMouseLeave={() => {
                closeWikiPreview();
                scheduleLineHandleHide();
              }}
              onContextMenu={(e) => {
                const target = e.target as HTMLElement;
                const nodeChip = target.closest?.('[data-chip="node"]') as HTMLElement | null;
                if (nodeChip) {
                  const nodeId = nodeChip.dataset.nodeid;
                  if (!nodeId) return;
                  e.preventDefault();
                  e.stopPropagation();
                  closeWikiPreview(0);
                  setSelectionToolbarAnchor(null);
                  setWikilinkPicker(null);
                  setNodePicker(null);
                  setWikiContextMenu(null);
                  setNodeContextMenu({
                    x: Math.min(e.clientX, window.innerWidth - 220),
                    y: Math.min(e.clientY, window.innerHeight - 150),
                    nodeId,
                    chip: nodeChip,
                  });
                  return;
                }
                const chip = target.closest?.('[data-chip="wiki"]') as HTMLElement | null;
                if (!chip) return;
                const title = getWikiChipTitle(chip);
                const linked = findDocumentByTitle(documents, title);
                e.preventDefault();
                e.stopPropagation();
                closeWikiPreview(0);
                setSelectionToolbarAnchor(null);
                setNodeContextMenu(null);
                if (!linked) {
                  setWikiContextMenu(null);
                  setNodePicker(null);
                  setWikilinkPicker({
                    x: Math.min(e.clientX, window.innerWidth - PICKER_WIDTH - 12),
                    y: e.clientY + 6,
                    initialQuery: title,
                    chip,
                  });
                  return;
                }
                setWikiContextMenu({
                  x: Math.min(e.clientX, window.innerWidth - 240),
                  y: Math.min(e.clientY, window.innerHeight - 180),
                  doc: linked,
                  chip,
                });
              }}
              onMouseMove={(e) => {
                if (!(e.target as HTMLElement).closest?.('[data-line-turn-ui="true"]')) {
                  updateLineHandleForBlock(findDirectEditorBlock(e.target));
                }
                const chip = (e.target as HTMLElement).closest?.('[data-chip="wiki"]') as HTMLElement | null;
                if (chip) {
                  keepWikiPreviewOpen();
                  const title = getWikiChipTitle(chip);
                  if (wikiPreviewTitle.current !== title || wikiPreview?.chip !== chip) {
                    wikiPreviewTitle.current = title;
                    const linked = findDocumentByTitle(documents, title);
                    if (linked) {
                      const rect = chip.getBoundingClientRect();
                      setWikiPreview({ x: Math.min(rect.left, window.innerWidth - 380), y: rect.bottom + 10, doc: linked, chip });
                    } else {
                      setWikiPreview(null);
                    }
                  }
                } else if (wikiPreviewTitle.current !== null) {
                  closeWikiPreview();
                }
              }}
              onPointerDown={(e) => {
                const chip = (e.target as HTMLElement).closest?.('[data-chip="wiki"]') as HTMLElement | null;
                wikiPointerDownRef.current = chip ? { chip, x: e.clientX, y: e.clientY } : null;
              }}
              onClick={(e) => {
                setWikiContextMenu(null);
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
                  const pointerDown = wikiPointerDownRef.current;
                  wikiPointerDownRef.current = null;
                  const moved = pointerDown?.chip === chip && Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > 4;
                  const selection = window.getSelection();
                  if (moved || (selection && !selection.isCollapsed)) return;
                  const title = getWikiChipTitle(chip);
                  const linked = findDocumentByTitle(documents, title);
                  if (linked && doc) {
                    setDocHistory((prev) => [...prev, doc.id]);
                    openDocumentInSurface(linked.id);
                  } else {
                    const rect = chip.getBoundingClientRect();
                    setWikiContextMenu(null);
                    closeWikiPreview(0);
                    setSelectionToolbarAnchor(null);
                    setNodePicker(null);
                    setWikilinkPicker({
                      x: Math.min(rect.left, window.innerWidth - PICKER_WIDTH - 12),
                      y: rect.bottom + 6,
                      initialQuery: title,
                      chip,
                    });
                  }
                } else if (type === 'node') {
                  const nodeId = chip.dataset.nodeid;
                  if (nodeId) { handleClose(); focusNode(nodeId, 420); }
                }
              }}
            >
              <div
                style={{
                  background: '#fffaf1',
                  maxWidth: 860,
                  width: '100%',
                  minHeight: panelMode ? 'calc(100% - 64px)' : 'calc(100% - 100px)',
                  padding: panelMode ? '30px 24px' : '42px 48px',
                  boxSizing: 'border-box',
                  borderRadius: 4,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 20px rgba(0,0,0,0.05)',
                }}
              >
              {/* Emoji area — above the H1, hover-zone scoped to this div */}
              <div
                style={{ padding: 0 }}
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
                style={{
                  padding: 0,
                }}
              >
                <textarea
                  ref={setBodyTitleTextarea}
                  value={doc.title}
                  onChange={(e) => {
                    const newTitle = e.target.value.replace(/\n/g, ' ');
                    resizeDocumentTitleTextarea(e.currentTarget);
                    if (newTitle !== doc.title) checkpointDocumentHistory();
                    markDirty();
                    updateDocument(doc.id, { title: newTitle });
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    contentRef.current?.focus();
                  }}
                  placeholder="Untitled note"
                  rows={1}
                  aria-label="Note title"
                  style={{
                    width: '100%',
                    minHeight: panelMode ? 32 : 34,
                    maxHeight: panelMode ? 38 : 40,
                    resize: 'none',
                    overflow: 'hidden',
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    color: 'var(--c-text-hi)',
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: panelMode ? 24 : 26,
                    fontWeight: 760,
                    lineHeight: 1.2,
                    letterSpacing: 0,
                    padding: 0,
                    margin: '0 0 6px',
                    whiteSpace: 'nowrap',
                  }}
                />
                <div
                  style={{
                    marginBottom: 24,
                    color: '#9b8d7f',
                    fontSize: 12,
                    lineHeight: 1.5,
                    fontWeight: 560,
                  }}
                >
                  Last edited {relativeTime(doc.updatedAt)} · {docWordCount} words · {docReadingTime}
                </div>
              </div>

              <div
                ref={contentRef}
                contentEditable
                suppressContentEditableWarning
                className="doc-content"
                onFocus={() => setIsEditorFocused(true)}
                onBlur={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                  setIsEditorFocused(false);
                }}
                onInput={handleInput}
                onClick={(e) => syncTaskCheckbox(e.target)}
                onChange={(e) => syncTaskCheckbox(e.target)}
                onKeyDown={(e) => {
                  if (handleTaskItemEnter(e)) return;
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
                  if (imageItem) {
                    const file = imageItem.getAsFile();
                    if (!file) return;
                    e.preventDefault();
                    void insertImageFile(file);
                    return;
                  }

                  const html = e.clipboardData.getData('text/html');
                  const text = e.clipboardData.getData('text/plain');
                  if (!html && !text) return;
                  e.preventDefault();
                  document.execCommand('insertHTML', false, sanitizeClipboardHtml(html, text));
                  if (contentRef.current) applyChipsToDOM(contentRef.current, documents);
                  handleInput();
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
                  padding: 0,
                  color: 'var(--c-text-hi)',
                  fontSize: '16px',
                  lineHeight: 1.8,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  outline: 'none',
                  overflowX: 'auto',
                  wordWrap: 'break-word',
                  minHeight: panelMode ? 360 : 520,
                }}
              />

              </div>

              <DocumentLineHandle
                lineHandle={lineHandle}
                lineHandleMenu={lineHandleMenu}
                turnIntoCommands={turnIntoCommands}
                onCancelHide={cancelLineHandleHide}
                onScheduleHide={scheduleLineHandleHide}
                onPointerDown={beginLineHandlePointer}
                onTurnInto={(command, block) => {
                  applyTurnIntoCommand(command, block);
                }}
              />

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

              {showLinkedMentionsColumn && (
                <aside
                  style={{
                    width: 244,
                    flexShrink: 0,
                    marginLeft: 24,
                    paddingTop: 2,
                    color: 'var(--c-text-md)',
                  }}
                >
                  {mentionedNodes.length > 0 && (
                    <div style={{ marginBottom: 24, padding: '12px 0 0', borderTop: '1px solid var(--c-border)' }}>
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

                  {backlinks.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-text-lo)', marginBottom: 12 }}>
                        Linked mentions ({backlinks.length})
                      </div>
                      {backlinks.map((bl) => (
                        <div
                          key={bl.from.id}
                          onClick={() => {
                            if (doc) setDocHistory((h) => [...h, doc.id]);
                            openDocumentInSurface(bl.from.id);
                          }}
                          style={{ padding: '10px 12px', marginBottom: 8, background: 'color-mix(in srgb, var(--c-panel) 70%, transparent)', border: '1px solid var(--c-border)', borderRadius: 8, cursor: 'pointer', transition: 'background 120ms' }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--c-hover)'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--c-panel) 70%, transparent)'; }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--c-text-hi)', marginBottom: 4 }}>
                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1" y="1" width="9" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.1"/><path d="M3 4h5M3 6h5M3 8h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
                            {bl.from.title || 'Untitled'}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--c-text-md)', lineHeight: 1.5 }}>{bl.context}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </aside>
              )}
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
              onFocus={() => setIsEditorFocused(true)}
              onBlur={() => setIsEditorFocused(false)}
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
                  <div style={{ fontSize: 12, color: 'var(--c-text-md)' }}>{saveStatus.label}</div>
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

      <AssetDrawer
        open={assetDrawerOpen}
        title="Assets"
        pageAssetPaths={currentDocAssetPaths}
        onClose={() => setAssetDrawerOpen(false)}
        onSelectAsset={(asset) => insertWorkspaceAsset(asset.path)}
        onUploadFiles={async (files) => {
          const first = files[0];
          if (first) await insertImageFile(first);
        }}
      />

      {/* Wiki hover preview card */}
      {wikiPreview && (
        <div
          onMouseEnter={keepWikiPreviewOpen}
          onMouseLeave={() => closeWikiPreview()}
          style={{
            position: 'fixed',
            left: wikiPreview.x,
            top: wikiPreview.y,
            width: 360,
            background: 'var(--c-panel)',
            border: '1px solid var(--c-border)',
            borderRadius: 14,
            boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
            overflow: 'hidden',
            zIndex: 9999,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', gap: 12, alignItems: 'center', padding: '16px 18px 15px' }}>
            <svg width="18" height="18" viewBox="0 0 13 13" fill="none" style={{ opacity: 0.7 }}>
              <rect x="1" y="1" width="11" height="11" rx="1.5" stroke="var(--c-text-lo)" strokeWidth="1.2" />
              <path d="M3.5 4.5h6M3.5 6.5h6M3.5 8.5h4" stroke="var(--c-text-lo)" strokeWidth="1" strokeLinecap="round" />
            </svg>
            <div style={{ minWidth: 0 }}>
              <div
                title={wikiPreviewTitleText}
                style={{
                  color: 'var(--c-text-hi)',
                  fontSize: 15,
                  fontWeight: 750,
                  lineHeight: 1.25,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {wikiPreviewTitleText}
              </div>
              <div style={{ color: 'var(--c-text-lo)', fontSize: 12, fontWeight: 650, lineHeight: 1.4 }}>
                Page
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: '1px solid var(--c-border)' }}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={openWikiPreviewDoc}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--c-hover)';
                e.currentTarget.style.color = 'var(--c-text-hi)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--c-text-hi)';
              }}
              style={{
                border: 0,
                borderRight: '1px solid var(--c-border)',
                background: 'transparent',
                color: 'var(--c-text-hi)',
                padding: '12px 14px',
                fontSize: 14,
                fontWeight: 650,
                fontFamily: 'inherit',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              <IconArrowRight size={15} />
              Open
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={startWikiPreviewRename}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--c-hover)';
                e.currentTarget.style.color = 'var(--c-text-hi)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--c-text-hi)';
              }}
              style={{
                border: 0,
                borderRight: '1px solid var(--c-border)',
                background: 'transparent',
                color: 'var(--c-text-hi)',
                padding: '12px 14px',
                fontSize: 14,
                fontWeight: 650,
                fontFamily: 'inherit',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              <IconTextWrap />
              Rename
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={removeWikiPreviewLink}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(248,113,113,0.12)';
                e.currentTarget.style.color = '#f87171';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#f87171';
              }}
              style={{
                border: 0,
                background: 'transparent',
                color: '#f87171',
                padding: '12px 14px',
                fontSize: 14,
                fontWeight: 650,
                fontFamily: 'inherit',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              <IconUnlink size={15} />
              Unlink
            </button>
          </div>
        </div>
      )}

      {wikiRename && (
        <input
          ref={wikiRenameInputRef}
          value={wikiRename.value}
          onChange={(e) => setWikiRename((current) => current ? { ...current, value: e.target.value } : current)}
          onBlur={() => {
            if (suppressWikiRenameBlurRef.current) {
              suppressWikiRenameBlurRef.current = false;
              return;
            }
            commitWikiRename();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitWikiRename();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelWikiRename();
            }
            e.stopPropagation();
          }}
          style={{
            position: 'fixed',
            left: Math.max(8, wikiRename.rect.left - 3),
            top: Math.max(8, wikiRename.rect.top - 2),
            width: Math.max(120, Math.min(360, wikiRename.rect.width + 36)),
            height: Math.max(28, wikiRename.rect.height + 6),
            zIndex: 10001,
            border: '1px solid rgba(184,119,80,0.55)',
            borderRadius: 6,
            outline: 'none',
            background: 'var(--c-panel)',
            color: 'var(--c-line)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.24)',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 16,
            fontWeight: 560,
            lineHeight: 1.2,
            padding: '2px 6px',
          }}
        />
      )}

      {wikiContextMenu && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: wikiContextMenu.x,
            top: wikiContextMenu.y,
            width: 220,
            padding: 6,
            background: 'var(--c-panel)',
            border: '1px solid var(--c-border)',
            borderRadius: 10,
            boxShadow: '0 10px 32px rgba(0,0,0,0.35)',
            zIndex: 10000,
          }}
        >
          <button
            type="button"
            onClick={openWikiContextDoc}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--c-hover)';
              e.currentTarget.style.color = 'var(--c-text-hi)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--c-text-hi)';
            }}
            style={{
              width: '100%',
              border: 0,
              background: 'transparent',
              color: 'var(--c-text-hi)',
              borderRadius: 7,
              padding: '8px 9px',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 650,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <IconArrowRight size={14} />
            Open
          </button>
          <button
            type="button"
            onClick={startWikiContextRename}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--c-hover)';
              e.currentTarget.style.color = 'var(--c-text-hi)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--c-text-hi)';
            }}
            style={{
              width: '100%',
              border: 0,
              background: 'transparent',
              color: 'var(--c-text-hi)',
              borderRadius: 7,
              padding: '8px 9px',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 650,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <IconTextWrap />
            Rename
          </button>
          <button
            type="button"
            onClick={() => void copyWikiContextLink()}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--c-hover)';
              e.currentTarget.style.color = 'var(--c-text-hi)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--c-text-hi)';
            }}
            style={{
              width: '100%',
              border: 0,
              background: 'transparent',
              color: 'var(--c-text-hi)',
              borderRadius: 7,
              padding: '8px 9px',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 650,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <IconCopy />
            Copy link
          </button>
          <div style={{ height: 1, background: 'var(--c-border)', margin: '5px 2px' }} />
          <button
            type="button"
            onClick={removeWikiContextLink}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(248,113,113,0.12)';
              e.currentTarget.style.color = '#f87171';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#f87171';
            }}
            style={{
              width: '100%',
              border: 0,
              background: 'transparent',
              color: '#f87171',
              borderRadius: 7,
              padding: '8px 9px',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 650,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <IconUnlink size={14} />
            Unlink
          </button>
        </div>
      )}

      {nodeContextMenu && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: nodeContextMenu.x,
            top: nodeContextMenu.y,
            width: 220,
            padding: 6,
            background: 'var(--c-panel)',
            border: '1px solid var(--c-border)',
            borderRadius: 10,
            boxShadow: '0 10px 32px rgba(0,0,0,0.35)',
            zIndex: 10000,
          }}
        >
          <button
            type="button"
            onClick={openNodeContextTarget}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--c-hover)';
              e.currentTarget.style.color = 'var(--c-text-hi)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--c-text-hi)';
            }}
            style={{
              width: '100%',
              border: 0,
              background: 'transparent',
              color: 'var(--c-text-hi)',
              borderRadius: 7,
              padding: '8px 9px',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 650,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <IconArrowRight size={14} />
            Jump to node
          </button>
          <button
            type="button"
            onClick={changeNodeContextTarget}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--c-hover)';
              e.currentTarget.style.color = 'var(--c-text-hi)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--c-text-hi)';
            }}
            style={{
              width: '100%',
              border: 0,
              background: 'transparent',
              color: 'var(--c-text-hi)',
              borderRadius: 7,
              padding: '8px 9px',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 650,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <IconNodeLink />
            Change node link
          </button>
          <div style={{ height: 1, background: 'var(--c-border)', margin: '5px 2px' }} />
          <button
            type="button"
            onClick={removeNodeContextLink}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(248,113,113,0.12)';
              e.currentTarget.style.color = '#f87171';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#f87171';
            }}
            style={{
              width: '100%',
              border: 0,
              background: 'transparent',
              color: '#f87171',
              borderRadius: 7,
              padding: '8px 9px',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 650,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <IconUnlink size={14} />
            Unlink
          </button>
        </div>
      )}

      {/* Wikilink picker */}
      {wikilinkPicker && (
        <WikilinkPicker
          pos={wikilinkPicker}
          documents={documents}
          activeDocId={currentDocumentId}
          initialQuery={wikilinkPicker.initialQuery}
          onSelect={insertWikiChip}
          onCreate={handleCreateAndLink}
          onClose={() => setWikilinkPicker(null)}
        />
      )}

      {/* Node picker */}
      {nodePicker && (
        <NodePicker
          pos={nodePicker}
          nodes={allCanvasNodes}
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
