import { useRef, useState, useEffect, useCallback, useContext, createContext, useId } from 'react';
import { saveAs } from 'file-saver';
import { useBoardStore } from '../store/boardStore';
import { TEMPLATES } from '../templates';
import ConfirmDialog from './ConfirmDialog';
import { saveBoard, saveBoardAs, clearFileHandle } from '../utils/fileSave';
import { openWorkspace, saveWorkspace, loadImageAsset, findImageInWorkspace, hasWorkspaceHandle, clearWorkspaceHandle, FSA_DIR_SUPPORTED, IN_IFRAME } from '../utils/workspaceManager';
import { toast } from '../utils/toast';
import { exportDocumentsAsMarkdown, generateMarkdownFilename } from '../utils/exportMarkdown';
import exportSound from '../assets/get1.mp3';
import { IconFreeformPage, IconSaveFile, IconStackPage } from './icons';

const playExportSound = () => new Audio(exportSound).play().catch(() => {});

interface TopBarProps {
  onShowAbout: () => void;
  timerVisible: boolean;
  onToggleTimer: () => void;
  pagesOpen: boolean;
  onTogglePages: () => void;
  explorerOpen: boolean;
  onToggleExplorer: () => void;
  onWorkspaceOpened: () => void;
  jiraOpen: boolean;
  onToggleJira: () => void;
  onToggleSearch: () => void;
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

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cell += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (ch === '\r') i++;
        row.push(cell); cell = '';
        rows.push(row); row = [];
      } else { cell += ch; }
    }
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

