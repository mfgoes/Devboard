import { useCallback, useEffect, useRef, useState } from 'react';
import { type Document, type PageMeta } from '../../types';
import { FONTS } from '../../utils/fonts';
import { IS_TAURI } from '../../utils/workspaceManager';
import WorkspaceExplorerPageHeader from './WorkspaceExplorerPageHeader';
import WorkspaceExplorerDocumentRow from './WorkspaceExplorerDocumentRow';
import WorkspaceExplorerNoteMenu from './WorkspaceExplorerNoteMenu';

export interface WorkspaceExplorerPageGroupProps {
  page: PageMeta;
  docs: Document[];
  coarsePointer: boolean;
  isActive: boolean;
  activePageId: string;
  isCollapsed: boolean;
  activeDocId: string | null;
  onRenameDocument: (docId: string, title: string) => void;
  onToggleFavoriteDocument: (doc: Document) => void;
  onReorderDocuments: (docIds: string[]) => void;
  onDeleteDocument: (doc: Document) => void;
  onRevealDocument: (doc: Document) => void;
  onRenamePage: (pageId: string, name: string) => void;
  onDeletePage: (page: PageMeta) => void;
  onRevealPage: (page: PageMeta) => void;
  onChangeSortMode: (page: PageMeta, sort: 'updated' | 'custom') => void;
  onEnsureCustomSort: (page: PageMeta) => void;
  onToggleCollapsed: () => void;
  onOpenPageOverview: () => void;
  onCreateFolder: () => void;
  onCreateNote: () => void;
  onCreateCanvas: () => void;
  onOpenDocument: (doc: Document) => void;
  onAddToCanvas: (doc: Document) => void;
  pageFocused: boolean;
  focusedDocId: string | null;
  onFocusPage: (pageId: string) => void;
  onFocusDocument: (pageId: string, docId: string) => void;
  onPageHover: (page: PageMeta, clientY: number) => void;
  onPageLeave: () => void;
  onNoteHover: (page: PageMeta, doc: Document, clientY: number) => void;
  onNoteLeave: () => void;
}

