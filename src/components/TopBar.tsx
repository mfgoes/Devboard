import { useRef, useState, useEffect, useCallback, useContext, createContext, useId } from 'react';
import { saveAs } from 'file-saver';
import { useBoardStore } from '../store/boardStore';
import { useAuth } from '../contexts/AuthContext';
import { TEMPLATES } from '../templates';
import ConfirmDialog from './ConfirmDialog';
import CloudModal from './CloudModal';
import { saveBoard, saveBoardAs, clearFileHandle } from '../utils/fileSave';
import { openWorkspace, createWorkspace, saveWorkspace, hasWorkspaceHandle, clearWorkspaceHandle, getWorkspacePathHint, IS_TAURI } from '../utils/workspaceManager';
import { toast } from '../utils/toast';
import { exportDocumentsAsMarkdown, generateMarkdownFilename } from '../utils/exportMarkdown';
import exportSound from '../assets/get1.mp3';
import { IconDoc, IconFreeformPage, IconSaveFile, IconStackPage } from './icons';
import { announceLocalSave } from '../utils/saveStatus';
import { applyWorkspaceSyncFromOpenResult } from '../utils/applyWorkspaceSync';
import { DARK_MENU_CLASSES } from './darkMenuTheme';

const playExportSound = () => new Audio(exportSound).play().catch(() => {});

interface TopBarProps {
  onShowAbout: () => void;
  onNewNote: () => void;
  timerVisible: boolean;
  onToggleTimer: () => void;
  explorerOpen: boolean;
  onToggleExplorer: () => void;
  onWorkspaceOpened: () => void;
  jiraOpen: boolean;
  onToggleJira: () => void;
  onToggleSearch: () => void;
  workspaceOffset?: number;
  templatesOpen?: boolean;
  onTemplatesOpenChange?: (open: boolean) => void;
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

type WorkspaceStorageTone = 'neutral' | 'local' | 'cloud' | 'success' | 'warning';

function storageToneClass(tone: WorkspaceStorageTone, theme: 'dark' | 'light'): string {
  if (tone === 'success') return `border-emerald-500/25 bg-emerald-500/10 ${theme === 'light' ? 'text-emerald-700' : 'text-emerald-300'}`;
  if (tone === 'warning') return `border-amber-500/28 bg-amber-500/12 ${theme === 'light' ? 'text-amber-700' : 'text-amber-300'}`;
  if (tone === 'cloud') {
    return theme === 'light'
      ? 'border-[var(--c-border)] bg-[var(--c-panel)]/85 text-[var(--c-text-hi)]'
      : 'border-sky-500/24 bg-sky-500/10 text-sky-300';
  }
  if (tone === 'local') return 'border-[var(--c-border)] bg-[var(--c-panel)]/75 text-[var(--c-text-md)]';
  return 'border-[var(--c-border)] bg-[var(--c-panel)]/65 text-[var(--c-text-lo)]';
}

export default function TopBar({ onShowAbout, onNewNote, timerVisible, onToggleTimer, explorerOpen, onToggleExplorer, onWorkspaceOpened, jiraOpen, onToggleJira, onToggleSearch, workspaceOffset = 0, templatesOpen, onTemplatesOpenChange }: TopBarProps) {
  const { boardTitle, exportData, loadBoard, setActiveTool, setActiveShapeKind, toggleTheme, theme, addNode, pages, activePageId, setPageLayoutMode, workspaceName, setWorkspaceName, nodes, appMode, noteAutosaveEnabled, setNoteAutosaveEnabled, cloudBoardId, cloudBoardTitle, cloudSyncedAt, lastLocalSavedAt, lastLocalSaveTarget } = useBoardStore();
  const { user } = useAuth();
  const activePage = pages.find((p) => p.id === activePageId);
  const isDocumentContext = appMode === 'document';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    extraActions?: Array<{ label: string; onClick: () => void }>;
  } | null>(null);
  const [templatesModalOpenInternal, setTemplatesModalOpenInternal] = useState(false);
  const templatesModalOpen = templatesOpen !== undefined ? templatesOpen : templatesModalOpenInternal;
  const setTemplatesModalOpen = useCallback((open: boolean) => {
    if (onTemplatesOpenChange) onTemplatesOpenChange(open);
    else setTemplatesModalOpenInternal(open);
  }, [onTemplatesOpenChange]);
  const [cloudOpen, setCloudOpen] = useState(false);

