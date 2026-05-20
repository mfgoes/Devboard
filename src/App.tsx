import React, { useEffect, useState, useRef, useCallback } from 'react';
import { saveBoard } from './utils/fileSave';
import { saveWorkspace, getWorkspaceName, restoreWorkspace, setOnWorkspaceSavedCallback, MOBILE_WORKSPACE_WARNING_EVENT } from './utils/workspaceManager';
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

// Tauri event listener — only active when running inside a Tauri window
async function listenTauriMenus(handlers: Record<string, () => void>) {
  try {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten: Array<() => void> = [];
    for (const [event, handler] of Object.entries(handlers)) {
      unlisten.push(await listen(event, handler));
    }
    // URL opener (help menu links)
    const { listen: listenUrl } = await import('@tauri-apps/api/event');
    unlisten.push(await listenUrl('menu:open_url', (e) => {
      window.open(e.payload as string, '_blank', 'noopener');
    }));
    // Tool switcher (View > Tools menu)
    unlisten.push(await listen('menu:tool', (e) => {
      useBoardStore.getState().setActiveTool(e.payload as import('./types').Tool);
    }));
    return () => unlisten.forEach((u) => u());
  } catch {
    return () => {};
  }
}
import Canvas from './components/Canvas';
import Toolbar from './components/Toolbar';
import ZoomToolbar from './components/ZoomToolbar';
import TopBar from './components/TopBar';
import WelcomeModal from './components/WelcomeModal';
import OnboardingModal from './components/OnboardingModal';
import FocusMode from './components/FocusMode';
import DocumentMode from './components/DocumentMode';
import StackView from './components/StackView';
import QuickSwitcher from './components/QuickSwitcher';
import TimerWidget from './components/TimerWidget';
import WorkspaceExplorer, { WORKSPACE_EXPLORER_WIDTH } from './components/WorkspaceExplorer';
import JiraPanel from './components/JiraPanel';
import SearchBar from './components/SearchBar';
import { useBoardStore } from './store/boardStore';
import { useAuth } from './contexts/AuthContext';
import { applyTheme } from './theme';

const EXPLORER_COLLAPSED_WIDTH = 44;
const EXPLORER_EXPAND_HIT_WIDTH = 64;
const DESKTOP_EXPLORER_BREAKPOINT = 1024;
const MOBILE_NOTE_BREAKPOINT = 768;
const IS_WINDOWS = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');

function shouldKeepSidePanelOpenForTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest([
    'button',
    'a',
    'input',
    'textarea',
    'select',
    '[contenteditable="true"]',
    '[data-side-panel-open-target="true"]',
    '[data-native-clipboard="true"]',
    '[role="button"]',
    '[role="menu"]',
    '[role="dialog"]',
  ].join(','));
}

function loadFromHash() {
  const hash = window.location.hash;
  const match = hash.match(/^#board=(.+)$/);
  if (!match) return;
  try {
    const decoded = decodeURIComponent(escape(atob(match[1])));
    const data = JSON.parse(decoded);
    if (data.nodes && Array.isArray(data.nodes)) {
      useBoardStore.getState().loadBoard(data);
      history.replaceState(null, '', window.location.pathname);
    }
  } catch {
    console.warn('Failed to load board from URL hash.');
  }
}

async function isBraveBrowser(): Promise<boolean> {
  return !!(navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }).brave?.isBrave
    && await (navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }).brave!.isBrave!();
}

function generateId() { return Math.random().toString(36).slice(2, 11); }

