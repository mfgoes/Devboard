import { useRef, useState, useEffect, useCallback } from 'react';
import { saveAs } from 'file-saver';
import { useBoardStore } from '../store/boardStore';
import { useAuth } from '../contexts/AuthContext';
import { TEMPLATES } from '../templates';
import ConfirmDialog from './ConfirmDialog';
import CloudModal from './CloudModal';
import AppMenu from './AppMenu';
import { saveBoard, saveBoardAs, clearFileHandle } from '../utils/fileSave';
import { openWorkspace, openRecentWorkspace, listLocalRecentWorkspaces, createWorkspace, saveWorkspace, hasWorkspaceHandle, clearWorkspaceHandle, getWorkspacePathHint, IS_TAURI, type LocalRecentWorkspace, type WorkspaceOpenResult } from '../utils/workspaceManager';
import { toast } from '../utils/toast';
import { exportDocumentsAsMarkdown, generateMarkdownFilename } from '../utils/exportMarkdown';
import { exportDocumentAsMarkdownFile, exportDocumentAsPdf, exportDocumentAsTextFile } from '../utils/documentExport';
import exportSound from '../assets/get1.mp3';
import { IconDoc, IconSidebarToggle } from './icons';
import { announceLocalSave } from '../utils/saveStatus';
import { applyWorkspaceSyncFromOpenResult } from '../utils/applyWorkspaceSync';
import { promptAndImportMarkdownNotes } from '../utils/noteImport';

const playExportSound = () => new Audio(exportSound).play().catch(() => {});

interface TopBarProps {
  onShowAbout: () => void;
  onNewNote: () => void;
  onToggleTimer: () => void;
  explorerOpen: boolean;
  onToggleExplorer: () => void;
  onWorkspaceOpened: () => void;
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

export default function TopBar({ onShowAbout, onNewNote, onToggleTimer, explorerOpen, onToggleExplorer, onWorkspaceOpened, onToggleJira, onToggleSearch, workspaceOffset = 0, templatesOpen, onTemplatesOpenChange }: TopBarProps) {
  const { boardTitle, exportData, loadBoard, setActiveTool, setActiveShapeKind, addNode, addCanvasDocument, addPage, pages, activePageId, activeDocId, documents, workspaceName, setWorkspaceName, nodes, appMode, cloudBoardId, cloudBoardTitle, cloudSyncedAt, lastLocalSavedAt, lastLocalSaveTarget } = useBoardStore();
  const { user } = useAuth();
  const isDocumentContext = appMode === 'document';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchorLeft, setMenuAnchorLeft] = useState<number | null>(null);
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
  const [cloudInitialTab, setCloudInitialTab] = useState<'workspace' | 'library'>('workspace');
  const [recentProjects, setRecentProjects] = useState<LocalRecentWorkspace[]>([]);

  const workspacePathHint = getWorkspacePathHint();
  const workspaceFolderLabel = workspaceName ?? workspacePathHint?.replace(/\\/g, '/').split('/').pop() ?? null;
  const titleLabel = boardTitle.trim() || cloudBoardTitle || workspaceFolderLabel || 'Untitled Project';
  const titleStripLeft = Math.max(8, workspaceOffset + 10);
  const appMenuLeft = menuAnchorLeft ?? titleStripLeft;
  const activeDocumentForMenu = documents.find((doc) => doc.id === activeDocId) ?? null;
  const canExportActiveNote = !!activeDocumentForMenu && activeDocumentForMenu.docType !== 'canvas';

  const applyOpenedWorkspaceResult = useCallback((result: WorkspaceOpenResult) => {
    setWorkspaceName(result.name);
    if (result.data) {
      loadBoard(result.data);
    } else {
      loadBoard({ boardTitle: result.name, nodes: [] });
    }
    applyWorkspaceSyncFromOpenResult(result);
    clearFileHandle();
    onWorkspaceOpened();
  }, [loadBoard, onWorkspaceOpened, setWorkspaceName]);

