import { useEffect, useRef, useState } from 'react';
import { type Document } from '../../types';
import { FONTS } from '../../utils/fonts';
import { exportDocumentAsMarkdownFile, exportDocumentAsPdf, exportDocumentAsTextFile } from '../../utils/documentExport';
import { isCanvasDocument } from './workspaceExplorerUtils';

interface WorkspaceExplorerNoteMenuProps {
  note: { doc: Document; x: number; y: number };
  onClose: () => void;
  onAddToCanvas: (doc: Document) => void;
  onToggleFavoriteDocument: (doc: Document) => void;
  onRevealDocument: (doc: Document) => void;
  onRename: (doc: Document) => void;
  onDeleteDocument: (doc: Document) => void;
  isTauri: boolean;
}

export default function WorkspaceExplorerNoteMenu({
  note,
  onClose,
  onAddToCanvas,
  onToggleFavoriteDocument,
  onRevealDocument,
  onRename,
  onDeleteDocument,
  isTauri,
}: WorkspaceExplorerNoteMenuProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleWindowClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target) || exportMenuRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, [onClose]);

  useEffect(() => {
    if (note) return;
    setExportOpen(false);
  }, [note]);

  const MENU_W = 160;
  const left = Math.min(note.x, window.innerWidth - MENU_W - 8);
  const top = Math.min(note.y, window.innerHeight - 64);
  const exportMenuLeft = Math.min(left + MENU_W - 8, window.innerWidth - 172 - 8);
  const exportMenuTop = Math.min(top + 48, window.innerHeight - 110);

  const closeMenu = () => {
    setExportOpen(false);
    onClose();
  };

  return (
    <>
      <div
        ref={menuRef}
        style={{ position: 'fixed', left, top, zIndex: 9100, minWidth: MENU_W }}
        className="py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {!isCanvasDocument(note.doc) && (
          <>
            <button
              className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
              style={{ fontFamily: FONTS.ui }}
              onClick={() => {
                onAddToCanvas(note.doc);
                closeMenu();
              }}
            >
              <span>Add to canvas</span>
            </button>
            <div style={{ height: 1, background: 'var(--c-border)', margin: '3px 0' }} />
            <button
              className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
              style={{ fontFamily: FONTS.ui }}
              onClick={() => {
                exportDocumentAsMarkdownFile(note.doc);
                closeMenu();
              }}
            >
              <span>Export .md</span>
            </button>
            <button
              className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
              style={{ fontFamily: FONTS.ui }}
              onMouseEnter={() => setExportOpen(true)}
              onClick={() => setExportOpen((current) => !current)}
            >
              <span>Export as</span>
              <span className="text-[10px] ml-3 text-[var(--c-text-off)]">›</span>
            </button>
            <div style={{ height: 1, background: 'var(--c-border)', margin: '3px 0' }} />
          </>
        )}
        <button
          className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
          style={{ fontFamily: FONTS.ui }}
          onClick={() => {
            onToggleFavoriteDocument(note.doc);
            closeMenu();
          }}
        >
          <span>{note.doc.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}</span>
          <span className="text-[10px] ml-3" style={{ color: note.doc.isFavorite ? '#d6a045' : 'var(--c-text-off)' }}>★</span>
        </button>
        <div style={{ height: 1, background: 'var(--c-border)', margin: '3px 0' }} />
        {isTauri && (
          <button
            className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
            style={{ fontFamily: FONTS.ui }}
            onClick={() => {
              onRevealDocument(note.doc);
              closeMenu();
            }}
          >
            <span>Show in Folder</span>
          </button>
        )}
        <button
          className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
          style={{ fontFamily: FONTS.ui }}
          onClick={() => {
            onRename(note.doc);
            closeMenu();
          }}
        >
          <span>Rename</span>
        </button>
        <div style={{ height: 1, background: 'var(--c-border)', margin: '3px 0' }} />
        <button
          className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left hover:bg-[rgba(239,68,68,0.12)]"
          style={{ fontFamily: FONTS.ui, color: '#f87171' }}
          onClick={() => {
            onDeleteDocument(note.doc);
            closeMenu();
          }}
        >
          <span>Delete</span>
          <span className="text-[10px] ml-3" style={{ color: '#f87171', opacity: 0.6 }}>⌫</span>
        </button>
      </div>

      {exportOpen && (
        <div
          ref={exportMenuRef}
          style={{ position: 'fixed', left: exportMenuLeft, top: exportMenuTop, zIndex: 9101, minWidth: 172 }}
          className="py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseLeave={() => setExportOpen(false)}
        >
          <button
            className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
            style={{ fontFamily: FONTS.ui }}
            onClick={() => {
              exportDocumentAsPdf(note.doc);
              closeMenu();
            }}
          >
            <span>PDF…</span>
          </button>
          <button
            className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
            style={{ fontFamily: FONTS.ui }}
            onClick={() => {
              exportDocumentAsTextFile(note.doc);
              closeMenu();
            }}
          >
            <span>Plain text (.txt)</span>
          </button>
        </div>
      )}
    </>
  );
}

