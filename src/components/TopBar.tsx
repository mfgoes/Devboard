import { useRef, useState, useEffect, useCallback } from 'react';
import { saveAs } from 'file-saver';
import { useBoardStore } from '../store/boardStore';
import { TEMPLATES } from '../templates';
import ConfirmDialog from './ConfirmDialog';
import { saveBoardAs, clearFileHandle } from '../utils/fileSave';
import { toast } from '../utils/toast';

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
  const { boardTitle, setBoardTitle, exportData, loadBoard, setActiveTool, setActiveShapeKind, toggleTheme, theme } = useBoardStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(boardTitle);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const templatesRef = useRef<HTMLDivElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

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
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    if (!templatesOpen) return;
    const handler = (e: MouseEvent) => {
      if (templatesRef.current && !templatesRef.current.contains(e.target as Node)) setTemplatesOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [templatesOpen]);

  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportOpen]);

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

  const handleSaveJSON = () => saveBoardAs(exportData());

  const handleLoadJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (parsed.nodes && Array.isArray(parsed.nodes)) {
          loadBoard(parsed);
          clearFileHandle();
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

  const handleShare = () => {
    const data = exportData();
    const json = JSON.stringify(data);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    const url = `${window.location.origin}${window.location.pathname}#board=${b64}`;
    navigator.clipboard.writeText(url).then(() => {
      toast('Share link copied!');
    }).catch(() => {
      toast('Failed to copy link.');
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
    setTemplatesOpen(false);
    setMenuOpen(false);
    const { nodes } = useBoardStore.getState();
    if (nodes.length > 0) {
      setConfirmDialog({
        message: 'Load template? This will replace the current board.',
        onConfirm: () => {
          loadBoard(template.data);
          clearFileHandle();
          setConfirmDialog(null);
        },
      });
    } else {
      loadBoard(template.data);
      clearFileHandle();
    }
  };

  const menuAction = (fn: () => void) => {
    setMenuOpen(false);
    fn();
  };

  return (
    <>
    {confirmDialog && (
      <ConfirmDialog
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(null)}
        confirmLabel="Load template"
      />
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
              <MenuLabel>Popular templates</MenuLabel>
              {TEMPLATES.slice(0, 3).map((t) => (
                <MenuItem key={t.id} onClick={() => handleLoadTemplate(t.id)} icon={<IconTemplate />}>
                  {t.name}
                </MenuItem>
              ))}

              <MenuDivider />
              <MenuLabel>Export</MenuLabel>
              <MenuItem onClick={() => menuAction(handleExportPNG)} icon={<IconImg />}>Export PNG</MenuItem>
              <MenuItem onClick={() => menuAction(handleSaveJSON)} icon={<IconJson />} badge="⌘S">Save as JSON</MenuItem>
              <MenuItem onClick={() => menuAction(() => fileInputRef.current?.click())} icon={<IconLoad />}>Load JSON</MenuItem>
              {!isItchIo && (
                <MenuItem onClick={() => menuAction(handleShare)} icon={<IconShare />}>Copy share link</MenuItem>
              )}

              <MenuDivider />
              <MenuItemSub label="Insert" icon={<IconSticky />}>
                <MenuItem onClick={() => menuAction(() => setActiveTool('sticky'))} icon={<IconSticky />} badge="S">Sticky note</MenuItem>
                <MenuItem onClick={() => menuAction(() => setActiveTool('text'))}   icon={<IconText />}   badge="T">Text block</MenuItem>
                <MenuDivider />
                <MenuLabel>Shapes</MenuLabel>
                <MenuItem onClick={() => menuAction(() => { setActiveShapeKind('rect');     setActiveTool('shape'); })} icon={<IconShapeRect />}     badge="R">Rectangle</MenuItem>
                <MenuItem onClick={() => menuAction(() => { setActiveShapeKind('ellipse');  setActiveTool('shape'); })} icon={<IconShapeEllipse />}  badge="R">Ellipse</MenuItem>
                <MenuItem onClick={() => menuAction(() => { setActiveShapeKind('diamond');  setActiveTool('shape'); })} icon={<IconShapeDiamond />}  badge="R">Diamond</MenuItem>
                <MenuItem onClick={() => menuAction(() => { setActiveShapeKind('triangle'); setActiveTool('shape'); })} icon={<IconShapeTriangle />} badge="R">Triangle</MenuItem>
              </MenuItemSub>

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

        {/* Templates dropdown */}
        <div className="relative" ref={templatesRef}>
          <Tooltip label="Load a starter template">
          <button
            onClick={() => setTemplatesOpen((v) => !v)}
            title="Templates"
            className={[
              'flex items-center gap-1 px-2 h-7 rounded font-mono text-[11px] tracking-wide transition-colors',
              templatesOpen
                ? 'text-[var(--c-text-hi)] bg-[var(--c-hover)]'
                : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
            ].join(' ')}
          >
            <IconTemplate />
            <IconChevronDown />
          </button>
          </Tooltip>
          {templatesOpen && (
            <div className="absolute top-full right-0 mt-1.5 w-52 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl py-1.5 z-[100]">
              <MenuLabel>Templates</MenuLabel>
              {TEMPLATES.map((t) => (
                <MenuItem key={t.id} onClick={() => handleLoadTemplate(t.id)} icon={<IconTemplate />}>
                  {t.name}
                </MenuItem>
              ))}
            </div>
          )}
        </div>

        {/* Export dropdown */}
        <div className="relative" ref={exportRef}>
          <Tooltip label="Save, load, or share your board">
          <button
            onClick={() => setExportOpen((v) => !v)}
            title="Export"
            className={[
              'flex items-center gap-1 px-2.5 h-7 rounded font-mono text-[11px] tracking-wide transition-colors',
              exportOpen
                ? 'bg-[#4f46e5] text-white'
                : 'bg-[#6366f1] text-white hover:bg-[#4f46e5]',
            ].join(' ')}
          >
            <span>Export</span>
            <IconChevronDown />
          </button>
          </Tooltip>
          {exportOpen && (
            <div className="absolute top-full right-0 mt-1.5 w-48 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl py-1.5 z-[100]">
              <MenuItem onClick={() => { setExportOpen(false); handleExportPNG(); }} icon={<IconImg />}>Export PNG</MenuItem>
              <MenuItem onClick={() => { setExportOpen(false); handleSaveJSON(); }} icon={<IconJson />} badge="⌘S">Save as JSON</MenuItem>
              <MenuItem onClick={() => { setExportOpen(false); fileInputRef.current?.click(); }} icon={<IconLoad />}>Load JSON</MenuItem>
              {!isItchIo && (
                <>
                  <MenuDivider />
                  <MenuItem onClick={() => { setExportOpen(false); handleShare(); }} icon={<IconShare />}>Copy share link</MenuItem>
                </>
              )}
            </div>
          )}
        </div>

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
function IconChevronRight() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M4 2.5L7 5.5L4 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconShapeRect() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1.5" y="2.5" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function IconShapeEllipse() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <ellipse cx="6.5" cy="6.5" rx="5" ry="4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function IconShapeDiamond() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M6.5 1.5L12 6.5L6.5 11.5L1 6.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
function IconShapeTriangle() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M6.5 1.5L12 11.5H1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

// ── MenuItemSub — hover-triggered right flyout ────────────────────────────────
function MenuItemSub({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    timerRef.current = setTimeout(() => setOpen(false), 120);
  }, []);

  return (
    <div ref={ref} className="relative" onMouseEnter={show} onMouseLeave={hide}>
      <button
        className={[
          'w-full flex items-center gap-2.5 px-3 py-1.5 font-mono text-[12px] text-left transition-colors',
          open
            ? 'text-[var(--c-text-hi)] bg-[var(--c-hover)]'
            : 'text-[var(--c-text-md)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
        ].join(' ')}
      >
        {icon && <span className="text-[#6366f1]">{icon}</span>}
        <span className="flex-1">{label}</span>
        <span className="text-[var(--c-text-off)]"><IconChevronRight /></span>
      </button>
      {open && (
        <div
          className="absolute left-full top-0 ml-1 w-48 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl py-1.5 z-[110]"
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 rounded bg-[var(--c-panel)] border border-[var(--c-border)] text-[var(--c-text-md)] font-mono text-[10px] whitespace-nowrap shadow-lg pointer-events-none z-[200]">
          {label}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[4px] border-b-[var(--c-border)]" />
        </div>
      )}
    </div>
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
