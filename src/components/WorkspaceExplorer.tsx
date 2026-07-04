/**
 * VS Code-inspired workspace file explorer.
 * Draggable, horizontally resizable floating panel.
 * Lazy-loads directory contents; opens note files and places assets on canvas.
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useBoardStore } from '../store/boardStore';
import { useAuth } from '../contexts/AuthContext';
import type { CanvasNode, Document, ImageNode, PageMeta } from '../types';
import { listDirectory, getWorkspaceName, IS_TAURI, revealInFinder, saveWorkspace, type LocalRecentWorkspace, type WorkspaceOpenResult } from '../utils/workspaceManager';
import { FONTS } from '../utils/fonts';
import { placeCodeFile, placeImageFile, placeDocumentFile, openDocumentFile } from '../utils/canvasPlacement';
import { stripHtmlPreview } from '../utils/documentExport';
import { toast } from '../utils/toast';
import { applyWorkspaceSyncFromOpenResult } from '../utils/applyWorkspaceSync';
import { promptAndImportMarkdownNotes } from '../utils/noteImport';
import { useFilePreview } from '../hooks/useFilePreview';
import { useTreeState } from '../hooks/useTreeState';
import { IconArrowRight, IconCanvasDoc, IconCloud, IconDoc, IconFolder } from './icons';
import { DARK_MENU_COLORS } from './darkMenuTheme';
import {
  SKIP_DIRS,
  IMAGE_EXTS,
  CODE_EXTS,
  DOC_EXTS,
  ext,
  generateId,
  TreeEntry,
  buildEntry,
  buildVirtualCloudTree,
  flatVisible,
  isVisibleInAssets,
  isWorkspaceManagedEntry,
} from './explorer/fileTreeUtils';
import {
  NoWorkspaceState,
} from './explorer/WorkspaceExplorerParts';
import { isCanvasDocument, relativeTime, sortDocumentsForExplorer, wordCountFromPreviewText } from './explorer/workspaceExplorerUtils';
import { CanvasHoverThumbnail, NoteHoverThumbnail } from './explorer/WorkspaceExplorerThumbnails';
import WorkspaceExplorerPagePreview, { type PagePreview } from './explorer/WorkspaceExplorerPagePreview';
import WorkspaceExplorerNotePreview, { type NotePreview } from './explorer/WorkspaceExplorerNotePreview';
import WorkspaceExplorerProjectRenameDialog from './explorer/WorkspaceExplorerProjectRenameDialog';
import WorkspaceExplorerConfirmDialog from './explorer/WorkspaceExplorerConfirmDialog';
import WorkspaceExplorerPreferencesDialog from './explorer/WorkspaceExplorerPreferencesDialog';
import WorkspaceExplorerSearchBar from './explorer/WorkspaceExplorerSearchBar';
import WorkspaceExplorerFilePreview from './explorer/WorkspaceExplorerFilePreview';
import WorkspaceExplorerEntryMenu from './explorer/WorkspaceExplorerEntryMenu';
import WorkspaceExplorerFooter from './explorer/WorkspaceExplorerFooter';
import WorkspaceExplorerFavoritesSection from './explorer/WorkspaceExplorerFavoritesSection';
import WorkspaceExplorerFoldersSection from './explorer/WorkspaceExplorerFoldersSection';
import WorkspaceExplorerHeader from './explorer/WorkspaceExplorerHeader';
import WorkspaceExplorerMissingImagesControl from './explorer/WorkspaceExplorerMissingImagesControl';
import { useWorkspaceExplorerNavigation } from '../hooks/useWorkspaceExplorerNavigation';
import { useWorkspaceExplorerProjectActions } from '../hooks/useWorkspaceExplorerProjectActions';
import { useWorkspaceExplorerMissingImages } from '../hooks/useWorkspaceExplorerMissingImages';
import { useWorkspaceExplorerFileActions } from '../hooks/useWorkspaceExplorerFileActions';
import { useWorkspaceExplorerRenameDelete } from '../hooks/useWorkspaceExplorerRenameDelete';

const SIDEBAR_SELECTABLE_ROW_HEIGHT = 24;

const ADVANCED_FILES_STORAGE_KEY = 'devboard-advanced-files-visible';

export const WORKSPACE_EXPLORER_WIDTH = 240;

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  onClose: () => void;
  onCollapse: () => void;
  onToggleSearch: () => void;
  onToggleTimer: () => void;
  onToggleJira: () => void;
  onExportBoardPng: () => void;
  canClose?: boolean;
  collapseIcon?: 'close' | 'open';
}

export default function WorkspaceExplorer({
  onClose,
  onCollapse,
  onToggleSearch,
  onToggleTimer,
  onToggleJira,
  onExportBoardPng,
  canClose = true,
  collapseIcon = 'close',
}: Props) {
  const isPreviewPanel = collapseIcon === 'open';
  const { isConfigured: authConfigured, isLoading: authLoading, user } = useAuth();
  const imageAssetFolder = useBoardStore((s) => s.imageAssetFolder);
  const boardTitle = useBoardStore((s) => s.boardTitle);
  const setBoardTitle = useBoardStore((s) => s.setBoardTitle);
  const cloudBoardId = useBoardStore((s) => s.cloudBoardId);
  const cloudBoardTitle = useBoardStore((s) => s.cloudBoardTitle);
  const cloudSyncedAt = useBoardStore((s) => s.cloudSyncedAt);
  const lastLocalSavedAt = useBoardStore((s) => s.lastLocalSavedAt);
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
  const addCanvasDocument = useBoardStore((s) => s.addCanvasDocument);
  const addNode = useBoardStore((s) => s.addNode);
  const updateNode = useBoardStore((s) => s.updateNode);
  const updateDocument = useBoardStore((s) => s.updateDocument);
  const toggleFavoriteDocument = useBoardStore((s) => s.toggleFavoriteDocument);
  const deleteDocument = useBoardStore((s) => s.deleteDocument);
  const openDocument = useBoardStore((s) => s.openDocument);
  const openCanvasDocument = useBoardStore((s) => s.openCanvasDocument);
  const storeNodes = useBoardStore((s) => s.nodes);
  const pageSnapshots = useBoardStore((s) => s.pageSnapshots);
  const theme = useBoardStore((s) => s.theme);
  const toggleTheme = useBoardStore((s) => s.toggleTheme);
  const noteAutosaveEnabled = useBoardStore((s) => s.noteAutosaveEnabled);
  const setNoteAutosaveEnabled = useBoardStore((s) => s.setNoteAutosaveEnabled);
  const isDark = theme === 'dark';

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
  const pendingLocalWorkspaceName = useBoardStore((s) => s.pendingLocalWorkspaceName);
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
  const [favoritesSectionOpen, setFavoritesSectionOpen] = useState(true);
  const [assetsSectionOpen] = useState(false);
  const [cloudExpandedPaths, setCloudExpandedPaths] = useState<Record<string, boolean>>({
    assets: true,
    notes: true,
    pages: false,
  });
  const [advancedFilesVisible, setAdvancedFilesVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(ADVANCED_FILES_STORAGE_KEY) === '1';
  });
  const [collapsedPageIds, setCollapsedPageIds] = useState<Record<string, boolean>>({});
  const [confirmingClose, setConfirmingClose] = useState(false);
  const confirmCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commandMenuRef = useRef<HTMLDivElement>(null);
  const [coarsePointer, setCoarsePointer] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [pagePreview, setPagePreview] = useState<PagePreview | null>(null);
  const [notePreview, setNotePreview] = useState<NotePreview | null>(null);
  const clearPagePreview = useCallback(() => {
    setPagePreview(null);
  }, []);
  const clearNotePreview = useCallback(() => {
    setNotePreview(null);
  }, []);
  const [deletePageConfirm, setDeletePageConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleteNoteConfirm, setDeleteNoteConfirm] = useState<Document | null>(null);
  const [missingImagesOpen, setMissingImagesOpen] = useState(false);
  const [missingImagesFixing, setMissingImagesFixing] = useState(false);
  const missingImagesPopoverRef = useRef<HTMLDivElement>(null);
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);
  const [projectSwitcherLoading, setProjectSwitcherLoading] = useState(false);
  const [projectSwitcherRecents, setProjectSwitcherRecents] = useState<LocalRecentWorkspace[]>([]);
  const [projectMenu, setProjectMenu] = useState<{ x: number; y: number } | null>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const projectSwitcherRef = useRef<HTMLDivElement>(null);
  const [projectRenameOpen, setProjectRenameOpen] = useState(false);
  const [projectRenameDraft, setProjectRenameDraft] = useState('');
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  // Explorer context menu (right-click)
  type ExplorerMenu = { entry: TreeEntry; x: number; y: number };
  const [explorerMenu, setExplorerMenu] = useState<ExplorerMenu | null>(null);
  const explorerMenuRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const workspaceDisplayName = useMemo(() => {
    const projectTitle = boardTitle.trim();
    const workspaceTitle = storeWorkspaceName || getWorkspaceName();
    return projectTitle || cloudBoardTitle || workspaceTitle || 'Untitled Project';
  }, [boardTitle, cloudBoardTitle, storeWorkspaceName]);
  const activeDocumentForMenu = useMemo(
    () => documents.find((doc) => doc.id === activeDocId) ?? null,
    [activeDocId, documents],
  );
  const ignoredMissingImagesSignature = useBoardStore((s) => s.workspacePreferences.ignoredMissingImagesSignature ?? null);
  const hasLocalWorkspace = !!(storeWorkspaceName || getWorkspaceName());
  const hasWorkspaceContext = hasLocalWorkspace || !!cloudBoardId;
  const cloudOnlyWorkspace = !hasLocalWorkspace && !!cloudBoardId;
  const missingImages = useMemo(
    () => storeNodes.filter((node): node is ImageNode => node.type === 'image' && !!node.assetName && !node.src),
    [storeNodes]
  );
  const hasUnsyncedSyncChanges = !!user && !!cloudBoardId && !!lastLocalSavedAt && !!cloudSyncedAt && lastLocalSavedAt > cloudSyncedAt + 1000;
  const syncStatus = authLoading
    ? {
      label: 'Checking',
      title: 'Checking cloud sync status.',
      tone: 'neutral' as const,
    }
    : !user && !!cloudBoardId
      ? {
        label: 'Sync paused',
        title: `This project is linked to cloud storage${cloudBoardTitle ? ` as "${cloudBoardTitle}"` : ''}, but you are signed out.`,
        tone: 'warning' as const,
      }
      : hasUnsyncedSyncChanges
        ? {
          label: 'Unsynced',
          title: 'Local changes are newer than the last cloud sync.',
          tone: 'warning' as const,
        }
        : cloudOnlyWorkspace
          ? {
            label: 'Cloud only',
            title: `This project is saved in cloud storage${cloudBoardTitle ? ` as "${cloudBoardTitle}"` : ''}, but no local folder is attached on this device.`,
            tone: 'cloud' as const,
          }
          : cloudBoardId
            ? {
              label: 'Synced',
              title: `This project is linked to cloud storage${cloudBoardTitle ? ` as "${cloudBoardTitle}"` : ''}.`,
              tone: 'success' as const,
            }
            : {
              label: 'Local only',
              title: 'This project is only saved locally right now.',
              tone: 'neutral' as const,
            };
  const accountStatus = authLoading
    ? 'Checking...'
    : hasUnsyncedSyncChanges
      ? 'Unsynced'
      : cloudBoardId
        ? 'Saved'
        : 'Saved';
  const bottomSyncStatus = authLoading
    ? null
    : !user && !!cloudBoardId
      ? { label: 'Not saved — offline', tone: 'danger' as const, title: syncStatus.title }
      : syncStatus.label === 'Cloud copy newer'
        ? { label: 'Cloud copy is newer — review', tone: 'warning' as const, title: syncStatus.title }
      : hasUnsyncedSyncChanges
        ? { label: 'Not saved — offline', tone: 'danger' as const, title: syncStatus.title }
      : cloudOnlyWorkspace
          ? { label: 'Synced to cloud', tone: 'success' as const, title: syncStatus.title }
          : !cloudBoardId
          ? { label: 'Working locally', tone: 'success' as const, title: 'This project is saved locally on this device.' }
            : { label: 'Synced to cloud', tone: 'success' as const, title: syncStatus.title };
  const footerSyncDot = bottomSyncStatus
    ? {
      label: bottomSyncStatus.label,
      title: bottomSyncStatus.title,
      tone: bottomSyncStatus.tone,
      color: bottomSyncStatus.tone === 'danger'
        ? '#ef4444'
        : bottomSyncStatus.tone === 'warning'
          ? '#d97706'
          : bottomSyncStatus.tone === 'success'
            ? '#4aa878'
            : '#b6b6b1',
      textColor: bottomSyncStatus.tone === 'danger'
        ? '#c93636'
        : bottomSyncStatus.tone === 'warning'
          ? '#a05a00'
          : bottomSyncStatus.tone === 'success'
            ? 'var(--c-text-hi)'
            : 'var(--c-text-md)',
    }
    : null;
  const openCloudModal = useCallback((tab: 'workspace' | 'library' = 'workspace') => {
    window.dispatchEvent(new CustomEvent('devboard:open-cloud-modal', { detail: { tab } }));
  }, []);

  const closeSidebarMenus = useCallback((keep?: 'command' | 'missingImages' | 'projectSwitcher' | 'preferences') => {
    if (keep !== 'missingImages') setMissingImagesOpen(false);
    if (keep !== 'projectSwitcher') setProjectSwitcherOpen(false);
    if (keep !== 'preferences') setPreferencesOpen(false);
    setProjectMenu(null);
  }, []);

  const openPreferences = useCallback(() => {
    closeSidebarMenus('preferences');
    setPreferencesOpen(true);
  }, [closeSidebarMenus]);

  useEffect(() => {
    window.addEventListener('devboard:open-preferences', openPreferences);
    return () => window.removeEventListener('devboard:open-preferences', openPreferences);
  }, [openPreferences]);

  const missingImagePath = useCallback((image: ImageNode): string => {
    const folder = image.assetFolder ?? imageAssetFolder ?? 'assets';
    return folder ? `${folder}/${image.assetName}` : image.assetName ?? 'missing image';
  }, [imageAssetFolder]);
  const missingImagesSignature = useMemo(
    () => missingImages
      .map((image) => `${image.id}:${missingImagePath(image)}`)
      .sort((a, b) => a.localeCompare(b))
      .join('|'),
    [missingImages, missingImagePath]
  );
  const missingImagesSuppressed = missingImages.length > 0
    && !!ignoredMissingImagesSignature
    && ignoredMissingImagesSignature === missingImagesSignature;

  // Cleanup on unmount
  useEffect(() => () => {
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ADVANCED_FILES_STORAGE_KEY, advancedFilesVisible ? '1' : '0');
  }, [advancedFilesVisible]);

  useEffect(() => {
    if (!missingImagesOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (missingImagesPopoverRef.current?.contains(e.target as Node)) return;
      setMissingImagesOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMissingImagesOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [missingImagesOpen]);

  useEffect(() => {
    if (!projectSwitcherOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (projectSwitcherRef.current?.contains(e.target as Node)) return;
      setProjectSwitcherOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProjectSwitcherOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [projectSwitcherOpen]);

  useEffect(() => {
    if (!projectMenu) return;
    const onMouseDown = (e: MouseEvent) => {
      if (projectMenuRef.current?.contains(e.target as Node)) return;
      setProjectMenu(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProjectMenu(null);
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [projectMenu]);

  useEffect(() => {
    if (missingImages.length === 0 || missingImagesSuppressed) setMissingImagesOpen(false);
  }, [missingImages.length, missingImagesSuppressed]);

  useEffect(() => {
    if (missingImages.length !== 0 || !ignoredMissingImagesSignature) return;
    useBoardStore.getState().setIgnoredMissingImagesSignature(null);
    if (hasWorkspaceContext) {
      void saveWorkspace(useBoardStore.getState().exportData(), { notify: false });
    }
  }, [hasWorkspaceContext, ignoredMissingImagesSignature, missingImages.length]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(pointer: coarse)');
    const sync = () => setCoarsePointer(media.matches);
    sync();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync);
      return () => media.removeEventListener('change', sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
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
      if (isWorkspaceManagedEntry(entry)) {
        toast('Opening from Folders. Notes are read-only in Asset files; edit them from the Folders section above.');
      }
      await openDocumentFile(entry.path);
    } else {
      await placeFile(entry);
    }
  }, [placeFile]);

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const reloadWorkspaceRootTree = useCallback(() => {
    setRootLoading(true);
    setRootError(null);
    listDirectory([])
      .then((entries) => {
        const filtered = entries.filter((entry) => !entry.name.startsWith('.') && !(entry.kind === 'directory' && SKIP_DIRS.has(entry.name)));
        setTree(filtered.map((entry) => buildEntry(entry.name, entry.kind, [])));
        setRootLoading(false);
      })
      .catch((err) => {
        setRootError(`Failed to read folder: ${err?.message ?? err}`);
        setRootLoading(false);
      });
  }, [setTree]);

  const applyOpenedWorkspaceResult = useCallback((result: WorkspaceOpenResult) => {
    setMissingImagesOpen(false);
    setProjectSwitcherOpen(false);
    useBoardStore.getState().setWorkspaceName?.(result.name);
    // A folder with no existing workspace.json still needs the old board cleared —
    // otherwise the previously open project's pages/notes stay visible under the new name.
    if (result.data) {
      useBoardStore.getState().loadBoard(result.data);
    } else {
      useBoardStore.getState().loadBoard({ boardTitle: result.name, nodes: [] });
    }
    applyWorkspaceSyncFromOpenResult(result);
    reloadWorkspaceRootTree();
  }, [reloadWorkspaceRootTree]);

  const {
    handleOpenFolder,
    handleReconnectWorkspace,
    loadProjectSwitcherRecents,
    handleToggleProjectSwitcher,
    handleOpenProjectsLibrary,
    beginProjectRename,
    commitProjectRename,
    handleOpenRecentProject,
    handleRelocateRecentProject,
  } = useWorkspaceExplorerProjectActions({
    workspaceDisplayName,
    projectSwitcherOpen,
    projectRenameDraft,
    setProjectMenu,
    setProjectRenameDraft,
    setProjectRenameOpen,
    setProjectSwitcherOpen,
    setProjectSwitcherLoading,
    setProjectSwitcherRecents,
    setBoardTitle,
    applyOpenedWorkspaceResult,
    closeSidebarMenus,
    openCloudModal,
  });

  const {
    handleFindMissingImages,
    handleIgnoreMissingImages,
  } = useWorkspaceExplorerMissingImages({
    missingImages,
    missingImagesFixing,
    missingImagesSignature,
    hasWorkspaceContext,
    imageAssetFolder,
    setMissingImagesOpen,
    setMissingImagesFixing,
    updateNode,
  });

  const {
    deleteConfirm,
    setDeleteConfirm,
    renameExtWarning,
    setRenameExtWarning,
    startRename,
    doRename,
    doDelete,
    startDelete,
  } = useWorkspaceExplorerRenameDelete({
    cloudOnlyWorkspace,
    setExplorerMenu,
    setTree,
  });

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
    const canvasPageIds = new Set(documents.filter((doc) => doc.docType === 'canvas' && doc.canvasPageId).map((doc) => doc.canvasPageId));
    for (const page of pages) {
      if (!page.isCanvasDocument && !canvasPageIds.has(page.id)) docsByPage.set(page.id, []);
    }
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

  const folderPages = useMemo(() => {
    const canvasPageIds = new Set(documents.filter((doc) => doc.docType === 'canvas' && doc.canvasPageId).map((doc) => doc.canvasPageId));
    return pages.filter((page) => !page.isCanvasDocument && !canvasPageIds.has(page.id));
  }, [documents, pages]);

  // A previously-picked workspace handle exists but its permission lapsed (browsers
  // demote directory-handle grants across sessions). The last-synced folder tree is
  // still sitting in persisted local state, so show it dimmed instead of a blank card.
  const isReconnectPending = !!pendingLocalWorkspaceName && folderPages.length > 0;

  const favoriteDocs = useMemo(
    () => documents.filter((doc) => doc.isFavorite).sort((a, b) => b.updatedAt - a.updatedAt),
    [documents]
  );
  const visibleFavoriteDocs = useMemo(() => favoriteDocs.slice(0, 5), [favoriteDocs]);

  const getPageNodes = useCallback((pageId: string) => {
    if (pageId === activePageId) return storeNodes;
    return pageSnapshots[pageId]?.nodes ?? [];
  }, [activePageId, pageSnapshots, storeNodes]);
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
    openDocument(docId);
  }, [activePageId, addDocument, documents, openDocument, pages, switchPage]);

  const createCanvasForPage = useCallback((pageId: string) => {
    addCanvasDocument(pageId);
  }, [addCanvasDocument]);

  const handleCreateNoteFromMenu = useCallback(() => {
    const activePage = pages.find((entry) => entry.id === activePageId);
    createNoteForPage(activePage?.isCanvasDocument ? (activePage.parentPageId ?? activePageId) : activePageId);
  }, [activePageId, createNoteForPage, pages]);

  const handleCreateCanvasFromMenu = useCallback(() => {
    const activePage = pages.find((entry) => entry.id === activePageId);
    createCanvasForPage(activePage?.isCanvasDocument ? (activePage.parentPageId ?? activePageId) : activePageId);
  }, [activePageId, createCanvasForPage, pages]);

  const openDocumentFromShortcut = useCallback((doc: Document) => {
    if (isCanvasDocument(doc)) {
      openCanvasDocument(doc.id);
      return;
    }
    if (doc.pageId && doc.pageId !== activePageId) switchPage(doc.pageId);
    openDocument(doc.id);
  }, [activePageId, openCanvasDocument, openDocument, switchPage]);

  const toggleFavoriteFromExplorer = useCallback((doc: Document) => {
    toggleFavoriteDocument(doc.id);
    if (getWorkspaceName()) {
      window.setTimeout(() => {
        void saveWorkspace(useBoardStore.getState().exportData(), { notify: false });
      }, 0);
    }
  }, [toggleFavoriteDocument]);

  const addDocumentToActiveCanvas = useCallback((doc: Document) => {
    const activePage = pages.find((page) => page.id === activePageId);
    const activeCanvasDoc = documents.find((entry) => entry.docType === 'canvas' && entry.canvasPageId === activePageId);
    if (isCanvasDocument(doc)) return;
    if (!activePage?.isCanvasDocument && !activeCanvasDoc) {
      toast('Open a canvas first');
      return;
    }
    const { camera } = useBoardStore.getState();
    const cx = (window.innerWidth / 2 - camera.x) / camera.scale;
    const cy = (window.innerHeight / 2 - camera.y) / camera.scale;
    addNode({
      id: generateId(),
      type: 'document',
      x: cx - 140,
      y: cy - 88,
      width: 280,
      height: 176,
      docId: doc.id,
    });
  }, [activePageId, addNode, documents, pages]);

  const renameDocumentFromExplorer = useCallback((docId: string, title: string) => {
    updateDocument(docId, { title });
  }, [updateDocument]);

  const renamePageFromExplorer = useCallback((pageId: string, name: string) => {
    const nextName = name.trim();
    if (!nextName) return;
    renamePage(pageId, nextName);
    if (getWorkspaceName()) {
      window.setTimeout(() => {
        void saveWorkspace(useBoardStore.getState().exportData(), { notify: false });
      }, 0);
    }
  }, [renamePage]);

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

  const showPagePreview = useCallback((page: PageMeta, anchorY: number) => {
    clearPreview();
    setNotePreview(null);
    setPagePreview({
      kind: 'page',
      page,
      docs: pageDocs.get(page.id) ?? [],
      nodes: getPageNodes(page.id),
      anchorY,
    });
  }, [clearPreview, getPageNodes, pageDocs]);

  const showNotePreview = useCallback((page: PageMeta, doc: Document, anchorY: number) => {
    clearPreview();
    setPagePreview(null);
    setNotePreview({
      kind: 'note',
      page,
      doc,
      anchorY,
    });
  }, [clearPreview]);

  const showShortcutNotePreview = useCallback((doc: Document, anchorY: number) => {
    const page = pages.find((entry) => entry.id === doc.pageId) ?? pages.find((entry) => entry.id === activePageId) ?? pages[0];
    if (!page) return;
    showNotePreview(page, doc, anchorY);
  }, [activePageId, pages, showNotePreview]);

  const cloudTree = useMemo(() => buildVirtualCloudTree({
    pages,
    documents,
    nodes: storeNodes,
    pageSnapshots,
    expandedPaths: new Set(
      Object.entries(cloudExpandedPaths)
        .filter(([, expanded]) => expanded)
        .map(([path]) => path)
    ),
  }), [cloudExpandedPaths, documents, pageSnapshots, pages, storeNodes]);

  const handleAssetToggle = useCallback((path: string[]) => {
    if (!cloudOnlyWorkspace) {
      handleToggle(path);
      return;
    }
    const key = path.join('/');
    setCloudExpandedPaths((prev) => ({ ...prev, [key]: !prev[key] }));
  }, [cloudOnlyWorkspace, handleToggle]);

  const {
    searchQuery,
    setSearchQuery,
    searchOpen,
    setSearchOpen,
    setFocusedIdx,
    focusAssetPath,
    focusPage,
    focusDocument,
    handleKeyDown,
    focusedPageId,
    focusedDocId,
  } = useWorkspaceExplorerNavigation({
    tree,
    cloudTree,
    cloudOnlyWorkspace,
    advancedFilesVisible,
    pages,
    documents,
    activePageId,
    pageDocs,
    folderPages,
    pagesSectionOpen,
    assetsSectionOpen,
    collapsedPageIds,
    panelRef,
    visibleEntriesRef,
    showFilePreview,
    clearPreview,
    clearPagePreview,
    switchPage,
    openCanvasDocument,
    openDocument,
    openFile,
    placeFile,
    handleAssetToggle,
    startDelete,
    startRename,
  });

  const {
    handleFileOpen,
    handleFileDragStart,
    handleFileSingleClick,
  } = useWorkspaceExplorerFileActions({
    filePreview,
    clearPreview,
    clearPagePreview,
    clearNotePreview,
    focusAssetPath,
    openFile,
    showFilePreview,
  });

  const openWorkspaceNameMenu = useCallback((x: number, y: number) => {
    setProjectSwitcherOpen(false);
    closeSidebarMenus();
    setProjectMenu({ x, y });
  }, [closeSidebarMenus]);

  return (
    <>
    <div
      ref={panelRef}
      className="flex flex-col select-none"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        background: 'var(--c-sidebar)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseDownCapture={(e) => {
        const target = e.target as Node;
        if (missingImagesPopoverRef.current?.contains(target)) return;
        closeSidebarMenus();
      }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <WorkspaceExplorerHeader
        isPreviewPanel={isPreviewPanel}
        workspaceDisplayName={workspaceDisplayName}
        commandMenuRef={commandMenuRef}
        activeDocumentForMenu={activeDocumentForMenu}
        projectSwitcherRecents={projectSwitcherRecents}
        onToggleSearch={onToggleSearch}
        onToggleTimer={onToggleTimer}
        onToggleJira={onToggleJira}
        onExportBoardPng={onExportBoardPng}
        onOpenFolder={() => { void handleOpenFolder(); }}
        onOpenRecentProject={(project) => { void handleOpenRecentProject(project); }}
        onOpenProjectsLibrary={handleOpenProjectsLibrary}
        onOpenCloudModal={() => openCloudModal()}
        onOpenPreferences={openPreferences}
        onOpenGetStarted={() => window.dispatchEvent(new CustomEvent('devboard:open-get-started'))}
        onCloseSidebarMenus={closeSidebarMenus}
        onLoadProjectSwitcherRecents={loadProjectSwitcherRecents}
        onCreateNote={handleCreateNoteFromMenu}
        onCreateCanvas={handleCreateCanvasFromMenu}
        onCreateFolder={() => addPage()}
        onImportMarkdown={() => { void promptAndImportMarkdownNotes(); }}
        onSaveWorkspace={() => void saveWorkspace(useBoardStore.getState().exportData())}
        onRenameWorkspace={beginProjectRename}
        onWorkspaceNameContextMenu={openWorkspaceNameMenu}
        onCollapse={onCollapse}
      />
      {hasWorkspaceContext && (
        <WorkspaceExplorerSearchBar
          open={searchOpen}
          value={searchQuery}
          inputRef={searchInputRef}
          onOpen={() => setSearchOpen(true)}
          onChange={setSearchQuery}
          onClose={() => setSearchOpen(false)}
          onSearchKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setSearchOpen(false);
              setSearchQuery('');
              searchInputRef.current?.blur();
              return;
            }
            if (['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) handleKeyDown(e as unknown as React.KeyboardEvent<HTMLInputElement>);
          }}
          onCloseSidebarMenus={closeSidebarMenus}
        />
      )}

      {!hasWorkspaceContext && !isReconnectPending && (
        <NoWorkspaceState
          onOpen={() => { void handleOpenFolder(); }}
          pendingWorkspaceName={pendingLocalWorkspaceName}
          onReconnect={() => { void handleReconnectWorkspace(); }}
        />
      )}

      {hasWorkspaceContext && missingImages.length > 0 && !missingImagesSuppressed && (
        <div style={{ flexShrink: 0, padding: '0 10px 8px', position: 'relative' }}>
          <WorkspaceExplorerMissingImagesControl
            ref={missingImagesPopoverRef}
            open={missingImagesOpen}
            missingImages={missingImages}
            missingImagesFixing={missingImagesFixing}
            missingImagePath={missingImagePath}
            backgroundTone="warning"
            popoverPlacement="below"
            onToggleOpen={() => {
              if (missingImagesOpen) {
                setMissingImagesOpen(false);
                return;
              }
              closeSidebarMenus('missingImages');
              setMissingImagesOpen(true);
            }}
            onClose={() => setMissingImagesOpen(false)}
            onFindMissingImages={handleFindMissingImages}
            onIgnoreMissingImages={handleIgnoreMissingImages}
            onOpenFolder={handleOpenFolder}
          />
        </div>
      )}

      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          position: 'relative',
        }}
      >
      <div className={isReconnectPending ? 'workspace-reconnect-dimmed' : undefined}>
      {(hasWorkspaceContext || isReconnectPending) && documents.length > 0 && (
        <div style={{ borderBottom: '0.5px solid var(--c-sidebar-border)', flexShrink: 0 }}>
          <WorkspaceExplorerFavoritesSection
            open={favoritesSectionOpen}
            activeDocId={activeDocId}
            favoriteDocs={favoriteDocs}
            visibleFavoriteDocs={visibleFavoriteDocs}
            onToggleOpen={() => setFavoritesSectionOpen((v) => !v)}
            onOpenDocument={openDocumentFromShortcut}
            onToggleFavoriteDocument={toggleFavoriteFromExplorer}
            onPreviewDocument={showShortcutNotePreview}
            onPreviewEnd={clearNotePreview}
          />
        </div>
      )}

      <WorkspaceExplorerFoldersSection
        open={(hasWorkspaceContext || isReconnectPending) && folderPages.length > 0}
        folderPages={folderPages}
        pages={pages}
        pagesSectionOpen={pagesSectionOpen}
        activePageId={activePageId}
        activeDocId={activeDocId}
        collapsedPageIds={collapsedPageIds}
        pageDocs={pageDocs}
        coarsePointer={coarsePointer}
        focusedPageId={focusedPageId}
        focusedDocId={focusedDocId}
        onToggleSection={() => setPagesSectionOpen((v) => !v)}
        onAddPage={() => addPage()}
        onRenameDocument={renameDocumentFromExplorer}
        onToggleFavoriteDocument={toggleFavoriteFromExplorer}
        onReorderDocumentsForPage={(pageId, docIds) => reorderDocumentsForPage(pageId, docIds)}
        onDeleteDocument={deleteDocumentFromExplorer}
        onRevealDocument={revealDocumentInFinder}
        onRenamePage={renamePageFromExplorer}
        onDeletePage={(targetPage) => setDeletePageConfirm({ id: targetPage.id, name: targetPage.name })}
        onRevealPage={revealPageInFinder}
        onChangeSortMode={changePageNoteSort}
        onEnsureCustomSort={ensureCustomSortForPage}
        onToggleCollapsed={togglePageCollapsed}
        onOpenPageOverview={(pageId, isActive) => {
          if (!isActive) switchPage(pageId);
          window.dispatchEvent(new CustomEvent('devboard:snap-close-document'));
        }}
        onCreateNoteForPage={createNoteForPage}
        onCreateCanvasForPage={createCanvasForPage}
        onOpenDocument={openDocumentFromShortcut}
        onAddToCanvas={addDocumentToActiveCanvas}
        onFocusPage={focusPage}
        onFocusDocument={focusDocument}
        onPageHover={showPagePreview}
        onPageLeave={clearPagePreview}
        onNoteHover={showNotePreview}
        onNoteLeave={clearNotePreview}
      />
      </div>

      {isReconnectPending && (
        <button
          type="button"
          className="workspace-reconnect-overlay"
          onClick={() => { void handleReconnectWorkspace(); }}
          aria-label={`Reconnect to "${pendingLocalWorkspaceName}" to edit`}
        >
          <span className="workspace-reconnect-overlay__badge">
            Reconnect to &quot;{pendingLocalWorkspaceName}&quot; to edit
          </span>
        </button>
      )}
      </div>

      <WorkspaceExplorerFooter
        footerSyncDot={footerSyncDot}
        projectSwitcherRef={projectSwitcherRef}
        projectSwitcherOpen={projectSwitcherOpen}
        projectSwitcherLoading={projectSwitcherLoading}
        projectSwitcherRecents={projectSwitcherRecents}
        workspaceDisplayName={workspaceDisplayName}
        footerStatusLabel={bottomSyncStatus?.label}
        onToggleProjectSwitcher={handleToggleProjectSwitcher}
        onProjectSwitcherContextMenu={openWorkspaceNameMenu}
        onOpenRecentProject={(project) => { void handleOpenRecentProject(project); }}
        onRelocateRecentProject={(project) => { void handleRelocateRecentProject(project); }}
        onOpenProjectsLibrary={handleOpenProjectsLibrary}
        projectMenu={projectMenu}
        projectMenuRef={projectMenuRef}
        onRenameProject={beginProjectRename}
        onOpenLocalFolder={() => {
          setProjectMenu(null);
          void handleOpenFolder();
        }}
        onOpenCloudModal={() => openCloudModal()}
      />

      <WorkspaceExplorerProjectRenameDialog
        open={projectRenameOpen}
        draft={projectRenameDraft}
        onDraftChange={setProjectRenameDraft}
        onConfirm={commitProjectRename}
        onCancel={() => setProjectRenameOpen(false)}
      />

      <WorkspaceExplorerPreferencesDialog
        open={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        items={[
          {
            label: 'Dark mode',
            detail: theme === 'dark' ? 'On' : 'Off',
            enabled: theme === 'dark',
            onToggle: toggleTheme,
          },
          {
            label: 'Note autosave',
            detail: noteAutosaveEnabled ? 'On' : 'Off',
            enabled: noteAutosaveEnabled,
            onToggle: () => setNoteAutosaveEnabled(!noteAutosaveEnabled),
          },
          {
            label: 'Favorites section',
            detail: favoritesSectionOpen ? 'Shown' : 'Hidden',
            enabled: favoritesSectionOpen,
            onToggle: () => setFavoritesSectionOpen((current) => !current),
          },
          {
            label: 'Folders section',
            detail: pagesSectionOpen ? 'Shown' : 'Hidden',
            enabled: pagesSectionOpen,
            onToggle: () => setPagesSectionOpen((current) => !current),
          },
          {
            label: 'Advanced files',
            detail: advancedFilesVisible ? 'Shown' : 'Hidden',
            enabled: advancedFilesVisible,
            onToggle: () => setAdvancedFilesVisible((current) => !current),
          },
        ]}
      />

      <WorkspaceExplorerConfirmDialog
        open={!!deleteConfirm}
        title={deleteConfirm?.kind === 'directory' ? 'Delete folder?' : 'Delete file?'}
        confirmLabel="Delete"
        confirmBackground="#ef4444"
        onConfirm={() => {
          if (!deleteConfirm) return;
          void doDelete(deleteConfirm).then((deleted) => {
            if (deleted) setFocusedIdx(null);
          });
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
      >
        {deleteConfirm && (
          <>
            <span style={{ color: '#f87171' }}>{deleteConfirm.name}</span>
            {deleteConfirm.kind === 'directory' ? ' and all its contents will be permanently deleted.' : ' will be permanently deleted.'}
            {' '}This cannot be undone.
          </>
        )}
      </WorkspaceExplorerConfirmDialog>

      <WorkspaceExplorerConfirmDialog
        open={!!deletePageConfirm}
        title="Delete folder?"
        confirmLabel="Delete"
        confirmBackground="#ef4444"
        onConfirm={() => {
          if (!deletePageConfirm) return;
          deletePage(deletePageConfirm.id);
          setDeletePageConfirm(null);
        }}
        onCancel={() => setDeletePageConfirm(null)}
      >
        {deletePageConfirm && (
          <>
            <span style={{ color: '#f87171' }}>{deletePageConfirm.name}</span>
            {' '}will be removed from the workspace. This cannot be undone.
          </>
        )}
      </WorkspaceExplorerConfirmDialog>

      <WorkspaceExplorerConfirmDialog
        open={!!deleteNoteConfirm}
        title="Delete note?"
        confirmLabel="Delete"
        confirmBackground="#ef4444"
        onConfirm={() => {
          if (!deleteNoteConfirm) return;
          deleteDocument(deleteNoteConfirm.id);
          setDeleteNoteConfirm(null);
        }}
        onCancel={() => setDeleteNoteConfirm(null)}
      >
        {deleteNoteConfirm && (
          <>
            <span style={{ color: '#f87171' }}>{deleteNoteConfirm.title || 'Untitled note'}</span>
            {' '}will be permanently deleted. This cannot be undone.
          </>
        )}
      </WorkspaceExplorerConfirmDialog>

      <WorkspaceExplorerConfirmDialog
        open={!!renameExtWarning}
        title="Change file extension?"
        confirmLabel="Rename anyway"
        confirmBackground="#d4835a"
        onConfirm={() => {
          if (!renameExtWarning) return;
          doRename(renameExtWarning.entry, renameExtWarning.newName);
          setRenameExtWarning(null);
        }}
        onCancel={() => setRenameExtWarning(null)}
      >
        {renameExtWarning && (
          <>
            Renaming <span style={{ color: 'var(--c-text-md)' }}>{renameExtWarning.entry.name}</span> to{' '}
            <span style={{ color: '#d4835a' }}>{renameExtWarning.newName}</span> changes the extension.
            The file may no longer open correctly.
          </>
        )}
      </WorkspaceExplorerConfirmDialog>

      <WorkspaceExplorerEntryMenu
        open={!!explorerMenu}
        entry={explorerMenu?.entry ?? null}
        x={explorerMenu?.x ?? 0}
        y={explorerMenu?.y ?? 0}
        menuRef={explorerMenuRef}
        cloudOnlyWorkspace={cloudOnlyWorkspace}
        onOpenFile={(entry) => {
          setExplorerMenu(null);
          openFile(entry);
        }}
        onPlaceFile={(entry) => {
          setExplorerMenu(null);
          placeFile(entry);
        }}
        onShowInFolder={(path) => {
          setExplorerMenu(null);
          void revealInFinder(path);
        }}
        onRename={(entry) => startRename(entry)}
        onDelete={(entry) => startDelete(entry)}
      />

      {/* Folder preview panel */}
      {pagePreview && (
        <WorkspaceExplorerPagePreview
          preview={pagePreview}
          panelRect={panelRef.current?.getBoundingClientRect() ?? null}
          workspaceWidth={WORKSPACE_EXPLORER_WIDTH}
        />
      )}

      {/* Note preview panel */}
      {notePreview && (
        <WorkspaceExplorerNotePreview
          preview={notePreview}
          panelRect={panelRef.current?.getBoundingClientRect() ?? null}
          workspaceWidth={WORKSPACE_EXPLORER_WIDTH}
          getPageNodes={getPageNodes}
        />
      )}

      {/* File preview panel */}
      {filePreview && (
        <WorkspaceExplorerFilePreview
          preview={filePreview}
          panelRect={panelRef.current?.getBoundingClientRect() ?? null}
          workspaceWidth={WORKSPACE_EXPLORER_WIDTH}
          isDark={isDark}
        />
      )}
    </div>
    </>
  );
}
