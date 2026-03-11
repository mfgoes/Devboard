import { useRef, useState, useEffect } from 'react';
import { saveAs } from 'file-saver';
import { useBoardStore } from '../store/boardStore';
import { TEMPLATES } from '../templates';

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
function IconChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconTheme({ isLight }: { isLight: boolean }) {
  if (isLight) {
    // Moon icon (switch to dark)
    return (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path d="M11 8.5A5.5 5.5 0 0 1 4.5 2a5.5 5.5 0 1 0 6.5 6.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  // Sun icon (switch to light)
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="6.5" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.5 1v1.5M6.5 10.5V12M1 6.5h1.5M10.5 6.5H12M2.9 2.9l1.1 1.1M9 9l1.1 1.1M2.9 10.1l1.1-1.1M9 4l1.1-1.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

const isItchIo = typeof window !== 'undefined' && window.location.hostname.endsWith('.itch.io');

export default function TopBar({ onShowAbout }: TopBarProps) {
  const { boardTitle, setBoardTitle, exportData, loadBoard, setActiveTool, toggleTheme, theme } = useBoardStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(boardTitle);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Track fullscreen changes (e.g. user presses Esc)
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

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

  const handleLoadTemplate = (templateId: string) => {
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    const { nodes } = useBoardStore.getState();
    if (nodes.length > 0 && !window.confirm('Load template? This will replace the current board.')) return;
    loadBoard(template.data);
    setMenuOpen(false);
  };

  const menuAction = (fn: () => void) => {
    setMenuOpen(false);
    fn();
  };

  return (
    <>
    {toast && (
      <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 rounded bg-[#6366f1] text-white font-mono text-xs shadow-lg pointer-events-none select-none animate-fade-in">
        {toast}
      </div>
    )}
    <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-11 bg-[var(--c-panel)] border-b border-[var(--c-border)]">
      {/* Left: Logo + dropdown + title */}
      <div className="flex items-center gap-3 min-w-0">

        {/* Logo + chevron */}
        <div className="relative flex items-center shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            title="Menu"
            className={[
              'flex items-center gap-0.5 px-1.5 h-7 rounded transition-colors',
              menuOpen
                ? 'text-[var(--c-text-hi)] bg-[var(--c-hover)]'
                : 'text-[#6366f1] hover:text-[#818cf8] hover:bg-[var(--c-hover)]',
            ].join(' ')}
          >
            <span className="font-mono text-[11px] font-semibold tracking-widest uppercase">DevBoard</span>
            <IconChevronDown />
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-52 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl py-1.5 z-[100]">

              <MenuItem onClick={() => menuAction(onShowAbout)} icon={<IconAbout />}>About</MenuItem>
              <MenuItem onClick={() => menuAction(toggleTheme)} icon={<IconTheme isLight={theme === 'light'} />}>
                {theme === 'light' ? 'Dark mode' : 'Light mode'}
              </MenuItem>

              <MenuDivider />
              <MenuLabel>Templates</MenuLabel>
              {TEMPLATES.map((t) => (
                <MenuItem key={t.id} onClick={() => handleLoadTemplate(t.id)} icon={<IconTemplate />}>
                  {t.name}
                </MenuItem>
              ))}

              <MenuDivider />
              <MenuLabel>Export</MenuLabel>
              <MenuItem onClick={() => menuAction(handleExportPNG)} icon={<IconImg />}>Export PNG</MenuItem>
              <MenuItem onClick={() => menuAction(handleSaveJSON)} icon={<IconJson />}>Save as JSON</MenuItem>
              <MenuItem onClick={() => menuAction(() => fileInputRef.current?.click())} icon={<IconLoad />}>Load JSON</MenuItem>
              {!isItchIo && (
                <MenuItem onClick={() => menuAction(handleShare)} icon={<IconShare />}>Copy share link</MenuItem>
              )}

              <MenuDivider />
              <MenuLabel>Insert</MenuLabel>
              <MenuItem onClick={() => menuAction(() => setActiveTool('sticky'))} icon={<IconSticky />}>Sticky note</MenuItem>
              <MenuItem onClick={() => menuAction(() => setActiveTool('shape'))} icon={<IconShape />}>Shape</MenuItem>
              <MenuItem onClick={() => menuAction(() => setActiveTool('text'))} icon={<IconText />}>Text block</MenuItem>

              <MenuDivider />
              <MenuItem
                onClick={() => { setMenuOpen(false); window.open('https://mischa.itch.io/devboard', '_blank', 'noopener'); }}
                icon={<IconDownload />}
              >
                Download desktop app
              </MenuItem>

            </div>
          )}
        </div>

        <span className="text-[var(--c-border)]">/</span>
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
            className="bg-transparent border-b border-[#6366f1] text-[var(--c-text-hi)] font-mono text-sm outline-none min-w-0 max-w-[220px]"
          />
        ) : (
          <button
            onClick={() => { setTitleDraft(boardTitle); setEditingTitle(true); }}
            title="Rename board"
            className="font-mono text-sm text-[var(--c-text-hi)] hover:text-[var(--c-text-hi)] truncate max-w-[220px] text-left"
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

        <div className="w-px h-5 bg-[var(--c-border)] mx-1" />

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          className="w-7 h-7 flex items-center justify-center rounded text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
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

// ── Menu sub-components ──────────────────────────────────────────────────────

function MenuDivider() {
  return <div className="my-1 h-px bg-[var(--c-border)] mx-2" />;
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-0.5 font-mono text-[10px] text-[var(--c-text-off)] uppercase tracking-widest select-none">
      {children}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  icon,
  disabled,
  badge,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className={[
        'w-full flex items-center gap-2.5 px-3 py-1.5 font-mono text-[12px] text-left transition-colors',
        disabled
          ? 'text-[var(--c-text-off)] cursor-default'
          : 'text-[var(--c-text-md)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
      ].join(' ')}
    >
      {icon && (
        <span className={disabled ? 'text-[var(--c-text-off)]' : 'text-[#6366f1]'}>
          {icon}
        </span>
      )}
      <span className="flex-1">{children}</span>
      {badge && (
        <span className="text-[9px] font-mono text-[var(--c-text-off)] border border-[var(--c-border)] rounded px-1 py-0.5 uppercase tracking-wide">
          {badge}
        </span>
      )}
    </button>
  );
}

// ── Menu icons ───────────────────────────────────────────────────────────────

function IconAbout() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.5 5.5v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="6.5" cy="3.5" r="0.7" fill="currentColor" />
    </svg>
  );
}
function IconImg() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1" y="2.5" width="11" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1 8.5l3-3 2.5 2.5 2-2 2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="4.5" cy="5.5" r="1" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}
function IconJson() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1.5" y="1" width="10" height="11" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 4.5h5M4 6.5h5M4 8.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function IconLoad() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M2 8.5v2a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5v-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6.5 1.5v6M4 5l2.5 2.5L9 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconShare() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="10" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="3" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="10" cy="10" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.4 7.3l4.2 2M8.6 3.7l-4.2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function IconSticky() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1.5" y="1.5" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8.5 1.5v3.5l1.5-1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="4" y1="7" x2="9" y2="7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="4" y1="9" x2="7.5" y2="9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}
function IconShape() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1.5" y="1.5" width="4.5" height="4.5" rx="0.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="9.5" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function IconText() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M2.5 3.5h8M6.5 3.5v6.5M4 10h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M6.5 1v6.5M4 5.5l2.5 2.5L9 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M1.5 10h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function IconTemplate() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1" y="1" width="11" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1" y="7" width="4.5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="7.5" y="7" width="4.5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

// ── TopBarBtn ────────────────────────────────────────────────────────────────

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
          : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
