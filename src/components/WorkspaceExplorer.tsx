/**
 * VS Code-inspired workspace file explorer.
 * Draggable, horizontally resizable floating panel.
 * Lazy-loads directory contents; opens note files and places assets on canvas.
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useBoardStore } from '../store/boardStore';
import type { Document, PageMeta } from '../types';
import { listDirectory, readWorkspaceFile, readWorkspaceFileAsUrl, readWorkspaceFileInfo, getWorkspaceName, openWorkspace, renameEntry, createDirectory, deleteEntry, FSA_DIR_SUPPORTED, IN_IFRAME, revealInFinder, saveTextFileToWorkspace, saveWorkspace } from '../utils/workspaceManager';
import { FONTS } from '../utils/fonts';
import { placeCodeFile, placeImageFile, placeDocumentFile, openDocumentFile } from '../utils/canvasPlacement';
import { markdownToHtml } from '../utils/exportMarkdown';
import { toast } from '../utils/toast';
import { useFilePreview } from '../hooks/useFilePreview';
import { useTreeState } from '../hooks/useTreeState';
import { IconFreeformPage, IconStackPage } from './icons';
import {
  SKIP_DIRS,
  IMAGE_EXTS,
  CODE_EXTS,
  DOC_EXTS,
  ext,
  generateId,
  formatSize,
  fileColor,
  FileIcon,
  TreeEntry,
  buildEntry,
  flatVisible,
} from './explorer/fileTreeUtils';

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;
  return new Date(ms).toLocaleDateString();
}

const explorerSectionHeaderStyle: React.CSSProperties = {
  fontFamily: FONTS.ui,
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--c-text-hi)',
};

function sortDocumentsForExplorer(docs: Document[], sortMode: PageMeta['noteSort'] = 'updated'): Document[] {
  if (sortMode === 'custom') {
    return [...docs].sort((a, b) => {
      if (a.orderIndex != null && b.orderIndex != null) return a.orderIndex - b.orderIndex;
      if (a.orderIndex != null) return -1;
      if (b.orderIndex != null) return 1;
      return b.updatedAt - a.updatedAt;
    });
  }
  return [...docs].sort((a, b) => {
    return b.updatedAt - a.updatedAt;
  });
}

// ── TreeRow ───────────────────────────────────────────────────────────────────
function TreeRow({
  entry,
  depth,
  focusedPath,
  renamingPath,
  renameDraft,
  onRenameDraftChange,
  onRenameCommit,
  onRenameCancel,
  onToggle,
  onFileSingleClick,
  onFileOpen,
  onMarkdownDrop,
  onContextMenu,
  onFileDragStart,
  onFileHover,
  usedOnCanvas,
  isDark,
}: {
  entry: TreeEntry;
  depth: number;
  focusedPath: string | null;
  renamingPath: string | null;
  renameDraft: string;
  onRenameDraftChange: (v: string) => void;
  onRenameCommit: (entry: TreeEntry) => void;
  onRenameCancel: () => void;
  onToggle: (path: string[]) => void;
  onFileSingleClick: (entry: TreeEntry, clientY: number) => void;
  onFileOpen: (entry: TreeEntry) => void;
  onMarkdownDrop: (pathParts: string[]) => void;
  onContextMenu: (entry: TreeEntry, x: number, y: number) => void;
  onFileDragStart: (entry: TreeEntry, e: React.DragEvent) => void;
  onFileHover: (entry: TreeEntry, clientY: number) => void;
  usedOnCanvas: Set<string>;
  isDark: boolean;
}) {
  const isDir = entry.kind === 'directory';
  const isImage = !isDir && IMAGE_EXTS.has(ext(entry.name));
  const isDoc = !isDir && DOC_EXTS.has(ext(entry.name));
  const canOpen = !isDir && (CODE_EXTS[ext(entry.name)] !== undefined || isImage || isDoc);
  const isNotesFolder = isDir && entry.path.join('/') === 'notes';
  const primaryAction = isDoc ? 'open note' : 'place on canvas';
  const isFocused = focusedPath === entry.path.join('/');
  const isRenaming = renamingPath === entry.path.join('/');
  const [dropActive, setDropActive] = useState(false);
  const tooltip = canOpen
    ? isImage
      ? `${entry.path.join('/')} — hover to preview · drag or double-click to place`
      : isDoc
        ? `${entry.path.join('/')} — single-click to preview · double-click or ↵ to open note · drag to place`
        : `${entry.path.join('/')} — single-click to preview · double-click or ↵ to place`
    : entry.path.join('/');

  // Distinguish single vs double click without a 300ms delay penalty
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hover preview for image files
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleClick = (clientY: number) => {
    // Cancel rename on any other item when clicking this one
    if (renamingPath && renamingPath !== entry.path.join('/')) {
      onRenameCancel();
    }

    if (isRenaming) return;
    if (isDir) { onToggle(entry.path); return; }
    if (!canOpen) return;
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      onFileOpen(entry);
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        onFileSingleClick(entry, clientY);
      }, 220);
    }
  };

  const sharedRowProps = {
    depth,
    focusedPath,
    renamingPath,
    renameDraft,
    onRenameDraftChange,
    onRenameCommit,
    onRenameCancel,
    onToggle,
    onFileSingleClick,
    onFileOpen,
    onMarkdownDrop,
    onContextMenu,
    onFileDragStart,
    onFileHover,
    usedOnCanvas,
    isDark,
  };

  return (
    <>
      <div
        className="group flex items-center gap-1.5 h-[22px] pr-2 rounded cursor-pointer"
        style={{
          paddingLeft: 8 + depth * 14,
          background: dropActive ? 'rgba(184,119,80,0.16)' : isFocused ? 'rgba(99,102,241,0.15)' : undefined,
          outline: dropActive ? '1px solid var(--c-line)' : isFocused ? '1px solid rgba(99,102,241,0.35)' : undefined,
          outlineOffset: -1,
        }}
        data-focused={isFocused ? 'true' : undefined}
        draggable={(isImage || isDoc) && !isRenaming}
        onClick={(e) => handleClick(e.clientY)}
        onDragStart={(e) => { if ((isImage || isDoc) && !isRenaming) onFileDragStart(entry, e); else e.preventDefault(); }}
        onDragEnter={(e) => {
          if (!isNotesFolder) return;
          e.preventDefault();
          e.stopPropagation();
          setDropActive(true);
        }}
        onDragOver={(e) => {
          if (!isNotesFolder) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
          setDropActive(true);
        }}
        onDragLeave={() => {
          if (isNotesFolder) setDropActive(false);
        }}
        onDrop={(e) => {
          if (!isNotesFolder) return;
          e.preventDefault();
          e.stopPropagation();
          setDropActive(false);
          const raw = e.dataTransfer.getData('application/x-devboard-entry');
          if (!raw) return;
          try {
            onMarkdownDrop(JSON.parse(raw) as string[]);
          } catch {
            toast('Could not import note');
          }
        }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(entry, e.clientX, e.clientY); }}
        onMouseEnter={(e) => {
          if ((!isImage && !isDoc) || isRenaming) return;
          const y = e.clientY;
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = setTimeout(() => { onFileHover(entry, y); }, 380);
        }}
        onMouseLeave={() => {
          if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
        }}
        title={isRenaming ? undefined : tooltip}
      >
        {/* Expand arrow for directories */}
        <span className="w-3 flex items-center justify-center shrink-0 text-[var(--c-text-off)]" style={{ fontSize: 9 }}>
          {isDir ? (entry.loading ? '…' : entry.expanded ? '▾' : '▸') : ' '}
        </span>

        <FileIcon name={entry.name} kind={entry.kind} />

        {isRenaming ? (
          // ── Inline rename input ───────────────────────────────────────
          <input
            autoFocus
            data-rename-input="true"
            value={renameDraft}
            onChange={(e) => onRenameDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter')  { e.stopPropagation(); onRenameCommit(entry); }
              if (e.key === 'Escape') { e.stopPropagation(); onRenameCancel(); }
              e.stopPropagation();
            }}
            onBlur={() => onRenameCancel()}
            onClick={(e) => e.stopPropagation()}
            ref={(el) => {
              if (el) {
                // Select only the stem (before the last dot) so extension stays intact
                const dotIdx = entry.kind === 'file' ? entry.name.lastIndexOf('.') : -1;
                const end = dotIdx > 0 ? dotIdx : entry.name.length;
                el.setSelectionRange(0, end);
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              background: 'var(--c-canvas)',
              border: '1px solid var(--c-line)',
              borderRadius: 4,
              outline: 'none',
              fontFamily: FONTS.ui,
              fontSize: 11,
              color: 'var(--c-text-hi)',
              caretColor: 'var(--c-line)',
              padding: '0 4px',
              height: 18,
            }}
          />
        ) : (
          // ── Normal name display ───────────────────────────────────────
          (() => {
            const color = isDir ? 'var(--c-text-hi)' : canOpen ? fileColor(entry.name, isDark) : 'var(--c-text-lo)';
            const dotIdx = isDir ? -1 : entry.name.lastIndexOf('.');
            const base = dotIdx > 0 ? entry.name.slice(0, dotIdx) : entry.name;
            const extn = dotIdx > 0 ? entry.name.slice(dotIdx) : '';
            return (
              <span className="flex-1 min-w-0 flex text-[11px]" style={{ color, fontFamily: FONTS.ui }}>
                <span className="truncate">{base}</span>
                {extn && <span className="shrink-0">{extn}</span>}
              </span>
            );
          })()
        )}

        {!isRenaming && canOpen && usedOnCanvas.has(entry.path.join('/')) && (
          <span
            style={{
              width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
              background: isImage ? (isDark ? '#22d3ee' : '#0891b2') : 'var(--c-line)',
              display: 'inline-block',
            }}
            title="On canvas"
          />
        )}
        {!isRenaming && canOpen && (
          <span className="hidden group-hover:inline text-[9px] text-[var(--c-line)] shrink-0" title={`Double-click to ${primaryAction}`}>↵</span>
        )}
      </div>

      {isDir && entry.expanded && entry.children && (
        <>
          {entry.children.map((child) => (
            <TreeRow
              key={child.path.join('/')}
              entry={child}
              {...sharedRowProps}
              depth={depth + 1}
            />
          ))}
          {entry.children.length === 0 && (
            <div
              className="text-[10px] text-[var(--c-text-lo)] font-sans italic"
              style={{ paddingLeft: 8 + (depth + 1) * 14 + 18 }}
            >
              empty
            </div>
          )}
        </>
      )}
    </>
  );
}

