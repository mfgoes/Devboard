import React, { useEffect, useState, useRef, useCallback } from 'react';
import { saveBoard } from './utils/fileSave';
import { saveWorkspace, getWorkspaceName, restoreWorkspace, getPendingLocalWorkspaceName, setOnWorkspaceSavedCallback, IS_MACOS_DESKTOP, MOBILE_WORKSPACE_WARNING_EVENT } from './utils/workspaceManager';
import { setToastListener, toast, ToastPayload } from './utils/toast';
import {
  checkForUpdates,
  getLastNotifiedVersion,
  getUpdateDownloadUrl,
  markUpdateCheck,
  markUpdateNotified,
  shouldAutoCheckForUpdates,
} from './utils/updates';
import { announceLocalSave } from './utils/saveStatus';
import { applyWorkspaceSyncFromOpenResult } from './utils/applyWorkspaceSync';
import { loadCloudBoard } from './utils/cloudStorage';
import { extractMarkdownFiles, importMarkdownFileObjects, promptAndImportMarkdownNotes } from './utils/noteImport';
import { listenTauriMenus, shouldKeepSidePanelOpenForTarget, loadFromHash, isBraveBrowser, generateId, readWorkspaceRoute, replaceWorkspaceRoute } from './utils/appHelpers';
import Canvas from './components/Canvas';
import Toolbar from './components/Toolbar';
import ZoomToolbar from './components/ZoomToolbar';
import TopBar from './components/TopBar';
import MobileNav from './components/MobileNav';
import WelcomeModal from './components/WelcomeModal';
import OnboardingModal from './components/OnboardingModal';
import FocusMode from './components/FocusMode';
import DocumentMode from './components/DocumentMode';
import StackView from './components/StackView';
import QuickSwitcher from './components/QuickSwitcher';
import TimerWidget from './components/TimerWidget';
import WorkspaceExplorer from './components/WorkspaceExplorer';
import CloudModal from './components/CloudModal';
import JiraPanel from './components/JiraPanel';
import SearchBar from './components/SearchBar';
import WorkspaceShareModal from './components/WorkspaceShareModal';
import { IconArrowLeft } from './components/icons';
import { useBoardStore } from './store/boardStore';
import { useAuth } from './contexts/AuthContext';
import { applyTheme } from './theme';
import { createWelcomeBoard } from './templates/welcomeBoard';
import devboardIconUrl from './assets/devboard_icon.png';
import { CollapsedRailTooltip } from './components/CollapsedRailTooltip';

const EXPLORER_COLLAPSED_WIDTH = 48;
const MOBILE_NOTE_BREAKPOINT = 768;
const TOP_BAR_HEIGHT = 44;
const NOTICE_HEIGHT = 40;
const DOCUMENT_FULLSCREEN_Z = 210;
const MORPH_MS = 380;
const PANEL_SLIDE_MS = 220;
const IS_WINDOWS = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');

