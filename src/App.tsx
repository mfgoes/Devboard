import { useEffect, useState, useRef } from 'react';
import { saveBoard } from './utils/fileSave';
import { saveWorkspace, getWorkspaceName } from './utils/workspaceManager';
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
import PagesPanel from './components/PagesPanel';
import TimerWidget from './components/TimerWidget';
import WorkspaceExplorer from './components/WorkspaceExplorer';
import JiraPanel from './components/JiraPanel';
import SearchBar from './components/SearchBar';
import { useBoardStore } from './store/boardStore';
import { STICKER_KEYS } from './assets/stickerAssets';
import { DEMO_COLORS } from './utils/palette';


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
  const [toastData, setToastData] = useState<ToastPayload | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const [showTimer, setShowTimer] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [jiraOpen, setJiraOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const explorerOpen = useBoardStore((s) => s.explorerOpen);
  const setExplorerOpen = useBoardStore((s) => s.setExplorerOpen);

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
      // Cmd+F: open search bar (must run before tag guard so it works from any context)
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }

      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

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
      } else if (e.key === 's') {
        e.preventDefault();
        const data = useBoardStore.getState().exportData();
        if (getWorkspaceName()) {
          saveWorkspace(data);
        } else {
          saveBoard(data);
        }
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
      'menu:save':         () => saveBoard(useBoardStore.getState().exportData()),
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
  }, []);

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
        onToggleExplorer={() => setExplorerOpen(!explorerOpen)}
        onWorkspaceOpened={() => setExplorerOpen(true)}
        jiraOpen={jiraOpen}
        onToggleJira={() => setJiraOpen((v) => !v)}
        onToggleSearch={() => setSearchOpen((v) => !v)}
      />
      {showTimer && <TimerWidget onClose={() => setShowTimer(false)} />}
      {pagesOpen && <PagesPanel onClose={() => setPagesOpen(false)} />}
      {explorerOpen && <WorkspaceExplorer onClose={() => setExplorerOpen(false)} />}
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
      <div className={`absolute inset-0 ${showBraveNotice ? 'top-[5.25rem]' : 'top-11'}`}>
        <Canvas />
      </div>
      <Toolbar />
      <ZoomToolbar />
      {showOnboarding && <OnboardingModal onClose={() => setShowOnboarding(false)} />}
      {showWelcome && <WelcomeModal onClose={handleCloseWelcome} />}
    </div>
  );
}