// ── Empty / no-workspace state ────────────────────────────────────────────────
function NoWorkspaceState({ onOpen }: { onOpen: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', gap: 12, textAlign: 'center' }}>
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ opacity: 0.35 }}>
        <path d="M3 9a3 3 0 0 1 3-3h8l4 4H30a3 3 0 0 1 3 3v15a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9z" stroke="var(--c-text-hi)" strokeWidth="2" strokeLinejoin="round" />
        <line x1="18" y1="16" x2="18" y2="24" stroke="var(--c-text-hi)" strokeWidth="2" strokeLinecap="round" />
        <line x1="14" y1="20" x2="22" y2="20" stroke="var(--c-text-hi)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div>
        <p style={{ fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-hi)', fontWeight: 600, margin: '0 0 4px' }}>No folder open</p>
        <p style={{ fontFamily: FONTS.ui, fontSize: 10, color: 'var(--c-text-lo)', margin: 0, lineHeight: 1.5 }}>
          Open a folder to browse files, open notes, and place assets on the canvas.
        </p>
      </div>
      <button
        onClick={onOpen}
        style={{
          marginTop: 4,
          padding: '7px 16px',
          borderRadius: 8,
          border: 'none',
          background: 'var(--c-line)',
          color: '#fff',
          fontFamily: FONTS.ui,
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          letterSpacing: '0.02em',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-line)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--c-line)')}
      >
        Open folder…
      </button>
    </div>
  );
}

