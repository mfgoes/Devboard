import React, { useEffect, useState, useRef, useCallback } from 'react';
import { saveBoard } from './utils/fileSave';
import { saveWorkspace, getWorkspaceName, restoreWorkspace, setOnWorkspaceSavedCallback, MOBILE_WORKSPACE_WARNING_EVENT } from './utils/workspaceManager';
import { setToastListener, toast, ToastPayload } from './utils/toast';

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
import PagesPanel from './components/PagesPanel';
import TimerWidget from './components/TimerWidget';
import WorkspaceExplorer, { WORKSPACE_EXPLORER_WIDTH } from './components/WorkspaceExplorer';
import JiraPanel from './components/JiraPanel';
import SearchBar from './components/SearchBar';
import { useBoardStore } from './store/boardStore';
import { STICKER_KEYS } from './assets/stickerAssets';
import { DEMO_COLORS } from './utils/palette';

const EXPLORER_COLLAPSED_WIDTH = 28;

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
  // Only show welcome modal when explicitly triggered (logo click)
  const [showWelcome, setShowWelcome] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showBraveNotice, setShowBraveNotice] = useState(false);
  const [showMobileWorkspaceNotice, setShowMobileWorkspaceNotice] = useState(false);
  const [toastData, setToastData] = useState<ToastPayload | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const [showTimer, setShowTimer] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [jiraOpen, setJiraOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const explorerOpen = useBoardStore((s) => s.explorerOpen);
  const setExplorerOpen = useBoardStore((s) => s.setExplorerOpen);
  const appMode = useBoardStore((s) => s.appMode);
  const pages = useBoardStore((s) => s.pages);
  const activePageId = useBoardStore((s) => s.activePageId);
  const morphSourceRect = useBoardStore((s) => s.morphSourceRect);
  const closeDocument = useBoardStore((s) => s.closeDocument);
  const addDocument = useBoardStore((s) => s.addDocument);
  const openDocumentWithMorph = useBoardStore((s) => s.openDocumentWithMorph);

  const boardTitle = useBoardStore((s) => s.boardTitle);
  const workspaceName = useBoardStore((s) => s.workspaceName);

  const activePage = pages.find((p) => p.id === activePageId);
  const isStackPage = activePage?.layoutMode === 'stack';

  useEffect(() => {
    const label = workspaceName ?? boardTitle;
    document.title = label ? `${label} — DevBoard` : 'DevBoard';
  }, [boardTitle, workspaceName]);
  const activeNoticeCount = Number(showBraveNotice) + Number(showMobileWorkspaceNotice);
  const contentTop = 44 + activeNoticeCount * 40;
  const [explorerWidth, setExplorerWidth] = useState(WORKSPACE_EXPLORER_WIDTH);
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const explorerOffset = explorerOpen ? (explorerCollapsed ? EXPLORER_COLLAPSED_WIDTH : explorerWidth) : 0;
  const explorerDragRef = useRef(false);

  // ── Zoom-morph state machine ─────────────────────────────────────────────
  const MORPH_MS = 380;
  const [morphPhase, setMorphPhase] = useState<'idle' | 'opening' | 'open' | 'closing'>('idle');
  const prevAppMode = useRef(appMode);

  useEffect(() => {
    if (appMode === 'document' && prevAppMode.current !== 'document') {
      setMorphPhase('opening');
      requestAnimationFrame(() => requestAnimationFrame(() => setMorphPhase('open')));
    }
    prevAppMode.current = appMode;
  }, [appMode]);

  const closeDoc = useCallback(() => {
    setMorphPhase('closing');
    setTimeout(() => {
      closeDocument();
      setMorphPhase('idle');
    }, MORPH_MS);
  }, [closeDocument]);

  // Esc closes document
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && morphPhase === 'open') {
        e.preventDefault();
        closeDoc();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [morphPhase, closeDoc]);

  // Cmd+N on stack pages → new note
  const handleNewStackNote = useCallback(() => {
    const pageId = useBoardStore.getState().activePageId;
    const id = addDocument({ title: '', content: '', pageId });
    useBoardStore.getState().ensureDocumentNode(id, pageId);
    openDocumentWithMorph(id);
  }, [addDocument, openDocumentWithMorph]);

  // Snap-close doc without animation (used when jumping to a canvas node)
  const snapCloseDoc = useCallback(() => {
    closeDocument();
    setMorphPhase('idle');
  }, [closeDocument]);

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

  // Cmd+K quick switcher
  const [qsOpen, setQsOpen] = useState(false);

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
    if (!explorerOpen) setExplorerCollapsed(false);
  }, [explorerOpen]);

  const theme = useBoardStore((s) => s.theme);

  // Apply/remove light class on document root when theme changes
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
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

  // Seed welcome board on first visit (canvas-native start screen)
  useEffect(() => {
    const isFirstVisit = !localStorage.getItem('devboard-visited');
    if (!isFirstVisit) return;
    // Wait for hash-loading to settle, then check if board is still empty
    setTimeout(() => {
      const store = useBoardStore.getState();
      if (store.nodes.length > 0) return; // board was loaded from hash
      localStorage.setItem('devboard-visited', '1');

      const cx = Math.round(window.innerWidth / 2);
      const cy = Math.round(window.innerHeight / 2);

      // Sticker keys
      const sHappy    = STICKER_KEYS.find(k => k.includes('happy'))       ?? STICKER_KEYS[0];
      const sFire     = STICKER_KEYS.find(k => k.includes('fire'))        ?? STICKER_KEYS[0];
      const sThumbsUp = STICKER_KEYS.find(k => k.includes('thumbA.png'))  ?? STICKER_KEYS[0];
      const sDerpy    = STICKER_KEYS.find(k => k.includes('derpy'))       ?? STICKER_KEYS[0];

      // Pre-generate IDs so connectors can reference sticky nodes
      const idS1 = generateId(), idS2 = generateId(), idS3 = generateId();

      // Sticky geometry
      const SW = 210;  // sticky width
      const GAP = 44;  // gap between stickies
      const ROW_Y = cy - 40;

      const s1x = cx - SW * 1.5 - GAP;
      const s2x = cx - SW / 2;
      const s3x = cx + SW / 2 + GAP;

      store.loadBoard({
        boardTitle: 'Welcome to DevBoard',
        nodes: [
          // ── Header ──────────────────────────────────────────────────────────
          {
            id: generateId(), type: 'textblock',
            x: cx - 210, y: cy - 195,
            text: 'Welcome to DevBoard',
            fontSize: 28, width: 420, color: 'auto', bold: true, italic: false, underline: false,
          } as import('./types').TextBlockNode,
          {
            id: generateId(), type: 'textblock',
            x: cx - 200, y: cy - 148,
            text: 'A thinking canvas for solo devs. Drop ideas, connect them, ship faster.',
            fontSize: 13, width: 400, color: 'auto', bold: false, italic: true, underline: false,
          } as import('./types').TextBlockNode,

          // ── Three feature stickies ───────────────────────────────────────────
          {
            id: idS1, type: 'sticky',
            x: s1x, y: ROW_Y,
            text: 'Drop ideas\n\nSticky notes, shapes, text — put anything on the canvas.',
            color: DEMO_COLORS.ideas, width: SW, height: 130,
            fontSizeMode: 'fixed',
          } as import('./types').StickyNoteNode,
          {
            id: idS2, type: 'sticky',
            x: s2x, y: ROW_Y,
            text: 'Connect them\n\nDraw arrows between ideas to map flows and relationships.',
            color: DEMO_COLORS.connect, width: SW, height: 130,
            fontSizeMode: 'fixed',
          } as import('./types').StickyNoteNode,
          {
            id: idS3, type: 'sticky',
            x: s3x, y: ROW_Y,
            text: 'Share & export\n\nSave as PNG or a shareable link. Offline. No account.',
            color: DEMO_COLORS.share, width: SW, height: 130,
            fontSizeMode: 'fixed',
          } as import('./types').StickyNoteNode,

          // ── Connectors between stickies ──────────────────────────────────────
          {
            id: generateId(), type: 'connector',
            fromNodeId: idS1, fromAnchor: 'right', fromX: s1x + SW, fromY: ROW_Y + 65,
            toNodeId: idS2,   toAnchor: 'left',   toX: s2x,        toY: ROW_Y + 65,
            color: DEMO_COLORS.connector, strokeWidth: 2,
            lineStyle: 'curved', strokeStyle: 'solid',
            arrowHeadStart: 'none', arrowHeadEnd: 'arrow',
          } as import('./types').ConnectorNode,
          {
            id: generateId(), type: 'connector',
            fromNodeId: idS2, fromAnchor: 'right', fromX: s2x + SW, fromY: ROW_Y + 65,
            toNodeId: idS3,   toAnchor: 'left',   toX: s3x,        toY: ROW_Y + 65,
            color: DEMO_COLORS.connector, strokeWidth: 2,
            lineStyle: 'curved', strokeStyle: 'solid',
            arrowHeadStart: 'none', arrowHeadEnd: 'arrow',
          } as import('./types').ConnectorNode,

          // ── Stickers for fun ─────────────────────────────────────────────────
          { id: generateId(), type: 'sticker', src: sHappy,    x: cx - 310, y: cy - 220, width: 80, height: 80, rotation: -12 } as import('./types').StickerNode,
          { id: generateId(), type: 'sticker', src: sFire,     x: s3x + SW + 10, y: ROW_Y + 60,  width: 70, height: 70, rotation: 10  } as import('./types').StickerNode,
          { id: generateId(), type: 'sticker', src: sThumbsUp, x: s1x - 80, y: ROW_Y + 55, width: 70, height: 70, rotation: -8  } as import('./types').StickerNode,
          { id: generateId(), type: 'sticker', src: sDerpy,    x: cx - 35,  y: ROW_Y + 148, width: 65, height: 65, rotation: 6   } as import('./types').StickerNode,
        ],
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

      // Cmd+N on stack page → new note
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        const currentPage = useBoardStore.getState().pages.find((p) => p.id === useBoardStore.getState().activePageId);
        if (currentPage?.layoutMode === 'stack') {
          e.preventDefault();
          const pageId = useBoardStore.getState().activePageId;
          const id = useBoardStore.getState().addDocument({ title: '', content: '', pageId });
          useBoardStore.getState().ensureDocumentNode(id, pageId);
          useBoardStore.getState().openDocumentWithMorph(id);
          return;
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (requestActiveDocumentSave()) return;
        const data = useBoardStore.getState().exportData();
        if (getWorkspaceName()) {
          saveWorkspace(data);
        } else {
          saveBoard(data);
        }
        return;
      }

      const el = (e.target as HTMLElement);
      const tag = el?.tagName?.toLowerCase();
      // Skip shortcuts when typing in inputs, textareas, or contentEditable elements
      if (tag === 'input' || tag === 'textarea' || el?.isContentEditable) return;

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
      'menu:save':         () => {
        if (requestActiveDocumentSave()) return;
        saveBoard(useBoardStore.getState().exportData());
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
    }).then(fn => { cleanup = fn; });
    return () => cleanup();
  }, [requestActiveDocumentSave]);

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
        timerVisible={showTimer}
        onToggleTimer={() => setShowTimer((v) => !v)}
        pagesOpen={pagesOpen}
        onTogglePages={() => setPagesOpen((v) => !v)}
        explorerOpen={explorerOpen}
        onToggleExplorer={() => {
          if (explorerOpen) {
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
      />
      {showTimer && <TimerWidget onClose={() => setShowTimer(false)} />}
      {pagesOpen && <PagesPanel onClose={() => setPagesOpen(false)} />}
      {jiraOpen && <JiraPanel onClose={() => setJiraOpen(false)} />}
      {searchOpen && <SearchBar onClose={() => setSearchOpen(false)} />}
      {showBraveNotice && (
        <div className="absolute top-11 left-0 right-0 z-50 flex items-center justify-between gap-3 bg-orange-500 text-white text-xs px-4 py-2">
          <span>
            🦁 <strong>Brave browser detected:</strong> If interactions don't work, click the 🦁 icon in the address bar and disable <strong>Shields</strong> for this page.
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
      {explorerOpen && !explorerCollapsed && (
        <div
          style={{
            position: 'absolute',
            top: contentTop,
            left: 0,
            bottom: 0,
            width: explorerWidth,
            zIndex: 180,
            borderRight: '1px solid var(--c-border)',
            background: 'var(--c-panel)',
            boxShadow: '8px 0 24px rgba(0,0,0,0.08)',
          }}
        >
          <WorkspaceExplorer onClose={() => setExplorerOpen(false)} onCollapse={() => setExplorerCollapsed(true)} />
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
        </div>
      )}
      {explorerOpen && explorerCollapsed && (
        <div
          style={{
            position: 'absolute',
            top: contentTop,
            left: 0,
            bottom: 0,
            width: EXPLORER_COLLAPSED_WIDTH,
            zIndex: 180,
            borderRight: '1px solid var(--c-border)',
            background: 'var(--c-panel)',
            boxShadow: '6px 0 18px rgba(0,0,0,0.06)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: 10,
          }}
        >
          <button
            onClick={() => setExplorerCollapsed(false)}
            title="Expand explorer"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M4.25 2.25 8 6l-3.75 3.75" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 2.25 5.75 6 2 9.75" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          top: contentTop,
          right: 0,
          bottom: 0,
          left: explorerOffset,
        }}
      >
        {isStackPage ? (
          <StackView pageId={activePageId} pageName={activePage?.name ?? ''} />
        ) : (
          <Canvas />
        )}
      </div>
      {!isStackPage && <Toolbar />}
      {!isStackPage && <ZoomToolbar />}
      {appMode !== 'document' && <FocusMode />}
      {showOnboarding && <OnboardingModal onClose={() => setShowOnboarding(false)} />}
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

      {/* Zoom-morph overlay — document editor */}
      {morphPhase !== 'idle' && (() => {
        const W = window.innerWidth;
        const H = window.innerHeight;
        const src = morphSourceRect;
        const isOpen = morphPhase === 'open';
        const frameStyle: React.CSSProperties = {
          position: 'fixed',
          left: isOpen ? explorerOffset : (src?.left ?? explorerOffset + (W - explorerOffset) / 2 - 150),
          top: isOpen ? contentTop : (src?.top ?? H / 2 - 100),
          width: isOpen ? Math.max(0, W - explorerOffset) : (src?.width ?? 300),
          height: isOpen ? Math.max(0, H - contentTop) : (src?.height ?? 200),
          borderRadius: isOpen ? 0 : 10,
          overflow: 'hidden',
          transition: `left ${MORPH_MS}ms ease, top ${MORPH_MS}ms ease, width ${MORPH_MS}ms ease, height ${MORPH_MS}ms ease, border-radius ${MORPH_MS}ms ease`,
        };
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 170, pointerEvents: 'none' }}>
            <div style={{
              position: 'fixed',
              left: explorerOffset,
              top: contentTop,
              width: Math.max(0, W - explorerOffset),
              height: Math.max(0, H - contentTop),
              background: 'rgba(0,0,0,0.45)',
              opacity: isOpen ? 1 : 0,
              transition: `opacity ${MORPH_MS}ms ease`,
              pointerEvents: 'none',
            }} />
            <div style={{ ...frameStyle, pointerEvents: 'auto' }}>
              <DocumentMode onClose={closeDoc} />
            </div>
          </div>
        );
      })()}
    </div>
  );
}
