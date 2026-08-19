import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useBoardStore } from '../store/boardStore';
import { CanvasNode, Document } from '../types';
import { documentMarkdownFromParts, htmlToMarkdown, looksLikeMarkdown, markdownToHtml } from '../utils/exportMarkdown';
import { saveAs } from 'file-saver';
import { hasWorkspaceHandle, readWorkspaceFileAsUrl, saveImageAsset, saveTextFileToWorkspace } from '../utils/workspaceManager';
import { toast } from '../utils/toast';
import { focusNode } from '../utils/focusNode';
import { IconArrowRight, IconCode, IconColumns, IconCopy, IconEye, IconMoreHorizontal, IconNodeLink, IconStar, IconTextWrap, IconUnlink } from './icons';
import { useDocumentAutoSave } from '../hooks/useDocumentAutoSave';
import { useSelectionFormattingToolbar } from '../hooks/useSelectionFormattingToolbar';
import { useImageSelection } from '../hooks/useImageSelection';
import { useLineHandleDrag } from '../hooks/useLineHandleDrag';
import { type DocumentCommandDefinition, type DocumentCommandId, getDocumentCommandsForSurface, runDocumentCommand } from './documentCommands';
import { caretHostForConvertedBlock, isConvertibleDocumentCommand, isSupportedTurnIntoBlock, restoreCaretAtEnd, turnBlockInto } from './documentBlockTransforms';
import DocumentLineHandle from './DocumentLineHandle';
import { htmlToPlainText, sanitizeClipboardHtml } from '../utils/richText';
import { describeNoteSaveStatus, saveLinkedWorkspaceToCloud, type NoteSavePresentation } from '../utils/saveStatus';
import { taskListItemHtml } from '../utils/taskListHtml';
import AssetDrawer from './AssetDrawer';
import { DocumentHeadingRail } from './DocumentHeadingRail';
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
  stripLeadingHtmlTitle,
  syncWikiChipState,
  wikiLinkRaw,
  wordCountFromHtml,
} from './documentModeUtils';
import {
  updatePlaceholderVisibility,
  ensureDocImageIds,
  ensureDocumentHeadingIds,
  rangeBlock,
} from './documentEditorCommands';
import {
  FormattingBar,
  SelectionFormattingToolbar,
} from './DocumentToolbars';
import {
  PICKER_WIDTH,
  WikilinkPicker,
  NodePicker,
  DocEmojiPicker,
  SlashCommandPalette,
} from './DocumentPickers';
import './DocumentMode.css';

const TODO_LIST_ITEM_HTML = taskListItemHtml({ placeholder: 'Todo item' });
// ── DocumentMode ─────────────────────────────────────────────────────────────

type SlashCommand = DocumentCommandDefinition;