function PageGroup({
  page,
  docs,
  isActive,
  isCollapsed,
  activeDocId,
  onRenameDocument,
  onReorderDocuments,
  onDeleteDocument,
  onRevealDocument,
  onRenamePage,
  onDeletePage,
  onRevealPage,
  onChangeSortMode,
  onEnsureCustomSort,
  onToggleCollapsed,
  onOpenPageOverview,
  onCreateNote,
  onOpenDocument,
}: {
  page: PageMeta;
  docs: Document[];
  isActive: boolean;
  isCollapsed: boolean;
  activeDocId: string | null;
  onRenameDocument: (docId: string, title: string) => void;
  onReorderDocuments: (docIds: string[]) => void;
  onDeleteDocument: (doc: Document) => void;
  onRevealDocument: (doc: Document) => void;
  onRenamePage: (pageId: string, name: string) => void;
  onDeletePage: (page: PageMeta) => void;
  onRevealPage: (page: PageMeta) => void;
  onChangeSortMode: (page: PageMeta, sort: 'updated' | 'custom') => void;
  onEnsureCustomSort: (page: PageMeta) => void;
  onToggleCollapsed: () => void;
  onOpenPageOverview: () => void;
  onCreateNote: () => void;
  onOpenDocument: (docId: string) => void;
}) {
  const [renamingPage, setRenamingPage] = useState(false);
  const [pageRenameDraft, setPageRenameDraft] = useState(page.name);
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [draggedDocId, setDraggedDocId] = useState<string | null>(null);
  const [dropTargetDocId, setDropTargetDocId] = useState<string | null>(null);
  const [noteMenu, setNoteMenu] = useState<{ doc: Document; x: number; y: number } | null>(null);
  const [pageMenu, setPageMenu] = useState<{ x: number; y: number } | null>(null);

  const beginRename = useCallback((doc: Document) => {
    setRenamingDocId(doc.id);
    setRenameDraft(doc.title || 'Untitled note');
  }, []);

  const commitRename = useCallback(() => {
    if (!renamingDocId) return;
    const nextTitle = renameDraft.trim() || 'Untitled note';
    onRenameDocument(renamingDocId, nextTitle);
    setRenamingDocId(null);
  }, [onRenameDocument, renameDraft, renamingDocId]);

  const cancelRename = useCallback(() => {
    setRenamingDocId(null);
    setRenameDraft('');
  }, []);

  const handleDropOnDoc = useCallback((targetDocId: string) => {
    if (!draggedDocId || draggedDocId === targetDocId) return;
    const ids = docs.map((doc) => doc.id);
    const from = ids.indexOf(draggedDocId);
    const to = ids.indexOf(targetDocId);
    if (from === -1 || to === -1) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorderDocuments(next);
    setDraggedDocId(null);
    setDropTargetDocId(null);
  }, [docs, draggedDocId, onReorderDocuments]);

  useEffect(() => {
    if (!noteMenu) return;
    const handleWindowClick = () => setNoteMenu(null);
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, [noteMenu]);

  useEffect(() => {
    setPageRenameDraft(page.name);
  }, [page.name]);

  useEffect(() => {
    if (!pageMenu) return;
    const handleWindowClick = () => setPageMenu(null);
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, [pageMenu]);

  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 9px',
          background: isActive ? 'rgba(184,119,80,0.12)' : 'none',
          outline: isActive ? '1px solid rgba(184,119,80,0.24)' : 'none',
          outlineOffset: -1,
          borderRadius: 6,
        }}
        className="hover:bg-[var(--c-hover)]"
      >
        <button
          onClick={onToggleCollapsed}
          title={isCollapsed ? `Expand "${page.name}"` : `Collapse "${page.name}"`}
          style={{
            width: 14,
            height: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            background: 'transparent',
            border: 'none',
            color: isActive ? 'var(--c-text-md)' : 'var(--c-text-lo)',
            flexShrink: 0,
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              fontSize: 9,
              lineHeight: 1,
              transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.16s cubic-bezier(0.22, 1, 0.36, 1)',
              display: 'inline-block',
            }}
          >
            ▾
          </span>
        </button>

        <button
          onClick={onOpenPageOverview}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setPageMenu({ x: e.clientX, y: e.clientY });
          }}
          title={`Open "${page.name}" page overview`}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: 0,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ width: 16, display: 'flex', justifyContent: 'center', flexShrink: 0, color: isActive ? 'var(--c-line)' : 'var(--c-text-lo)' }}>
            {page.layoutMode === 'stack' ? (
              <IconStackPage />
            ) : (
              <IconFreeformPage />
            )}
          </span>
          {renamingPage ? (
            <input
              autoFocus
              value={pageRenameDraft}
              onChange={(e) => setPageRenameDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => {
                const nextName = pageRenameDraft.trim() || page.name;
                onRenamePage(page.id, nextName);
                setRenamingPage(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const nextName = pageRenameDraft.trim() || page.name;
                  onRenamePage(page.id, nextName);
                  setRenamingPage(false);
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setRenamingPage(false);
                  setPageRenameDraft(page.name);
                }
                e.stopPropagation();
              }}
              style={{
                flex: 1,
                minWidth: 0,
                height: 22,
                padding: '0 6px',
                background: 'var(--c-canvas)',
                border: '1px solid rgba(184,119,80,0.28)',
                borderRadius: 5,
                outline: 'none',
                fontFamily: FONTS.ui,
                fontSize: 10.5,
                color: 'var(--c-text-hi)',
              }}
            />
          ) : (
            <span style={{
              fontFamily: FONTS.ui, fontSize: 10.5, fontWeight: isActive ? 600 : 500,
              color: isActive ? 'var(--c-text-hi)' : 'var(--c-text-lo)',
              overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', flex: 1,
            }}>
              {page.name}
            </span>
          )}
          <span style={{
            fontFamily: FONTS.ui,
            fontSize: 9.5,
            color: isActive ? 'var(--c-text-md)' : 'var(--c-text-lo)',
            flexShrink: 0,
          }}>
            {docs.length}
          </span>
        </button>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setPageMenu((current) => current ? null : { x: rect.right - 180, y: rect.bottom + 4 });
            }}
            title={`${page.name} menu`}
            style={{
              width: 18,
              height: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              border: 'none',
              background: 'transparent',
              color: 'var(--c-text-off)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>⋯</span>
          </button>
          {pageMenu && (() => {
            const MENU_W = 180;
            const left = Math.min(pageMenu.x, window.innerWidth - MENU_W - 8);
            const top = Math.min(pageMenu.y, window.innerHeight - 110);
            return (
            <div
              style={{ position: 'fixed', left, top, zIndex: 9100, minWidth: MENU_W }}
              className="py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div style={{ padding: '2px 10px 4px', fontFamily: FONTS.ui, fontSize: 10, color: 'var(--c-text-off)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Sort notes
              </div>
              <button
                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left hover:bg-[var(--c-hover)]"
                style={{ fontFamily: FONTS.ui, color: page.noteSort !== 'custom' ? 'var(--c-text-hi)' : 'var(--c-text-md)' }}
                onClick={() => {
                  onChangeSortMode(page, 'updated');
                  setPageMenu(null);
                }}
              >
                <span>By updated date</span>
                {page.noteSort !== 'custom' && <span className="text-[10px] ml-3">✓</span>}
              </button>
              <button
                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left hover:bg-[var(--c-hover)]"
                style={{ fontFamily: FONTS.ui, color: page.noteSort === 'custom' ? 'var(--c-text-hi)' : 'var(--c-text-md)' }}
                onClick={() => {
                  onChangeSortMode(page, 'custom');
                  setPageMenu(null);
                }}
              >
                <span>Custom order</span>
                {page.noteSort === 'custom' && <span className="text-[10px] ml-3">✓</span>}
              </button>
              <div style={{ height: 1, background: 'var(--c-border)', margin: '4px 0' }} />
              <button
                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                style={{ fontFamily: FONTS.ui }}
                onClick={() => {
                  onRevealPage(page);
                  setPageMenu(null);
                }}
              >
                <span>Show in Folder</span>
              </button>
              <button
                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                style={{ fontFamily: FONTS.ui }}
                onClick={() => {
                  setRenamingPage(true);
                  setPageMenu(null);
                }}
              >
                <span>Rename page</span>
              </button>
              <button
                className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left hover:bg-[rgba(239,68,68,0.12)]"
                style={{ fontFamily: FONTS.ui, color: '#f87171' }}
                onClick={() => {
                  onDeletePage(page);
                  setPageMenu(null);
                }}
              >
                <span>Delete page</span>
              </button>
            </div>
            );
          })()}
        </div>
      </div>

      {!isCollapsed && (
        <div
          style={{
            marginTop: 4,
            marginLeft: 22,
            paddingLeft: 10,
            borderLeft: '1px solid rgba(184,119,80,0.18)',
            maxHeight: 520,
            opacity: 1,
            overflow: 'hidden',
            transform: 'translateY(0)',
            transition: 'max-height 0.18s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.14s ease, transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), margin-top 0.18s ease',
          }}
        >
          <button
            onClick={onCreateNote}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '6px 8px',
              background: 'transparent',
              border: '1px dashed rgba(184,119,80,0.22)',
              borderRadius: 7,
              cursor: 'pointer',
              textAlign: 'left',
              color: 'var(--c-text-md)',
              fontFamily: FONTS.ui,
              fontSize: 10,
              transition: 'background 0.12s, border-color 0.12s, color 0.12s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--c-hover)';
              e.currentTarget.style.borderColor = 'rgba(184,119,80,0.34)';
              e.currentTarget.style.color = 'var(--c-text-hi)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'rgba(184,119,80,0.22)';
              e.currentTarget.style.color = 'var(--c-text-md)';
            }}
          >
            <span style={{ fontSize: 15, lineHeight: 1, width: 12, textAlign: 'center', flexShrink: 0 }}>+</span>
            <span>{`New note in ${page.name}`}</span>
          </button>

          {docs.length === 0 ? (
            <div style={{ padding: '8px 8px 2px', fontSize: 9.5, color: 'var(--c-text-lo)', fontFamily: FONTS.ui, fontStyle: 'italic' }}>
              No notes on this page
            </div>
          ) : (
            docs.map((doc) => {
              const isSelected = doc.id === activeDocId;
              const isRenaming = doc.id === renamingDocId;
              const isDragged = doc.id === draggedDocId;
              const isDropTarget = doc.id === dropTargetDocId && draggedDocId !== doc.id;
              return (
                <button
                  key={doc.id}
                  onClick={() => {
                    if (isRenaming) return;
                    onOpenDocument(doc.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setNoteMenu({ doc, x: e.clientX, y: e.clientY });
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    marginTop: 2,
                    padding: '6px 8px',
                    background: isDragged ? 'rgba(184,119,80,0.08)' : isSelected ? 'rgba(184,119,80,0.14)' : 'none',
                    border: 'none',
                    outline: isDropTarget
                      ? '1px solid rgba(184,119,80,0.42)'
                      : isSelected
                        ? '1px solid rgba(184,119,80,0.26)'
                        : 'none',
                    outlineOffset: -1,
                    borderRadius: 6,
                    cursor: isRenaming ? 'text' : 'grab',
                    textAlign: 'left',
                    boxShadow: isDropTarget ? 'inset 0 2px 0 rgba(184,119,80,0.55)' : 'none',
                    opacity: isDragged ? 0.72 : 1,
                  }}
                  className="hover:bg-[var(--c-hover)]"
                  title={doc.title || 'Untitled note'}
                  draggable={!isRenaming}
                  onDragStart={(e) => {
                    if (isRenaming) {
                      e.preventDefault();
                      return;
                    }
                    onEnsureCustomSort(page);
                    setDraggedDocId(doc.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', doc.id);

                    const ghost = document.createElement('div');
                    ghost.style.cssText = [
                      'position:fixed',
                      'top:-999px',
                      'left:-999px',
                      'display:flex',
                      'align-items:center',
                      'gap:8px',
                      'min-width:180px',
                      'max-width:280px',
                      'padding:8px 10px',
                      'background:#f5ede3',
                      'border:1px solid rgba(184,119,80,0.35)',
                      'border-radius:10px',
                      'box-shadow:0 10px 28px rgba(74,53,37,0.18)',
                      'color:#2c241f',
                      `font:600 12px/1.2 ${FONTS.ui}`,
                      'pointer-events:none',
                      'white-space:nowrap',
                    ].join(';');

                    const grip = document.createElement('span');
                    grip.textContent = '⋮⋮';
                    grip.style.cssText = 'font-size:10px;color:#8a755f;flex-shrink:0;';
                    ghost.appendChild(grip);

                    const textWrap = document.createElement('div');
                    textWrap.style.cssText = 'display:flex;flex-direction:column;min-width:0;';

                    const title = document.createElement('span');
                    title.textContent = doc.title || 'Untitled note';
                    title.style.cssText = 'overflow:hidden;text-overflow:ellipsis;';
                    textWrap.appendChild(title);

                    const subtitle = document.createElement('span');
                    subtitle.textContent = page.name;
                    subtitle.style.cssText = 'font-size:10px;font-weight:500;color:#8a755f;margin-top:2px;';
                    textWrap.appendChild(subtitle);

                    ghost.appendChild(textWrap);
                    document.body.appendChild(ghost);
                    e.dataTransfer.setDragImage(ghost, 18, 14);
                    requestAnimationFrame(() => ghost.remove());
                  }}
                  onDragEnd={() => {
                    setDraggedDocId(null);
                    setDropTargetDocId(null);
                  }}
                  onDragOver={(e) => {
                    if (!draggedDocId || draggedDocId === doc.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dropTargetDocId !== doc.id) setDropTargetDocId(doc.id);
                  }}
                  onDragLeave={(e) => {
                    const related = e.relatedTarget as Node | null;
                    if (related && e.currentTarget.contains(related)) return;
                    if (dropTargetDocId === doc.id) setDropTargetDocId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropOnDoc(doc.id);
                  }}
                >
                  <span
                    title="Drag note to reorder"
                    style={{
                      width: 12,
                      display: 'flex',
                      justifyContent: 'center',
                      color: isDropTarget || isDragged ? 'var(--c-line)' : 'var(--c-text-off)',
                      cursor: isRenaming ? 'text' : 'grab',
                      flexShrink: 0,
                      fontSize: 10,
                      lineHeight: 1,
                      opacity: isDragged ? 1 : 0.72,
                      transition: 'color 0.12s ease, opacity 0.12s ease',
                    }}
                  >
                    ⋮⋮
                  </span>
                  <span style={{ width: 14, display: 'flex', justifyContent: 'center', flexShrink: 0, color: isSelected ? 'var(--c-line)' : 'var(--c-text-lo)' }}>
                    {doc.emoji ? (
                      <span style={{ fontSize: 12, lineHeight: 1 }}>{doc.emoji}</span>
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <rect x="1.5" y="1.5" width="9" height="9" rx="1.4" stroke="currentColor" strokeWidth="1.1" />
                        <path d="M3.5 4h5M3.5 6h5M3.5 8h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                      </svg>
                    )}
                  </span>
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={commitRename}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitRename();
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelRename();
                        }
                        e.stopPropagation();
                      }}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: 22,
                        padding: '0 6px',
                        background: 'var(--c-canvas)',
                        border: '1px solid rgba(184,119,80,0.28)',
                        borderRadius: 5,
                        outline: 'none',
                        fontFamily: FONTS.ui,
                        fontSize: 10,
                        color: 'var(--c-text-hi)',
                      }}
                    />
                  ) : (
                    <span style={{
                      fontFamily: FONTS.ui, fontSize: 10, fontWeight: isSelected ? 600 : 500,
                      color: 'var(--c-text-hi)',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', flex: 1,
                    }}>
                      {doc.title || 'Untitled note'}
                    </span>
                  )}
                  <span style={{ fontFamily: FONTS.ui, fontSize: 9.5, color: isSelected ? 'var(--c-text-md)' : 'var(--c-text-lo)', flexShrink: 0 }}>
                    {relativeTime(doc.updatedAt)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
      {noteMenu && (() => {
        const MENU_W = 160;
        const left = Math.min(noteMenu.x, window.innerWidth - MENU_W - 8);
        const top = Math.min(noteMenu.y, window.innerHeight - 64);
        return (
          <div
            style={{ position: 'fixed', left, top, zIndex: 9100, minWidth: MENU_W }}
            className="py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
              style={{ fontFamily: FONTS.ui }}
              onClick={() => {
                onRevealDocument(noteMenu.doc);
                setNoteMenu(null);
              }}
            >
              <span>Show in Folder</span>
            </button>
            <button
              className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
              style={{ fontFamily: FONTS.ui }}
              onClick={() => {
                beginRename(noteMenu.doc);
                setNoteMenu(null);
              }}
            >
              <span>Rename</span>
            </button>
            <div style={{ height: 1, background: 'var(--c-border)', margin: '3px 0' }} />
            <button
              className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left hover:bg-[rgba(239,68,68,0.12)]"
              style={{ fontFamily: FONTS.ui, color: '#f87171' }}
              onClick={() => {
                onDeleteDocument(noteMenu.doc);
                setNoteMenu(null);
              }}
            >
              <span>Delete</span>
              <span className="text-[10px] ml-3" style={{ color: '#f87171', opacity: 0.6 }}>⌫</span>
            </button>
          </div>
        );
      })()}
    </div>
  );
}

export const WORKSPACE_EXPLORER_WIDTH = 340;

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  onClose: () => void;
}