  const loadRecentProjects = useCallback(async () => {
    try {
      setRecentProjects((await listLocalRecentWorkspaces()).slice(0, 6));
    } catch (err) {
      console.warn('Failed to load recent projects', err);
      setRecentProjects([]);
    }
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ left?: number }>).detail;
      setMenuAnchorLeft(typeof detail?.left === 'number' ? detail.left : titleStripLeft);
      setMenuOpen((open) => {
        const next = !open;
        if (next) void loadRecentProjects();
        return next;
      });
    };
    window.addEventListener('devboard:toggle-app-menu', handler);
    return () => window.removeEventListener('devboard:toggle-app-menu', handler);
  }, [loadRecentProjects, titleStripLeft]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: 'workspace' | 'library' }>).detail;
      setCloudInitialTab(detail?.tab === 'library' ? 'library' : 'workspace');
      setCloudOpen(true);
    };
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
    applyOpenedWorkspaceResult(result);
  };

  const handleOpenRecentProject = async (project: LocalRecentWorkspace) => {
    const result = await openRecentWorkspace(project.id);
    if (!result) {
      toast('Could not reopen that project. Relocate the folder or choose another project.');
      await loadRecentProjects();
      return;
    }
    applyOpenedWorkspaceResult(result);
  };

  const handleOpenProjectsLibrary = () => {
    setCloudInitialTab('library');
    setCloudOpen(true);
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

  const handleImportNotes = async () => {
    setMenuOpen(false);
    await promptAndImportMarkdownNotes();
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
            label: 'Switch project…',
            onClick: async () => {
              doNewBoard();
              const result = await openWorkspace();
              if (result) {
                applyOpenedWorkspaceResult(result);
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

  const handleNewCanvasFromMenu = () => {
    const activePage = pages.find((page) => page.id === activePageId);
    addCanvasDocument(activePage?.isCanvasDocument ? activePage.parentPageId : activePageId);
  };

  const handleExportActiveMarkdown = () => {
    if (!activeDocumentForMenu || activeDocumentForMenu.docType === 'canvas') return;
    exportDocumentAsMarkdownFile(activeDocumentForMenu);
  };

  const handleExportActivePdf = () => {
    if (!activeDocumentForMenu || activeDocumentForMenu.docType === 'canvas') return;
    exportDocumentAsPdf(activeDocumentForMenu);
  };

  const handleExportActiveText = () => {
    if (!activeDocumentForMenu || activeDocumentForMenu.docType === 'canvas') return;
    exportDocumentAsTextFile(activeDocumentForMenu);
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
      <CloudModal open={cloudOpen} onClose={() => setCloudOpen(false)} initialTab={cloudInitialTab} />
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
      <div
        className="pointer-events-none absolute top-0 left-0 right-0 z-[190] h-11 font-sans overflow-visible"
        style={{
          height: 44,
          background: 'var(--c-topbar)',
          borderBottom: '0.5px solid var(--c-topbar-border)',
        }}
      >
      {/* Left: persistent project menu when the sidebar is collapsed */}
      {!explorerOpen && (
        <div
          ref={menuRef}
          className="pointer-events-auto absolute top-1/2 flex -translate-y-1/2 items-center gap-2"
          style={{
            left: titleStripLeft,
            maxWidth: 'min(360px, calc(100vw - 116px))',
          }}
        >
          <div
            className="flex min-w-0 items-center gap-2 rounded-[11px] border border-[var(--c-border)] bg-[var(--c-panel)] py-1 pl-3 pr-2 shadow-sm"
            style={{ height: 36 }}
          >
            <span
              className="min-w-0 flex-1 truncate pr-1 font-sans text-[12px] font-semibold text-[var(--c-text-hi)]"
              title={titleLabel}
            >
              {titleLabel}
            </span>
            <button
              type="button"
              onClick={onToggleExplorer}
              title="Expand sidebar"
              aria-label="Expand sidebar"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
            >
              <IconSidebarToggle size={16} />
            </button>
          </div>
          {menuOpen && (
            <AppMenu
              left={appMenuLeft}
              top={46}
              width={220}
              onRequestClose={() => setMenuOpen(false)}
              recentProjects={recentProjects}
              currentProjectName={titleLabel}
              state={{
                canExportActiveNote,
                canExportBoardPng: true,
              }}
              actions={{
                newNote: onNewNote,
                newCanvas: handleNewCanvasFromMenu,
                newFolder: () => addPage(),
                openLocalFolder: () => { void handleOpenFolder(); },
                openRecentProject: (project) => { void handleOpenRecentProject(project); },
                allProjects: handleOpenProjectsLibrary,
                saveProject: handleSaveJSON,
                projectSync: () => window.dispatchEvent(new CustomEvent('devboard:open-cloud-modal')),
                search: onToggleSearch,
                toggleTimer: onToggleTimer,
                toggleJira: onToggleJira,
                exportActiveNoteMarkdown: handleExportActiveMarkdown,
                exportActiveNotePdf: handleExportActivePdf,
                exportActiveNoteText: handleExportActiveText,
                exportBoardPng: handleExportPNG,
                downloadDesktopApp: () => window.open('https://devboard.app/download', '_blank'),
                preferences: () => {
                  onToggleExplorer();
                  window.setTimeout(() => window.dispatchEvent(new CustomEvent('devboard:open-preferences')), 60);
                },
                helpAbout: onShowAbout,
              }}
            />
          )}
        </div>
      )}

      {/* Right: Actions */}
      <div className="pointer-events-auto absolute right-2 sm:right-4 top-1/2 flex -translate-y-1/2 shrink-0 items-center gap-0.5 sm:gap-1 whitespace-nowrap">
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
function IconLoad() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M2 8.5v2a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5v-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6.5 1.5v6M4 5l2.5 2.5L9 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
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
