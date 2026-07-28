import type { RefObject } from 'react';

import { CODE_EXTS, DOC_EXTS, IMAGE_EXTS, ext, type TreeEntry, isWorkspaceManagedEntry } from './fileTreeUtils';
import { IS_TAURI } from '../../utils/workspaceManager';
import { FONTS } from '../../utils/fonts';

interface WorkspaceExplorerEntryMenuProps {
  open: boolean;
  entry: TreeEntry | null;
  x: number;
  y: number;
  menuRef: RefObject<HTMLDivElement>;
  cloudOnlyWorkspace: boolean;
  onOpenFile: (entry: TreeEntry) => void;
  onPlaceFile: (entry: TreeEntry) => void;
  onShowInFolder: (path: string) => void;
  onRename: (entry: TreeEntry) => void;
  onDelete: (entry: TreeEntry) => void;
}

export default function WorkspaceExplorerEntryMenu({
  open,
  entry,
  x,
  y,
  menuRef,
  cloudOnlyWorkspace,
  onOpenFile,
  onPlaceFile,
  onShowInFolder,
  onRename,
  onDelete,
}: WorkspaceExplorerEntryMenuProps) {
  if (!open || !entry) return null;

  const MENU_W = 160;
  const left = Math.min(x, window.innerWidth - MENU_W - 8);
  const top = Math.min(y, window.innerHeight - 80);
  const menuExt = ext(entry.name);
  const canActOnFile = entry.kind === 'file' && (IMAGE_EXTS.has(menuExt) || DOC_EXTS.has(menuExt) || CODE_EXTS[menuExt] !== undefined);
  const isDocFile = entry.kind === 'file' && DOC_EXTS.has(menuExt);
  const entryRelativePath = entry.path.join('/');
  const isReadOnly = cloudOnlyWorkspace || isWorkspaceManagedEntry(entry);

  return (
    <div
      ref={menuRef}
      style={{ position: 'fixed', left, top, zIndex: 9100, minWidth: MENU_W }}
      className="py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {canActOnFile && (
        <>
          <button
            className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
            style={{ fontFamily: FONTS.ui }}
            onClick={() => onOpenFile(entry)}
          >
            <span>{isDocFile ? 'Open note' : 'Place on canvas'}</span>
            <span className="text-[10px] text-[var(--c-text-off)] ml-3">↵</span>
          </button>
          {isDocFile && (
            <button
              className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
              style={{ fontFamily: FONTS.ui }}
              onClick={() => onPlaceFile(entry)}
            >
              <span>Place on canvas</span>
              <span className="text-[10px] text-[var(--c-text-off)] ml-3">drag</span>
            </button>
          )}
          <div style={{ height: 1, background: 'var(--c-border)', margin: '3px 0' }} />
        </>
      )}
      {!canActOnFile && entry.kind === 'file' && IS_TAURI && !cloudOnlyWorkspace && (
        <>
          <button
            className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
            style={{ fontFamily: FONTS.ui }}
            onClick={() => onOpenFile(entry)}
          >
            <span>Open in default app</span>
            <span className="text-[10px] text-[var(--c-text-off)] ml-3">↵</span>
          </button>
          <div style={{ height: 1, background: 'var(--c-border)', margin: '3px 0' }} />
        </>
      )}
      {IS_TAURI && (
        <>
          <button
            className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
            style={{ fontFamily: FONTS.ui }}
            onClick={() => onShowInFolder(entryRelativePath)}
          >
            <span>Show in Folder</span>
          </button>
          <div style={{ height: 1, background: 'var(--c-border)', margin: '3px 0' }} />
        </>
      )}
      {isReadOnly ? (
        <div
          className="px-3 py-1.5 text-[12px]"
          style={{ fontFamily: FONTS.ui, color: 'var(--c-text-off)' }}
        >
          {cloudOnlyWorkspace ? 'Cloud file' : 'Managed by Folders'}
        </div>
      ) : (
        <>
          <button
            className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
            style={{ fontFamily: FONTS.ui }}
            onClick={() => onRename(entry)}
          >
            <span>Rename</span>
            <span className="text-[10px] text-[var(--c-text-off)] ml-3">F2</span>
          </button>
          <div style={{ height: 1, background: 'var(--c-border)', margin: '3px 0' }} />
          <button
            className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left hover:bg-[rgba(239,68,68,0.12)]"
            style={{ fontFamily: FONTS.ui, color: '#f87171' }}
            onClick={() => onDelete(entry)}
          >
            <span>Delete</span>
            <span className="text-[10px] ml-3" style={{ color: '#f87171', opacity: 0.6 }}>⌫</span>
          </button>
        </>
      )}
    </div>
  );
}