export default function App() {
  const { user } = useAuth();
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
  const [updateBusy, setUpdateBusy] = useState(false);
  const [mobileCanvasToolsExpanded, setMobileCanvasToolsExpanded] = useState(false);
  const explorerOpen = useBoardStore((s) => s.explorerOpen);
  const setExplorerOpen = useBoardStore((s) => s.setExplorerOpen);
  const appMode = useBoardStore((s) => s.appMode);
  const pages = useBoardStore((s) => s.pages);
  const activePageId = useBoardStore((s) => s.activePageId);
  const morphSourceRect = useBoardStore((s) => s.morphSourceRect);
  const documentOpenTransition = useBoardStore((s) => s.documentOpenTransition);
  const closeDocument = useBoardStore((s) => s.closeDocument);
  const addDocument = useBoardStore((s) => s.addDocument);
  const openDocumentWithMorph = useBoardStore((s) => s.openDocumentWithMorph);
  const docViewMode = useBoardStore((s) => s.docViewMode);
  const setDocViewMode = useBoardStore((s) => s.setDocViewMode);

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

  const activePage = pages.find((p) => p.id === activePageId);
  const isStackPage = activePage?.layoutMode === 'stack';

  useEffect(() => {
    const label = boardTitle.trim() || workspaceName;
    document.title = label ? `${label} — DevBoard` : 'DevBoard';
  }, [boardTitle, workspaceName]);
  const activeNoticeCount = Number(showBraveNotice) + Number(showMobileWorkspaceNotice);
  const contentTop = 44 + activeNoticeCount * 40;
  const [explorerWidth, setExplorerWidth] = useState(WORKSPACE_EXPLORER_WIDTH);
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [explorerPreviewOpen, setExplorerPreviewOpen] = useState(false);
  const [desktopExplorerPinned, setDesktopExplorerPinned] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth >= DESKTOP_EXPLORER_BREAKPOINT : true
  ));
  const [isMobileViewport, setIsMobileViewport] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_NOTE_BREAKPOINT : false
  ));
  const explorerVisible = desktopExplorerPinned || explorerOpen;
  const explorerOffset = explorerVisible ? (explorerCollapsed ? EXPLORER_COLLAPSED_WIDTH : explorerWidth) : 0;
  const documentFrameOffset = isMobileViewport ? 0 : explorerOffset;
  const explorerDragRef = useRef(false);
  const explorerPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidePanelDragRef = useRef(false);
  const documentTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docPanelRef = useRef<HTMLDivElement>(null);
  const [docPanelWidth, setDocPanelWidth] = useState(() => (
    typeof window !== 'undefined'
      ? Math.max(440, Math.min(760, Math.round(window.innerWidth * 0.44)))
      : 560
  ));
  const effectiveDocViewMode = isMobileViewport || isStackPage ? 'fullscreen' : docViewMode;

  // ── Zoom-morph state machine ─────────────────────────────────────────────
  const MORPH_MS = 380;
  const PANEL_SLIDE_MS = 220;
  const [morphPhase, setMorphPhase] = useState<'idle' | 'opening' | 'open' | 'closing'>('idle');
  const [panelPhase, setPanelPhase] = useState<'idle' | 'open' | 'closing'>('idle');
  const [morphRectOverride, setMorphRectOverride] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const prevPresentation = useRef({ appMode, docViewMode: effectiveDocViewMode });

  const getPanelRect = useCallback(() => {
    const maxWidth = Math.max(380, window.innerWidth - documentFrameOffset - 120);
    const panelWidth = window.innerWidth < 640
      ? window.innerWidth
      : Math.max(380, Math.min(maxWidth, docPanelWidth));
    return {
      left: window.innerWidth - panelWidth,
      top: contentTop,
      width: panelWidth,
      height: Math.max(0, window.innerHeight - contentTop),
    };
  }, [contentTop, docPanelWidth, documentFrameOffset]);

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

  // Cmd+N on stack pages → new note
  const handleNewNote = useCallback(() => {
    const pageId = useBoardStore.getState().activePageId;
    const id = addDocument({ title: '', content: '', pageId });
    useBoardStore.getState().ensureDocumentNode(id, pageId);
    openDocumentWithMorph(id);
  }, [addDocument, openDocumentWithMorph]);

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

  const openExplorerPreview = useCallback(() => {
    if (!explorerCollapsed) return;
    if (explorerPreviewTimerRef.current) {
      clearTimeout(explorerPreviewTimerRef.current);
      explorerPreviewTimerRef.current = null;
    }
    setExplorerPreviewOpen(true);
  }, [explorerCollapsed]);

  const scheduleExplorerPreviewClose = useCallback(() => {
    if (explorerPreviewTimerRef.current) clearTimeout(explorerPreviewTimerRef.current);
    explorerPreviewTimerRef.current = setTimeout(() => {
      setExplorerPreviewOpen(false);
      explorerPreviewTimerRef.current = null;
    }, 120);
  }, []);

  useEffect(() => () => {
    if (explorerPreviewTimerRef.current) clearTimeout(explorerPreviewTimerRef.current);
  }, []);

  useEffect(() => {
    if (explorerVisible && explorerCollapsed) return;
    setExplorerPreviewOpen(false);
  }, [explorerCollapsed, explorerVisible]);

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
    if (!desktopExplorerPinned && !explorerOpen) setExplorerCollapsed(false);
  }, [desktopExplorerPinned, explorerOpen]);

  useEffect(() => {
    const onResize = () => {
      setDesktopExplorerPinned(window.innerWidth >= DESKTOP_EXPLORER_BREAKPOINT);
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

  // Register callback so the explorer tree reloads after every workspace save.
  useEffect(() => {
    setOnWorkspaceSavedCallback(() => useBoardStore.getState().bumpWorkspaceSaved());
  }, []);

  // Restore previously granted localhost workspace handle when possible.
  useEffect(() => {
    restoreWorkspace().then((result) => {
      if (!result) return;
      useBoardStore.getState().setWorkspaceName(result.name);
      useBoardStore.getState().bumpWorkspaceSaved();
      if (result.data) useBoardStore.getState().loadBoard(result.data);
      applyWorkspaceSyncFromOpenResult(result);
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
      const now = Date.now();
      const stackPageId = 'page-1';
      const canvasPageId = 'page-2';

      store.loadBoard({
        boardTitle: 'Welcome to DevBoard',
        nodes: [],
        pages: [
          {
            id: stackPageId,
            name: 'Start here',
            layoutMode: 'stack',
            noteSort: 'custom',
            nodes: [],
            camera: { x: 0, y: 0, scale: 1 },
          },
          {
            id: canvasPageId,
            name: 'Canvas',
            layoutMode: 'freeform',
            noteSort: 'updated',
            nodes: [
              {
                id: generateId(),
                type: 'textblock',
                x: 120,
                y: 110,
                text: 'Use this page when notes need a spatial layout.',
                fontSize: 16,
                width: 320,
                color: 'auto',
                bold: false,
                italic: true,
                underline: false,
              } as import('./types').TextBlockNode,
            ],
            camera: { x: 0, y: 0, scale: 1 },
          },
        ],
        activePageId: stackPageId,
        documents: [
          {
            id: 'doc_welcome_workspace',
            title: 'Open or create a workspace folder',
            emoji: '📁',
            pageId: stackPageId,
            orderIndex: 0,
            createdAt: now,
            updatedAt: now,
            tags: ['workspace'],
            content: '<p>Start by attaching a real workspace folder so your board, notes, and files live together.</p><p>Use the top bar to <strong>Open workspace folder</strong> for an existing project, or <strong>Create workspace folder</strong> to start fresh.</p><p>Once connected, DevBoard can keep notes beside your project files instead of in a throwaway canvas.</p>',
          },
          {
            id: 'doc_welcome_notes',
            title: 'Jot down notes first',
            emoji: '📝',
            pageId: stackPageId,
            orderIndex: 1,
            createdAt: now,
            updatedAt: now,
            tags: ['notes'],
            content: '<p>This page opens in <strong>Stack mode</strong> so new ideas start as simple notes, not scattered stickies.</p><p>Use <strong>⌘N</strong> to make a note and capture:</p><ul><li>next steps</li><li>questions</li><li>ideas worth keeping</li></ul><p>Think of this as your project notebook.</p>',
          },
          {
            id: 'doc_welcome_canvas',
            title: 'Switch to canvas when ideas need space',
            emoji: '🗺️',
            pageId: stackPageId,
            orderIndex: 2,
            createdAt: now,
            updatedAt: now,
            tags: ['canvas'],
            content: '<p>Canvas is still there when you need it.</p><p>Use it for spatial work like arranging stickies, drawing flows, or mapping relationships. Start with notes, then switch a page to <strong>Canvas</strong> mode when the work becomes visual.</p>',
          },
        ],
        schemaVersion: 3,
      });
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
        const data = useBoardStore.getState().exportData();
        if (getWorkspaceName()) {
          saveWorkspace(data, { notify: false }).then((result) => {
            if (!result.saved) return;
            announceLocalSave('workspace');
          });
        } else {
          saveBoard(data, { notify: false }).then((result) => {
            if (!result.saved) return;
            announceLocalSave('file');
          });
        }
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
  }, []);

  // Wire macOS native menu events → app actions
  useEffect(() => {
    let cleanup = () => {};
    listenTauriMenus({
      'menu:new_board':    () => useBoardStore.getState().loadBoard({ boardTitle: 'Untitled Board', nodes: [] }),
      'menu:new_note':     () => handleNewNote(),
      'menu:save':         () => {
        if (requestActiveDocumentSave()) return;
        const data = useBoardStore.getState().exportData();
        if (getWorkspaceName()) {
          void saveWorkspace(data, { notify: false }).then((result) => {
            if (!result.saved) return;
            announceLocalSave('workspace');
          });
        } else {
          void saveBoard(data, { notify: false }).then((result) => {
            if (!result.saved) return;
            announceLocalSave('file');
          });
        }
      },
      'menu:save_as':      () => import('./utils/fileSave').then(m => m.saveBoardAs(useBoardStore.getState().exportData())),
      'menu:export_png':   () => {
        const c = document.querySelector<HTMLCanvasElement>('.konvajs-content canvas');
        c?.toBlob(b => {
          if (!b) return;
          import('file-saver').then(({ saveAs }) => saveAs(b, `${useBoardStore.getState().boardTitle}.png`));
        });
      },
      'menu:zoom_in':      () => { const s = useBoardStore.getState(); s.setCamera({ scale: Math.min(s.camera.scale * 1.2, 8) }); },
      'menu:zoom_out':     () => { const s = useBoardStore.getState(); s.setCamera({ scale: Math.max(s.camera.scale / 1.2, 0.08) }); },
      'menu:zoom_reset':   () => useBoardStore.getState().setCamera({ scale: 1, x: 0, y: 0 }),
      'menu:toggle_theme': () => useBoardStore.getState().toggleTheme(),
      'menu:check_updates': () => { void runUpdateCheck(true); },
    }).then(fn => { cleanup = fn; });
    return () => cleanup();
  }, [handleNewNote, requestActiveDocumentSave, runUpdateCheck]);

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
      <TopBar
        onShowAbout={() => setShowWelcome(true)}
        onNewNote={handleNewNote}
        timerVisible={showTimer}
        onToggleTimer={() => setShowTimer((v) => !v)}
        explorerOpen={explorerVisible}
        onToggleExplorer={() => {
          if (desktopExplorerPinned) {
            setExplorerCollapsed((v) => !v);
          } else if (explorerOpen) {
            setExplorerOpen(false);
          } else {
            setExplorerCollapsed(false);
            setExplorerOpen(true);
          }
        }}
        onWorkspaceOpened={() => {
          setExplorerCollapsed(false);
          setExplorerOpen(true);
        }}
        jiraOpen={jiraOpen}
        onToggleJira={() => setJiraOpen((v) => !v)}
        onToggleSearch={() => setSearchOpen((v) => !v)}
        templatesOpen={templatesOpen}
        onTemplatesOpenChange={setTemplatesOpen}
      />
      {showTimer && <TimerWidget onClose={() => setShowTimer(false)} />}
      {jiraOpen && <JiraPanel onClose={() => setJiraOpen(false)} />}
      {searchOpen && <SearchBar onClose={() => setSearchOpen(false)} />}
      {showBraveNotice && (
        <div className="absolute top-11 left-0 right-0 z-50 flex items-center justify-between gap-3 bg-orange-500 text-white text-xs px-4 py-2">
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
          style={{ top: showBraveNotice ? 84 : 44 }}
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
            width: explorerCollapsed ? EXPLORER_COLLAPSED_WIDTH : explorerWidth,
            zIndex: 180,
            borderRight: '1px solid var(--c-border)',
            background: 'var(--c-panel)',
            boxShadow: explorerCollapsed ? '6px 0 18px rgba(0,0,0,0.06)' : '8px 0 24px rgba(0,0,0,0.08)',
            overflow: 'hidden',
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
                padding: '10px 0',
              }}
            >
              <button
                type="button"
                onMouseEnter={openExplorerPreview}
                onClick={() => {
                  setExplorerPreviewOpen(false);
                  setExplorerCollapsed(false);
                }}
                title="Open sidebar"
                aria-label="Open sidebar"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
              >
                <svg width="16" height="16" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                  <path d="M3 4h9M3 7.5h9M3 11h9" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openCloudModal();
                }}
                title={accountLabel}
                aria-label="Open Workspace Sync"
                className="mt-auto flex items-center justify-center rounded-full transition-colors hover:bg-[var(--c-hover)]"
                style={{
                  width: 34,
                  height: 34,
                  padding: 3,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
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
                    background: 'var(--c-line)',
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
            </div>
          ) : (
            <>
              <WorkspaceExplorer onClose={() => setExplorerOpen(false)} onCollapse={() => setExplorerCollapsed(true)} canClose={!desktopExplorerPinned} />
              {/* Resize handle */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  right: -3,
                  width: 6,
                  bottom: 0,
                  cursor: 'col-resize',
                  zIndex: 10,
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  explorerDragRef.current = true;
                  const startX = e.clientX;
                  const startW = explorerWidth;
                  const onMove = (ev: MouseEvent) => {
                    if (!explorerDragRef.current) return;
                    const next = Math.max(180, Math.min(560, startW + ev.clientX - startX));
                    setExplorerWidth(next);
                  };
                  const onUp = () => {
                    explorerDragRef.current = false;
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                  };
                  window.addEventListener('mousemove', onMove);
                  window.addEventListener('mouseup', onUp);
                }}
              />
            </>
          )}
        </div>
      )}
      {explorerVisible && explorerCollapsed && (
        <div
          onClick={() => {
            setExplorerPreviewOpen(false);
            setExplorerCollapsed(false);
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: EXPLORER_EXPAND_HIT_WIDTH,
            zIndex: 175,
            border: 'none',
            padding: 0,
            background: 'transparent',
            cursor: 'pointer',
          }}
        />
      )}
      {explorerVisible && explorerCollapsed && explorerPreviewOpen && (
        <div
          onMouseEnter={openExplorerPreview}
          onMouseLeave={scheduleExplorerPreviewClose}
          className="animate-sidebar-preview-in"
          style={{
            position: 'absolute',
            top: 8,
            left: 0,
            bottom: 12,
            width: Math.min(300, explorerWidth, WORKSPACE_EXPLORER_WIDTH),
            zIndex: 230,
            border: '1px solid var(--c-border)',
            borderLeft: 'none',
            borderRadius: '0 14px 14px 0',
            background: 'var(--c-panel)',
            boxShadow: '18px 0 44px rgba(0,0,0,0.22)',
            overflow: 'hidden',
            transformOrigin: 'left center',
          }}
        >
          <WorkspaceExplorer
            onClose={() => {
              setExplorerPreviewOpen(false);
              setExplorerOpen(false);
            }}
            onCollapse={() => {
              setExplorerPreviewOpen(false);
              setExplorerCollapsed(false);
            }}
            canClose={!desktopExplorerPinned}
            collapseIcon="open"
          />
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          top: contentTop,
          right: 0,
          bottom: 0,
          left: explorerOffset,
          transition: 'left 190ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {isStackPage ? (
          <StackView pageId={activePageId} pageName={activePage?.name ?? ''} />
        ) : (
          <Canvas onBackgroundInteract={dismissSidePanelFromCanvas} />
        )}
      </div>
      {!isStackPage && appMode !== 'document' && <Toolbar onMobileExpandedChange={setMobileCanvasToolsExpanded} />}
      {!isStackPage && appMode !== 'document' && <ZoomToolbar hideOnMobile={mobileCanvasToolsExpanded} />}
      {appMode !== 'document' && <FocusMode />}
      {showOnboarding && (
        <OnboardingModal
          onClose={() => setShowOnboarding(false)}
          onStartWriting={() => {
            setShowOnboarding(false);
            const state = useBoardStore.getState();
            state.setPageLayoutMode(state.activePageId, 'stack');
            handleNewNote();
          }}
          onStartMapping={() => {
            setShowOnboarding(false);
            const state = useBoardStore.getState();
            state.setPageLayoutMode(state.activePageId, 'freeform');
          }}
          onShowTemplates={() => {
            setShowOnboarding(false);
            setTemplatesOpen(true);
          }}
        />
      )}
      {showWelcome && <WelcomeModal onClose={handleCloseWelcome} />}

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
          if (doc?.pageId && doc.pageId !== state.activePageId) state.switchPage(doc.pageId);
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
              zIndex: 170,
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
          top: isOpen ? contentTop : (src?.top ?? H / 2 - 100),
          width: isOpen ? Math.max(0, W - documentFrameOffset) : (src?.width ?? 300),
          height: isOpen ? Math.max(0, H - contentTop) : (src?.height ?? 200),
          borderRadius: isOpen ? 0 : 10,
          overflow: 'hidden',
          transition: `left ${MORPH_MS}ms ease, top ${MORPH_MS}ms ease, width ${MORPH_MS}ms ease, height ${MORPH_MS}ms ease, border-radius ${MORPH_MS}ms ease`,
        };
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 170, pointerEvents: 'none' }}>
            <div style={{
              position: 'fixed',
              left: documentFrameOffset,
              top: contentTop,
              width: Math.max(0, W - documentFrameOffset),
              height: Math.max(0, H - contentTop),
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
