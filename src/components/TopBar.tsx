import { useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import { useBoardStore } from '../store/boardStore';

interface TopBarProps {
  onShowAbout: () => void;
}

export default function TopBar({ onShowAbout }: TopBarProps) {
  const { boardTitle, setBoardTitle, exportData, loadBoard } = useBoardStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(boardTitle);

  const commitTitle = () => {
    const t = titleDraft.trim() || 'Untitled Board';
    setBoardTitle(t);
    setTitleDraft(t);
    setEditingTitle(false);
  };

  // Export as JSON
  const handleSaveJSON = () => {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    saveAs(blob, `${data.boardTitle.replace(/\s+/g, '_')}.devboard.json`);
  };

  // Load from JSON
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

  // Export PNG via Konva stage snapshot
  const handleExportPNG = () => {
    // Find the Konva stage canvas element and capture it
    const stageCanvas = document.querySelector<HTMLCanvasElement>(
      '.konvajs-content canvas'
    );
    if (!stageCanvas) return;
    stageCanvas.toBlob((blob) => {
      if (blob) saveAs(blob, `${boardTitle.replace(/\s+/g, '_')}.png`);
    });
  };

  // Share via base64 URL hash
  const handleShare = () => {
    const data = exportData();
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    const url = `${window.location.origin}${window.location.pathname}#board=${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Share link copied to clipboard!');
    });
  };

  return (
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
              if (e.key === 'Escape') {
                setTitleDraft(boardTitle);
                setEditingTitle(false);
              }
            }}
            className="bg-transparent border-b border-[#6366f1] text-[#e2e8f0] font-mono text-sm outline-none min-w-0 max-w-[220px]"
          />
        ) : (
          <button
            onClick={() => {
              setTitleDraft(boardTitle);
              setEditingTitle(true);
            }}
            title="Rename board"
            className="font-mono text-sm text-[#e2e8f0] hover:text-white truncate max-w-[220px] text-left"
          >
            {boardTitle}
          </button>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        <TopBarBtn onClick={handleExportPNG} title="Export PNG">
          PNG
        </TopBarBtn>
        <TopBarBtn onClick={handleSaveJSON} title="Save board as JSON">
          Save
        </TopBarBtn>
        <TopBarBtn onClick={() => fileInputRef.current?.click()} title="Load board from JSON">
          Load
        </TopBarBtn>
        <TopBarBtn
          onClick={handleShare}
          title="Copy shareable link (base64 in URL hash)"
          accent
        >
          Share ↗
        </TopBarBtn>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.devboard.json"
          className="hidden"
          onChange={handleLoadJSON}
        />
      </div>
    </div>
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
