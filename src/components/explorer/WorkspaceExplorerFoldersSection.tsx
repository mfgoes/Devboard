import type { Document, PageMeta } from '../../types';
import { FONTS } from '../../utils/fonts';
import { SectionChevron } from './WorkspaceExplorerParts';
import WorkspaceExplorerPageGroup from './WorkspaceExplorerPageGroup';

interface WorkspaceExplorerFoldersSectionProps {
  open: boolean;
  folderPages: PageMeta[];
  pages: PageMeta[];
  pagesSectionOpen: boolean;
  activePageId: string;
  activeDocId: string | null;
  collapsedPageIds: Record<string, boolean>;
  pageDocs: Map<string, Document[]>;
  coarsePointer: boolean;
  focusedPageId: string | null;
  focusedDocId: string | null;
  onToggleSection: () => void;
  onAddPage: () => void;
  onRenameDocument: (docId: string, title: string) => void;
  onToggleFavoriteDocument: (doc: Document) => void;
  onReorderDocumentsForPage: (pageId: string, docIds: string[]) => void;
  onDeleteDocument: (doc: Document) => void;
  onRevealDocument: (doc: Document) => void;
  onRenamePage: (pageId: string, name: string) => void;
  onDeletePage: (page: PageMeta) => void;
  onRevealPage: (page: PageMeta) => void;
  onChangeSortMode: (page: PageMeta, sort: 'updated' | 'custom') => void;
  onEnsureCustomSort: (page: PageMeta) => void;
  onToggleCollapsed: (pageId: string) => void;
  onOpenPageOverview: (pageId: string, isActive: boolean) => void;
  onCreateNoteForPage: (pageId: string) => void;
  onCreateCanvasForPage: (pageId: string) => void;
  onOpenDocument: (doc: Document) => void;
  onAddToCanvas: (doc: Document) => void;
  onFocusPage: (pageId: string) => void;
  onFocusDocument: (pageId: string, docId: string) => void;
  onPageHover: (page: PageMeta, clientY: number) => void;
  onPageLeave: () => void;
  onNoteHover: (page: PageMeta, doc: Document, clientY: number) => void;
  onNoteLeave: () => void;
}

export default function WorkspaceExplorerFoldersSection({
  open,
  folderPages,
  pages,
  pagesSectionOpen,
  activePageId,
  activeDocId,
  collapsedPageIds,
  pageDocs,
  coarsePointer,
  focusedPageId,
  focusedDocId,
  onToggleSection,
  onAddPage,
  onRenameDocument,
  onToggleFavoriteDocument,
  onReorderDocumentsForPage,
  onDeleteDocument,
  onRevealDocument,
  onRenamePage,
  onDeletePage,
  onRevealPage,
  onChangeSortMode,
  onEnsureCustomSort,
  onToggleCollapsed,
  onOpenPageOverview,
  onCreateNoteForPage,
  onCreateCanvasForPage,
  onOpenDocument,
  onAddToCanvas,
  onFocusPage,
  onFocusDocument,
  onPageHover,
  onPageLeave,
  onNoteHover,
  onNoteLeave,
}: WorkspaceExplorerFoldersSectionProps) {
  if (!open) return null;

  return (
    <div style={{ flexShrink: 0 }}>
      <div
        onClick={onToggleSection}
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
        <span style={{ fontFamily: FONTS.ui, fontSize: 9.5, fontWeight: 650, letterSpacing: '0.02em', color: 'var(--c-sidebar-section)' }}>Pages</span>
        <SectionChevron open={pagesSectionOpen} />
        <span style={{ marginLeft: 'auto', fontFamily: FONTS.ui, fontSize: 8.5, color: 'var(--c-sidebar-meta)' }}>{folderPages.length}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddPage();
          }}
          title="New folder"
          style={{
            width: 16,
            height: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: 4,
            background: 'transparent',
            border: 'none',
            borderRadius: 4,
            color: 'var(--c-sidebar-item-text)',
            cursor: 'pointer',
            flexShrink: 0,
            fontFamily: FONTS.ui,
            fontSize: 12,
            lineHeight: 1,
            opacity: 0,
            transition: 'opacity 0.12s ease, background 0.12s ease, color 0.12s ease',
          }}
          className="group-hover:opacity-100 focus:opacity-100"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--c-hover)';
            e.currentTarget.style.color = 'var(--c-text-hi)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--c-text-lo)';
          }}
        >
          +
        </button>
      </div>

      {pagesSectionOpen && (
        <div
          style={{
            padding: '0 8px 0',
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            scrollbarWidth: 'thin',
          }}
        >
          {folderPages.map((page) => {
            const activePage = pages.find((entry) => entry.id === activePageId);
            const isActive = page.id === activePageId;
            const shouldExpand = isActive || activePage?.parentPageId === page.id;
            const docsForPage = pageDocs.get(page.id) ?? [];
            const isCollapsed = collapsedPageIds[page.id] ?? !shouldExpand;
            return (
              <WorkspaceExplorerPageGroup
                key={page.id}
                page={page}
                docs={docsForPage}
                coarsePointer={coarsePointer}
                isActive={isActive}
                activePageId={activePageId}
                isCollapsed={isCollapsed}
                activeDocId={activeDocId}
                onRenameDocument={onRenameDocument}
                onToggleFavoriteDocument={onToggleFavoriteDocument}
                onReorderDocuments={(docIds) => onReorderDocumentsForPage(page.id, docIds)}
                onDeleteDocument={onDeleteDocument}
                onRevealDocument={onRevealDocument}
                onRenamePage={onRenamePage}
                onDeletePage={onDeletePage}
                onRevealPage={onRevealPage}
                onChangeSortMode={onChangeSortMode}
                onEnsureCustomSort={onEnsureCustomSort}
                onToggleCollapsed={() => onToggleCollapsed(page.id)}
                onOpenPageOverview={() => onOpenPageOverview(page.id, isActive)}
                onCreateFolder={onAddPage}
                onCreateNote={() => onCreateNoteForPage(page.id)}
                onCreateCanvas={() => onCreateCanvasForPage(page.id)}
                onOpenDocument={onOpenDocument}
                onAddToCanvas={onAddToCanvas}
                pageFocused={focusedPageId === page.id}
                focusedDocId={focusedDocId}
                onFocusPage={onFocusPage}
                onFocusDocument={onFocusDocument}
                onPageHover={onPageHover}
                onPageLeave={onPageLeave}
                onNoteHover={onNoteHover}
                onNoteLeave={onNoteLeave}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