export default function App() {
  const { user, isLoading: authLoading } = useAuth();
  // Only show welcome modal when explicitly triggered (logo click)
  const [showWelcome, setShowWelcome] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [showBraveNotice, setShowBraveNotice] = useState(false);
  const [showMobileWorkspaceNotice, setShowMobileWorkspaceNotice] = useState(false);
  const [toastData, setToastData] = useState<ToastPayload | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const [showTimer, setShowTimer] = useState(false);
  const [jiraOpen, setJiraOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [workspaceShareOpen, setWorkspaceShareOpen] = useState(false);
  const hasNavigatedToWorkspaceContent = useRef(false);
  const cloudRouteLoadingRef = useRef<string | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [mobileCanvasToolsExpanded, setMobileCanvasToolsExpanded] = useState(false);
  const explorerOpen = useBoardStore((s) => s.explorerOpen);
  const setExplorerOpen = useBoardStore((s) => s.setExplorerOpen);
  const sidebarCollapsed = useBoardStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useBoardStore((s) => s.setSidebarCollapsed);
  const sidebarWidth = useBoardStore((s) => s.sidebarWidth);
  const setSidebarWidth = useBoardStore((s) => s.setSidebarWidth);
  const appMode = useBoardStore((s) => s.appMode);
  const pages = useBoardStore((s) => s.pages);
  const activePageId = useBoardStore((s) => s.activePageId);
  const documents = useBoardStore((s) => s.documents);
  const morphSourceRect = useBoardStore((s) => s.morphSourceRect);
  const documentOpenTransition = useBoardStore((s) => s.documentOpenTransition);
  const closeDocument = useBoardStore((s) => s.closeDocument);
  const addDocument = useBoardStore((s) => s.addDocument);
  const addCanvasDocument = useBoardStore((s) => s.addCanvasDocument);
  const openDocumentWithMorph = useBoardStore((s) => s.openDocumentWithMorph);
  const docViewMode = useBoardStore((s) => s.docViewMode);
  const setDocViewMode = useBoardStore((s) => s.setDocViewMode);
  const switchPage = useBoardStore((s) => s.switchPage);
  const cloudBoardId = useBoardStore((s) => s.cloudBoardId);
  const cloudSyncedAt = useBoardStore((s) => s.cloudSyncedAt);
  const lastLocalSavedAt = useBoardStore((s) => s.lastLocalSavedAt);
  const activeDocId = useBoardStore((s) => s.activeDocId);

  const boardTitle = useBoardStore((s) => s.boardTitle);
  const workspaceName = useBoardStore((s) => s.workspaceName);
  const accountLabel = String(user?.user_metadata?.user_name
    ?? user?.user_metadata?.preferred_username
    ?? user?.user_metadata?.name
    ?? user?.email
    ?? 'Workspace Sync');
  const accountInitials = accountLabel
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'DB';
  const avatarUrl = typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null;
  const openCloudModal = useCallback(() => {
    window.dispatchEvent(new CustomEvent('devboard:open-cloud-modal'));
  }, []);

  const [cloudModalOpen, setCloudModalOpen] = useState(false);
  const [cloudModalTab, setCloudModalTab] = useState<'workspace' | 'library'>('workspace');
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: 'workspace' | 'library' }>).detail;
      setCloudModalTab(detail?.tab === 'library' ? 'library' : 'workspace');
      setCloudModalOpen(true);
    };
    window.addEventListener('devboard:open-cloud-modal', handler);
    return () => window.removeEventListener('devboard:open-cloud-modal', handler);
  }, []);
  useEffect(() => {
    const handler = () => setWorkspaceShareOpen(true);
    window.addEventListener('devboard:open-share-workspace', handler);
    return () => window.removeEventListener('devboard:open-share-workspace', handler);
  }, []);

  const activePage = pages.find((p) => p.id === activePageId);
  const activeCanvasDocument = documents.find((doc) => doc.docType === 'canvas' && doc.canvasPageId === activePageId);
  const activeCanvasParentPage = activePage?.isCanvasDocument && activePage.parentPageId
    ? pages.find((p) => p.id === activePage.parentPageId)
    : null;
  const isStackPage = !activePage?.isCanvasDocument && !activeCanvasDocument;
  const canvasDocumentOwnsTop = appMode !== 'document' && !!activeCanvasDocument;

  useEffect(() => {
    const label = boardTitle.trim() || workspaceName;
    document.title = label ? `${label} — DevBoard` : 'DevBoard';
  }, [boardTitle, workspaceName]);
  const explorerCollapsed = sidebarCollapsed;
  const setExplorerCollapsed = useCallback((next: boolean | ((current: boolean) => boolean)) => {
    setSidebarCollapsed(typeof next === 'function' ? next(useBoardStore.getState().sidebarCollapsed) : next);
  }, [setSidebarCollapsed]);
  const [isMobileViewport, setIsMobileViewport] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_NOTE_BREAKPOINT : false
  ));
  const topBarVisible = !isMobileViewport && !canvasDocumentOwnsTop;
  // The top bar only holds content (title chip + app menu) when the sidebar is
  // collapsed. When it's expanded, the sidebar owns that chrome, so the band would
  // be an empty strip — collapse it to reclaim the space instead.
  // On macOS the top bar is the right half of the unified title band, so it
  // always reserves space rather than floating over the content.
  const topBarOccupiesSpace = topBarVisible && (explorerCollapsed || IS_MACOS_DESKTOP);
  const activeNoticeCount = Number(showBraveNotice) + Number(showMobileWorkspaceNotice);
  const contentTop = (topBarOccupiesSpace ? TOP_BAR_HEIGHT : 0) + activeNoticeCount * NOTICE_HEIGHT;
  const explorerVisible = !isMobileViewport;
  const explorerOffset = explorerVisible ? (explorerCollapsed ? EXPLORER_COLLAPSED_WIDTH : sidebarWidth) : 0;
  const documentFrameOffset = isMobileViewport ? 0 : explorerOffset;
  const sidePanelDragRef = useRef(false);
  const sidebarResizeRef = useRef(false);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const documentTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docPanelRef = useRef<HTMLDivElement>(null);
  const [docPanelWidth, setDocPanelWidth] = useState(() => (
    typeof window !== 'undefined'
      ? Math.max(380, Math.min(560, Math.round(window.innerWidth * 0.34)))
      : 420
  ));
  const effectiveDocViewMode = isMobileViewport || isStackPage ? 'fullscreen' : docViewMode;
  const showMobileNavigator = isMobileViewport && appMode !== 'document' && !activePage?.isCanvasDocument;

  // ── Zoom-morph state machine ─────────────────────────────────────────────
  const [morphPhase, setMorphPhase] = useState<'idle' | 'opening' | 'open' | 'closing'>('idle');
  const [panelPhase, setPanelPhase] = useState<'idle' | 'open' | 'closing'>('idle');
  const [morphRectOverride, setMorphRectOverride] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const documentFullscreenOwnsTop = appMode === 'document' && effectiveDocViewMode === 'fullscreen' && morphPhase !== 'idle';
  const documentFullscreenTop = documentFullscreenOwnsTop ? activeNoticeCount * NOTICE_HEIGHT : contentTop;
  const documentPanelOwnsTop = appMode === 'document' && effectiveDocViewMode === 'panel' && panelPhase !== 'idle';
  const documentPanelTop = documentPanelOwnsTop ? activeNoticeCount * NOTICE_HEIGHT : contentTop;
  const prevPresentation = useRef({ appMode, docViewMode: effectiveDocViewMode });

  const getPanelRect = useCallback(() => {
    const maxWidth = Math.max(380, window.innerWidth - documentFrameOffset - 120);
    const panelWidth = window.innerWidth < 640
      ? window.innerWidth
      : Math.max(380, Math.min(maxWidth, docPanelWidth));
    return {
      left: window.innerWidth - panelWidth,
      top: documentPanelTop,
      width: panelWidth,
      height: Math.max(0, window.innerHeight - documentPanelTop),
    };
  }, [docPanelWidth, documentFrameOffset, documentPanelTop]);

  useEffect(() => {
    if (appMode === 'document' && documentTransitionTimerRef.current) {
      clearTimeout(documentTransitionTimerRef.current);
      documentTransitionTimerRef.current = null;
    }
    if (appMode === 'document' && prevPresentation.current.appMode !== 'document') {
      if (effectiveDocViewMode === 'fullscreen') {
        if (documentOpenTransition === 'instant') {
          setMorphPhase('open');
        } else {
          setMorphPhase('opening');
          requestAnimationFrame(() => requestAnimationFrame(() => setMorphPhase('open')));
        }
      } else {
        setPanelPhase('open');
      }
    } else if (appMode === 'canvas' && prevPresentation.current.appMode === 'document') {
      setPanelPhase('idle');
      setMorphPhase('idle');
      setMorphRectOverride(null);
    } else if (appMode === 'document' && prevPresentation.current.docViewMode !== effectiveDocViewMode) {
      if (effectiveDocViewMode === 'fullscreen') {
        setMorphRectOverride(prevPresentation.current.docViewMode === 'panel' ? getPanelRect() : null);
        setPanelPhase('idle');
        setMorphPhase('opening');
        requestAnimationFrame(() => requestAnimationFrame(() => setMorphPhase('open')));
      } else {
        setMorphPhase('idle');
        setMorphRectOverride(null);
        setPanelPhase('open');
      }
    }
    prevPresentation.current = { appMode, docViewMode: effectiveDocViewMode };
  }, [appMode, documentOpenTransition, effectiveDocViewMode, getPanelRect]);

  const closeDoc = useCallback(() => {
    if (documentTransitionTimerRef.current) {
      clearTimeout(documentTransitionTimerRef.current);
      documentTransitionTimerRef.current = null;
    }
    if (effectiveDocViewMode === 'fullscreen') {
      setMorphPhase('closing');
      documentTransitionTimerRef.current = setTimeout(() => {
        closeDocument();
        setMorphPhase('idle');
        setMorphRectOverride(null);
        documentTransitionTimerRef.current = null;
      }, MORPH_MS);
    } else {
      setPanelPhase('closing');
      documentTransitionTimerRef.current = setTimeout(() => {
        closeDocument();
        setPanelPhase('idle');
        setMorphRectOverride(null);
        documentTransitionTimerRef.current = null;
      }, PANEL_SLIDE_MS);
    }
  }, [closeDocument, effectiveDocViewMode]);

  useEffect(() => () => {
    if (documentTransitionTimerRef.current) {
      clearTimeout(documentTransitionTimerRef.current);
      documentTransitionTimerRef.current = null;
    }
  }, []);

  // Esc closes document
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (morphPhase === 'open' || panelPhase === 'open')) {
        e.preventDefault();
        closeDoc();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [morphPhase, panelPhase, closeDoc]);

  useEffect(() => {
    if (appMode !== 'document' || effectiveDocViewMode !== 'panel' || panelPhase !== 'open') return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (target instanceof Node && docPanelRef.current?.contains(target)) return;
      if (shouldKeepSidePanelOpenForTarget(target)) return;
      closeDoc();
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [appMode, closeDoc, effectiveDocViewMode, panelPhase]);

  // Cmd+N creates a text note in the current folder and opens it full-screen.
  const handleNewNote = useCallback(() => {
    const state = useBoardStore.getState();
    const currentPage = state.pages.find((entry) => entry.id === state.activePageId);
    const pageId = currentPage?.isCanvasDocument ? (currentPage.parentPageId ?? state.activePageId) : state.activePageId;
    const id = addDocument({ title: '', content: '', pageId });
    if (state.appMode === 'document') {
      state.openDocument(id);
      return;
    }
    state.setDocViewMode('fullscreen');
    openDocumentWithMorph(id);
  }, [addDocument, openDocumentWithMorph]);

  const handleNewCanvas = useCallback(() => {
    const state = useBoardStore.getState();
    const currentPage = state.pages.find((entry) => entry.id === state.activePageId);
    addCanvasDocument(currentPage?.isCanvasDocument ? currentPage.parentPageId : state.activePageId);
  }, [addCanvasDocument]);

  const handleExportBoardPng = useCallback(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.konvajs-content canvas');
    canvas?.toBlob((blob) => {
      if (!blob) return;
      import('file-saver').then(({ saveAs }) => {
        saveAs(blob, `${useBoardStore.getState().boardTitle}.png`);
      });
    });
  }, []);

  // Snap-close doc without animation (used when jumping to a canvas node)
  const snapCloseDoc = useCallback(() => {
    closeDocument();
    setMorphPhase('idle');
    setPanelPhase('idle');
    setMorphRectOverride(null);
  }, [closeDocument]);

  const expandToFullscreen = useCallback(() => {
    setMorphRectOverride(getPanelRect());
    setPanelPhase('idle');
    setDocViewMode('fullscreen');
    setMorphPhase('opening');
    requestAnimationFrame(() => requestAnimationFrame(() => setMorphPhase('open')));
  }, [getPanelRect, setDocViewMode]);

  const collapseToPanel = useCallback(() => {
    if (documentTransitionTimerRef.current) {
      clearTimeout(documentTransitionTimerRef.current);
      documentTransitionTimerRef.current = null;
    }
    setMorphRectOverride(getPanelRect());
    setMorphPhase('closing');
    documentTransitionTimerRef.current = setTimeout(() => {
      setDocViewMode('panel');
      setMorphPhase('idle');
      setPanelPhase('open');
      setMorphRectOverride(null);
      documentTransitionTimerRef.current = null;
    }, MORPH_MS);
  }, [getPanelRect, setDocViewMode]);

  const dismissSidePanelFromCanvas = useCallback(() => {
    if (appMode === 'document' && effectiveDocViewMode === 'panel' && !isStackPage && panelPhase === 'open') {
      closeDoc();
    }
  }, [appMode, closeDoc, effectiveDocViewMode, isStackPage, panelPhase]);

  useEffect(() => {
    const handleSnapClose = () => snapCloseDoc();
    window.addEventListener('devboard:snap-close-document', handleSnapClose);
    return () => window.removeEventListener('devboard:snap-close-document', handleSnapClose);
  }, [snapCloseDoc]);

  // Pan canvas to center on a node and select it
  const focusNode = useCallback((nodeId: string) => {
    const state = useBoardStore.getState();
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const n = node as { x: number; y: number; width?: number; height?: number };
    const w = n.width ?? 200;
    const h = n.height ?? 120;
    const scale = state.camera.scale;
    const topH = 44;
    state.setCamera({
      x: window.innerWidth / 2 - (n.x + w / 2) * scale,
      y: topH + (window.innerHeight - topH) / 2 - (n.y + h / 2) * scale,
    });
    state.selectIds([nodeId]);
  }, []);

  const requestActiveDocumentSave = useCallback(() => {
    if (useBoardStore.getState().appMode !== 'document') return false;
    window.dispatchEvent(new CustomEvent('devboard:save-active-document'));
    return true;
  }, []);

  const saveCurrentBoardQuietly = useCallback(() => {
    const data = useBoardStore.getState().exportData();
    if (getWorkspaceName()) {
      void saveWorkspace(data, { notify: false }).then((result) => {
        if (!result.saved) return;
        if (result.workspaceName) useBoardStore.getState().setWorkspaceName(result.workspaceName);
        useBoardStore.getState().setSidebarCollapsed(false);
        useBoardStore.getState().setExplorerOpen(true);
        announceLocalSave('workspace', result.workspaceName);
      });
      return;
    }

    void saveBoard(data, { notify: false }).then((result) => {
      if (!result.saved) return;
      announceLocalSave('file', result.targetName);
    });
  }, []);

  const openExternalUrl = useCallback((url: string) => {
    void import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('open_external_url', { url }))
      .catch(() => window.open(url, '_blank', 'noopener'));
  }, []);

  const restartApp = useCallback(() => {
    void import('@tauri-apps/plugin-process')
      .then(({ relaunch }) => relaunch())
      .catch(() => window.location.reload());
  }, []);

  const installUpdate = useCallback(async (update: import('@tauri-apps/plugin-updater').Update) => {
    if (updateBusy) {
      toast('Update already in progress.');
      return;
    }

    setUpdateBusy(true);

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          toast('Downloading update…');
        } else if (event.event === 'Finished') {
          toast('Installing update…');
        }
      });

      if (!IS_WINDOWS) {
        toast('Update installed. Restart DevBoard to finish.', {
          label: 'Restart',
          onClick: restartApp,
        });
      }
    } catch {
      toast('Update failed. You can download the latest build manually.', {
        label: 'Download',
        onClick: () => openExternalUrl(getUpdateDownloadUrl()),
      });
    } finally {
      setUpdateBusy(false);
      void update.close().catch(() => {});
    }
  }, [openExternalUrl, restartApp, updateBusy]);

  const runUpdateCheck = useCallback(async (interactive: boolean) => {
    if (updateBusy) {
      if (interactive) toast('Update already in progress.');
      return;
    }

    const result = await checkForUpdates();
    markUpdateCheck();

    if (result.status === 'update-available') {
      const alreadyNotified = getLastNotifiedVersion() === result.latestVersion;
      if (!interactive && alreadyNotified) return;

      markUpdateNotified(result.latestVersion);
      toast(
        `DevBoard ${result.latestVersion} is available${interactive ? '' : ' to install'}.`,
        { label: 'Install', onClick: () => { void installUpdate(result.update); } },
      );
      return;
    }

    if (result.status === 'up-to-date') {
      if (interactive) toast(`You’re on the latest version (${result.currentVersion}).`);
      return;
    }

    if (result.status === 'unsupported') return;

    if (interactive) {
      toast('Could not check for updates right now.', {
        label: 'Download',
        onClick: () => openExternalUrl(getUpdateDownloadUrl()),
      });
    }
  }, [installUpdate, openExternalUrl, updateBusy]);

  // Cmd+K quick switcher
  const [qsOpen, setQsOpen] = useState(false);

  useEffect(() => {
    const openQuickSwitcher = () => setQsOpen(true);
    window.addEventListener('devboard:open-quick-switcher', openQuickSwitcher);
    return () => window.removeEventListener('devboard:open-quick-switcher', openQuickSwitcher);
  }, []);

  useEffect(() => {
    const openGetStarted = () => setShowOnboarding(true);
    window.addEventListener('devboard:open-get-started', openGetStarted);
    return () => window.removeEventListener('devboard:open-get-started', openGetStarted);
  }, []);

  useEffect(() => {
    setToastListener((payload) => {
      clearTimeout(toastTimer.current);
      setToastData(payload);
      toastTimer.current = setTimeout(() => setToastData(null), payload.action ? 5000 : 2500);
    });
  }, []);

  useEffect(() => {
    isBraveBrowser().then((brave) => {
      if (brave) setShowBraveNotice(true);
    });
  }, []);

  useEffect(() => {
    const handleMobileWorkspaceWarning = () => setShowMobileWorkspaceNotice(true);
    window.addEventListener(MOBILE_WORKSPACE_WARNING_EVENT, handleMobileWorkspaceWarning);
    return () => window.removeEventListener(MOBILE_WORKSPACE_WARNING_EVENT, handleMobileWorkspaceWarning);
  }, []);

  useEffect(() => {
    const onResize = () => {
      setIsMobileViewport(window.innerWidth < MOBILE_NOTE_BREAKPOINT);
      setDocPanelWidth((current) => {
        const maxWidth = Math.max(380, window.innerWidth - (window.innerWidth < MOBILE_NOTE_BREAKPOINT ? 0 : explorerOffset) - 120);
        return Math.max(380, Math.min(maxWidth, current));
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [explorerOffset]);

  useEffect(() => {
    if (isMobileViewport && appMode === 'document' && explorerOpen) {
      setExplorerCollapsed(false);
      setExplorerOpen(false);
    }
  }, [appMode, explorerOpen, isMobileViewport, setExplorerOpen]);

  const theme = useBoardStore((s) => s.theme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Load from URL hash once on mount
  useEffect(() => {
    loadFromHash();
  }, []);

  // A workspace route identifies a location, not a public document. Local
  // routes can only resolve after their folder is open; cloud routes require
  // the owner's signed-in private sync access.
  useEffect(() => {
    const openRouteTarget = () => {
      const route = readWorkspaceRoute();
      if (!route) return;
      const state = useBoardStore.getState();
      if (route.noteId && state.documents.some((document) => document.id === route.noteId)) {
        hasNavigatedToWorkspaceContent.current = true;
        state.openDocument(route.noteId);
        return;
      }
      if (route.canvasId) {
        const canvasDocument = state.documents.find((document) => document.canvasPageId === route.canvasId);
        if (canvasDocument) state.openCanvasDocument(canvasDocument.id);
        else if (state.pages.some((page) => page.id === route.canvasId)) state.switchPage(route.canvasId);
      }
    };

    const loadRoute = async () => {
      const route = readWorkspaceRoute();
      if (!route) return;
      if (!route.workspaceId) {
        openRouteTarget();
        return;
      }
      if (authLoading) return;
      if (!user) {
        setCloudModalOpen(true);
        return;
      }
      if (useBoardStore.getState().cloudBoardId === route.workspaceId) {
        openRouteTarget();
        return;
      }
      if (cloudRouteLoadingRef.current === route.workspaceId) return;
      cloudRouteLoadingRef.current = route.workspaceId;
      try {
        const data = await loadCloudBoard(route.workspaceId);
        const state = useBoardStore.getState();
        state.loadBoard(data);
        state.setCloudBoardState({ boardId: route.workspaceId, title: data.boardTitle });
        state.setWorkspaceName(null);
        openRouteTarget();
      } catch (error) {
        console.warn('Could not open workspace from private link', error);
        toast('Could not open this private workspace link');
      } finally {
        cloudRouteLoadingRef.current = null;
      }
    };

    void loadRoute();
    window.addEventListener('hashchange', loadRoute);
    return () => window.removeEventListener('hashchange', loadRoute);
  }, [authLoading, user]);

  // Keep a browser-visible location for notes and canvases. The local version
  // deliberately contains no filesystem path; only synced workspaces receive
  // a cloud workspace ID that can be opened on another signed-in device.
  useEffect(() => {
    if (!activeDocId && !hasNavigatedToWorkspaceContent.current) return;
    hasNavigatedToWorkspaceContent.current = true;
    replaceWorkspaceRoute({
      ...(cloudBoardId ? { workspaceId: cloudBoardId } : {}),
      workspaceTitle: boardTitle || workspaceName || 'Private workspace',
      ...(activeDocId
        ? { noteId: activeDocId, noteTitle: documents.find((document) => document.id === activeDocId)?.title }
        : { canvasId: activePageId, canvasTitle: pages.find((page) => page.id === activePageId)?.name }),
    });
  }, [activeDocId, activePageId, cloudBoardId, boardTitle, workspaceName, documents, pages]);

  // Register callback so the explorer tree reloads after every workspace save.
  useEffect(() => {
    setOnWorkspaceSavedCallback(() => {
      const state = useBoardStore.getState();
      const workspaceName = getWorkspaceName();
      if (workspaceName) {
        state.setWorkspaceName(workspaceName);
        state.setSidebarCollapsed(false);
        state.setExplorerOpen(true);
      }
      state.bumpWorkspaceSaved();
    });
  }, []);

  // Restore previously granted localhost workspace handle when possible.
  useEffect(() => {
    // A private cloud route must not be overwritten by the last local folder.
    if (readWorkspaceRoute()?.workspaceId) return;
    restoreWorkspace().then((result) => {
      if (!result) {
        // Permission may have lapsed (browsers demote directory-handle grants
        // across sessions) even though a workspace was picked before. Surface
        // that so the sidebar can offer "Reconnect" instead of looking empty.
        getPendingLocalWorkspaceName().then((name) => {
          if (name) useBoardStore.getState().setPendingLocalWorkspaceName(name);
        });
        return;
      }
      useBoardStore.getState().setWorkspaceName(result.name);
      useBoardStore.getState().bumpWorkspaceSaved();
      if (result.data) useBoardStore.getState().loadBoard(result.data);
      applyWorkspaceSyncFromOpenResult(result);
      const route = readWorkspaceRoute();
      if (route?.noteId && useBoardStore.getState().documents.some((document) => document.id === route.noteId)) {
        hasNavigatedToWorkspaceContent.current = true;
        useBoardStore.getState().openDocument(route.noteId);
      }
    }).catch((err) => {
      console.warn('Failed to restore workspace', err);
    });
  }, []);

  // Show onboarding modal on first visit (before welcome board seeded)
  useEffect(() => {
    const isFirstVisit = !localStorage.getItem('devboard-visited');
    const hasSeenOnboarding = localStorage.getItem('devboard-onboarding-dismissed');
    if (isFirstVisit && !hasSeenOnboarding) {
      setShowOnboarding(true);
    }
  }, []);

  // Seed welcome board on first visit (workspace + notes first)
  useEffect(() => {
    const isFirstVisit = !localStorage.getItem('devboard-visited');
    if (!isFirstVisit) return;
    // Wait for hash-loading to settle, then check if board is still empty
    setTimeout(() => {
      const store = useBoardStore.getState();
      if (store.nodes.length > 0) return; // board was loaded from hash
      localStorage.setItem('devboard-visited', '1');
      store.loadBoard(createWelcomeBoard());
    }, 0);
  }, []);

  // Global copy / paste / duplicate shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Cmd+K: quick switcher
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setQsOpen((v) => !v);
        return;
      }

      // Cmd+F: open search bar (must run before tag guard so it works from any context)
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }

      // Cmd+N → new note
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleNewNote();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (requestActiveDocumentSave()) return;
        saveCurrentBoardQuietly();
        return;
      }

      const el = (e.target as HTMLElement | null);
      const tag = el?.tagName?.toLowerCase();
      const isNativeTextInput = tag === 'input' || tag === 'textarea' || tag === 'select' || !!el?.isContentEditable;
      const selection = window.getSelection?.();
      const hasNativeTextSelection = !!selection && !selection.isCollapsed && selection.toString().trim().length > 0;
      const shouldUseNativeClipboard = isNativeTextInput || !!el?.closest('[data-native-clipboard="true"]') || hasNativeTextSelection;
      if (shouldUseNativeClipboard) return;

      const mod = e.metaKey || e.ctrlKey;

      // E — open file explorer (open-only; close requires the in-panel confirmation)
      if (!mod && e.key === 'e') {
        e.preventDefault();
        useBoardStore.getState().setSidebarCollapsed(false);
        useBoardStore.getState().setExplorerOpen(true);
        return;
      }

      if (!mod) return;

      if (e.key === 'c') {
        e.preventDefault();
        useBoardStore.getState().copySelected();
      } else if (e.key === 'v') {
        e.preventDefault();
        // Check system clipboard for URL — if so, create a Link node with option to convert
        navigator.clipboard.readText().then((text) => {
          const trimmed = text?.trim();
          if (trimmed && /^https?:\/\/\S+$/i.test(trimmed)) {
            const { camera, addNode, selectIds, clipboard, saveHistory, deleteSelected } = useBoardStore.getState();
            // If internal clipboard has nodes, prefer internal paste (user copied nodes first)
            if (clipboard.length > 0) {
              useBoardStore.getState().paste();
              return;
            }
            saveHistory();
            const linkId = generateId();
            const cx = (window.innerWidth / 2 - camera.x) / camera.scale;
            const cy = (window.innerHeight / 2 - camera.y) / camera.scale;
            addNode({
              id: linkId,
              type: 'link',
              x: cx - 160,
              y: cy - 45,
              width: 320,
              height: 90,
              url: trimmed,
              displayMode: 'compact',
            } as import('./types').LinkNode);
            selectIds([linkId]);
            // Show toast with option to convert to text block
            toast('Pasted as link embed', {
              label: 'Make text instead',
              onClick: () => {
                const store = useBoardStore.getState();
                store.saveHistory();
                // Remove the link node
                store.selectIds([linkId]);
                store.deleteSelected();
                // Create a text block with the URL as linked text
                const textId = generateId();
                store.addNode({
                  id: textId,
                  type: 'textblock',
                  x: cx - 160,
                  y: cy - 10,
                  width: 320,
                  text: trimmed,
                  fontSize: 16,
                  color: 'auto',
                  bold: false,
                  italic: false,
                  underline: false,
                  link: trimmed,
                } as import('./types').TextBlockNode);
                store.selectIds([textId]);
              },
            });
          } else {
            useBoardStore.getState().paste();
          }
        }).catch(() => {
          useBoardStore.getState().paste();
        });
      } else if (e.key === 'd') {
        e.preventDefault();
        useBoardStore.getState().duplicate();
      } else if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useBoardStore.getState().undo();
      } else if (e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        useBoardStore.getState().redo();
      } else if (e.key === 'b') {
        e.preventDefault();
        const { selectedIds, nodes, updateNode } = useBoardStore.getState();
        for (const id of selectedIds) {
          const n = nodes.find((x) => x.id === id);
          if (n && (n.type === 'sticky' || n.type === 'textblock' || n.type === 'shape')) {
            updateNode(id, { bold: !(n as { bold?: boolean }).bold } as never);
          }
        }
      } else if (e.key === 'i') {
        e.preventDefault();
        const { selectedIds, nodes, updateNode } = useBoardStore.getState();
        for (const id of selectedIds) {
          const n = nodes.find((x) => x.id === id);
          if (n && (n.type === 'sticky' || n.type === 'textblock' || n.type === 'shape')) {
            updateNode(id, { italic: !(n as { italic?: boolean }).italic } as never);
          }
        }
      } else if (e.key === 'g') {
        e.preventDefault();
        const { selectedIds: sids, nodes: ns, groupSelected, ungroupNodes } = useBoardStore.getState();
        const selected = ns.filter((n) => sids.includes(n.id) && n.type !== 'connector');
        const groupIds = [...new Set(
          selected
            .map((n) => (n as { groupId?: string }).groupId)
            .filter(Boolean) as string[]
        )];
        const allGrouped = selected.length >= 2 && groupIds.length === 1 &&
          selected.every((n) => !!(n as { groupId?: string }).groupId);
        if (allGrouped) {
          ungroupNodes(groupIds[0]);
        } else if (selected.length >= 2) {
          groupSelected();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleNewNote, requestActiveDocumentSave, saveCurrentBoardQuietly]);

  // Wire macOS native menu events → app actions
  useEffect(() => {
    let cleanup = () => {};
    listenTauriMenus({
      'menu:new_board':    () => useBoardStore.getState().loadBoard({ boardTitle: 'Untitled Project', nodes: [] }),
      'menu:new_note':     () => handleNewNote(),
      'menu:import_notes': () => { void promptAndImportMarkdownNotes(); },
      'menu:save':         () => {
        if (requestActiveDocumentSave()) return;
        saveCurrentBoardQuietly();
      },
      'menu:save_as':      () => import('./utils/fileSave').then((m) => {
        void m.saveBoardAs(useBoardStore.getState().exportData(), { notify: false }).then((result) => {
          if (!result.saved) return;
          announceLocalSave('file', result.targetName);
        });
      }),
      'menu:export_png':   () => handleExportBoardPng(),
      'menu:zoom_in':      () => { const s = useBoardStore.getState(); s.setCamera({ scale: Math.min(s.camera.scale * 1.2, 8) }); },
      'menu:zoom_out':     () => { const s = useBoardStore.getState(); s.setCamera({ scale: Math.max(s.camera.scale / 1.2, 0.08) }); },
      'menu:zoom_reset':   () => useBoardStore.getState().setCamera({ scale: 1, x: 0, y: 0 }),
      'menu:toggle_theme': () => useBoardStore.getState().toggleTheme(),
      'menu:check_updates': () => { void runUpdateCheck(true); },
    }).then(fn => { cleanup = fn; });
    return () => cleanup();
  }, [handleExportBoardPng, handleNewNote, requestActiveDocumentSave, runUpdateCheck, saveCurrentBoardQuietly]);

  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      if (extractMarkdownFiles(event.dataTransfer?.files).length === 0) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };

    const onDrop = (event: DragEvent) => {
      const files = extractMarkdownFiles(event.dataTransfer?.files);
      if (files.length === 0) return;
      event.preventDefault();
      void importMarkdownFileObjects(files);
    };

    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const maybeCheckForUpdates = async () => {
      if (!shouldAutoCheckForUpdates()) return;
      const result = await checkForUpdates();
      if (cancelled) return;

      markUpdateCheck();
      if (result.status !== 'update-available') return;
      if (getLastNotifiedVersion() === result.latestVersion) return;

      markUpdateNotified(result.latestVersion);
      toast(`DevBoard ${result.latestVersion} is available to install.`, {
        label: 'Install',
        onClick: () => { void installUpdate(result.update); },
      });
    };

    maybeCheckForUpdates().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [installUpdate]);

  const handleCloseWelcome = () => setShowWelcome(false);
  const syncDotColor = !cloudBoardId
    ? null
    : (!user || !cloudSyncedAt || (!!lastLocalSavedAt && lastLocalSavedAt > cloudSyncedAt + 1000))
      ? '#d4900a'
      : '#52a772';
  const railButtonStyle = (active = false, tinted = false): React.CSSProperties => ({
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    padding: 0,
    border: 'none',
    borderRadius: 8,
    background: active ? '#fdf2ea' : 'transparent',
    color: active || tinted ? '#b87750' : 'var(--color-text-secondary)',
    cursor: 'pointer',
    fontSize: 20,
    transition: 'background 0.12s ease, color 0.12s ease',
  });
  const railHoverHandlers = (active = false, tinted = false) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = '#fdf2ea';
      e.currentTarget.style.color = active || tinted ? '#b87750' : 'var(--c-text-hi)';
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = active ? '#fdf2ea' : 'transparent';
      e.currentTarget.style.color = active || tinted ? '#b87750' : 'var(--color-text-secondary)';
    },
  });

  return (
    <div className="relative w-full h-full overflow-hidden bg-[var(--c-canvas)] font-sans">
      {toastData && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-3 px-4 py-2 rounded bg-[var(--c-line)] text-white font-sans text-xs shadow-lg select-none animate-fade-in">
          <span className="pointer-events-none">{toastData.msg}</span>
          {toastData.action && (
            <button
              onClick={() => { toastData.action!.onClick(); setToastData(null); }}
              className="px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 transition-colors text-white font-sans text-[11px] whitespace-nowrap"
            >
              {toastData.action.label}
            </button>
          )}
        </div>
      )}
      {topBarVisible && (
        <TopBar
          onShowAbout={() => setShowWelcome(true)}
          onNewNote={handleNewNote}
          onToggleTimer={() => setShowTimer((v) => !v)}
          explorerOpen={!explorerCollapsed}
          onToggleExplorer={() => {
            setExplorerCollapsed((v) => !v);
          }}
          onWorkspaceOpened={() => {
            setExplorerCollapsed(false);
            setExplorerOpen(true);
          }}
          onToggleJira={() => setJiraOpen((v) => !v)}
          onToggleSearch={() => setSearchOpen((v) => !v)}
          workspaceOffset={documentFrameOffset}
          templatesOpen={templatesOpen}
          onTemplatesOpenChange={setTemplatesOpen}
        />
      )}
      {showTimer && <TimerWidget onClose={() => setShowTimer(false)} />}
      {jiraOpen && <JiraPanel onClose={() => setJiraOpen(false)} />}
      {searchOpen && <SearchBar onClose={() => setSearchOpen(false)} />}
      <WorkspaceShareModal
        open={workspaceShareOpen}
        onClose={() => setWorkspaceShareOpen(false)}
        onOpenSync={openCloudModal}
      />
      {showBraveNotice && (
        <div
          className="absolute left-0 right-0 z-50 flex items-center justify-between gap-3 bg-orange-500 text-white text-xs px-4 py-2"
          style={{
            top: documentFullscreenOwnsTop || canvasDocumentOwnsTop ? 0 : (topBarOccupiesSpace ? TOP_BAR_HEIGHT : 0),
            zIndex: documentFullscreenOwnsTop ? DOCUMENT_FULLSCREEN_Z + 20 : 50,
          }}
        >
          <span>
            🦁 <strong>Brave browser detected:</strong> Workspace folders can work here, but if <strong>Open folder</strong> does nothing, click the 🦁 icon in the address bar and disable <strong>Shields</strong> for this page.
          </span>
          <button
            onClick={() => setShowBraveNotice(false)}
            className="shrink-0 opacity-75 hover:opacity-100 font-bold"
          >
            ✕
          </button>
        </div>
      )}
      {showMobileWorkspaceNotice && (
        <div
          className="absolute left-0 right-0 z-50 flex items-center justify-between gap-3 bg-amber-600 text-white text-xs px-4 py-2"
          style={{
            top: documentFullscreenOwnsTop || canvasDocumentOwnsTop
              ? (showBraveNotice ? NOTICE_HEIGHT : 0)
              : (topBarOccupiesSpace ? TOP_BAR_HEIGHT : 0) + (showBraveNotice ? NOTICE_HEIGHT : 0),
            zIndex: documentFullscreenOwnsTop ? DOCUMENT_FULLSCREEN_Z + 20 : 50,
          }}
        >
          <span>
            <strong>Mobile device detected:</strong> Opening folder workspaces is only supported on desktop browsers and the desktop app right now.
          </span>
          <button
            onClick={() => setShowMobileWorkspaceNotice(false)}
            className="shrink-0 opacity-75 hover:opacity-100 font-bold"
          >
            ✕
          </button>
        </div>
      )}
      {explorerVisible && (
        <div
          className={`workspace-explorer-shell ${explorerCollapsed ? 'is-collapsed' : 'is-expanded'}`}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: explorerCollapsed ? EXPLORER_COLLAPSED_WIDTH : sidebarWidth,
            zIndex: 520,
            borderRight: explorerCollapsed ? 'none' : '0.5px solid var(--c-sidebar-border)',
            background: 'var(--c-sidebar)',
            boxShadow: 'none',
            overflow: 'hidden',
            transition: sidebarResizing ? 'none' : 'width 0.2s ease',
          }}
        >
          {explorerCollapsed ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                // The rail is narrower than the macOS traffic lights, so the
                // buttons drop below them rather than insetting from the left.
                padding: IS_MACOS_DESKTOP ? '44px 0 8px' : '8px 0',
                background: '#f7f6f4',
                borderRight: '0.5px solid #e2e0dc',
              }}
            >
              <CollapsedRailTooltip label="App menu">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent('devboard:toggle-app-menu', { detail: { left: 8 } }));
                  }}
                  aria-label="App menu"
                  style={railButtonStyle()}
                  {...railHoverHandlers()}
                >
                  <img src={devboardIconUrl} alt="" draggable={false} style={{ width: 19, height: 19, borderRadius: 4 }} />
                </button>
              </CollapsedRailTooltip>
              <div style={{ width: 24, height: 0.5, background: '#e2e0dc', flexShrink: 0 }} />
              <CollapsedRailTooltip label="Folders">
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  aria-label="Folders"
                  style={railButtonStyle(!searchOpen)}
                  {...railHoverHandlers(!searchOpen)}
                >
                  <i className="ti ti-folder" aria-hidden="true" />
                </button>
              </CollapsedRailTooltip>
              <CollapsedRailTooltip label="Search">
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  aria-label="Search"
                  style={railButtonStyle(searchOpen)}
                  {...railHoverHandlers(searchOpen)}
                >
                  <i className="ti ti-search" aria-hidden="true" />
                </button>
              </CollapsedRailTooltip>
              <CollapsedRailTooltip label="New note">
                <button
                  type="button"
                  onClick={handleNewNote}
                  aria-label="New note"
                  style={railButtonStyle(false, true)}
                  {...railHoverHandlers(false, true)}
                >
                  <i className="ti ti-plus" aria-hidden="true" />
                </button>
              </CollapsedRailTooltip>
              <CollapsedRailTooltip label="Sync" style={{ marginTop: 'auto' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openCloudModal();
                  }}
                  aria-label="Open Workspace Sync"
                  style={railButtonStyle(false)}
                  {...railHoverHandlers()}
                >
                  <i className="ti ti-cloud" aria-hidden="true" />
                  {syncDotColor && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        top: 7,
                        right: 7,
                        width: 5,
                        height: 5,
                        borderRadius: 999,
                        background: syncDotColor,
                      }}
                    />
                  )}
                </button>
              </CollapsedRailTooltip>
              <CollapsedRailTooltip label="Account">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openCloudModal();
                  }}
                  aria-label="Account"
                  style={railButtonStyle()}
                  {...railHoverHandlers()}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      background: '#c9895c',
                      color: '#fff',
                      fontFamily: 'var(--font-ui)',
                      fontSize: 10,
                      fontWeight: 800,
                      lineHeight: 1,
                    }}
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      accountInitials
                    )}
                  </span>
                </button>
              </CollapsedRailTooltip>
            </div>
          ) : (
            <>
              <WorkspaceExplorer
                onClose={() => setExplorerCollapsed(true)}
                onCollapse={() => setExplorerCollapsed(true)}
                onToggleSearch={() => setSearchOpen((v) => !v)}
                onToggleTimer={() => setShowTimer((v) => !v)}
                onToggleJira={() => setJiraOpen((v) => !v)}
                onExportBoardPng={handleExportBoardPng}
                canClose={false}
              />
            </>
          )}
        </div>
      )}
      {explorerVisible && !explorerCollapsed && (
        <div
          aria-hidden="true"
          title="Drag to resize sidebar"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: sidebarWidth - 3,
            width: 6,
            cursor: 'col-resize',
            zIndex: 521,
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            sidebarResizeRef.current = true;
            setSidebarResizing(true);
            const startX = e.clientX;
            const startW = sidebarWidth;
            const onMove = (ev: MouseEvent) => {
              if (!sidebarResizeRef.current) return;
              setSidebarWidth(startW + (ev.clientX - startX));
            };
            const onUp = () => {
              sidebarResizeRef.current = false;
              setSidebarResizing(false);
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
        />
      )}
      {showMobileNavigator ? (
        <MobileNav
          onOpenSync={() => openCloudModal()}
          onOpenAccount={() => openCloudModal()}
        />
      ) : (
        <div
        style={{
          position: 'absolute',
          top: contentTop,
          right: 0,
          bottom: 0,
          left: explorerOffset,
          transition: sidebarResizing ? 'none' : 'left 190ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {isStackPage ? (
          <StackView pageId={activePageId} pageName={activePage?.name ?? ''} />
        ) : (
          <>
            <Canvas onBackgroundInteract={dismissSidePanelFromCanvas} />
            {activeCanvasDocument && activeCanvasParentPage && (
              <button
                type="button"
                onClick={() => switchPage(activeCanvasParentPage.id)}
                title={`Back to ${activeCanvasParentPage.name}`}
                aria-label={`Back to ${activeCanvasParentPage.name}`}
                style={{
                  position: 'absolute',
                  top: 14,
                  left: 14,
                  zIndex: 30,
                  height: 32,
                  maxWidth: 'min(320px, calc(100% - 28px))',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '0 11px 0 9px',
                  border: '0.5px solid var(--c-border)',
                  borderRadius: 7,
                  background: 'var(--c-topbar)',
                  color: 'var(--c-text-md)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-ui)',
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--c-hover)';
                  e.currentTarget.style.color = 'var(--c-text-hi)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--c-topbar)';
                  e.currentTarget.style.color = 'var(--c-text-md)';
                }}
              >
                <IconArrowLeft size={14} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Back to {activeCanvasParentPage.name}
                </span>
              </button>
            )}
          </>
        )}
        </div>
      )}
      {!showMobileNavigator && !isStackPage && appMode !== 'document' && <Toolbar onMobileExpandedChange={setMobileCanvasToolsExpanded} />}
      {!showMobileNavigator && !isStackPage && appMode !== 'document' && <ZoomToolbar hideOnMobile={mobileCanvasToolsExpanded} />}
      {appMode !== 'document' && <FocusMode />}
      {showOnboarding && (
        <OnboardingModal
          onClose={() => setShowOnboarding(false)}
          onCreateProject={() => {
            setShowOnboarding(false);
            window.dispatchEvent(new CustomEvent('devboard:create-project'));
          }}
          onStartWriting={() => {
            setShowOnboarding(false);
            handleNewNote();
          }}
          onStartMapping={() => {
            setShowOnboarding(false);
            handleNewCanvas();
          }}
          onShowTemplates={() => {
            setShowOnboarding(false);
            setTemplatesOpen(true);
          }}
        />
      )}
      {showWelcome && <WelcomeModal onClose={handleCloseWelcome} />}

      {/* Mounted here rather than in TopBar: the top bar unmounts on mobile
          viewports and in canvas document mode, and every "Fix in Project Sync" /
          "Open Project Sync" entry point is an event dispatch. When the only
          listener lived in TopBar, those buttons silently did nothing. */}
      <CloudModal open={cloudModalOpen} onClose={() => setCloudModalOpen(false)} initialTab={cloudModalTab} />

      <QuickSwitcher
        open={qsOpen}
        onClose={() => setQsOpen(false)}
        onPickPage={(id) => {
          setQsOpen(false);
          if (morphPhase !== 'idle') snapCloseDoc();
          useBoardStore.getState().switchPage(id);
        }}
        onPickDoc={(id) => {
          setQsOpen(false);
          const state = useBoardStore.getState();
          const doc = state.documents.find((d) => d.id === id);
          if (doc?.docType === 'canvas') {
            state.openCanvasDocument(id);
            return;
          }
          if (doc?.pageId && doc.pageId !== state.activePageId) state.switchPage(doc.pageId);
          const targetPageId = doc?.pageId ?? state.activePageId;
          const page = state.pages.find((entry) => entry.id === targetPageId);
          if (page && !page.isCanvasDocument && !isMobileViewport) {
            state.setDocViewMode('fullscreen');
            state.setOpenPanelDocId(null);
            state.openDocumentWithMorph(id);
            return;
          }
          state.openDocumentWithMorph(id);
        }}
        onPickNode={(id) => {
          setQsOpen(false);
          if (morphPhase !== 'idle') {
            snapCloseDoc();
            setTimeout(() => focusNode(id), 50);
          } else {
            focusNode(id);
          }
        }}
      />

      {/* ── Side panel (default mode) ───────────────────────────────── */}
      {effectiveDocViewMode === 'panel' && panelPhase !== 'idle' && (() => {
        const panelRect = getPanelRect();
        return (
          <div
            ref={docPanelRef}
            style={{
              position: 'fixed',
              top: panelRect.top,
              right: panelPhase === 'open' ? 0 : -panelRect.width,
              width: panelRect.width,
              bottom: 0,
              zIndex: DOCUMENT_FULLSCREEN_Z,
              transition: `right ${PANEL_SLIDE_MS}ms cubic-bezier(0.22,1,0.36,1)`,
              boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
              borderLeft: '1px solid var(--c-border)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: -3,
                width: 6,
                bottom: 0,
                cursor: 'col-resize',
                zIndex: 12,
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                sidePanelDragRef.current = true;
                const startX = e.clientX;
                const startW = panelRect.width;
                const onMove = (ev: MouseEvent) => {
                  if (!sidePanelDragRef.current) return;
                  const maxWidth = Math.max(380, window.innerWidth - documentFrameOffset - 120);
                  const next = Math.max(380, Math.min(maxWidth, startW - (ev.clientX - startX)));
                  setDocPanelWidth(next);
                };
                const onUp = () => {
                  sidePanelDragRef.current = false;
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
            />
            <DocumentMode onClose={closeDoc} onExpand={expandToFullscreen} panelMode />
          </div>
        );
      })()}

      {/* ── Full-screen morph overlay (expand mode) ──────────────────── */}
      {effectiveDocViewMode === 'fullscreen' && morphPhase !== 'idle' && (() => {
        const W = window.innerWidth;
        const H = window.innerHeight;
        const src = morphRectOverride ?? morphSourceRect;
        const isOpen = morphPhase === 'open';
        const frameStyle: React.CSSProperties = {
          position: 'fixed',
          left: isOpen ? documentFrameOffset : (src?.left ?? documentFrameOffset + (W - documentFrameOffset) / 2 - 150),
          top: isOpen ? documentFullscreenTop : (src?.top ?? H / 2 - 100),
          width: isOpen ? Math.max(0, W - documentFrameOffset) : (src?.width ?? 300),
          height: isOpen ? Math.max(0, H - documentFullscreenTop) : (src?.height ?? 200),
          borderRadius: isOpen ? 0 : 10,
          overflow: 'hidden',
          transition: `left ${MORPH_MS}ms ease, top ${MORPH_MS}ms ease, width ${MORPH_MS}ms ease, height ${MORPH_MS}ms ease, border-radius ${MORPH_MS}ms ease`,
        };
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: DOCUMENT_FULLSCREEN_Z, pointerEvents: 'none' }}>
            <div style={{
              position: 'fixed',
              left: documentFrameOffset,
              top: documentFullscreenTop,
              width: Math.max(0, W - documentFrameOffset),
              height: Math.max(0, H - documentFullscreenTop),
              background: 'rgba(0,0,0,0.45)',
              opacity: isOpen ? 1 : 0,
              transition: `opacity ${MORPH_MS}ms ease`,
              pointerEvents: 'none',
            }} />
            <div style={{ ...frameStyle, pointerEvents: 'auto' }}>
              <DocumentMode
                onClose={closeDoc}
                onCollapseToPanel={isMobileViewport || isStackPage ? undefined : collapseToPanel}
              />
            </div>
          </div>
        );
      })()}
    </div>
  );
}