// ── Default save-folder row (used in the missing-images dropdown) ─────────────
function DefaultFolderRow({ folder, onChange }: { folder: string; onChange: (f: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder);
  const commit = () => {
    const v = draft.trim().replace(/^\/|\/$/g, '') || 'assets';
    onChange(v);
    setEditing(false);
  };
  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); e.stopPropagation(); }}
          placeholder="assets"
          className="flex-1 bg-[var(--c-canvas)] border border-[var(--c-border)] focus:border-[var(--c-line)] rounded px-2 py-0.5 font-sans text-[10px] text-[var(--c-text-hi)] outline-none"
        />
        <button onClick={commit} className="px-2 py-0.5 rounded bg-[var(--c-line)] text-white font-sans text-[9px]">OK</button>
      </div>
    );
  }
  return (
    <button
      onClick={() => { setDraft(folder); setEditing(true); }}
      className="w-full flex items-center gap-1.5 text-left font-sans text-[9px] text-[var(--c-text-md)] hover:text-[var(--c-text-hi)] transition-colors"
      title="Default folder for new images — click to change"
    >
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
        <path d="M1 2.5a.7.7 0 0 1 .7-.7h1.8l.7.7H7.3a.7.7 0 0 1 .7.7v3.5a.7.7 0 0 1-.7.7H1.7a.7.7 0 0 1-.7-.7V2.5z" stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round" />
      </svg>
      Default: <span className="text-[var(--c-text-md)]">{folder}/</span>
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="ml-auto">
        <path d="M5.5 1.5l1 1-4 4H1.5v-1l4-4z" stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export default function TopBar({ onShowAbout, timerVisible, onToggleTimer, pagesOpen, onTogglePages, explorerOpen, onToggleExplorer, onWorkspaceOpened, jiraOpen, onToggleJira, onToggleSearch }: TopBarProps) {
  const { boardTitle, setBoardTitle, exportData, loadBoard, setActiveTool, setActiveShapeKind, toggleTheme, theme, addNode, pages, activePageId, setPageLayoutMode, workspaceName, setWorkspaceName, nodes, updateNode, imageAssetFolder, setImageAssetFolder, appMode } = useBoardStore();
  const activePage = pages.find((p) => p.id === activePageId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(boardTitle);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSubMenu, setActiveSubMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    extraActions?: Array<{ label: string; onClick: () => void }>;
  } | null>(null);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
  const [missingWarningOpen, setMissingWarningOpen] = useState(false);
  const missingWarningRef = useRef<HTMLDivElement>(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);

  const missingImages = nodes.filter(
    (n) => n.type === 'image' && (n as import('../types').ImageNode).assetName && !(n as import('../types').ImageNode).src
  ) as import('../types').ImageNode[];

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
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) { setMenuOpen(false); setActiveSubMenu(null); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportOpen]);

  useEffect(() => {
    if (!missingWarningOpen) return;
    const handler = (e: MouseEvent) => {
      if (missingWarningRef.current && !missingWarningRef.current.contains(e.target as Node)) setMissingWarningOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [missingWarningOpen]);

  useEffect(() => {
    if (!workspaceMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(e.target as Node)) setWorkspaceMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [workspaceMenuOpen]);

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
    if (workspaceName) {
      saveWorkspace(exportData()).then(playExportSound);
    } else {
      saveBoard(exportData()).then(playExportSound);
    }
  };
  const handleSaveAsJSON = () => saveBoardAs(exportData()).then(playExportSound);

  const handleOpenFolder = async () => {
    setMenuOpen(false);
    const result = await openWorkspace();
    if (!result) return;
    setWorkspaceName(result.name);
    if (result.data) {
      loadBoard(result.data);
    } else {
      loadBoard({ boardTitle: result.name, nodes: [] });
    }
    clearFileHandle();
    onWorkspaceOpened(); // auto-open the file explorer
  };

  const handleAutoFix = async () => {
    if (!hasWorkspaceHandle()) { handleOpenFolder(); return; }
    let fixed = 0;
    for (const img of missingImages) {
      if (!img.assetName) continue;

      // 1. Try stored folder first
      let url: string | null = null;
      const folder = img.assetFolder ?? '';
      if (folder) url = await loadImageAsset(img.assetName, folder);

      // 2. Fallback: scan workspace for the filename
      if (!url) {
        const found = await findImageInWorkspace(img.assetName);
        if (found) {
          url = found.url;
          // Persist the corrected folder so future reloads work
          updateNode(img.id, { assetFolder: found.folder } as Parameters<typeof updateNode>[1]);
        }
      }

      if (url) {
        updateNode(img.id, { src: url } as Parameters<typeof updateNode>[1]);
        fixed++;
      }
    }
    // Persist corrected assetFolder values to workspace JSON
    if (fixed > 0) {
      setTimeout(() => saveWorkspace(useBoardStore.getState().exportData()), 0);
    }
    toast(fixed > 0 ? `Reloaded ${fixed} image${fixed > 1 ? 's' : ''}` : 'Images not found — try re-opening the folder');
    if (fixed > 0) setMissingWarningOpen(false);
  };

  const handleExportAllPages = () => {
    const data = exportData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    saveAs(blob, `${boardTitle.replace(/\s+/g, '_')}_all-pages.json`);
    playExportSound();
  };

  const handleLoadJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const isLegacy = parsed.nodes && Array.isArray(parsed.nodes);
        const isMultiPage = parsed.pages && Array.isArray(parsed.pages) && parsed.activePageId;
        if (isLegacy || isMultiPage) {
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

  const handleExportZip = () => {
    import('../utils/exportZip').then(({ exportBoardAsZip }) => {
      exportBoardAsZip(exportData(), boardTitle).then(playExportSound);
    });
  };

  const handleExportPNG = () => {
    const stageCanvas = document.querySelector<HTMLCanvasElement>('.konvajs-content canvas');
    if (!stageCanvas) return;
    stageCanvas.toBlob((blob) => {
      if (blob) { saveAs(blob, `${boardTitle.replace(/\s+/g, '_')}.png`); playExportSound(); }
    });
  };

  const handleExportTablesCSV = () => {
    const { nodes, boardTitle } = useBoardStore.getState();
    const tables = nodes.filter((n) => n.type === 'table') as import('../types').TableNode[];
    if (tables.length === 0) {
      toast('No tables found on this board.');
      return;
    }
    const parts = tables.map((t, i) => {
      const header = tables.length > 1 ? `# Table ${i + 1}\n` : '';
      const rows = t.cells.map((row) =>
        row.map((cell) => {
          const escaped = (cell ?? '').replace(/"/g, '""');
          return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')
            ? `"${escaped}"`
            : escaped;
        }).join(',')
      );
      return header + rows.join('\n');
    });
    const csv = parts.join('\n\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `${boardTitle.replace(/\s+/g, '_')}_tables.csv`);
    playExportSound();
  };

  const handleExportDocumentsMarkdown = () => {
    const { nodes, boardTitle, documents } = useBoardStore.getState();
    const md = exportDocumentsAsMarkdown(nodes, documents);
    if (md.trim() === '') {
      toast('No notes found on this board.');
      return;
    }
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    saveAs(blob, generateMarkdownFilename(boardTitle, true));
    playExportSound();
  };

  const handleImportTableCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) { toast('CSV is empty.'); return; }
      const numCols = Math.max(...rows.map((r) => r.length));
      const numRows = rows.length;
      // Pad short rows
      const cells = rows.map((r) => {
        const padded = [...r];
        while (padded.length < numCols) padded.push('');
        return padded;
      });
      const { camera, theme: currentTheme } = useBoardStore.getState();
      const isDark = currentTheme === 'dark';
      const colW = Math.max(80, Math.round(Math.min(200, 600 / numCols)));
      const rowH = 28;
      const totalW = colW * numCols;
      const totalH = rowH * numRows;
      const placeX = (-camera.x + window.innerWidth / 2) / camera.scale - totalW / 2;
      const placeY = (-camera.y + window.innerHeight / 2) / camera.scale - totalH / 2;
      addNode({
        id: `node_${Date.now()}`,
        type: 'table',
        x: placeX,
        y: placeY,
        colWidths: Array(numCols).fill(colW),
        rowHeights: Array(numRows).fill(rowH),
        cells,
        headerRow: true,
        fill: isDark ? '#1e293b' : '#ffffff',
        headerFill: 'var(--c-line)',
        stroke: isDark ? '#475569' : '#e2e8f0',
        fontSize: 13,
      } satisfies import('../types').TableNode);
      setActiveTool('select');
      toast(`Imported ${numRows} rows × ${numCols} cols`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleNewBoard = () => {
    const { nodes, pageSnapshots } = useBoardStore.getState();
    const hasContent = nodes.length > 0 || Object.values(pageSnapshots).some((s) => s.nodes.length > 0);

    const doNewBoard = () => {
      loadBoard({ boardTitle: 'Untitled Board', nodes: [] });
      clearFileHandle();
      setConfirmDialog(null);
    };

    if (!hasContent) {
      doNewBoard();
      return;
    }

    if (hasWorkspaceHandle()) {
      const wsName = workspaceName ?? 'workspace';
      setConfirmDialog({
        message: 'Start a new board? All pages will be lost.',
        confirmLabel: `Keep "${wsName}"`,
        onConfirm: doNewBoard,
        extraActions: [
          {
            label: 'Switch workspace…',
            onClick: async () => {
              doNewBoard();
              const result = await openWorkspace();
              if (result) {
                setWorkspaceName(result.name);
                if (result.data) loadBoard(result.data);
                onWorkspaceOpened();
              }
            },
          },
          {
            label: 'Go standalone (no folder)',
            onClick: () => {
              doNewBoard();
              clearWorkspaceHandle();
              setWorkspaceName(null);
            },
          },
        ],
      });
    } else {
      setConfirmDialog({
        message: 'Start a new board? All pages will be lost.',
        confirmLabel: 'New board',
        onConfirm: doNewBoard,
      });
    }
  };

  const handleLoadTemplate = (templateId: string) => {
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    setTemplatesModalOpen(false);
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
        confirmLabel={confirmDialog.confirmLabel}
        extraActions={confirmDialog.extraActions}
      />
    )}
    {templatesModalOpen && (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
        onMouseDown={() => setTemplatesModalOpen(false)}
      >
        <div
          className="relative w-[420px] max-h-[70vh] flex flex-col rounded-2xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl overflow-hidden font-sans"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--c-border)] shrink-0">
            <span className="font-sans text-[13px] font-semibold text-[var(--c-text-hi)] tracking-wide">Templates</span>
            <button
              onClick={() => setTemplatesModalOpen(false)}
              className="w-6 h-6 flex items-center justify-center rounded text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          {/* Scrollable list */}
          <div className="overflow-y-auto py-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => { setTemplatesModalOpen(false); handleLoadTemplate(t.id); }}
                className="w-full flex items-start gap-3 px-5 py-3 text-left hover:bg-[var(--c-hover)] transition-colors group"
              >
                <span className="mt-0.5 shrink-0 text-[var(--c-line)]"><IconTemplate /></span>
                <div className="min-w-0">
                  <div className="font-sans text-[12px] text-[var(--c-text-hi)] group-hover:text-[var(--c-text-hi)]">{t.name}</div>
                  <div className="font-sans text-[10px] text-[var(--c-text-lo)] mt-0.5 leading-snug">{t.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )}
    <div className="absolute top-0 left-0 right-0 z-[190] flex items-center justify-between px-4 h-11 bg-[var(--c-panel)] border-b border-[var(--c-border)] font-sans">
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
                : 'text-[var(--c-line)] hover:opacity-80 hover:bg-[var(--c-hover)]',
            ].join(' ')}
          >
            <span className="font-sans text-[10px] font-semibold tracking-wider uppercase">DevBoard</span>
            <IconChevronDown />
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <ActiveSubMenuCtx.Provider value={{ activeId: activeSubMenu, setActiveId: setActiveSubMenu as (id: string | null | ((prev: string | null) => string | null)) => void }}>
            <div className="absolute top-full left-0 mt-1.5 w-52 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl py-1.5 z-[220]">

              <MenuItemSub label="File" icon={<IconJson />}>
                <MenuItem onClick={() => menuAction(handleNewBoard)} icon={<IconNewBoard />}>New board</MenuItem>
                <MenuItem onClick={() => menuAction(() => fileInputRef.current?.click())} icon={<IconLoad />}>Load board…</MenuItem>
                <MenuItem onClick={() => menuAction(handleSaveJSON)} icon={<IconJson />} badge="⌘S">Save workspace</MenuItem>
                <MenuItem onClick={() => menuAction(handleSaveAsJSON)} icon={<IconJson />}>Save workspace as…</MenuItem>
                <MenuItem onClick={handleOpenFolder} icon={<IconFolder />}>
                  Open folder…
                  {workspaceName && <span className="ml-auto text-[9px] text-[var(--c-line)] font-sans truncate max-w-[80px]">{workspaceName}</span>}
                </MenuItem>
                <MenuDivider />
                <MenuLabel>Templates</MenuLabel>
                {TEMPLATES.slice(0, 3).map((t) => (
                  <MenuItem key={t.id} onClick={() => handleLoadTemplate(t.id)} icon={<IconTemplate />}>
                    {t.name}
                  </MenuItem>
                ))}
                <MenuItem
                  onClick={() => { setMenuOpen(false); setTemplatesModalOpen(true); }}
                  icon={<IconChevronRight />}
                >
                  View more
                </MenuItem>
              </MenuItemSub>

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
                <MenuDivider />
                <MenuLabel>Code</MenuLabel>
                <MenuItem onClick={() => menuAction(() => setActiveTool('code'))} icon={<IconCode />} badge="C">Code snippet</MenuItem>
                <MenuDivider />
                <MenuLabel>Table</MenuLabel>
                <MenuItem onClick={() => menuAction(() => setActiveTool('table'))} icon={<IconTableNew />} badge="G">Table (new)</MenuItem>
                <MenuItem onClick={() => { setMenuOpen(false); csvInputRef.current?.click(); }} icon={<IconCsv />}>Table from CSV</MenuItem>
                <MenuDivider />
                <MenuLabel>Image</MenuLabel>
                <MenuItem onClick={() => menuAction(() => setActiveTool('image'))} icon={<IconImageMenu />} badge="I">Place image</MenuItem>
              </MenuItemSub>
              <MenuItemSub label="Tools" icon={<IconTools />}>
                <MenuItem
                  onClick={() => { setMenuOpen(false); onToggleSearch(); }}
                  icon={<IconSearchMenu />}
                  badge="⌘F"
                >
                  Find on board
                </MenuItem>
                <MenuItem
                  onClick={() => { setMenuOpen(false); onToggleTimer(); }}
                  icon={<IconTimerMenu />}
                  checked={timerVisible}
                >
                  Timer
                </MenuItem>
                <MenuItem
                  onClick={() => { setMenuOpen(false); onToggleExplorer(); }}
                  icon={<IconFolder />}
                  checked={explorerOpen}
                >
                  File explorer
                </MenuItem>
                <MenuItem
                  onClick={() => { setMenuOpen(false); onToggleJira(); }}
                  icon={<IconJiraMenu />}
                  checked={jiraOpen}
                >
                  Jira
                </MenuItem>
              </MenuItemSub>

              <MenuDivider />
              <MenuItemSub label="Export" icon={<IconImg />}>
                <MenuItem onClick={() => menuAction(handleExportPNG)} icon={<IconImg />}>Export PNG</MenuItem>
                <MenuItem onClick={() => menuAction(handleExportZip)} icon={<IconZip />}>Export as ZIP</MenuItem>
                <MenuItem onClick={() => menuAction(handleExportTablesCSV)} icon={<IconCsv />}>Export tables as CSV</MenuItem>
                <MenuItem
                  onClick={() => menuAction(handleExportDocumentsMarkdown)}
                  icon={<IconCsv />}
                  disabled={!nodes.some(n => n.type === 'document')}
                >
                  Export notes as Markdown
                </MenuItem>
                {pages.length > 1 && (
                  <MenuItem onClick={() => menuAction(handleExportAllPages)} icon={<IconJson />}>Export all pages</MenuItem>
                )}
                {/* Share link disabled — not fully working yet */}
              </MenuItemSub>
              <MenuItem onClick={() => menuAction(onShowAbout)} icon={<IconAbout />}>About</MenuItem>
              <MenuItem onClick={() => menuAction(toggleTheme)} icon={<IconTheme isLight={theme === 'light'} />}>
                {theme === 'light' ? 'Dark mode' : 'Light mode'}
              </MenuItem>
              <MenuItem
                onClick={() => { setMenuOpen(false); window.open('https://mischa.itch.io/devboard', '_blank', 'noopener'); }}
                icon={<IconDownload />}
              >
                Download desktop app
              </MenuItem>

            </div>
            </ActiveSubMenuCtx.Provider>
          )}
        </div>

        {/* Pages toggle */}
        {(() => {
          const activePage = pages.find((p) => p.id === activePageId);
          return (
            <button
              onClick={onTogglePages}
              data-pages-toggle="true"
              title="Pages"
              className={[
                'flex items-center gap-1.5 h-7 px-2 rounded transition-colors shrink-0 min-w-0',
                pagesOpen
                  ? 'bg-[var(--c-line)] text-white'
                  : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
              ].join(' ')}
            >
              {/* Stacked pages icon with page count */}
              <span className="relative flex items-center justify-center w-[18px] h-[18px]">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="3" width="14" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M4 3V2.5A1.5 1.5 0 0 1 5.5 1h5A1.5 1.5 0 0 1 12 2.5V3" stroke="currentColor" strokeWidth="1.3" />
                </svg>
                <span
                  className="absolute bottom-[-3px] right-[-4px] flex items-center justify-center rounded-full text-[8px] font-bold leading-none"
                  style={{
                    minWidth: 12,
                    height: 12,
                    padding: '0 2px',
                    background: pagesOpen ? 'rgba(255,255,255,0.25)' : 'var(--c-line)',
                    color: pagesOpen ? 'white' : 'white',
                  }}
                >
                  {pages.length}
                </span>
              </span>
              {/* Active page name — hidden on mobile */}
              <span className="hidden sm:inline font-sans text-[9px] tracking-wide max-w-[100px] truncate">
                {activePage?.name ?? 'Page 1'}
              </span>
            </button>
          );
        })()}

        {/* Layout mode switcher — hidden when a document/note is open */}
        <div className={`${appMode === 'document' ? 'hidden' : 'hidden sm:flex'} items-center shrink-0`} style={{ padding: 2, background: 'var(--c-hover)', border: '1px solid var(--c-border)', borderRadius: 7, height: 28 }}>
          {(['freeform', 'stack'] as const).map((mode) => {
            const active = (activePage?.layoutMode ?? 'freeform') === mode;
            return (
              <button
                key={mode}
                onClick={() => setPageLayoutMode(activePageId, mode)}
                title={mode === 'freeform' ? 'Freeform canvas' : 'Stack — writing list'}
                className="font-sans"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 9px', height: 22, borderRadius: 5, border: 'none',
                  cursor: 'pointer', fontSize: 11, fontWeight: 500,
                  background: active ? 'var(--c-panel)' : 'transparent',
                  color: active ? 'var(--c-text-hi)' : 'var(--c-text-lo)',
                  boxShadow: active ? '0 1px 2px rgba(40,32,26,.08)' : 'none',
                  transition: 'background 120ms, color 120ms',
                }}
              >
                {mode === 'freeform' ? (
                  <IconFreeformPage />
                ) : (
                  <IconStackPage />
                )}
                {mode === 'freeform' ? 'Freeform' : 'Stack'}
              </button>
            );
          })}
        </div>

        {/* Separator + board title — hidden on mobile */}
        <span className="hidden sm:block text-[var(--c-border)]">/</span>
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
            className="hidden sm:block bg-transparent border-b border-[var(--c-line)] text-[var(--c-text-hi)] font-sans text-sm outline-none min-w-0 max-w-[220px]"
          />
        ) : (
          <button
            onClick={() => { setTitleDraft(boardTitle); setEditingTitle(true); }}
            title="Rename board"
            className="hidden sm:block font-sans text-sm text-[var(--c-text-hi)] hover:text-[var(--c-text-hi)] truncate max-w-[220px] text-left"
          >
            {boardTitle}
          </button>
        )}
        {/* Workspace indicator — interactive dropdown */}
        <div className="relative hidden sm:block shrink-0" ref={workspaceMenuRef}>
          {workspaceName ? (
            <button
              onClick={() => setWorkspaceMenuOpen((v) => !v)}
              title={`Workspace: ${workspaceName}`}
              className={[
                'flex items-center gap-1 px-2 h-7 rounded text-[11px] font-sans transition-colors max-w-[160px]',
                workspaceMenuOpen
                  ? 'bg-[var(--c-hover)] text-[var(--c-text-hi)]'
                  : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
              ].join(' ')}
            >
              <IconFolder />
              <span className="truncate max-w-[100px]">{workspaceName}</span>
              <IconChevronDown />
            </button>
          ) : (
            <button
              onClick={() => {
                if (IN_IFRAME) {
                  toast('Workspace folders are not available when embedded on itch.io');
                } else {
                  handleOpenFolder();
                }
              }}
              title={
                IN_IFRAME
                  ? 'Workspace folders are not available when embedded on itch.io'
                  : !FSA_DIR_SUPPORTED
                  ? 'Requires Chrome, Edge, or the desktop app'
                  : 'Open a folder workspace to save images as files and keep JSON small'
              }
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-sans border border-dashed border-[var(--c-border)] text-[var(--c-text-md)] hover:text-[var(--c-line)] hover:border-[var(--c-line)]/40 hover:bg-[var(--c-line)]/8 transition-colors"
            >
              <IconFolder />
              {IN_IFRAME ? 'Workspace unavailable' : 'Open workspace…'}
            </button>
          )}
          {workspaceMenuOpen && workspaceName && (
            <div className="absolute top-full left-0 mt-1.5 z-[300] bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl min-w-[190px] overflow-hidden">
              {/* Header */}
              <div className="px-3 py-2 border-b border-[var(--c-border)]">
                <p className="font-sans text-[9px] text-[var(--c-text-lo)] uppercase tracking-wider">Active workspace</p>
                <p className="font-sans text-[9px] text-[var(--c-line)] font-semibold truncate mt-0.5" title={workspaceName}>{workspaceName}</p>
              </div>
              {/* Actions */}
              <div className="py-1">
                <button
                  onClick={() => { setWorkspaceMenuOpen(false); handleOpenFolder(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left font-sans text-[12px] text-[var(--c-text-md)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
                >
                  <IconFolder />
                  Switch workspace…
                </button>
                <button
                  onClick={() => { setWorkspaceMenuOpen(false); onToggleExplorer(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left font-sans text-[12px] text-[var(--c-text-md)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <rect x="1" y="1" width="4" height="4" rx="0.8" stroke="currentColor" strokeWidth="1.1"/>
                    <rect x="1" y="6" width="4" height="4" rx="0.8" stroke="currentColor" strokeWidth="1.1"/>
                    <path d="M7 3h3M7 5.5h3M7 8h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                  </svg>
                  File explorer
                  <svg
                    width="10" height="10" viewBox="0 0 10 10" fill="none"
                    className="ml-auto"
                    style={{ opacity: explorerOpen ? 1 : 0 }}
                  >
                    <path d="M1.5 5l2.5 2.5 5-5" stroke="var(--c-line)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    setWorkspaceMenuOpen(false);
                    clearWorkspaceHandle();
                    setWorkspaceName(null);
                    toast('Workspace closed');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left font-sans text-[11px] text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  Close workspace
                </button>
              </div>
            </div>
          )}
        </div>
        {/* Missing images warning */}
        {missingImages.length > 0 && (
          <div ref={missingWarningRef} className="relative ml-1">
            <button
              onClick={() => setMissingWarningOpen((v) => !v)}
              title={`${missingImages.length} missing image${missingImages.length > 1 ? 's' : ''}`}
              className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-sans text-[#f59e0b] border border-[#f59e0b]/40 bg-[#f59e0b]/10 hover:bg-[#f59e0b]/20 transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M5 1L9.5 9H0.5L5 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M5 4.5v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <circle cx="5" cy="7.5" r="0.5" fill="currentColor" />
              </svg>
              {missingImages.length} missing
            </button>
            {missingWarningOpen && (
              <div className="absolute top-full left-0 mt-1.5 z-[300] bg-[var(--c-panel)] border border-[#f59e0b]/40 rounded-xl shadow-2xl min-w-[220px] overflow-hidden">
                <div className="px-3 py-2 border-b border-[var(--c-border)]">
                  <p className="font-sans text-[10px] text-[#f59e0b] font-semibold uppercase tracking-wider">Missing images</p>
                  <p className="font-sans text-[9px] text-[var(--c-text-lo)] mt-0.5">Re-open the workspace folder to reload.</p>
                </div>
                <ul className="max-h-[160px] overflow-y-auto py-1">
                  {missingImages.map((img) => (
                    <li key={img.id} className="flex items-center gap-2 px-3 py-1.5">
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="shrink-0 text-[#f59e0b]">
                        <rect x="1" y="1" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.1" />
                        <path d="M1 8L3.5 5.5l2 2L8 5l2 2.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                        <line x1="1" y1="1" x2="10" y2="10" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                      </svg>
                      <span className="font-sans text-[10px] text-[var(--c-text-md)] truncate" title={img.assetName}>{img.assetName}</span>
                    </li>
                  ))}
                </ul>
                <div className="px-3 py-2 border-t border-[var(--c-border)] flex flex-col gap-1.5">
                  <button
                    onClick={handleAutoFix}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--c-line)] hover:opacity-80 text-white font-sans text-[10px] font-semibold transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M5.5 1a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z" stroke="currentColor" strokeWidth="1.1"/>
                      <path d="M3.5 5.5l1.5 1.5 2.5-2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {hasWorkspaceHandle() ? 'Auto-fix all' : 'Re-open workspace to fix'}
                  </button>
                  {hasWorkspaceHandle() && (
                    <button
                      onClick={() => { setMissingWarningOpen(false); handleOpenFolder(); }}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--c-hover)] hover:bg-[#f59e0b]/15 text-[var(--c-text-lo)] hover:text-[#f59e0b] font-sans text-[10px] transition-colors"
                    >
                      <IconFolder />
                      Re-open workspace folder
                    </button>
                  )}
                  <DefaultFolderRow folder={imageAssetFolder} onChange={setImageAssetFolder} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">

        {/* Export dropdown */}
        <div className="relative" ref={exportRef}>
          <Tooltip label="Save or export your workspace">
          <button
            onClick={() => setExportOpen((v) => !v)}
            title="Save Workspace / Export"
            className={[
              'flex items-center gap-1 px-2.5 h-7 rounded font-sans text-[11px] tracking-wide transition-colors',
              exportOpen
                ? 'bg-[var(--c-line)] opacity-90 text-white'
                : 'bg-[var(--c-line)] text-white hover:opacity-80',
            ].join(' ')}
          >
            <span className="hidden sm:inline">Save Workspace</span>
            <IconJson />
            <IconChevronDown />
          </button>
          </Tooltip>
          {exportOpen && (
            <div className="absolute top-full right-0 mt-1.5 w-48 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl py-1.5 z-[220]">
              <MenuItem onClick={() => { setExportOpen(false); handleSaveJSON(); }} icon={<IconJson />} badge="⌘S">Save workspace</MenuItem>
              <MenuItem onClick={() => { setExportOpen(false); handleSaveAsJSON(); }} icon={<IconLoad />}>Save workspace as…</MenuItem>
              {pages.length > 1 && (
                <MenuItem onClick={() => { setExportOpen(false); handleExportAllPages(); }} icon={<IconJson />}>Export all pages</MenuItem>
              )}
              <MenuDivider />
              <MenuItem onClick={() => { setExportOpen(false); handleExportPNG(); }} icon={<IconImg />}>Export PNG</MenuItem>
              {/* Share link disabled — not fully working yet */}
            </div>
          )}
        </div>

        <div className="hidden sm:block w-px h-5 bg-[var(--c-border)] mx-1" />

        {/* Fullscreen — hidden on mobile */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          className="hidden sm:flex w-7 h-7 items-center justify-center rounded text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)] transition-colors"
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
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleImportTableCSV}
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
    <div className="px-3 py-0.5 font-sans text-[10px] text-[var(--c-text-off)] uppercase tracking-widest select-none">
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
  checked,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  badge?: string;
  checked?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className={[
        'w-full flex items-center gap-2.5 px-3 py-1.5 font-sans text-[12px] text-left transition-colors',
        disabled
          ? 'text-[var(--c-text-off)] cursor-default'
          : 'text-[var(--c-text-md)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
      ].join(' ')}
    >
      {icon && (
        <span className={disabled ? 'text-[var(--c-text-off)]' : 'text-[var(--c-line)]'}>
          {icon}
        </span>
      )}
      <span className="flex-1">{children}</span>
      {checked !== undefined && (
        <span className={checked ? 'text-[var(--c-line)]' : 'text-transparent'}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
      {badge && (
        <span className="text-[9px] font-sans text-[var(--c-text-off)] border border-[var(--c-border)] rounded px-1 py-0.5 uppercase tracking-wide">
          {badge}
        </span>
      )}
    </button>
  );
}

// ── Menu icons ───────────────────────────────────────────────────────────────

function IconNewBoard() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1.5" y="1" width="8" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9.5 3.5H11a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V11" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M5.5 5.5h3M7 4v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
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
const IconJson = IconSaveFile;

function IconLoad() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M2 8.5v2a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5v-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6.5 1.5v6M4 5l2.5 2.5L9 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconFolder() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M1 3.5a1 1 0 0 1 1-1h3l1.5 1.5H11a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
function IconZip() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1" y="1" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 1v11M5 3h2M5 5h2M5 7h2M5 9h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}
function IconImageMenu() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1" y="2" width="11" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="4.5" cy="5.5" r="1.2" stroke="currentColor" strokeWidth="1.1" />
      <path d="M1 9.5L4 7l2.5 2.5L8.5 7l3.5 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
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
function IconCode() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1" y="2" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 5L3 6.5l1.5 1.5M8.5 5L10 6.5 8.5 8M6 8l1-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconTableNew() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1" y="1" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1 4.5h11M4.5 4.5v7.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M7.5 7.5h3M9 6v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function IconCsv() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1.5" y="1" width="10" height="11" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 4.5h5M4 6.5h5M4 8.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8 8l1.5 1.5L8 11" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconTools() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M8.5 2a2.5 2.5 0 0 1 0 4.5L3 11.5a.7.7 0 0 1-1-1L7.5 5A2.5 2.5 0 0 1 8.5 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="9" cy="3.5" r="0.8" fill="currentColor" />
    </svg>
  );
}
function IconTimerMenu() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="6.5" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.5 4.5v3l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 1.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function IconJiraMenu() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M11.8 6.2L7.2 1.6 6.5.9 3 4.4l-.5.5a.4.4 0 000 .6l3 3 1 1 3.9-3.9.5-.5a.4.4 0 000-.6zM6.5 8.2L4.8 6.5l1.7-1.7 1.7 1.7-1.7 1.7z" fill="currentColor"/>
    </svg>
  );
}
function IconSearchMenu() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8.5 8.5L11.5 11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
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
const ActiveSubMenuCtx = createContext<{
  activeId: string | null;
  setActiveId: (id: string | null | ((prev: string | null) => string | null)) => void;
}>({ activeId: null, setActiveId: () => {} });

function MenuItemSub({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  const id = useId();
  const { activeId, setActiveId } = useContext(ActiveSubMenuCtx);
  const open = activeId === id;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setActiveId(id); // immediately replaces any other open submenu
  }, [id, setActiveId]);

  const hide = useCallback(() => {
    timerRef.current = setTimeout(
      // only close if we're still the active one — prevents stomping a newly opened sibling
      () => setActiveId((prev) => (prev === id ? null : prev)),
      300,
    );
  }, [id, setActiveId]);

  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hide}>
      <button
        className={[
          'w-full flex items-center gap-2.5 px-3 py-1.5 font-sans text-[12px] text-left transition-colors',
          open
            ? 'text-[var(--c-text-hi)] bg-[var(--c-hover)]'
            : 'text-[var(--c-text-md)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
        ].join(' ')}
      >
        {icon && <span className="text-[var(--c-line)]">{icon}</span>}
        <span className="flex-1">{label}</span>
        <span className="text-[var(--c-text-off)]"><IconChevronRight /></span>
      </button>
      {open && (
        <div
          className="absolute left-full top-0 ml-1 w-48 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl py-1.5 z-[230]"
          style={{ animation: 'submenu-in 0.13s ease-out' }}
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
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 rounded bg-[var(--c-panel)] border border-[var(--c-border)] text-[var(--c-text-md)] font-sans text-[10px] whitespace-nowrap shadow-lg pointer-events-none z-[200]">
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
        'px-3 h-7 rounded font-sans text-[11px] tracking-wide transition-colors',
        accent
          ? 'bg-[var(--c-line)] text-white hover:opacity-80'
          : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
