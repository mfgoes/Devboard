import { useEffect, useMemo, useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { useAuth } from '../contexts/AuthContext';
import { exportBoardAsZip } from '../utils/exportZip';
import { getWorkspacePathHint, hasWorkspaceHandle } from '../utils/workspaceManager';
import { toast } from '../utils/toast';
import { workspaceRouteUrl } from '../utils/appHelpers';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenSync: () => void;
}

async function copyText(value: string, success: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast(success);
  } catch {
    toast('Could not copy to clipboard');
  }
}

/**
 * Sharing is intentionally separate from sync. A local workspace can always be
 * exported; a synced workspace is still private until snapshot sharing exists.
 */
export default function WorkspaceShareModal({ open, onClose, onOpenSync }: Props) {
  const exportData = useBoardStore((s) => s.exportData);
  const boardTitle = useBoardStore((s) => s.boardTitle);
  const workspaceName = useBoardStore((s) => s.workspaceName);
  const cloudBoardId = useBoardStore((s) => s.cloudBoardId);
  const cloudSyncedAt = useBoardStore((s) => s.cloudSyncedAt);
  const lastLocalSavedAt = useBoardStore((s) => s.lastLocalSavedAt);
  const activeDocId = useBoardStore((s) => s.activeDocId);
  const activePageId = useBoardStore((s) => s.activePageId);
  const documents = useBoardStore((s) => s.documents);
  const pages = useBoardStore((s) => s.pages);
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);

  const folderPath = getWorkspacePathHint();
  const hasLocalWorkspace = hasWorkspaceHandle() || !!folderPath || !!workspaceName;
  const hasUnsyncedChanges = !!user && !!cloudBoardId && !!lastLocalSavedAt && !!cloudSyncedAt
    && lastLocalSavedAt > cloudSyncedAt + 1000;
  const status = useMemo(() => {
    if (!cloudBoardId) return { label: 'Local only', detail: 'This project stays on this device unless you export it or enable private sync.' };
    if (!user) return { label: 'Sync paused', detail: 'This project is linked to cloud sync, but you are signed out on this device.' };
    if (hasUnsyncedChanges) return { label: 'Changes waiting to sync', detail: 'Sync before opening this project on another device.' };
    return { label: 'Private sync on', detail: 'Your synced project is private. It does not create a public link.' };
  }, [cloudBoardId, hasUnsyncedChanges, user]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const title = boardTitle.trim() || workspaceName || 'Untitled project';
  const handleExport = async () => {
    setExporting(true);
    try {
      await exportBoardAsZip(exportData(), title);
      toast('Portable project copy downloaded');
    } catch (error) {
      console.error('Project export failed', error);
      toast('Could not export this project');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/45 p-4" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-project-title"
        className="w-full max-w-[520px] rounded-2xl border border-[var(--c-border)] bg-[var(--c-panel)] p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-lo)]">Project sharing</p>
            <h2 id="share-project-title" className="mt-1 text-lg font-semibold text-[var(--c-text-hi)]">Share {title}</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-[var(--c-text-lo)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]" aria-label="Close share project">
            ×
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-canvas)] px-3 py-2.5">
          <p className="text-xs font-semibold text-[var(--c-text-hi)]">{status.label}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--c-text-md)]">{status.detail}</p>
        </div>

        <div className="mt-4 space-y-2">
          <button
            onClick={() => void handleExport()}
            disabled={exporting}
            className="flex w-full items-center justify-between rounded-xl bg-[var(--c-line)] px-3.5 py-3 text-left text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <span><strong className="block text-xs">Export a portable copy</strong><span className="text-[11px] text-white/80">Notes, canvases, and embedded assets in one ZIP.</span></span>
            <span className="text-xs">{exporting ? 'Exporting…' : 'Export'}</span>
          </button>

          {hasLocalWorkspace && folderPath && (
            <button
              onClick={() => void copyText(folderPath, 'Folder path copied — it only works on this computer')}
              className="flex w-full items-center justify-between rounded-xl border border-[var(--c-border)] px-3.5 py-3 text-left hover:bg-[var(--c-hover)]"
            >
              <span><strong className="block text-xs text-[var(--c-text-hi)]">Copy folder path</strong><span className="text-[11px] text-[var(--c-text-md)]">Useful for your own machine; it is not a shareable project link.</span></span>
              <span className="text-xs text-[var(--c-text-lo)]">Copy</span>
            </button>
          )}

          {cloudBoardId && !hasUnsyncedChanges && (
            <button
              onClick={() => void copyText(workspaceRouteUrl({
                workspaceId: cloudBoardId,
                workspaceTitle: title,
                ...(activeDocId
                  ? { noteId: activeDocId, noteTitle: documents.find((document) => document.id === activeDocId)?.title }
                  : { canvasId: activePageId, canvasTitle: pages.find((page) => page.id === activePageId)?.name }),
              }), 'Private Devboard link copied')}
              className="flex w-full items-center justify-between rounded-xl border border-[var(--c-border)] px-3.5 py-3 text-left hover:bg-[var(--c-hover)]"
            >
              <span><strong className="block text-xs text-[var(--c-text-hi)]">Copy private Devboard link</strong><span className="text-[11px] text-[var(--c-text-md)]">Opens this location for anyone signed in to your synced workspace.</span></span>
              <span className="text-xs text-[var(--c-text-lo)]">Copy</span>
            </button>
          )}

          <button
            onClick={() => { onClose(); onOpenSync(); }}
            className="flex w-full items-center justify-between rounded-xl border border-[var(--c-border)] px-3.5 py-3 text-left hover:bg-[var(--c-hover)]"
          >
            <span><strong className="block text-xs text-[var(--c-text-hi)]">{cloudBoardId ? 'Manage private sync' : 'Enable private sync'}</strong><span className="text-[11px] text-[var(--c-text-md)]">For backup and opening this workspace on your own devices.</span></span>
            <span className="text-xs text-[var(--c-text-lo)]">Sync</span>
          </button>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-[var(--c-text-lo)]">
          Read-only web snapshots and invite links are not enabled yet. Private links require sign-in; Devboard will never create a public project link without asking first.
        </p>
      </section>
    </div>
  );
}
