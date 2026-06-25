import type { RefObject } from 'react';

import { FONTS } from '../../utils/fonts';

interface WorkspaceExplorerProjectMenuProps {
  open: boolean;
  x: number;
  y: number;
  menuRef: RefObject<HTMLDivElement>;
  onRenameProject: () => void;
  onOpenLocalFolder: () => void;
}

export default function WorkspaceExplorerProjectMenu({
  open,
  x,
  y,
  menuRef,
  onRenameProject,
  onOpenLocalFolder,
}: WorkspaceExplorerProjectMenuProps) {
  if (!open) return null;

  const MENU_W = 176;
  const left = Math.min(x, window.innerWidth - MENU_W - 8);
  const top = Math.min(y, window.innerHeight - 96);

  return (
    <div
      ref={menuRef}
      style={{ position: 'fixed', left, top, zIndex: 9300, minWidth: MENU_W }}
      className="py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
        style={{ fontFamily: FONTS.ui }}
        onClick={onRenameProject}
      >
        <span>Rename workspace...</span>
      </button>
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
        style={{ fontFamily: FONTS.ui }}
        onClick={onOpenLocalFolder}
      >
        <span>Open local folder...</span>
      </button>
    </div>
  );
}
