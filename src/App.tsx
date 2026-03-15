import { useEffect, useState } from 'react';
import { saveBoard } from './utils/fileSave';
import { setToastListener } from './utils/toast';
import Canvas from './components/Canvas';
import Toolbar from './components/Toolbar';
import ZoomToolbar from './components/ZoomToolbar';
import TopBar from './components/TopBar';
import WelcomeModal from './components/WelcomeModal';
import TimerWidget from './components/TimerWidget';
import { useBoardStore } from './store/boardStore';


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

export default function App() {
  const [showWelcome, setShowWelcome] = useState(() => {
    return !localStorage.getItem('devboard-visited');
  });
  const [showBraveNotice, setShowBraveNotice] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showTimer, setShowTimer] = useState(false);

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

  const handleCloseWelcome = () => {
    localStorage.setItem('devboard-visited', '1');
    setShowWelcome(false);
  };

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
      />
      {showTimer && <TimerWidget onClose={() => setShowTimer(false)} />}
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
