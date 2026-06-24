import type { Document } from '../../types';
import { FONTS } from '../../utils/fonts';
import { NoteShortcutRow, SectionChevron } from './WorkspaceExplorerParts';

interface WorkspaceExplorerFavoritesSectionProps {
  open: boolean;
  activeDocId: string | null;
  favoriteDocs: Document[];
  visibleFavoriteDocs: Document[];
  onToggleOpen: () => void;
  onOpenDocument: (doc: Document) => void;
  onToggleFavoriteDocument: (doc: Document) => void;
  onPreviewDocument: (doc: Document, clientY: number) => void;
  onPreviewEnd: () => void;
}

export default function WorkspaceExplorerFavoritesSection({
  open,
  activeDocId,
  favoriteDocs,
  visibleFavoriteDocs,
  onToggleOpen,
  onOpenDocument,
  onToggleFavoriteDocument,
  onPreviewDocument,
  onPreviewEnd,
}: WorkspaceExplorerFavoritesSectionProps) {
  if (favoriteDocs.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={onToggleOpen}
        className="group"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          minHeight: 22,
          padding: '4px 10px 3px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{ fontFamily: FONTS.ui, fontSize: 9.5, fontWeight: 650, letterSpacing: '0.02em', color: 'var(--c-sidebar-section)' }}>Favorites</span>
        <SectionChevron open={open} />
        <span style={{ marginLeft: 'auto', fontFamily: FONTS.ui, fontSize: 8.5, color: 'var(--c-sidebar-meta)' }}>{favoriteDocs.length}</span>
      </button>
      {open && (
        <div style={{ padding: '0 8px 4px' }}>
          {visibleFavoriteDocs.map((doc) => (
            <NoteShortcutRow
              key={doc.id}
              doc={doc}
              active={doc.id === activeDocId}
              onOpen={onOpenDocument}
              onToggleFavorite={onToggleFavoriteDocument}
              onPreview={onPreviewDocument}
              onPreviewEnd={onPreviewEnd}
            />
          ))}
          {favoriteDocs.length > visibleFavoriteDocs.length && (
            <div style={{ padding: '5px 8px 2px', fontFamily: FONTS.ui, fontSize: 9, color: 'var(--c-sidebar-meta)' }}>
              +{favoriteDocs.length - visibleFavoriteDocs.length} more favorites
            </div>
          )}
        </div>
      )}
    </>
  );
}
