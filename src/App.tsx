import { useEffect, useState } from 'react';
import Canvas from './components/Canvas';
import Toolbar from './components/Toolbar';
import TopBar from './components/TopBar';
import WelcomeModal from './components/WelcomeModal';
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

export default function App() {
  const [showWelcome, setShowWelcome] = useState(() => {
    return !localStorage.getItem('devboard-visited');
  });

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
    <div className="relative w-full h-full overflow-hidden bg-[#111118] font-mono">
      <TopBar onShowAbout={() => setShowWelcome(true)} />
      <div className="absolute inset-0 top-11">
        <Canvas />
      </div>
      <Toolbar />
      {showWelcome && <WelcomeModal onClose={handleCloseWelcome} />}
    </div>
  );
}