  const workspacePathHint = getWorkspacePathHint();
  const workspaceFolderLabel = workspaceName ?? workspacePathHint?.replace(/\\/g, '/').split('/').pop() ?? null;

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
    const handler = () => setCloudOpen(true);
    window.addEventListener('devboard:open-cloud-modal', handler);
    return () => window.removeEventListener('devboard:open-cloud-modal', handler);
  }, []);

  const handleSaveJSON = () => {
    if (workspaceName) {
      saveWorkspace(exportData(), { notify: false }).then((result) => {
        if (!result.saved) return;
        playExportSound();
        announceLocalSave('workspace', result.workspaceName);
      });
    } else {
      saveBoard(exportData(), { notify: false }).then((result) => {
        if (!result.saved) return;
        playExportSound();
        announceLocalSave('file', result.targetName);
      });
    }
  };
  const handleSaveAsJSON = () => saveBoardAs(exportData(), { notify: false }).then((result) => {
    if (!result.saved) return;
    playExportSound();
    announceLocalSave('file', result.targetName);
  });

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
    applyWorkspaceSyncFromOpenResult(result);
    clearFileHandle();
    onWorkspaceOpened(); // auto-open the file explorer
  };

  const handleCreateWorkspace = async () => {
    setMenuOpen(false);
    const result = await createWorkspace(exportData(), boardTitle.trim() || 'DevBoard Workspace');
    if (!result) return;
    setWorkspaceName(result.name);
    clearFileHandle();
    onWorkspaceOpened();
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
                applyWorkspaceSyncFromOpenResult(result);
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

  const isLinkedSyncSignedOut = !user && !!cloudBoardId;
  const hasUnsyncedSyncChanges = !!user && !!cloudBoardId && !!lastLocalSavedAt && !!cloudSyncedAt && lastLocalSavedAt > cloudSyncedAt + 1000;
  const isCloudOnlyWorkspace = !!cloudBoardId && !workspaceFolderLabel;
  const localTargetLabel = workspaceFolderLabel
    ? `workspace folder "${workspaceFolderLabel}"`
    : lastLocalSaveTarget?.kind === 'workspace'
      ? `workspace folder${lastLocalSaveTarget.name ? ` "${lastLocalSaveTarget.name}"` : ''}`
    : lastLocalSaveTarget?.kind === 'file'
      ? `local file${lastLocalSaveTarget.name ? ` "${lastLocalSaveTarget.name}"` : ''}`
      : lastLocalSavedAt
        ? 'local file'
        : null;
  const hasLocalAttachment = !!localTargetLabel;
  const storageStatus: { label: string; title: string; tone: WorkspaceStorageTone } = isLinkedSyncSignedOut
    ? {
      label: 'Sync paused',
      title: `This workspace is linked to cloud storage${cloudBoardTitle ? ` as "${cloudBoardTitle}"` : ''}, but you are signed out.`,
      tone: 'warning',
    }
    : hasUnsyncedSyncChanges
      ? {
        label: 'Unsynced',
        title: `Local changes in your ${localTargetLabel ?? 'workspace'} are newer than the last cloud sync.`,
        tone: 'warning',
      }
      : cloudBoardId && isCloudOnlyWorkspace && !hasLocalAttachment
        ? {
          label: 'Cloud only',
          title: `This workspace is saved in cloud storage${cloudBoardTitle ? ` as "${cloudBoardTitle}"` : ''}, but no local folder or file is attached on this device.`,
          tone: 'cloud',
        }
        : cloudBoardId
          ? {
            label: 'Synced',
            title: `Your ${localTargetLabel ?? 'local workspace'} and cloud copy${cloudBoardTitle ? ` "${cloudBoardTitle}"` : ''} are linked.`,
            tone: 'success',
          }
          : hasLocalAttachment
            ? {
              label: 'Local only',
              title: `Saved to your ${localTargetLabel}. Not linked to Workspace Sync.`,
              tone: 'local',
            }
            : {
              label: 'Not saved',
              title: 'No local workspace, local board file, or cloud workspace is attached yet.',
              tone: 'neutral',
            };
  const storageStatusIconOnly = workspaceOffset > 400;
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
      <CloudModal open={cloudOpen} onClose={() => setCloudOpen(false)} />
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
              <span className="font-sans text-[13px] font-semibold text-[var(--c-text-hi)] tracking-wide">Starter Workspaces</span>
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
      <div className="pointer-events-none absolute top-0 left-0 right-0 z-[190] h-11 font-sans overflow-visible">
      {/* Left: Logo + dropdown */}
      {!explorerOpen && (
      <div className="pointer-events-auto absolute left-2 sm:left-4 top-1/2 flex max-w-[calc(50vw-132px)] -translate-y-1/2 items-center gap-1.5 sm:gap-2.5 min-w-0 overflow-visible">

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
            <span className="font-sans text-[11px] font-semibold truncate max-w-[132px]">
              {(workspaceFolderLabel ?? boardTitle.trim()) || 'DevBoard'}
            </span>
            <IconChevronDown />
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div className={`absolute top-full left-0 mt-1.5 w-52 py-1.5 z-[220] ${DARK_MENU_CLASSES.panel}`}>
              <MenuItem onClick={handleOpenFolder} icon={<IconFolder />}>
                Switch workspace...
              </MenuItem>
              <MenuDivider />
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  setCloudOpen(true);
                }}
                icon={<IconSettings />}
              >
                Preferences...
              </MenuItem>
              <MenuItem onClick={() => menuAction(onShowAbout)} icon={<IconAbout />}>Help & about</MenuItem>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Center: Layout mode switcher */}
      <div
        className="pointer-events-auto absolute top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:flex items-center shrink-0"
        style={{
          left: workspaceOffset > 0 ? `calc(50% + ${Math.round(workspaceOffset / 2)}px)` : '50%',
          padding: 2,
          background: 'color-mix(in srgb, var(--c-panel) 82%, transparent)',
          border: '1px solid color-mix(in srgb, var(--c-border) 86%, transparent)',
          borderRadius: 9,
          height: 28,
          boxShadow: '0 6px 18px rgba(40,32,26,0.08)',
          backdropFilter: 'blur(10px)',
        }}
      >
        {(['freeform', 'stack'] as const).map((mode) => {
          const active = (activePage?.layoutMode ?? 'freeform') === mode;
          return (
            <button
              key={mode}
              onClick={() => setPageLayoutMode(activePageId, mode)}
              title={mode === 'freeform' ? 'Canvas' : 'Notes'}
              className="font-sans px-2 sm:px-3"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 24, borderRadius: 6, border: 'none',
                cursor: 'pointer', fontSize: 11, fontWeight: 650,
                background: active ? 'var(--c-canvas)' : 'transparent',
                color: active ? 'var(--c-text-hi)' : 'var(--c-text-lo)',
                boxShadow: active ? '0 1px 2px rgba(40,32,26,.08)' : 'none',
                transition: 'background 120ms, color 120ms',
              }}
            >
              {mode === 'freeform' ? <IconFreeformPage /> : <IconStackPage />}
              <span>{mode === 'freeform' ? 'Canvas' : 'Notes'}</span>
            </button>
          );
        })}
      </div>

      {/* Right: Actions */}
      <div className="pointer-events-auto absolute right-2 sm:right-4 top-1/2 flex -translate-y-1/2 shrink-0 items-center gap-0.5 sm:gap-1 whitespace-nowrap">
        <button
          type="button"
          onClick={() => setCloudOpen(true)}
          title={storageStatus.title}
          aria-label={`Workspace storage status: ${storageStatus.label}. ${storageStatus.title}`}
          className={[
            'hidden md:inline-flex h-7 items-center justify-center gap-1.5 rounded-full border px-2.5 font-sans text-[10px] font-semibold transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]',
            storageToneClass(storageStatus.tone, theme),
          ].join(' ')}
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
            style={{ opacity: storageStatus.tone === 'neutral' ? 0.45 : 0.8 }}
          />
          {!storageStatusIconOnly && <span>{storageStatus.label}</span>}
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
  return <div className={DARK_MENU_CLASSES.divider} />;
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className={DARK_MENU_CLASSES.label}>
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
        DARK_MENU_CLASSES.itemBase,
        disabled ? DARK_MENU_CLASSES.itemDisabled : DARK_MENU_CLASSES.itemEnabled,
      ].join(' ')}
    >
      {icon && (
        <span className={disabled ? DARK_MENU_CLASSES.itemDisabled : DARK_MENU_CLASSES.accent}>
          {icon}
        </span>
      )}
      <span className="flex-1">{children}</span>
      {checked !== undefined && (
        <span className={checked ? DARK_MENU_CLASSES.accent : 'text-transparent'}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
      {badge && (
        <span className={DARK_MENU_CLASSES.badge}>
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
function IconSettings() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="6.5" cy="6.5" r="1.7" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6.5 1.7v1.1M6.5 10.2v1.1M1.7 6.5h1.1M10.2 6.5h1.1M3.1 3.1l.8.8M9.1 9.1l.8.8M3.1 9.9l.8-.8M9.1 3.9l.8-.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
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
  const [nestedActiveId, setNestedActiveId] = useState<string | null>(null);

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
          DARK_MENU_CLASSES.itemBase,
          open ? DARK_MENU_CLASSES.itemActive : DARK_MENU_CLASSES.itemEnabled,
        ].join(' ')}
      >
        {icon && <span className={DARK_MENU_CLASSES.accent}>{icon}</span>}
        <span className="flex-1">{label}</span>
        <span className={DARK_MENU_CLASSES.muted}><IconChevronRight /></span>
      </button>
      {open && (
        <div
          className={`absolute left-full top-0 ml-1 w-48 py-1.5 z-[230] ${DARK_MENU_CLASSES.panel}`}
          style={{ animation: 'submenu-in 0.13s ease-out' }}
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          <ActiveSubMenuCtx.Provider value={{ activeId: nestedActiveId, setActiveId: setNestedActiveId as (id: string | null | ((prev: string | null) => string | null)) => void }}>
            {children}
          </ActiveSubMenuCtx.Provider>
        </div>
      )}
    </div>
    </>
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
