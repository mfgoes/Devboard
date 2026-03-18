import { useEffect, useState } from 'react';
import { saveBoard } from './utils/fileSave';
import { setToastListener } from './utils/toast';

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
import PagesPanel from './components/PagesPanel';
import TimerWidget from './components/TimerWidget';
import { useBoardStore } from './store/boardStore';
import { STICKER_KEYS } from './assets/stickerAssets';


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
  const [showBraveNotice, setShowBraveNotice] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showTimer, setShowTimer] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);

  useEffect(() => {
    setToastListener((msg) => {
      setToastMsg(msg);
      setTimeout(() => setToastMsg(null), 2500);
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

  // Seed welcome board on first visit (canvas-native start screen)
  useEffect(() => {
    const isFirstVisit = !localStorage.getItem('devboard-visited');
    if (!isFirstVisit) return;
    // Wait for hash-loading to settle, then check if board is still empty
    setTimeout(() => {
      const { nodes, addNode } = useBoardStore.getState();
      if (nodes.length > 0) return; // board was loaded from hash
      localStorage.setItem('devboard-visited', '1');
      const happySticker = STICKER_KEYS.find(k => k.includes('happy')) ?? STICKER_KEYS[0];
      const cx = Math.round(window.innerWidth / 2);
      const cy = Math.round(window.innerHeight / 2);
      addNode({ id: generateId(), type: 'sticker', src: happySticker, x: cx - 390, y: cy - 220, width: 130, height: 130, rotation: 0 } as import('./types').StickerNode);
      addNode({ id: generateId(), type: 'textblock', x: cx - 240, y: cy - 195, text: 'Welcome to Devboard!', fontSize: 26, width: 500, color: 'auto', bold: true, italic: false, underline: false } as import('./types').TextBlockNode);
      addNode({ id: generateId(), type: 'sticky', x: cx - 240, y: cy - 110, text: '', color: '#bbf7d0', width: 320, height: 240 } as import('./types').StickyNoteNode);
    }, 0);
  }, []);

  // Global copy / paste / duplicate shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === 'c') {
        e.preventDefault();
        useBoardStore.getState().copySelected();
      } else if (e.key === 'v') {
        e.preventDefault();
        useBoardStore.getState().paste();
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
        saveBoard(useBoardStore.getState().exportData());
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
    <div className="relative w-full h-full overflow-hidden bg-[var(--c-canvas)] font-mono">
      {toastMsg && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[300] px-4 py-2 rounded bg-[#6366f1] text-white font-mono text-xs shadow-lg pointer-events-none select-none animate-fade-in">
          {toastMsg}
        </div>
      )}
      <TopBar
        onShowAbout={() => setShowWelcome(true)}
        timerVisible={showTimer}
        onToggleTimer={() => setShowTimer((v) => !v)}
        pagesOpen={pagesOpen}
        onTogglePages={() => setPagesOpen((v) => !v)}
      />
      {showTimer && <TimerWidget onClose={() => setShowTimer(false)} />}
      {pagesOpen && <PagesPanel onClose={() => setPagesOpen(false)} />}
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
      {showWelcome && <WelcomeModal onClose={handleCloseWelcome} />}
    </div>
  );
}
