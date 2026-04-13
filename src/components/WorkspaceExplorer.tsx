/**
 * VS Code-inspired workspace file explorer.
 * Draggable, horizontally resizable floating panel.
 * Lazy-loads directory contents; click to place files on canvas.
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useBoardStore } from '../store/boardStore';
import { listDirectory, readWorkspaceFile, readWorkspaceFileAsUrl, readWorkspaceFileInfo, getWorkspaceName, openWorkspace, renameEntry, createDirectory, FSA_DIR_SUPPORTED, IN_IFRAME } from '../utils/workspaceManager';
import { FONTS } from '../utils/fonts';
import { placeCodeFile, placeImageFile } from '../utils/canvasPlacement';
import { usePanelGeometry } from '../hooks/usePanelGeometry';
import { useFilePreview } from '../hooks/useFilePreview';
import { useTreeState } from '../hooks/useTreeState';
import {
  SKIP_DIRS,
  IMAGE_EXTS,
  CODE_EXTS,
  ext,
  generateId,
  formatSize,
  fileColor,
  FileIcon,
  TreeEntry,
  buildEntry,
  flatVisible,
} from './explorer/fileTreeUtils';

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
  onFileDblClick,
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
  onFileDblClick: (entry: TreeEntry) => void;
  onContextMenu: (entry: TreeEntry, x: number, y: number) => void;
  onFileDragStart: (entry: TreeEntry, e: React.DragEvent) => void;
  onFileHover: (entry: TreeEntry, clientY: number) => void;
  usedOnCanvas: Set<string>;
  isDark: boolean;
}) {
  const isDir = entry.kind === 'directory';
  const isImage = !isDir && IMAGE_EXTS.has(ext(entry.name));
  const canOpen = !isDir && (CODE_EXTS[ext(entry.name)] !== undefined || isImage);
  const isFocused = focusedPath === entry.path.join('/');
  const isRenaming = renamingPath === entry.path.join('/');
  const tooltip = canOpen
    ? isImage
      ? `${entry.path.join('/')} — hover to preview · drag or double-click to place`
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
      onFileDblClick(entry);
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
    onFileDblClick,
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
          background: isFocused ? 'rgba(99,102,241,0.15)' : undefined,
          outline: isFocused ? '1px solid rgba(99,102,241,0.35)' : undefined,
          outlineOffset: -1,
        }}
        data-focused={isFocused ? 'true' : undefined}
        draggable={isImage && !isRenaming}
        onClick={(e) => handleClick(e.clientY)}
        onDragStart={(e) => { if (isImage && !isRenaming) onFileDragStart(entry, e); else e.preventDefault(); }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(entry, e.clientX, e.clientY); }}
        onMouseEnter={(e) => {
          if (!isImage || isRenaming) return;
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
          <span className="hidden group-hover:inline text-[9px] text-[var(--c-line)] shrink-0" title={isImage ? "drag or double-click to place" : "double-click to place"}>↵</span>
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
          Open a folder to browse files, place images and code snippets on the canvas.
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

// ── Persistent state (survives open/close cycles) ─────────────────────────────
let _savedPos: { x: number; y: number } | null = null;
let _savedWidth = 260;

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  onClose: () => void;
}

export default function WorkspaceExplorer({ onClose }: Props) {
  const workspaceName = useBoardStore((s) => s.workspaceName) ?? getWorkspaceName() ?? 'No folder open';
  const imageAssetFolder = useBoardStore((s) => s.imageAssetFolder);
  const setImageAssetFolder = useBoardStore((s) => s.setImageAssetFolder);
  const pages = useBoardStore((s) => s.pages);
  const activePageId = useBoardStore((s) => s.activePageId);
  const switchPage = useBoardStore((s) => s.switchPage);
  const storeNodes = useBoardStore((s) => s.nodes);
  const pageSnapshots = useBoardStore((s) => s.pageSnapshots);
  const isDark = useBoardStore((s) => s.theme) === 'dark';

  // Hooks for panel geometry, file preview, and tree state
  const { pos, width, onMouseDownHeader, onMouseDownResizer } = usePanelGeometry();
  const panelRef = useRef<HTMLDivElement>(null);
  const { filePreview, showFilePreview, handleFileHover, clearPreview } = useFilePreview(panelRef);
  const {
    tree,
    setTree,
    rootLoading,
    setRootLoading,
    rootError,
    setRootError,
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

  // Local state
  const [pagesSectionOpen, setPagesSectionOpen] = useState(true);
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
  // Explorer context menu (right-click)
  type ExplorerMenu = { entry: TreeEntry; x: number; y: number };
  const [explorerMenu, setExplorerMenu] = useState<ExplorerMenu | null>(null);
  const explorerMenuRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Cleanup on unmount
  useEffect(() => () => {
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current);
  }, []);


  // ── Place file on canvas (double click / Enter) ───────────────────────────
  const placeFile = useCallback(async (entry: TreeEntry) => {
    const e = ext(entry.name);
    if (IMAGE_EXTS.has(e)) {
      await placeImageFile(entry.path);
    } else if (CODE_EXTS[e] !== undefined) {
      await placeCodeFile(entry.path);
    }
  }, []);

  const handleFileSingleClick = useCallback((entry: TreeEntry, clientY: number) => {
    const idx = visibleEntriesRef.current.findIndex((e) => e.path.join('/') === entry.path.join('/'));
    if (idx !== -1) setFocusedIdx(idx);
    showFilePreview(entry, clientY);
  }, [showFilePreview]);

  const handleFileDblClick = useCallback((entry: TreeEntry) => {
    clearPreview();
    placeFile(entry);
  }, [placeFile, clearPreview]);

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
    }
    return paths;
  }, [storeNodes, pageSnapshots]);

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
    const panelMidY = pos.y + Math.min(520, window.innerHeight - pos.y - 16) / 2;
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
      } else {
        clearPreview();
        placeFile(entry);
      }
    } else if (e.key === 'F2') {
      if (focusedIdx === null) return;
      const entry = visibleEntries[focusedIdx];
      if (entry) { e.preventDefault(); startRename(entry); }
    } else if (e.key === 'Escape') {
      setExplorerMenu(null);
      setFocusedIdx(null);
      clearPreview();
    }
  }, [visibleEntries, focusedIdx, handleToggle, placeFile, startRename]);

  const panelHeight = Math.min(520, window.innerHeight - pos.y - 16);

  return (
    <div
      ref={panelRef}
      className="flex flex-col select-none"
      style={{
        position: 'fixed',
        top: pos.y,
        left: pos.x,
        width,
        height: panelHeight,
        zIndex: 180,
        borderRadius: 12,
        border: '1px solid var(--c-border)',
        background: 'var(--c-panel)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Header — drag handle */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px 8px',
          borderBottom: '1px solid var(--c-border)',
          flexShrink: 0,
          borderRadius: '12px 12px 0 0',
          cursor: 'grab',
        }}
        onMouseDown={onMouseDownHeader}
        className="active:cursor-grabbing"
      >
        <span style={{ fontFamily: FONTS.ui, fontSize: 12, fontWeight: 600, color: 'var(--c-text-hi)', letterSpacing: '0.04em' }}>
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

      {/* Workspace root label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderBottom: '1px solid var(--c-border)', flexShrink: 0, overflow: 'hidden' }}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
          <path d="M1 2.5a1 1 0 0 1 1-1h1.8L5 3H8.5a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2.5z" fill="rgba(212, 131, 90, 0.2)" stroke="#d4835a" strokeWidth="1" strokeLinejoin="round" />
        </svg>
        <span
          style={{ fontFamily: FONTS.ui, fontSize: 10, fontWeight: 700, color: 'var(--c-text-hi)', textTransform: 'uppercase', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
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
              padding: '5px 12px', background: 'none', border: 'none',
              cursor: 'pointer', userSelect: 'none',
            }}
          >
            <span style={{
              fontSize: 9, color: 'var(--c-text-off)',
              transform: pagesSectionOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.12s',
              display: 'inline-block',
            }}>▾</span>
            <span style={{
              fontFamily: FONTS.ui, fontSize: 9,
              fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--c-text-off)',
            }}>Pages</span>
            <span style={{
              marginLeft: 'auto', fontFamily: FONTS.ui, fontSize: 9,
              color: 'var(--c-text-off)', opacity: 0.6,
            }}>{pages.length}</span>
          </button>

          {pagesSectionOpen && (
            <div style={{ paddingBottom: 3 }}>
              {pages.map((page) => {
                const isActive = page.id === activePageId;
                return (
                  <button
                    key={page.id}
                    onClick={() => switchPage(page.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center',
                      gap: 7, padding: '3px 12px 3px 18px',
                      background: isActive ? 'rgba(99,102,241,0.13)' : 'none',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                      outline: isActive ? '1px solid rgba(99,102,241,0.28)' : 'none',
                      outlineOffset: -1, borderRadius: 4,
                    }}
                    className="hover:bg-[var(--c-hover)]"
                    title={`Switch to "${page.name}"`}
                  >
                    <span style={{
                      width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                      background: isActive ? 'var(--c-line)' : 'var(--c-border)',
                      transition: 'background 0.12s',
                    }} />
                    <span style={{
                      fontFamily: FONTS.ui, fontSize: 11,
                      color: isActive ? 'var(--c-text-hi)' : 'var(--c-text-lo)',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', flex: 1,
                    }}>
                      {page.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Search bar */}
      {getWorkspaceName() && (
        <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--c-border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink: 0, opacity: 0.45 }}>
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
            placeholder="Search files…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: FONTS.ui,
              fontSize: 11,
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
      )}

      {/* File tree */}
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
        ) : !getWorkspaceName() ? (
          <NoWorkspaceState onOpen={handleOpenFolder} />
        ) : searchResults !== null ? (
          searchResults.length === 0 ? (
            <div style={{ padding: '10px 16px', fontSize: 10, color: 'var(--c-text-lo)', fontFamily: FONTS.ui, fontStyle: 'italic' }}>No matches</div>
          ) : (
            searchResults.map((entry) => (
              <TreeRow key={entry.path.join('/')} entry={entry} depth={0} focusedPath={focusedPath} renamingPath={renamingPath} renameDraft={renameDraft} onRenameDraftChange={setRenameDraft} onRenameCommit={commitRename} onRenameCancel={() => setRenamingPath(null)} onToggle={handleToggle} onFileSingleClick={handleFileSingleClick} onFileDblClick={handleFileDblClick} onContextMenu={handleEntryContextMenu} onFileDragStart={handleFileDragStart} onFileHover={handleFileHover} usedOnCanvas={usedOnCanvas} isDark={isDark} />
            ))
          )
        ) : tree.length === 0 ? (
          <div style={{ padding: '10px 16px', fontSize: 10, color: 'var(--c-text-lo)', fontFamily: FONTS.ui, fontStyle: 'italic' }}>Folder is empty</div>
        ) : (
          tree.map((entry) => (
            <TreeRow key={entry.path.join('/')} entry={entry} depth={0} focusedPath={focusedPath} renamingPath={renamingPath} renameDraft={renameDraft} onRenameDraftChange={setRenameDraft} onRenameCommit={commitRename} onRenameCancel={() => setRenamingPath(null)} onToggle={handleToggle} onFileSingleClick={handleFileSingleClick} onFileDblClick={handleFileDblClick} onContextMenu={handleEntryContextMenu} onFileDragStart={handleFileDragStart} onFileHover={handleFileHover} usedOnCanvas={usedOnCanvas} isDark={isDark} />
          ))
        )}
      </div>

      {/* Default save folder — only shown when a workspace is open */}
      {getWorkspaceName() && (
        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--c-border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
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
              <span style={{ fontFamily: FONTS.ui, fontSize: 10, color: 'var(--c-text-off)', flex: 1 }}>
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

      {/* Footer hint */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--c-border)', flexShrink: 0, borderRadius: '0 0 12px 12px' }}>
        <p style={{ fontSize: 9, color: 'var(--c-text-lo)', fontFamily: FONTS.ui, lineHeight: 1.4, margin: 0 }}>
          Single-click to preview · drag or double-click (↵) to place · ↑↓ navigate
        </p>
      </div>

      {/* Right-edge resize handle */}
      <div
        onMouseDown={onMouseDownResizer}
        style={{ position: 'absolute', top: 12, right: -3, bottom: 12, width: 6, cursor: 'ew-resize', borderRadius: 3 }}
        title="Drag to resize"
      />

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
        return (
          <div
            ref={explorerMenuRef}
            style={{ position: 'fixed', left, top, zIndex: 9100, minWidth: MENU_W }}
            className="py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
              style={{ fontFamily: FONTS.ui }}
              onClick={() => startRename(explorerMenu.entry)}
            >
              <span>Rename</span>
              <span className="text-[10px] text-[var(--c-text-off)] ml-3">F2</span>
            </button>
          </div>
        );
      })()}

      {/* File preview panel */}
      {filePreview && (() => {
        const previewW = 240;
        const spaceRight = window.innerWidth - (pos.x + width + 8);
        const left = spaceRight >= previewW ? pos.x + width + 8 : pos.x - previewW - 8;
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
              <span style={{ fontFamily: FONTS.ui, fontSize: 9, color: 'var(--c-text-off)' }}>double-click or ↵ to place on canvas</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