export default function WorkspaceExplorerPageGroup({
  page,
  docs,
  coarsePointer,
  isActive,
  activePageId,
  isCollapsed,
  activeDocId,
  onRenameDocument,
  onToggleFavoriteDocument,
  onReorderDocuments,
  onDeleteDocument,
  onRevealDocument,
  onRenamePage,
  onDeletePage,
  onRevealPage,
  onChangeSortMode,
  onEnsureCustomSort,
  onToggleCollapsed,
  onOpenPageOverview,
  onCreateFolder,
  onCreateNote,
  onCreateCanvas,
  onOpenDocument,
  onAddToCanvas,
  pageFocused,
  focusedDocId,
  onFocusPage,
  onFocusDocument,
  onPageHover,
  onPageLeave,
  onNoteHover,
  onNoteLeave,
}: WorkspaceExplorerPageGroupProps) {
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [draggedDocId, setDraggedDocId] = useState<string | null>(null);
  const [dropTargetDocId, setDropTargetDocId] = useState<string | null>(null);
  const [noteMenu, setNoteMenu] = useState<{ doc: Document; x: number; y: number } | null>(null);
  const [hoveredDocId, setHoveredDocId] = useState<string | null>(null);
  const noteHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginRename = useCallback((doc: Document) => {
    setRenamingDocId(doc.id);
    setRenameDraft(doc.title || 'Untitled note');
  }, []);

  const commitRename = useCallback(() => {
    if (!renamingDocId) return;
    const nextTitle = renameDraft.trim() || 'Untitled note';
    onRenameDocument(renamingDocId, nextTitle);
    setRenamingDocId(null);
  }, [onRenameDocument, renameDraft, renamingDocId]);

  const cancelRename = useCallback(() => {
    setRenamingDocId(null);
    setRenameDraft('');
  }, []);

  const handleDropOnDoc = useCallback((targetDocId: string) => {
    if (!draggedDocId || draggedDocId === targetDocId) return;
    const ids = docs.map((doc) => doc.id);
    const from = ids.indexOf(draggedDocId);
    const to = ids.indexOf(targetDocId);
    if (from === -1 || to === -1) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorderDocuments(next);
    setDraggedDocId(null);
    setDropTargetDocId(null);
  }, [docs, draggedDocId, onReorderDocuments]);

  useEffect(() => () => {
    if (noteHoverTimerRef.current) clearTimeout(noteHoverTimerRef.current);
  }, []);

  return (
    <div style={{ marginBottom: 2 }}>
      <WorkspaceExplorerPageHeader
        page={page}
        docCount={docs.length}
        isActive={isActive}
        isCollapsed={isCollapsed}
        coarsePointer={coarsePointer}
        pageFocused={pageFocused}
        onToggleCollapsed={onToggleCollapsed}
        onOpenPageOverview={onOpenPageOverview}
        onRenamePage={onRenamePage}
        onDeletePage={onDeletePage}
        onRevealPage={onRevealPage}
        onChangeSortMode={onChangeSortMode}
        onCreateFolder={onCreateFolder}
        onCreateNote={onCreateNote}
        onCreateCanvas={onCreateCanvas}
        onFocusPage={onFocusPage}
        onPageHover={onPageHover}
        onPageLeave={onPageLeave}
      />

      {!isCollapsed && (
        <div
          style={{
            marginTop: 1,
            marginLeft: 13,
            paddingLeft: 6,
            borderLeft: '1px solid rgba(184,119,80,0.18)',
            maxHeight: 'none',
            opacity: 1,
            overflow: 'visible',
            transform: 'translateY(0)',
            transition: 'max-height 0.18s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.14s ease, transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), margin-top 0.18s ease',
          }}
        >
          {docs.length === 0 ? (
            <div style={{ padding: '3px 6px 2px', fontSize: 9, color: 'var(--c-text-lo)', fontFamily: FONTS.ui, fontStyle: 'italic' }}>
              No documents in this folder
            </div>
          ) : (
            docs.map((doc) => (
              <WorkspaceExplorerDocumentRow
                key={doc.id}
                page={page}
                doc={doc}
                activePageId={activePageId}
                activeDocId={activeDocId}
                focusedDocId={focusedDocId}
                renamingDocId={renamingDocId}
                renameDraft={renameDraft}
                draggedDocId={draggedDocId}
                dropTargetDocId={dropTargetDocId}
                hoveredDocId={hoveredDocId}
                onSetHoveredDocId={setHoveredDocId}
                onFocusDocument={onFocusDocument}
                onOpenDocument={onOpenDocument}
                onRenameDraftChange={setRenameDraft}
                onRenameCommit={commitRename}
                onRenameCancel={cancelRename}
                onContextMenu={(doc, x, y) => setNoteMenu({ doc, x, y })}
                onNoteHover={onNoteHover}
                onNoteLeave={onNoteLeave}
                onDragStart={(doc, e) => {
                  if (doc.docType !== 'canvas') {
                    e.dataTransfer.setData('application/x-devboard-doc', doc.id);
                  }
                  e.dataTransfer.effectAllowed = doc.docType === 'canvas' ? 'move' : 'copyMove';
                  e.dataTransfer.setData('text/plain', doc.id);
                  setDraggedDocId(doc.id);
                }}
                onDragEnd={() => {
                  setDraggedDocId(null);
                  setDropTargetDocId(null);
                }}
                onDragOver={(doc, e) => {
                  if (!draggedDocId || draggedDocId === doc.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dropTargetDocId !== doc.id) setDropTargetDocId(doc.id);
                }}
                onDragLeave={(doc, e) => {
                  const related = e.relatedTarget as Node | null;
                  if (related && e.currentTarget.contains(related)) return;
                  if (dropTargetDocId === doc.id) setDropTargetDocId(null);
                }}
                onDrop={(targetDocId) => {
                  handleDropOnDoc(targetDocId);
                }}
                onEnsureCustomSort={() => onEnsureCustomSort(page)}
              />
            ))
          )}
        </div>
      )}
      {noteMenu && (
        <WorkspaceExplorerNoteMenu
          note={noteMenu}
          onClose={() => setNoteMenu(null)}
          onAddToCanvas={onAddToCanvas}
          onToggleFavoriteDocument={onToggleFavoriteDocument}
          onRevealDocument={onRevealDocument}
          onRename={beginRename}
          onDeleteDocument={onDeleteDocument}
          isTauri={IS_TAURI}
        />
      )}
    </div>
  );
}