interface FloatingPalettePosition {
  x: number;
  y: number;
  bounds?: { left: number; right: number; top: number; bottom: number };
}

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
  const [viewMode, setViewMode] = useState<'edit' | 'source' | 'split'>('edit');
  const [isNarrowViewport, setIsNarrowViewport] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  ));
  useEffect(() => {
    const onResize = () => setIsNarrowViewport(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [sourceText, setSourceText] = useState('');
  // Keep the latest raw buffer available to save handlers without waiting for a
  // React render. Source and split mode intentionally keep this text unparsed
  // until the user changes views or explicitly saves.
  const sourceTextRef = useRef('');
  const [sourceWrap, setSourceWrap] = useState(true);
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
  const [sidebarPanel, setSidebarPanel] = useState<'properties' | null>(null);
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
  const wikiPointerDownRef = useRef<{ chip: HTMLElement; x: number; y: number } | null>(null);

  const selectionToolbar = useSelectionFormattingToolbar({ viewMode, contentRef, editorScrollRef });
  const imageSelection = useImageSelection({ contentRef, editorScrollRef, savedSelectionRef, saveHistory });

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

  const scrollToHeading = useCallback((id: string) => {
    contentRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const docOutlineIdsKey = docOutline.map((item) => item.id).join('|');

  // Scrollspy: track which heading is currently scrolled to the top of the
  // page so DocumentHeadingRail can highlight it. Keyed off a derived ids
  // string rather than `docOutline` itself, since that array gets a new
  // identity on every keystroke anywhere in the doc (doc.content changes).
  useEffect(() => {
    const root = editorScrollRef.current;
    const contentRoot = contentRef.current;
    if (!root || !contentRoot || docOutline.length === 0) {
      setActiveHeadingId(null);
      return;
    }
    const elements = docOutline
      .map((item) => contentRoot.querySelector<HTMLElement>(`#${CSS.escape(item.id)}`))
      .filter((el): el is HTMLElement => !!el);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setActiveHeadingId(entry.target.id);
        } else if (entry.boundingClientRect.top > (entry.rootBounds?.top ?? 0)) {
          // Exited through the bottom of the observed band while scrolling up
          // past it — fall back to the previous heading in document order.
          const idx = docOutline.findIndex((item) => item.id === entry.target.id);
          if (idx > 0) setActiveHeadingId(docOutline[idx - 1].id);
        }
      }
    }, {
      root,
      rootMargin: '0px 0px -75% 0px',
      threshold: 0,
    });

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, docOutlineIdsKey]);

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
      // Persist any heading ids just assigned above so docOutline (parsed from
      // doc.content) always matches the live DOM, even before the user's first
      // keystroke — otherwise heading click-to-jump/active-tracking silently
      // no-ops on a freshly opened, never-yet-edited document.
      const idSyncedContent = stripLeadingHtmlTitle(stripChipsFromHTML(contentRef.current.innerHTML), doc.title);
      if (idSyncedContent !== doc.content) {
        updateDocument(doc.id, { content: idSyncedContent });
      }
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

  useEffect(() => {
    setLastSavedAt(null);
    setHasEditedSinceOpen(false);
    setDirtySinceSave(false);
  }, [doc?.id]);

  useEffect(() => {
    selectionToolbar.close();
  }, [doc?.id, viewMode, selectionToolbar.close]);

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

  const setSourceBuffer = useCallback((nextText: string) => {
    sourceTextRef.current = nextText;
    setSourceText(nextText);
  }, []);

  const updateSourceText = useCallback((nextText: string) => {
    setSourceBuffer(nextText);
    markDirty();
  }, [markDirty, setSourceBuffer]);

  const handleAutoSaveSuccess = useCallback(() => {
    setLastSavedAt(Date.now());
    setHasEditedSinceOpen(true);
    setDirtySinceSave(false);
  }, []);

  const autoSaveStatus = useDocumentAutoSave({
    docId: doc?.id ?? null,
    enabled: noteAutosaveEnabled && dirtySinceSave,
    // Markdown is an intentional draft buffer in Source/Split. Suspending
    // autosave here prevents it from saving the last rich-text version while
    // the user is editing newer source.
    suspended: viewMode === 'source' || viewMode === 'split',
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

      if (viewMode === 'source' || viewMode === 'split') {
        const nextSource = htmlToMarkdown(hydrated);
        setSourceText((current) => {
          sourceTextRef.current = current === nextSource ? current : nextSource;
          return sourceTextRef.current;
        });
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

  const lineHandleDrag = useLineHandleDrag({ contentRef, editorScrollRef, checkpointDocumentHistory, refreshEditorDomAfterBlockChange });

  useEffect(() => {
    lineHandleDrag.resetLineHandle();
  }, [doc?.id, viewMode, lineHandleDrag.resetLineHandle]);

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
    lineHandleDrag.resetLineHandle();
    refreshEditorDomAfterBlockChange(caretHostForConvertedBlock(converted));
    return true;
  }, [checkpointDocumentHistory, getCurrentEditorBlock, lineHandleDrag.resetLineHandle, refreshEditorDomAfterBlockChange]);

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

  const switchToSource = () => {
    if (!doc) return;
    // Only reseed the raw buffer when coming from the WYSIWYG editor; toggling
    // between the two raw modes (source ↔ split) must preserve uncommitted edits.
    if (viewMode === 'edit') setSourceBuffer(htmlToMarkdown(doc.content ?? ''));
    setViewMode('source');
  };

  const switchToSplit = () => {
    if (!doc) return;
    if (viewMode === 'edit') setSourceBuffer(htmlToMarkdown(doc.content ?? ''));
    setViewMode('split');
  };

  // Commit the raw-Markdown buffer back into the document as HTML. Shared by the
  // Source→Edit and Split→Edit transitions.
  const commitSourceToDocument = () => {
    if (!doc) return;
    const html = markdownToHtml(sourceTextRef.current);
    if (html !== (doc.content ?? '')) checkpointDocumentHistory();
    markDirty();
    updateDocument(doc.id, { content: html });
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

  const switchToEdit = () => {
    if (!doc) return;
    // In split mode the raw buffer stays in sync with the doc live, but re-commit
    // to be safe before returning to the WYSIWYG editor.
    commitSourceToDocument();
    setViewMode('edit');
  };

  const insertSourceSyntax = useCallback((syntax: string) => {
    const textarea = sourceRef.current;
    const start = textarea?.selectionStart ?? sourceText.length;
    const end = textarea?.selectionEnd ?? sourceText.length;
    const selected = sourceText.slice(start, end);
    const nextText = sourceText.slice(0, start) + syntax + sourceText.slice(end);
    const cursorOffset = selected ? syntax.length : getSourceCursorOffset(syntax);
    updateSourceText(nextText);
    requestAnimationFrame(() => {
      sourceRef.current?.focus();
      const cursor = start + cursorOffset;
      sourceRef.current?.setSelectionRange(cursor, selected ? cursor + selected.length : cursor);
    });
  }, [sourceText, updateSourceText]);

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
    const rawMode = viewMode === 'source' || viewMode === 'split';
    const content = rawMode ? markdownToHtml(sourceTextRef.current) : doc.content;
    // Saving from Source or Split must include its current buffer, even though
    // the buffer is normally committed only when returning to Preview.
    if (rawMode && content !== (doc.content ?? '')) updateDocument(doc.id, { content });
    const md = documentMarkdownFromParts(doc.title, content);
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
      if ((viewMode === 'source' || viewMode === 'split') && sourceRef.current) {
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

    if (viewMode === 'source' || viewMode === 'split') {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const next = sourceText.replace(new RegExp(escaped, 'gi'), replace);
      if (next !== sourceText) {
        updateSourceText(next);
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
  }, [checkpointDocumentHistory, doc, sourceText, updateSourceText, viewMode]);

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
      selectionToolbar.close();
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
    selectionToolbar.close();
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
  const headerModeButtonStyle = (active: boolean, side: 'left' | 'middle' | 'right'): React.CSSProperties => ({
    position: 'relative',
    zIndex: 1,
    height: 28,
    minWidth: panelMode ? 44 : 68,
    padding: '0 10px',
    border: 'none',
    borderRadius: side === 'left' ? '7px 0 0 7px' : side === 'right' ? '0 7px 7px 0' : 0,
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
  const showFormattingBar = viewMode === 'source' || viewMode === 'split';
  // Backdrop behind the page — a recessed panel tone, theme-aware (light in
  // light mode, dark in dark mode). The page itself (below) uses the
  // lighter sidebar tone plus a subtle border/shadow so it visibly reads as
  // a sheet sitting on top, not sunk into, the backdrop.
  const editorSurface = 'var(--c-panel)';
  const pageSurface = 'var(--c-sidebar)';

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
                if (viewMode !== 'edit') switchToEdit();
              }}
              style={headerModeButtonStyle(viewMode === 'edit', 'left')}
            >
              {panelMode ? <IconEye /> : 'Preview'}
            </button>
            <button
              className="doc-editor-view-button"
              title="Split (Markdown + preview)"
              onMouseDown={(e) => {
                e.preventDefault();
                if (viewMode !== 'split') switchToSplit();
              }}
              style={headerModeButtonStyle(viewMode === 'split', 'middle')}
            >
              {panelMode ? <IconColumns /> : 'Split'}
            </button>
            <button
              className="doc-editor-view-button"
              title="Source"
              onMouseDown={(e) => {
                e.preventDefault();
                if (viewMode !== 'source') switchToSource();
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
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: editorSurface }}>
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
              anchor={selectionToolbar.anchor}
              isWikiLinkActive={isWikiLinkActive}
              onWikilinkClick={handleWikilinkClick}
              onInteractionStart={selectionToolbar.markInteraction}
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
                background: editorSurface,
                padding: panelMode ? '12px 14px 40px' : isNarrowViewport ? '8px 8px 40px' : '16px 24px 60px',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
              }}
              onScroll={() => {
                selectionToolbar.update();
                imageSelection.refreshOverlayPosition();
                setWikiContextMenu(null);
                lineHandleDrag.resetLineHandle();
              }}
              onMouseLeave={() => {
                closeWikiPreview();
                lineHandleDrag.scheduleLineHandleHide();
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
                  selectionToolbar.close();
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
                selectionToolbar.close();
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
                  lineHandleDrag.updateLineHandleForBlock(findDirectEditorBlock(e.target));
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
                  imageSelection.selectImage(imageFigure.dataset.docImageId);
                  return;
                }
                if (imageSelection.selectedImageId) imageSelection.clearSelectedImage();
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
                    selectionToolbar.close();
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
                  background: pageSurface,
                  maxWidth: 860,
                  width: '100%',
                  aspectRatio: '210 / 297',
                  padding: panelMode ? '20px 24px' : isNarrowViewport ? '16px 16px' : '28px 48px',
                  boxSizing: 'border-box',
                  borderRadius: 3,
                  border: '1px solid var(--c-border)',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                }}
              >
              {docOutline.length > 0 && (
                <DocumentHeadingRail
                  outline={docOutline}
                  activeId={activeHeadingId}
                  onJump={scrollToHeading}
                  inset={panelMode ? 6 : isNarrowViewport ? 4 : 10}
                />
              )}
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
                  if ((e.key === 'Backspace' || e.key === 'Delete') && imageSelection.selectedImageId) {
                    e.preventDefault();
                    imageSelection.removeSelectedImage();
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
                      captureEditorSelection();
                      openSlashPalette();
                      return;
                    }
                  }
                  if (e.key === 'Escape' && imageSelection.selectedImageId) {
                    e.preventDefault();
                    imageSelection.clearSelectedImage();
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

                  let insertHtml = sanitizeClipboardHtml(html, text);
                  // If the pasted text looks like markdown source and the "rich" clipboard
                  // HTML never actually rendered it (still literal # / ** / - syntax, because
                  // the source was a plain-text app), parse it as markdown instead.
                  if (looksLikeMarkdown(text) && looksLikeMarkdown(htmlToPlainText(insertHtml))) {
                    insertHtml = markdownToHtml(text);
                  }

                  document.execCommand('insertHTML', false, insertHtml);
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
                lineHandle={lineHandleDrag.lineHandle}
                lineHandleMenu={lineHandleDrag.lineHandleMenu}
                turnIntoCommands={turnIntoCommands}
                onCancelHide={lineHandleDrag.cancelLineHandleHide}
                onScheduleHide={lineHandleDrag.scheduleLineHandleHide}
                onPointerDown={lineHandleDrag.beginLineHandlePointer}
                onTurnInto={(command, block) => {
                  applyTurnIntoCommand(command, block);
                }}
              />

              {lineHandleDrag.lineDropIndicator && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'fixed',
                    left: lineHandleDrag.lineDropIndicator.left,
                    top: lineHandleDrag.lineDropIndicator.top,
                    width: lineHandleDrag.lineDropIndicator.width,
                    height: 3,
                    borderRadius: 999,
                    background: 'var(--c-line)',
                    boxShadow: '0 0 0 3px color-mix(in srgb, var(--c-line) 18%, transparent)',
                    pointerEvents: 'none',
                    zIndex: 10010,
                  }}
                />
              )}

              {lineHandleDrag.lineDragGhost && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'fixed',
                    left: lineHandleDrag.lineDragGhost.left,
                    top: lineHandleDrag.lineDragGhost.top,
                    width: lineHandleDrag.lineDragGhost.width,
                    maxHeight: 220,
                    overflow: 'hidden',
                    background: pageSurface,
                    border: '1px solid color-mix(in srgb, var(--c-line) 35%, transparent)',
                    borderRadius: 6,
                    boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
                    padding: '2px 10px',
                    opacity: 0.94,
                    transform: 'rotate(0.6deg)',
                    pointerEvents: 'none',
                    zIndex: 10030,
                    fontSize: '16px',
                    lineHeight: 1.8,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    color: 'var(--c-text-hi)',
                  }}
                  dangerouslySetInnerHTML={{ __html: lineHandleDrag.lineDragGhost.html }}
                />
              )}

              {imageSelection.selectedImageRect && imageSelection.selectedImageId && (
                <div
                  style={{
                    position: 'fixed',
                    left: imageSelection.selectedImageRect.left,
                    top: imageSelection.selectedImageRect.top,
                    width: imageSelection.selectedImageRect.width,
                    height: imageSelection.selectedImageRect.height,
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
                        imageSelection.removeSelectedImage();
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
                      imageSelection.beginResize(e.clientX);
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
                updateSourceText(e.target.value);
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

          {viewMode === 'split' && (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: isNarrowViewport ? 'column' : 'row',
                overflow: 'hidden',
                background: editorSurface,
              }}
            >
              <section
                aria-label="Markdown source"
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  borderRight: isNarrowViewport ? 'none' : '1px solid var(--c-border)',
                  borderBottom: isNarrowViewport ? '1px solid var(--c-border)' : 'none',
                }}
              >
                <div className="doc-split-pane-label"><IconCode /> Markdown</div>
                <textarea
                  ref={sourceRef}
                  value={sourceText}
                  wrap={sourceWrap ? 'soft' : 'off'}
                  onChange={(e) => updateSourceText(e.target.value)}
                  onFocus={() => setIsEditorFocused(true)}
                  onBlur={() => setIsEditorFocused(false)}
                  spellCheck={false}
                  aria-label="Markdown source"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 0,
                    padding: panelMode ? '18px' : '24px 28px',
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
                    opacity: 0.9,
                  }}
                />
              </section>

              <section
                aria-label="Rendered preview"
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <div className="doc-split-pane-label"><IconEye /> Preview</div>
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    padding: panelMode ? '12px 14px 28px' : '16px 24px 44px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                  }}
                >
                  <article
                    className="doc-split-preview-page"
                    style={{
                      width: '100%',
                      maxWidth: 860,
                      minHeight: '100%',
                      boxSizing: 'border-box',
                      padding: panelMode ? '20px 24px' : '28px 48px',
                      background: pageSurface,
                      border: '1px solid var(--c-border)',
                      borderRadius: 3,
                      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    }}
                  >
                    <h1 className="doc-split-preview-title">{doc.title || 'Untitled note'}</h1>
                    <div className="doc-split-preview-meta">Last edited {relativeTime(doc.updatedAt)} · {docWordCount} words · {docReadingTime}</div>
                    <div
                      className="doc-content doc-content--preview"
                      style={{ color: 'var(--c-text-hi)', fontSize: '16px', lineHeight: 1.8, wordWrap: 'break-word' }}
                      dangerouslySetInnerHTML={{ __html: markdownToHtml(sourceText) }}
                    />
                  </article>
                </div>
              </section>
            </div>
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
                Properties
              </div>
              <button
                onClick={() => setSidebarPanel(null)}
                style={{ border: 'none', background: 'transparent', color: 'var(--c-text-lo)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                title="Close panel"
              >
                ×
              </button>
            </div>

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
