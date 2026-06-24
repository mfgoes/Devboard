import { useEffect, useRef } from 'react';
import { type PageMeta } from '../../types';
import { FONTS } from '../../utils/fonts';
import { IS_TAURI } from '../../utils/workspaceManager';

interface WorkspaceExplorerPageMenuProps {
  page: { x: number; y: number };
  noteSort: PageMeta['noteSort'];
  onClose: () => void;
  onCreateFolder: () => void;
  onCreateNote: () => void;
  onCreateCanvas: () => void;
  onChangeSortMode: (sort: 'updated' | 'custom') => void;
  onRevealPage: () => void;
  onRenamePage: () => void;
  onDeletePage: () => void;
}

export default function WorkspaceExplorerPageMenu({
  page,
  noteSort,
  onClose,
  onCreateFolder,
  onCreateNote,
  onCreateCanvas,
  onChangeSortMode,
  onRevealPage,
  onRenamePage,
  onDeletePage,
}: WorkspaceExplorerPageMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleWindowClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, [onClose]);

  const MENU_W = 180;
  const left = Math.min(page.x, window.innerWidth - MENU_W - 8);
  const top = Math.min(page.y, window.innerHeight - 110);

  return (
    <div
      ref={menuRef}
      style={{ position: 'fixed', left, top, zIndex: 9100, minWidth: MENU_W }}
      className="py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
        style={{ fontFamily: FONTS.ui }}
        onClick={() => {
          onCreateFolder();
          onClose();
        }}
      >
        <span>New folder</span>
        <span className="text-[10px] ml-3 text-[var(--c-text-off)]">+</span>
      </button>
      <button
        className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
        style={{ fontFamily: FONTS.ui }}
        onClick={() => {
          onCreateNote();
          onClose();
        }}
      >
        <span>New note</span>
        <span className="text-[10px] ml-3 text-[var(--c-text-off)]">+</span>
      </button>
      <button
        className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
        style={{ fontFamily: FONTS.ui }}
        onClick={() => {
          onCreateCanvas();
          onClose();
        }}
      >
        <span>New canvas</span>
        <span className="text-[10px] ml-3 text-[var(--c-text-off)]">▱</span>
      </button>
      <div style={{ height: 1, background: 'var(--c-border)', margin: '4px 0' }} />
      <div style={{ padding: '2px 10px 4px', fontFamily: FONTS.ui, fontSize: 10, color: 'var(--c-text-off)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Sort notes
      </div>
      <button
        className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left hover:bg-[var(--c-hover)]"
        style={{ fontFamily: FONTS.ui, color: noteSort !== 'custom' ? 'var(--c-text-hi)' : 'var(--c-text-md)' }}
        onClick={() => {
          onChangeSortMode('updated');
          onClose();
        }}
      >
        <span>Newest first</span>
        {noteSort !== 'custom' && <span className="text-[10px] ml-3">✓</span>}
      </button>
      <button
        className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left hover:bg-[var(--c-hover)]"
        style={{ fontFamily: FONTS.ui, color: noteSort === 'custom' ? 'var(--c-text-hi)' : 'var(--c-text-md)' }}
        onClick={() => {
          onChangeSortMode('custom');
          onClose();
        }}
      >
        <span>Custom order</span>
        {noteSort === 'custom' && <span className="text-[10px] ml-3">✓</span>}
      </button>
      <div style={{ height: 1, background: 'var(--c-border)', margin: '4px 0' }} />
      {IS_TAURI && (
        <button
          className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
          style={{ fontFamily: FONTS.ui }}
          onClick={() => {
            onRevealPage();
            onClose();
          }}
        >
          <span>Show in Folder</span>
        </button>
      )}
      <button
        className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
        style={{ fontFamily: FONTS.ui }}
        onClick={() => {
          onRenamePage();
          onClose();
        }}
      >
        <span>Rename folder</span>
      </button>
      <button
        className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left hover:bg-[rgba(239,68,68,0.12)]"
        style={{ fontFamily: FONTS.ui, color: '#f87171' }}
        onClick={() => {
          onDeletePage();
          onClose();
        }}
      >
        <span>Delete folder</span>
      </button>
    </div>
  );
}