export default function WorkspaceExplorer({ onClose }: Props) {
  const workspaceName = useBoardStore((s) => s.workspaceName) ?? getWorkspaceName() ?? 'No folder open';
  const imageAssetFolder = useBoardStore((s) => s.imageAssetFolder);
  const setImageAssetFolder = useBoardStore((s) => s.setImageAssetFolder);
  const pages = useBoardStore((s) => s.pages);
  const addPage = useBoardStore((s) => s.addPage);
  const deletePage = useBoardStore((s) => s.deletePage);
  const renamePage = useBoardStore((s) => s.renamePage);
  const setPageNoteSort = useBoardStore((s) => s.setPageNoteSort);
  const activePageId = useBoardStore((s) => s.activePageId);
  const activeDocId = useBoardStore((s) => s.activeDocId);
  const switchPage = useBoardStore((s) => s.switchPage);
  const documents = useBoardStore((s) => s.documents);
  const addDocument = useBoardStore((s) => s.addDocument);
  const updateDocument = useBoardStore((s) => s.updateDocument);
  const deleteDocument = useBoardStore((s) => s.deleteDocument);
  const openDocumentWithMorph = useBoardStore((s) => s.openDocumentWithMorph);
  const storeNodes = useBoardStore((s) => s.nodes);
  const pageSnapshots = useBoardStore((s) => s.pageSnapshots);
  const isDark = useBoardStore((s) => s.theme) === 'dark';

  const panelRef = useRef<HTMLDivElement>(null);
  const { filePreview, showFilePreview, handleFileHover, clearPreview } = useFilePreview(panelRef);
  const {
    tree,
    setTree,
    rootLoading,
    setRootLoading,
    rootError,
    setRootError,
    reloadRoot,
    newFolderParent,
    setNewFolderParent,
    newFolderName,
    setNewFolderName,
    newFolderInputRef,
    visibleEntriesRef,
    updateEntry,
    handleToggle,
    startNewFolder,
    commitNewFolder,
  } = useTreeState(imageAssetFolder);

  // Reload tree when workspace is opened externally (e.g. via TopBar)
  const storeWorkspaceName = useBoardStore((s) => s.workspaceName);
  const workspaceSavedAt = useBoardStore((s) => s.workspaceSavedAt);
  const prevStoreWorkspaceRef = useRef(storeWorkspaceName);
  const prevWorkspaceSavedAtRef = useRef(workspaceSavedAt);
  useEffect(() => {
    if (storeWorkspaceName === prevStoreWorkspaceRef.current) return;
    prevStoreWorkspaceRef.current = storeWorkspaceName;
    if (storeWorkspaceName) reloadRoot();
  }, [storeWorkspaceName, reloadRoot]);
  useEffect(() => {
    if (workspaceSavedAt === prevWorkspaceSavedAtRef.current) return;
    prevWorkspaceSavedAtRef.current = workspaceSavedAt;
    if (workspaceSavedAt) reloadRoot();
  }, [workspaceSavedAt, reloadRoot]);

  // Local state
  const [pagesSectionOpen, setPagesSectionOpen] = useState(true);
  const [assetsSectionOpen, setAssetsSectionOpen] = useState(true);
  const [collapsedPageIds, setCollapsedPageIds] = useState<Record<string, boolean>>({});
  const [pageSectionHeight, setPageSectionHeight] = useState(320);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const confirmCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [folderEditing, setFolderEditing] = useState(false);
  const [folderDraft, setFolderDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  // Rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const renamingEntryRef = useRef<TreeEntry | null>(null);
  // Delete confirm state
  const [deleteConfirm, setDeleteConfirm] = useState<TreeEntry | null>(null);
  const [deletePageConfirm, setDeletePageConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleteNoteConfirm, setDeleteNoteConfirm] = useState<Document | null>(null);
  // Explorer context menu (right-click)
  type ExplorerMenu = { entry: TreeEntry; x: number; y: number };
  const [explorerMenu, setExplorerMenu] = useState<ExplorerMenu | null>(null);
  const explorerMenuRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const resizeStateRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // Cleanup on unmount
  useEffect(() => () => {
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current);
  }, []);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) return;
      const panelHeight = panelRef.current?.getBoundingClientRect().height ?? window.innerHeight;
      const minHeight = 120;
      const maxHeight = Math.max(minHeight, Math.min(520, panelHeight * 0.62));
      const nextHeight = resizeState.startHeight + (e.clientY - resizeState.startY);
      setPageSectionHeight(Math.max(minHeight, Math.min(maxHeight, nextHeight)));
    };

    const onPointerUp = () => {
      resizeStateRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);


  // ── File actions ─────────────────────────────────────────────────────────
  const placeFile = useCallback(async (entry: TreeEntry) => {
    const e = ext(entry.name);
    if (IMAGE_EXTS.has(e)) {
      await placeImageFile(entry.path);
    } else if (DOC_EXTS.has(e)) {
      await placeDocumentFile(entry.path);
    } else if (CODE_EXTS[e] !== undefined) {
      await placeCodeFile(entry.path);
    }
  }, []);

  const openFile = useCallback(async (entry: TreeEntry) => {
    const e = ext(entry.name);
    if (DOC_EXTS.has(e)) {
      await openDocumentFile(entry.path);
    } else {
      await placeFile(entry);
    }
  }, [placeFile]);

  const importMarkdownToNotes = useCallback(async (pathParts: string[]) => {
    const e = ext(pathParts[pathParts.length - 1] ?? '');
    if (!DOC_EXTS.has(e)) {
      toast('Drop a Markdown file to add it to notes');
      return;
    }

    if (pathParts[0] === 'notes') {
      await openDocumentFile(pathParts);
      toast('Already in notes');
      return;
    }

    const content = await readWorkspaceFile(pathParts.join('/'));
    if (content === null) {
      toast('Could not read Markdown file');
      return;
    }

    const sourceName = pathParts[pathParts.length - 1];
    const dotIdx = sourceName.lastIndexOf('.');
    const stem = dotIdx > 0 ? sourceName.slice(0, dotIdx) : sourceName;
    const extn = dotIdx > 0 ? sourceName.slice(dotIdx) : '.md';
    let existing = new Set<string>();
    try {
      existing = new Set((await listDirectory(['notes'])).filter((entry) => entry.kind === 'file').map((entry) => entry.name.toLowerCase()));
    } catch {
      existing = new Set();
    }

    let filename = `${stem}${extn}`;
    let suffix = 2;
    while (existing.has(filename.toLowerCase())) {
      filename = `${stem}-${suffix}${extn}`;
      suffix += 1;
    }

    const ok = await saveTextFileToWorkspace('notes', filename, content);
    if (!ok) {
      toast('Could not copy note into notes/');
      return;
    }

    const titleMatch = content.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1].trim() : stem;
    const linkedFile = `notes/${filename}`;
    const existingDoc = useBoardStore.getState().documents.find((doc) => doc.linkedFile === linkedFile);
    const docId = existingDoc?.id ?? addDocument({ title, content: markdownToHtml(content), linkedFile });
    openDocumentWithMorph(docId);
    void saveWorkspace(useBoardStore.getState().exportData());
    try {
      const rawChildren = await listDirectory(['notes']);
      const children = rawChildren
        .filter((entry) => !entry.name.startsWith('.') && !(entry.kind === 'directory' && SKIP_DIRS.has(entry.name)))
        .map((entry) => buildEntry(entry.name, entry.kind, ['notes']));
      setTree((prev) => {
        const hasNotesFolder = prev.some((entry) => entry.path.join('/') === 'notes');
        if (!hasNotesFolder) {
          const next = [...prev, { ...buildEntry('notes', 'directory', []), expanded: true, children }];
          return next.sort((a, b) => {
            if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name, undefined, { numeric: true });
          });
        }
        return updateEntry(prev, ['notes'], (entry) => ({
          ...entry,
          expanded: true,
          loading: false,
          children,
        }));
      });
    } catch {
      // Keep existing expanded tree state even if the folder refresh fails.
    }
    toast(`Added note · ${linkedFile}`);
  }, [addDocument, openDocumentWithMorph, setTree, updateEntry]);

  const handleFileSingleClick = useCallback((entry: TreeEntry, clientY: number) => {
    const idx = visibleEntriesRef.current.findIndex((e) => e.path.join('/') === entry.path.join('/'));
    if (idx !== -1) setFocusedIdx(idx);
    showFilePreview(entry, clientY);
  }, [showFilePreview]);

  const handleFileOpen = useCallback((entry: TreeEntry) => {
    clearPreview();
    openFile(entry);
  }, [openFile, clearPreview]);

  const handleFileDragStart = useCallback((entry: TreeEntry, e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-devboard-entry', JSON.stringify(entry.path));
    e.dataTransfer.effectAllowed = 'copy';

    // Build a ghost drag image
    const ghost = document.createElement('div');
    ghost.style.cssText = [
      'position:fixed', 'top:-999px', 'left:-999px',
      'display:flex', 'align-items:center', 'gap:6px',
      'padding:5px 10px 5px 6px',
      'background:#1e1e2e', 'border:1px solid var(--c-line)',
      'border-radius:8px', 'color:#e2e8f0',
      'font:11px/1 \'JetBrains Mono\',monospace',
      'pointer-events:none', 'white-space:nowrap',
      'box-shadow:0 4px 16px rgba(0,0,0,0.5)',
    ].join(';');

    // Thumbnail if the image is currently previewed
    if (filePreview?.kind === 'image' && filePreview.entry.path.join('/') === entry.path.join('/')) {
      const img = document.createElement('img');
      img.src = filePreview.url;
      img.style.cssText = 'width:36px;height:36px;object-fit:contain;border-radius:4px;opacity:0.9;flex-shrink:0;';
      ghost.appendChild(img);
    }

    const label = document.createElement('span');
    label.textContent = entry.name;
    ghost.appendChild(label);

    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 20, 20);
    requestAnimationFrame(() => { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); });
  }, [filePreview]);

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const handleOpenFolder = useCallback(async () => {
    const result = await openWorkspace();
    if (result) {
      useBoardStore.getState().setWorkspaceName?.(result.name);
      if (result.data) useBoardStore.getState().loadBoard(result.data);
      // Reload tree
      setRootLoading(true);
      setRootError(null);
      listDirectory([])
        .then((entries) => {
          const filtered = entries.filter((e) => !e.name.startsWith('.') && !(e.kind === 'directory' && SKIP_DIRS.has(e.name)));
          setTree(filtered.map((e) => buildEntry(e.name, e.kind, [])));
          setRootLoading(false);
        })
        .catch((err) => {
          setRootError(`Failed to read folder: ${err?.message ?? err}`);
          setRootLoading(false);
        });
    }
  }, []);

  // ── Rename ───────────────────────────────────────────────────────────────
  const [renameExtWarning, setRenameExtWarning] = useState<{ entry: TreeEntry; newName: string } | null>(null);

  const startRename = useCallback((entry: TreeEntry) => {
    setRenamingPath(entry.path.join('/'));
    setRenameDraft(entry.name);
    renamingEntryRef.current = entry;
    setExplorerMenu(null);
  }, []);

  const doRename = useCallback(async (entry: TreeEntry, newName: string) => {
    try {
      await renameEntry(entry.path, newName);
      const newPath = [...entry.path.slice(0, -1), newName];
      setTree((prev) =>
        updateEntry(prev, entry.path, (e) => ({ ...e, name: newName, path: newPath }))
      );
    } catch (err) {
      console.warn('Rename failed:', err);
    }
  }, [updateEntry]);

  const commitRename = useCallback((entry: TreeEntry) => {
    const newName = renameDraft.trim();
    setRenamingPath(null);
    renamingEntryRef.current = null;
    if (!newName || newName === entry.name) return;
    // Warn if extension changed on a file
    if (entry.kind === 'file') {
      const oldExt = entry.name.includes('.') ? entry.name.split('.').pop()!.toLowerCase() : '';
      const newExt = newName.includes('.') ? newName.split('.').pop()!.toLowerCase() : '';
      if (oldExt && oldExt !== newExt) {
        setRenameExtWarning({ entry, newName });
        return;
      }
    }
    doRename(entry, newName);
  }, [renameDraft, doRename]);

  // ── Delete ───────────────────────────────────────────────────────────────
  const removeFromTree = useCallback((pathParts: string[]) => {
    const remove = (entries: TreeEntry[], path: string[]): TreeEntry[] => {
      if (path.length === 1) return entries.filter((e) => e.name !== path[0]);
      return entries.map((e) =>
        e.name === path[0] && e.children
          ? { ...e, children: remove(e.children, path.slice(1)) }
          : e
      );
    };
    setTree((prev) => remove(prev, pathParts));
  }, [setTree]);

  const doDelete = useCallback(async (entry: TreeEntry) => {
    try {
      await deleteEntry(entry.path);
      removeFromTree(entry.path);
      setFocusedIdx(null);
    } catch (err) {
      console.warn('Delete failed:', err);
    }
  }, [removeFromTree]);

  const startDelete = useCallback((entry: TreeEntry) => {
    setDeleteConfirm(entry);
    setExplorerMenu(null);
  }, []);

  // Cancel rename when clicking outside the inline input
  useEffect(() => {
    if (!renamingPath) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && target.dataset.renameInput) return;
      setRenamingPath(null);
      renamingEntryRef.current = null;
    };
    // Use click instead of mousedown since panel's onMouseDown stops propagation
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [renamingPath]);

  // Dismiss explorer context menu on outside click
  useEffect(() => {
    if (!explorerMenu) return;
    const handler = (e: MouseEvent) => {
      if (explorerMenuRef.current && !explorerMenuRef.current.contains(e.target as Node)) {
        setExplorerMenu(null);
      }
    };
    // Use click instead of mousedown since panel's onMouseDown stops propagation
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [explorerMenu]);

  const handleEntryContextMenu = useCallback((entry: TreeEntry, x: number, y: number) => {
    setExplorerMenu({ entry, x, y });
    // Also set keyboard focus to this entry
    const idx = visibleEntriesRef.current.findIndex((e) => e.path.join('/') === entry.path.join('/'));
    if (idx !== -1) setFocusedIdx(idx);
  }, []);


  // Flatten entire loaded tree for search results (includes collapsed dirs)
  const flattenTree = useCallback((entries: TreeEntry[]): TreeEntry[] => {
    const result: TreeEntry[] = [];
    for (const e of entries) {
      result.push(e);
      if (e.children) result.push(...flattenTree(e.children));
    }
    return result;
  }, []);

  const searchResults = useMemo(
    () => searchQuery.trim()
      ? flattenTree(tree).filter((e) => e.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : null,
    [searchQuery, tree, flattenTree]
  );

  // Flat list of currently visible rows (for keyboard nav)
  const visibleEntries = useMemo(
    () => searchResults ?? flatVisible(tree),
    [searchResults, tree]
  );

  // Set of workspace-relative file paths currently placed on any canvas page
  const usedOnCanvas = useMemo(() => {
    const paths = new Set<string>();
    const allNodes = [
      ...storeNodes,
      ...Object.values(pageSnapshots).flatMap((s) => s.nodes),
    ];
    for (const n of allNodes) {
      if (n.type === 'image') {
        const img = n as import('../types').ImageNode;
        if (img.assetName) {
          const folder = img.assetFolder ?? '';
          paths.add(folder ? `${folder}/${img.assetName}` : img.assetName);
        }
      }
      if (n.type === 'codeblock') {
        const cb = n as import('../types').CodeBlockNode;
        if (cb.linkedFile) paths.add(cb.linkedFile);
      }
      if (n.type === 'document') {
        const doc = n as import('../types').DocumentNode;
        if (doc.linkedFile) paths.add(doc.linkedFile);
      }
    }
    return paths;
  }, [storeNodes, pageSnapshots]);

  const pageDocs = useMemo(() => {
    const docsByPage = new Map<string, typeof documents>();
    for (const page of pages) docsByPage.set(page.id, []);
    for (const doc of documents) {
      if (!doc.pageId) continue;
      const list = docsByPage.get(doc.pageId);
      if (list) list.push(doc);
    }
    for (const [pageId, list] of docsByPage.entries()) {
      const page = pages.find((entry) => entry.id === pageId);
      const sorted = sortDocumentsForExplorer(list, page?.noteSort ?? 'updated');
      list.splice(0, list.length, ...sorted);
    }
    return docsByPage;
  }, [documents, pages]);
  const createNoteForPage = useCallback((pageId: string) => {
    if (pageId !== activePageId) switchPage(pageId);
    const page = pages.find((entry) => entry.id === pageId);
    const pageDocList = sortDocumentsForExplorer(
      documents.filter((doc) => doc.pageId === pageId),
      page?.noteSort ?? 'updated'
    );
    const docId = addDocument({
      title: 'Untitled note',
      pageId,
      orderIndex: (page?.noteSort ?? 'updated') === 'custom' ? pageDocList.length : undefined,
    });
    useBoardStore.getState().ensureDocumentNode(docId, pageId);
    openDocumentWithMorph(docId);
  }, [activePageId, addDocument, documents, openDocumentWithMorph, pages, switchPage]);

  const renameDocumentFromExplorer = useCallback((docId: string, title: string) => {
    updateDocument(docId, { title });
  }, [updateDocument]);

  const reorderDocumentsForPage = useCallback((pageId: string, docIds: string[]) => {
    docIds.forEach((docId, index) => {
      updateDocument(docId, { orderIndex: index });
    });
  }, [updateDocument]);

  const changePageNoteSort = useCallback((page: PageMeta, sort: 'updated' | 'custom') => {
    if (sort === 'custom') {
      const orderedDocs = sortDocumentsForExplorer(
        documents.filter((doc) => doc.pageId === page.id),
        page.noteSort ?? 'updated'
      );
      orderedDocs.forEach((doc, index) => {
        if (doc.orderIndex !== index) updateDocument(doc.id, { orderIndex: index });
      });
    }
    setPageNoteSort(page.id, sort);
  }, [documents, setPageNoteSort, updateDocument]);

  const ensureCustomSortForPage = useCallback((page: PageMeta) => {
    if (page.noteSort === 'custom') return;
    changePageNoteSort(page, 'custom');
  }, [changePageNoteSort]);

  const deleteDocumentFromExplorer = useCallback((doc: Document) => {
    setDeleteNoteConfirm(doc);
  }, []);

  const revealPageInFinder = useCallback((page: PageMeta) => {
    void revealInFinder(`pages/${page.id}.json`);
  }, []);

  const revealDocumentInFinder = useCallback((doc: Document) => {
    if (!doc.linkedFile) {
      toast('Save this note to the workspace first');
      return;
    }
    void revealInFinder(doc.linkedFile);
  }, []);

  const togglePageCollapsed = useCallback((pageId: string) => {
    setCollapsedPageIds((prev) => ({ ...prev, [pageId]: !prev[pageId] }));
  }, []);

  const startPageSectionResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    resizeStateRef.current = { startY: e.clientY, startHeight: pageSectionHeight };
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [pageSectionHeight]);

  const assetTree = useMemo(
    () => tree.filter((entry) => entry.path.join('/') !== 'notes'),
    [tree]
  );

  const assetSearchResults = useMemo(
    () => searchResults?.filter((entry) => entry.path[0] !== 'notes') ?? null,
    [searchResults]
  );

  visibleEntriesRef.current = visibleEntries;
  const focusedPath = focusedIdx !== null ? (visibleEntries[focusedIdx]?.path.join('/') ?? null) : null;

  // Reset focus when search changes
  useEffect(() => { setFocusedIdx(null); }, [searchQuery]);

  // Auto-scroll focused row into view
  useEffect(() => {
    if (focusedIdx === null) return;
    const el = scrollContainerRef.current?.querySelector<HTMLElement>('[data-focused="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusedIdx]);

  // Auto-preview focused file
  useEffect(() => {
    if (focusedIdx === null) { clearPreview(); return; }
    const entry = visibleEntries[focusedIdx];
    if (!entry || entry.kind === 'directory') { clearPreview(); return; }
    const rect = panelRef.current?.getBoundingClientRect();
    const panelMidY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    showFilePreview(entry, panelMidY);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIdx]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (visibleEntries.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIdx((prev) => (prev === null ? 0 : Math.min(prev + 1, visibleEntries.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIdx((prev) => (prev === null ? visibleEntries.length - 1 : Math.max(prev - 1, 0)));
    } else if (e.key === 'Enter') {
      if (focusedIdx === null) return;
      const entry = visibleEntries[focusedIdx];
      if (!entry) return;
      e.preventDefault();
      if (entry.kind === 'directory') {
        handleToggle(entry.path);
      } else if (e.shiftKey) {
        clearPreview();
        placeFile(entry);
      } else {
        clearPreview();
        openFile(entry);
      }
    } else if (e.key === 'F2') {
      if (focusedIdx === null) return;
      const entry = visibleEntries[focusedIdx];
      if (entry) { e.preventDefault(); startRename(entry); }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (focusedIdx === null) return;
      const entry = visibleEntries[focusedIdx];
      if (entry) { e.preventDefault(); startDelete(entry); }
    } else if (e.key === 'Escape') {
      setExplorerMenu(null);
      setFocusedIdx(null);
      clearPreview();
    }
  }, [visibleEntries, focusedIdx, handleToggle, placeFile, openFile, startRename, startDelete]);

  return (
    <div
      ref={panelRef}
      className="flex flex-col select-none"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'var(--c-panel)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Header — drag handle */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 12px 10px',
          borderBottom: '1px solid var(--c-border)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: FONTS.ui, fontSize: 12.5, fontWeight: 700, color: 'var(--c-text-hi)', letterSpacing: '-0.01em' }}>
          Explorer
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {!confirmingClose && getWorkspaceName() && (
            <button
              onClick={() => startNewFolder([])}
              title="New folder at root"
              className="w-5 h-5 flex items-center justify-center rounded text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 3a1 1 0 0 1 1-1h2.5L5.5 3H10a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
                <line x1="6" y1="5.5" x2="6" y2="8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <line x1="4.5" y1="7" x2="7.5" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          )}
          {confirmingClose ? (
            /* Two-step close confirmation */
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontFamily: FONTS.ui, fontSize: 10, color: 'var(--c-text-off)', whiteSpace: 'nowrap' }}>Close?</span>
              <button
                onClick={() => {
                  if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current);
                  onClose();
                }}
                style={{ padding: '1px 7px', background: 'var(--c-line)', border: 'none', borderRadius: 4, fontFamily: FONTS.ui, fontSize: 10, color: 'white', cursor: 'pointer', lineHeight: 1.6 }}
              >
                Yes
              </button>
              <button
                onClick={() => {
                  if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current);
                  setConfirmingClose(false);
                }}
                style={{ padding: '1px 7px', background: 'none', border: '1px solid var(--c-border)', borderRadius: 4, fontFamily: FONTS.ui, fontSize: 10, color: 'var(--c-text-lo)', cursor: 'pointer', lineHeight: 1.6 }}
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setConfirmingClose(true);
                if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current);
                confirmCloseTimerRef.current = setTimeout(() => setConfirmingClose(false), 3000);
              }}
              title="Close explorer"
              className="w-5 h-5 flex items-center justify-center rounded text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
            >
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Search bar */}
      {getWorkspaceName() && (
        <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 32,
              padding: '0 10px',
              background: 'var(--c-panel)',
              border: '1px solid var(--c-border)',
              borderRadius: 10,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 11 11" fill="none" style={{ flexShrink: 0, opacity: 0.55 }}>
              <circle cx="4.5" cy="4.5" r="3.5" stroke="var(--c-text-hi)" strokeWidth="1.3" />
              <line x1="7.5" y1="7.5" x2="10" y2="10" stroke="var(--c-text-hi)" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) handleKeyDown(e as unknown as React.KeyboardEvent);
              }}
              placeholder="Search pages, assets..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontFamily: FONTS.ui,
                fontSize: 10.5,
                color: 'var(--c-text-hi)',
                caretColor: 'var(--c-line)',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'var(--c-text-lo)' }}
                title="Clear search"
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Workspace root label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--c-border)', flexShrink: 0, overflow: 'hidden' }}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
          <path d="M1 2.5a1 1 0 0 1 1-1h1.8L5 3H8.5a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2.5z" fill="rgba(212, 131, 90, 0.2)" stroke="#d4835a" strokeWidth="1" strokeLinejoin="round" />
        </svg>
        <span
          style={{ fontFamily: FONTS.ui, fontSize: 9.5, fontWeight: 700, color: 'var(--c-text-hi)', textTransform: 'uppercase', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={workspaceName}
        >
          {workspaceName}
        </span>
      </div>

      {/* ── BOARDS section ─────────────────────────────────────────────────── */}
      {getWorkspaceName() && pages.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
          {/* Section header */}
          <button
            onClick={() => setPagesSectionOpen((v) => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 4,
              padding: '8px 12px 4px', background: 'none', border: 'none',
              cursor: 'pointer', userSelect: 'none',
            }}
          >
            <span style={{
              fontSize: 9, color: 'var(--c-text-off)',
              transform: pagesSectionOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.12s',
              display: 'inline-block',
            }}>▾</span>
            <span style={explorerSectionHeaderStyle}>Pages</span>
            <span style={{ marginLeft: 'auto', fontFamily: FONTS.ui, fontSize: 9.5, color: 'var(--c-text-lo)' }}>{pages.length}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                addPage();
              }}
              title="New page"
              style={{
                width: 18,
                height: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: 4,
                background: 'transparent',
                border: 'none',
                borderRadius: 4,
                color: 'var(--c-text-lo)',
                cursor: 'pointer',
                flexShrink: 0,
                fontFamily: FONTS.ui,
                fontSize: 14,
                lineHeight: 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--c-hover)';
                e.currentTarget.style.color = 'var(--c-text-hi)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--c-text-lo)';
              }}
            >
              +
            </button>
          </button>

          {pagesSectionOpen && (
            <div
              style={{
                padding: '0 8px 0',
                height: pageSectionHeight,
                overflowY: 'auto',
                scrollbarWidth: 'thin',
              }}
            >
              {pages.map((page) => {
                const isActive = page.id === activePageId;
                const docsForPage = pageDocs.get(page.id) ?? [];
                const isCollapsed = collapsedPageIds[page.id] ?? !isActive;
                return (
                  <PageGroup
                    key={page.id}
                    page={page}
                    docs={docsForPage}
                    isActive={isActive}
                    isCollapsed={isCollapsed}
                    activeDocId={activeDocId}
                    onRenameDocument={renameDocumentFromExplorer}
                    onReorderDocuments={(docIds) => reorderDocumentsForPage(page.id, docIds)}
                    onDeleteDocument={deleteDocumentFromExplorer}
                    onRevealDocument={revealDocumentInFinder}
                    onRenamePage={renamePage}
                    onDeletePage={(targetPage) => setDeletePageConfirm({ id: targetPage.id, name: targetPage.name })}
                    onRevealPage={revealPageInFinder}
                    onChangeSortMode={changePageNoteSort}
                    onEnsureCustomSort={ensureCustomSortForPage}
                    onToggleCollapsed={() => togglePageCollapsed(page.id)}
                    onOpenPageOverview={() => {
                      if (!isActive) switchPage(page.id);
                      window.dispatchEvent(new CustomEvent('devboard:snap-close-document'));
                    }}
                    onCreateNote={() => createNoteForPage(page.id)}
                    onOpenDocument={(docId) => {
                      if (!isActive) switchPage(page.id);
                      openDocumentWithMorph(docId);
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {getWorkspaceName() && pages.length > 0 && pagesSectionOpen && (
        <div
          onPointerDown={startPageSectionResize}
          title="Resize pages section"
          style={{
            height: 12,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'ns-resize',
            borderBottom: '1px solid var(--c-border)',
            background: 'var(--c-panel)',
          }}
        >
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 999,
              background: 'rgba(138, 117, 95, 0.26)',
            }}
          />
        </div>
      )}

      {/* Assets section */}
      <div style={{ borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
        <button
          onClick={() => setAssetsSectionOpen((v) => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 4,
            padding: '8px 12px 4px', background: 'none', border: 'none',
            cursor: 'pointer', userSelect: 'none',
          }}
        >
          <span style={{
            fontSize: 9, color: 'var(--c-text-off)',
            transform: assetsSectionOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.12s',
            display: 'inline-block',
          }}>▾</span>
          <span style={explorerSectionHeaderStyle}>Assets</span>
          <span style={{ marginLeft: 'auto', fontFamily: FONTS.ui, fontSize: 9.5, color: 'var(--c-text-lo)' }}>{assetTree.length}</span>
        </button>
      </div>

      {/* File tree */}
      {assetsSectionOpen && (
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto py-1" style={{ scrollbarWidth: 'thin', overflowX: 'hidden' }}>
        {/* Inline new-folder input at root */}
        {newFolderParent !== null && newFolderParent.length === 0 && (
          <div className="flex items-center gap-1.5 h-[26px] px-2 mx-1 rounded" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.35)' }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.6 }}>
              <path d="M1 3a1 1 0 0 1 1-1h2.5L5.5 3H10a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3z" stroke="var(--c-line)" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            <input
              ref={newFolderInputRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitNewFolder(); }
                if (e.key === 'Escape') { e.preventDefault(); setNewFolderParent(null); }
                e.stopPropagation();
              }}
              onBlur={() => { if (!newFolderName.trim()) setNewFolderParent(null); }}
              placeholder="folder name…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-hi)', caretColor: 'var(--c-line)' }}
            />
          </div>
        )}
        {rootLoading ? (
          <div style={{ padding: '10px 16px', fontSize: 10, color: 'var(--c-text-lo)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Loading…</div>
        ) : rootError ? (
          <div style={{ padding: '10px 16px', fontSize: 10.5, color: '#c96a6a', fontFamily: FONTS.ui, lineHeight: 1.5 }}>{rootError}</div>
        ) : !getWorkspaceName() ? (
          <NoWorkspaceState onOpen={handleOpenFolder} />
        ) : assetSearchResults !== null ? (
          assetSearchResults.length === 0 ? (
            <div style={{ padding: '10px 16px', fontSize: 10, color: 'var(--c-text-lo)', fontFamily: FONTS.ui, fontStyle: 'italic' }}>No matches</div>
          ) : (
            assetSearchResults.map((entry) => (
              <TreeRow key={entry.path.join('/')} entry={entry} depth={0} focusedPath={focusedPath} renamingPath={renamingPath} renameDraft={renameDraft} onRenameDraftChange={setRenameDraft} onRenameCommit={commitRename} onRenameCancel={() => setRenamingPath(null)} onToggle={handleToggle} onFileSingleClick={handleFileSingleClick} onFileOpen={handleFileOpen} onMarkdownDrop={importMarkdownToNotes} onContextMenu={handleEntryContextMenu} onFileDragStart={handleFileDragStart} onFileHover={handleFileHover} usedOnCanvas={usedOnCanvas} isDark={isDark} />
            ))
          )
        ) : assetTree.length === 0 ? (
          <div style={{ padding: '10px 16px', fontSize: 10, color: 'var(--c-text-lo)', fontFamily: FONTS.ui, fontStyle: 'italic' }}>Folder is empty</div>
        ) : (
          assetTree.map((entry) => (
            <TreeRow key={entry.path.join('/')} entry={entry} depth={0} focusedPath={focusedPath} renamingPath={renamingPath} renameDraft={renameDraft} onRenameDraftChange={setRenameDraft} onRenameCommit={commitRename} onRenameCancel={() => setRenamingPath(null)} onToggle={handleToggle} onFileSingleClick={handleFileSingleClick} onFileOpen={handleFileOpen} onMarkdownDrop={importMarkdownToNotes} onContextMenu={handleEntryContextMenu} onFileDragStart={handleFileDragStart} onFileHover={handleFileHover} usedOnCanvas={usedOnCanvas} isDark={isDark} />
          ))
        )}
      </div>
      )}

      {/* Default save folder — only shown when a workspace is open */}
      {getWorkspaceName() && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--c-border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
            <path d="M1 2.5a1 1 0 0 1 1-1h1.8L5 3H8.5a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2.5z" stroke="var(--c-text-off)" strokeWidth="1" strokeLinejoin="round" />
          </svg>
          {folderEditing ? (
            <input
              autoFocus
              type="text"
              value={folderDraft}
              onChange={(e) => setFolderDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = folderDraft.trim().replace(/^\/+|\/+$/g, '');
                  if (v) setImageAssetFolder(v);
                  setFolderEditing(false);
                  e.stopPropagation();
                }
                if (e.key === 'Escape') { setFolderEditing(false); e.stopPropagation(); }
                e.stopPropagation();
              }}
              onBlur={() => {
                const v = folderDraft.trim().replace(/^\/+|\/+$/g, '');
                if (v) setImageAssetFolder(v);
                setFolderEditing(false);
              }}
              placeholder="assets"
              style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px solid var(--c-line)', outline: 'none', fontFamily: FONTS.ui, fontSize: 10, color: 'var(--c-text-hi)', caretColor: 'var(--c-line)', paddingBottom: 1 }}
            />
          ) : (
            <>
              <span style={{ fontFamily: FONTS.ui, fontSize: 9.5, color: 'var(--c-text-off)', flex: 1 }}>
                Save images to: <span style={{ color: 'var(--c-text-md)' }}>{imageAssetFolder}/</span>
              </span>
              <button
                onClick={() => { setFolderDraft(imageAssetFolder); setFolderEditing(true); }}
                title="Change default save folder"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--c-text-lo)', lineHeight: 1, flexShrink: 0 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--c-text-hi)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--c-text-lo)')}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M7 1.5l1.5 1.5-5 5H2V6.5l5-5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                </svg>
              </button>
            </>
          )}
        </div>
      )}

      {/* Assets hint + trash */}
      <div style={{ padding: '7px 12px 9px', borderTop: '1px solid var(--c-border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <p style={{ fontSize: 8.5, color: 'var(--c-text-lo)', fontFamily: FONTS.ui, lineHeight: 1.4, margin: 0, flex: 1 }}>
          {focusedIdx !== null && visibleEntries[focusedIdx]
            ? 'Assets: double-click or ↵ to place · drag to canvas · ↑↓ navigate'
            : pages.length > 1
              ? 'Active page can be deleted from here'
              : 'Keep at least one page in the workspace'}
        </p>
        {(focusedIdx !== null && visibleEntries[focusedIdx]) || pages.length > 1 ? (
          <button
            onClick={() => {
              if (focusedIdx !== null && visibleEntries[focusedIdx]) {
                startDelete(visibleEntries[focusedIdx]!);
                return;
              }
              const activePage = pages.find((page) => page.id === activePageId);
              if (activePage && pages.length > 1) {
                setDeletePageConfirm({ id: activePage.id, name: activePage.name });
              }
            }}
            title={
              focusedIdx !== null && visibleEntries[focusedIdx]
                ? `Delete ${visibleEntries[focusedIdx]!.name}`
                : `Delete ${pages.find((page) => page.id === activePageId)?.name ?? 'page'}`
            }
            style={{
              flexShrink: 0,
              width: 24, height: 24,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6, cursor: 'pointer',
              color: '#f87171', opacity: 0.75,
              transition: 'opacity 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.75'; e.currentTarget.style.background = 'none'; }}
          >
            <svg width="11" height="12" viewBox="0 0 11 12" fill="none">
              <path d="M1 3h9M4 3V2h3v1M2 3l.7 7.5a1 1 0 0 0 1 .5h3.6a1 1 0 0 0 1-.5L9 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="4.5" y1="5.5" x2="4.5" y2="8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
              <line x1="6.5" y1="5.5" x2="6.5" y2="8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 24px', maxWidth: 340, boxShadow: '0 16px 48px rgba(0,0,0,0.4)' }}>
            <p style={{ fontFamily: FONTS.ui, fontSize: 12, fontWeight: 700, color: 'var(--c-text-hi)', margin: '0 0 8px' }}>
              Delete {deleteConfirm.kind === 'directory' ? 'folder' : 'file'}?
            </p>
            <p style={{ fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-lo)', margin: '0 0 16px', lineHeight: 1.5 }}>
              <span style={{ color: '#f87171' }}>{deleteConfirm.name}</span>
              {deleteConfirm.kind === 'directory' ? ' and all its contents will be permanently deleted.' : ' will be permanently deleted.'}
              {' '}This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { doDelete(deleteConfirm); setDeleteConfirm(null); }}
                style={{ flex: 1, padding: '7px 0', background: '#ef4444', border: 'none', borderRadius: 8, fontFamily: FONTS.ui, fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{ flex: 1, padding: '7px 0', background: 'var(--c-hover)', border: 'none', borderRadius: 8, fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-hi)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page delete confirmation */}
      {deletePageConfirm && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 24px', maxWidth: 340, boxShadow: '0 16px 48px rgba(0,0,0,0.4)' }}>
            <p style={{ fontFamily: FONTS.ui, fontSize: 12, fontWeight: 700, color: 'var(--c-text-hi)', margin: '0 0 8px' }}>
              Delete page?
            </p>
            <p style={{ fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-lo)', margin: '0 0 16px', lineHeight: 1.5 }}>
              <span style={{ color: '#f87171' }}>{deletePageConfirm.name}</span>
              {' '}will be removed from the workspace. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  deletePage(deletePageConfirm.id);
                  setDeletePageConfirm(null);
                }}
                style={{ flex: 1, padding: '7px 0', background: '#ef4444', border: 'none', borderRadius: 8, fontFamily: FONTS.ui, fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
              >
                Delete
              </button>
              <button
                onClick={() => setDeletePageConfirm(null)}
                style={{ flex: 1, padding: '7px 0', background: 'var(--c-hover)', border: 'none', borderRadius: 8, fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-hi)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note delete confirmation */}
      {deleteNoteConfirm && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 24px', maxWidth: 340, boxShadow: '0 16px 48px rgba(0,0,0,0.4)' }}>
            <p style={{ fontFamily: FONTS.ui, fontSize: 12, fontWeight: 700, color: 'var(--c-text-hi)', margin: '0 0 8px' }}>
              Delete note?
            </p>
            <p style={{ fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-lo)', margin: '0 0 16px', lineHeight: 1.5 }}>
              <span style={{ color: '#f87171' }}>{deleteNoteConfirm.title || 'Untitled note'}</span>
              {' '}will be permanently deleted. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  deleteDocument(deleteNoteConfirm.id);
                  setDeleteNoteConfirm(null);
                }}
                style={{ flex: 1, padding: '7px 0', background: '#ef4444', border: 'none', borderRadius: 8, fontFamily: FONTS.ui, fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteNoteConfirm(null)}
                style={{ flex: 1, padding: '7px 0', background: 'var(--c-hover)', border: 'none', borderRadius: 8, fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-hi)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extension-change warning */}
      {renameExtWarning && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 24px', maxWidth: 340, boxShadow: '0 16px 48px rgba(0,0,0,0.4)' }}>
            <p style={{ fontFamily: FONTS.ui, fontSize: 12, fontWeight: 700, color: 'var(--c-text-hi)', margin: '0 0 8px' }}>Change file extension?</p>
            <p style={{ fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-lo)', margin: '0 0 16px', lineHeight: 1.5 }}>
              Renaming <span style={{ color: 'var(--c-text-md)' }}>{renameExtWarning.entry.name}</span> to{' '}
              <span style={{ color: '#d4835a' }}>{renameExtWarning.newName}</span> changes the extension.
              The file may no longer open correctly.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { doRename(renameExtWarning.entry, renameExtWarning.newName); setRenameExtWarning(null); }}
                style={{ flex: 1, padding: '7px 0', background: '#d4835a', border: 'none', borderRadius: 8, fontFamily: FONTS.ui, fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
              >
                Rename anyway
              </button>
              <button
                onClick={() => setRenameExtWarning(null)}
                style={{ flex: 1, padding: '7px 0', background: 'var(--c-hover)', border: 'none', borderRadius: 8, fontFamily: FONTS.ui, fontSize: 11, color: 'var(--c-text-hi)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explorer entry context menu */}
      {explorerMenu && (() => {
        const MENU_W = 160;
        const left = Math.min(explorerMenu.x, window.innerWidth - MENU_W - 8);
        const top  = Math.min(explorerMenu.y, window.innerHeight - 80);
        const menuExt = ext(explorerMenu.entry.name);
        const canActOnFile = explorerMenu.entry.kind === 'file' && (IMAGE_EXTS.has(menuExt) || DOC_EXTS.has(menuExt) || CODE_EXTS[menuExt] !== undefined);
        const isDocFile = explorerMenu.entry.kind === 'file' && DOC_EXTS.has(menuExt);
        return (
          <div
            ref={explorerMenuRef}
            style={{ position: 'fixed', left, top, zIndex: 9100, minWidth: MENU_W }}
            className="py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {canActOnFile && (
              <>
                <button
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                  style={{ fontFamily: FONTS.ui }}
                  onClick={() => { setExplorerMenu(null); openFile(explorerMenu.entry); }}
                >
                  <span>{isDocFile ? 'Open note' : 'Place on canvas'}</span>
                  <span className="text-[10px] text-[var(--c-text-off)] ml-3">↵</span>
                </button>
                {isDocFile && (
                  <button
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                    style={{ fontFamily: FONTS.ui }}
                    onClick={() => { setExplorerMenu(null); placeFile(explorerMenu.entry); }}
                  >
                    <span>Place on canvas</span>
                    <span className="text-[10px] text-[var(--c-text-off)] ml-3">drag</span>
                  </button>
                )}
                <div style={{ height: 1, background: 'var(--c-border)', margin: '3px 0' }} />
              </>
            )}
            <button
              className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
              style={{ fontFamily: FONTS.ui }}
              onClick={() => startRename(explorerMenu.entry)}
            >
              <span>Rename</span>
              <span className="text-[10px] text-[var(--c-text-off)] ml-3">F2</span>
            </button>
            <div style={{ height: 1, background: 'var(--c-border)', margin: '3px 0' }} />
            <button
              className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left hover:bg-[rgba(239,68,68,0.12)]"
              style={{ fontFamily: FONTS.ui, color: '#f87171' }}
              onClick={() => startDelete(explorerMenu.entry)}
            >
              <span>Delete</span>
              <span className="text-[10px] ml-3" style={{ color: '#f87171', opacity: 0.6 }}>⌫</span>
            </button>
          </div>
        );
      })()}

      {/* File preview panel */}
      {filePreview && (() => {
        const previewW = 240;
        const rect = panelRef.current?.getBoundingClientRect();
        const panelLeft = rect?.left ?? 0;
        const panelRight = rect?.right ?? WORKSPACE_EXPLORER_WIDTH;
        const spaceRight = window.innerWidth - (panelRight + 8);
        const left = spaceRight >= previewW ? panelRight + 8 : Math.max(8, panelLeft - previewW - 8);
        const top = Math.max(8, Math.min(filePreview.anchorY - 80, window.innerHeight - 260));
        return (
          <div
            style={{
              position: 'fixed',
              left,
              top,
              width: previewW,
              maxHeight: 340,
              zIndex: 200,
              borderRadius: 10,
              border: '1px solid var(--c-border)',
              background: 'var(--c-panel)',
              boxShadow: '0 8px 28px rgba(0,0,0,0.36)',
              overflow: 'hidden',
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Filename bar */}
            <div style={{ padding: '7px 10px', borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
              <span style={{ fontFamily: FONTS.ui, fontSize: 10, fontWeight: 700, color: fileColor(filePreview.entry.name, isDark) }}>
                {filePreview.entry.name}
              </span>
              <span style={{ fontFamily: FONTS.ui, fontSize: 9, color: 'var(--c-text-off)', marginLeft: 6 }}>
                {filePreview.entry.path.slice(0, -1).join('/')}
              </span>
            </div>

            {filePreview.kind === 'image' ? (
              <>
                <div style={{ background: 'rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80, maxHeight: 180, overflow: 'hidden', flexShrink: 0 }}>
                  <img src={filePreview.url} style={{ maxWidth: '100%', maxHeight: 180, display: 'block', objectFit: 'contain' }} alt="" />
                </div>
                <div style={{ padding: '7px 10px', display: 'flex', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontFamily: FONTS.ui, fontSize: 10, fontWeight: 600, color: 'var(--c-text-hi)' }}>{filePreview.natW} × {filePreview.natH}</span>
                  <span style={{ fontFamily: FONTS.ui, fontSize: 10, color: 'var(--c-text-off)' }}>{formatSize(filePreview.size)}</span>
                </div>
              </>
            ) : (
              <div style={{ overflow: 'auto', flex: 1, padding: '6px 0' }}>
                <pre style={{ margin: 0, padding: '0 10px', fontFamily: FONTS.ui, fontSize: 10, lineHeight: 1.5, color: 'var(--c-text-hi)', whiteSpace: 'pre', tabSize: 2 }}>
                  {filePreview.content.split('\n').slice(0, 40).join('\n')}
                  {filePreview.content.split('\n').length > 40 && '\n…'}
                </pre>
              </div>
            )}

            <div style={{ padding: '5px 10px', borderTop: '1px solid var(--c-border)', flexShrink: 0 }}>
              <span style={{ fontFamily: FONTS.ui, fontSize: 9, color: 'var(--c-text-off)' }}>
                {DOC_EXTS.has(ext(filePreview.entry.name))
                  ? 'double-click or ↵ to open note · drag to place'
                  : 'double-click or ↵ to place on canvas'}
              </span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
