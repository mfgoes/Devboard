import { useRef, useState, useEffect } from 'react';
import { saveAs } from 'file-saver';
import { useBoardStore } from '../store/boardStore';

interface TopBarProps {
  onShowAbout: () => void;
}

function IconExpand() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconCompress() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M5 1v4H1M13 5H9V1M9 13v-4h4M1 9h4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const isItchIo = typeof window !== 'undefined' && window.location.hostname.endsWith('.itch.io');

export default function TopBar({ onShowAbout }: TopBarProps) {
  const { boardTitle, setBoardTitle, exportData, loadBoard } = useBoardStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(boardTitle);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Track fullscreen changes (e.g. user presses Esc)
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const commitTitle = () => {
    const t = titleDraft.trim() || 'Untitled Board';
    setBoardTitle(t);
    setTitleDraft(t);
    setEditingTitle(false);
  };

  const handleSaveJSON = () => {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    saveAs(blob, `${data.boardTitle.replace(/\s+/g, '_')}.devboard.json`);
  };

  const handleLoadJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (parsed.nodes && Array.isArray(parsed.nodes)) {
          loadBoard(parsed);
        } else {
          alert('Invalid DevBoard file.');
        }
      } catch {
        alert('Failed to parse file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleShare = () => {
    const data = exportData();
    const json = JSON.stringify(data);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    const url = `${window.location.origin}${window.location.pathname}#board=${b64}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast('Share link copied!');
    }).catch(() => {
      showToast('Failed to copy link.');
    });
  };

  const handleExportPNG = () => {
    const stageCanvas = document.querySelector<HTMLCanvasElement>('.konvajs-content canvas');
    if (!stageCanvas) return;
    stageCanvas.toBlob((blob) => {
      if (blob) saveAs(blob, `${boardTitle.replace(/\s+/g, '_')}.png`);
    });
  };

  return (
    <>
    {toast && (
      <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 rounded bg-[#6366f1] text-white font-mono text-xs shadow-lg pointer-events-none select-none animate-fade-in">
        {toast}
      </div>
    )}
    <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-11 bg-[#1a1a2a] border-b border-[#2e2e46]">
      {/* Left: Logo + title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onShowAbout}
          title="About DevBoard"
          className="font-mono text-[11px] font-semibold text-[#6366f1] tracking-widest uppercase shrink-0 hover:text-[#818cf8] transition-colors"
        >
          DevBoard
        </button>
        <span className="text-[#2e2e46]">/</span>
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle();
              if (e.key === 'Escape') { setTitleDraft(boardTitle); setEditingTitle(false); }
            }}
            className="bg-transparent border-b border-[#6366f1] text-[#e2e8f0] font-mono text-sm outline-none min-w-0 max-w-[220px]"
          />
        ) : (
          <button
            onClick={() => { setTitleDraft(boardTitle); setEditingTitle(true); }}
            title="Rename board"
            className="font-mono text-sm text-[#e2e8f0] hover:text-white truncate max-w-[220px] text-left"
          >
            {boardTitle}
          </button>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        <TopBarBtn onClick={handleExportPNG} title="Export PNG">PNG</TopBarBtn>
        <TopBarBtn onClick={handleSaveJSON} title="Save board as JSON">Save</TopBarBtn>
        <TopBarBtn onClick={() => fileInputRef.current?.click()} title="Load board from JSON">Load</TopBarBtn>
        {!isItchIo && (
          <TopBarBtn onClick={handleShare} title="Copy share link" accent>Share</TopBarBtn>
        )}

        <div className="w-px h-5 bg-[#2e2e46] mx-1" />

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          className="w-7 h-7 flex items-center justify-center rounded text-[#8888aa] hover:text-[#e2e8f0] hover:bg-[#22223a] transition-colors"
        >
          {isFullscreen ? <IconCompress /> : <IconExpand />}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.devboard.json"
          className="hidden"
          onChange={handleLoadJSON}
        />
      </div>
    </div>
    </>
  );
}

function TopBarBtn({
  children,
  onClick,
  title,
  accent,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={[
        'px-3 h-7 rounded font-mono text-[11px] tracking-wide transition-colors',
        accent
          ? 'bg-[#6366f1] text-white hover:bg-[#4f46e5]'
          : 'text-[#8888aa] hover:text-[#e2e8f0] hover:bg-[#22223a]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
