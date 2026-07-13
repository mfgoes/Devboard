import React, { useEffect, useRef } from 'react';
import { type Document, type PageMeta } from '../../types';
import { FONTS } from '../../utils/fonts';
import { isCanvasDocument, relativeTime } from './workspaceExplorerUtils';
import { IconCanvasDoc, IconDoc } from '../icons';

interface WorkspaceExplorerDocumentRowProps {
  page: PageMeta;
  doc: Document;
  activePageId: string;
  activeDocId: string | null;
  focusedDocId: string | null;
  renamingDocId: string | null;
  renameDraft: string;
  draggedDocId: string | null;
  dropTargetDocId: string | null;
  hoveredDocId: string | null;
  onSetHoveredDocId: React.Dispatch<React.SetStateAction<string | null>>;
  onFocusDocument: (pageId: string, docId: string) => void;
  onOpenDocument: (doc: Document) => void;
  onRenameDraftChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onContextMenu: (doc: Document, x: number, y: number) => void;
  onNoteHover: (page: PageMeta, doc: Document, clientY: number) => void;
  onNoteLeave: () => void;
  onDragStart: (doc: Document, e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (doc: Document, e: React.DragEvent) => void;
  onDragLeave: (doc: Document, e: React.DragEvent) => void;
  onDrop: (targetDocId: string) => void;
  onEnsureCustomSort: () => void;
}

export default function WorkspaceExplorerDocumentRow({
  page,
  doc,
  activePageId,
  activeDocId,
  focusedDocId,
  renamingDocId,
  renameDraft,
  draggedDocId,
  dropTargetDocId,
  hoveredDocId,
  onSetHoveredDocId,
  onFocusDocument,
  onOpenDocument,
  onRenameDraftChange,
  onRenameCommit,
  onRenameCancel,
  onContextMenu,
  onNoteHover,
  onNoteLeave,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onEnsureCustomSort,
}: WorkspaceExplorerDocumentRowProps) {
  const isCanvasDoc = doc.docType === 'canvas';
  const isSelected = isCanvasDoc ? doc.canvasPageId === activePageId : doc.id === activeDocId;
  const isFocused = doc.id === focusedDocId;
  const isRenaming = doc.id === renamingDocId;
  const isDragged = doc.id === draggedDocId;
  const isDropTarget = doc.id === dropTargetDocId && draggedDocId !== doc.id;
  const isHovered = hoveredDocId === doc.id;
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }, []);

  return (
    <button
      key={doc.id}
      onClick={() => {
        if (isRenaming) return;
        onFocusDocument(page.id, doc.id);
        onOpenDocument(doc);
      }}
      onFocus={() => onFocusDocument(page.id, doc.id)}
      onMouseEnter={(e) => {
        onSetHoveredDocId(doc.id);
        onFocusDocument(page.id, doc.id);
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = setTimeout(() => onNoteHover(page, doc, e.clientY), 380);
      }}
      onMouseLeave={() => {
        onSetHoveredDocId((current) => (current === doc.id ? null : current));
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        onNoteLeave();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onFocusDocument(page.id, doc.id);
        onContextMenu(doc, e.clientX, e.clientY);
      }}
      style={{
        width: '100%',
        minHeight: 24,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 42px',
        alignItems: 'center',
        columnGap: 6,
        marginTop: 0,
        padding: '2px 6px',
        background: isDragged
          ? 'var(--c-sidebar-item-hover)'
          : (isFocused || isSelected)
            ? 'var(--c-sidebar-item-active)'
            : isHovered
              ? 'var(--c-sidebar-item-hover)'
              : 'none',
        border: 'none',
        borderLeft: (isFocused || isSelected) ? '2px solid var(--c-line)' : '2px solid transparent',
        outline: isDropTarget
          ? '1px solid rgba(184,119,80,0.48)'
          : 'none',
        outlineOffset: -1,
        borderRadius: 5,
        cursor: isRenaming ? 'text' : 'pointer',
        textAlign: 'left',
        boxShadow: isDropTarget ? 'inset 0 2px 0 rgba(184,119,80,0.55)' : 'none',
        opacity: isDragged ? 0.72 : 1,
      }}
      data-focused={isFocused ? 'true' : undefined}
      title={doc.title || (isCanvasDoc ? 'Untitled canvas' : 'Untitled note')}
      className="hover:bg-[var(--c-sidebar-item-hover)]"
      draggable={!isRenaming}
      onDragStart={(e) => {
        if (isRenaming) {
          e.preventDefault();
          return;
        }
        onDragStart(doc, e);
        onEnsureCustomSort();

        const ghost = document.createElement('div');
        ghost.style.cssText = [
          'position:fixed',
          'top:-999px',
          'left:-999px',
          'min-width:180px',
          'max-width:280px',
          'padding:8px 10px',
          'background:#f5ede3',
          'border:1px solid rgba(184,119,80,0.35)',
          'border-radius:10px',
          'box-shadow:0 10px 28px rgba(74,53,37,0.18)',
          'color:#2c241f',
          `font:600 12px/1.2 ${FONTS.ui}`,
          'pointer-events:none',
          'white-space:nowrap',
        ].join(';');

        const textWrap = document.createElement('div');
        textWrap.style.cssText = 'display:flex;flex-direction:column;min-width:0;';

        const title = document.createElement('span');
        title.textContent = doc.title || (isCanvasDoc ? 'Untitled canvas' : 'Untitled note');
        title.style.cssText = 'overflow:hidden;text-overflow:ellipsis;';
        textWrap.appendChild(title);

        const subtitle = document.createElement('span');
        subtitle.textContent = page.name;
        subtitle.style.cssText = 'font-size:10px;font-weight:500;color:#8a755f;margin-top:2px;';
        textWrap.appendChild(subtitle);

        ghost.appendChild(textWrap);
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 18, 14);
        requestAnimationFrame(() => ghost.remove());
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (!draggedDocId || draggedDocId === doc.id) return;
        onDragOver(doc, e);
      }}
      onDragLeave={(e) => {
        const related = e.relatedTarget as Node | null;
        if (related && e.currentTarget.contains(related)) return;
        onDragLeave(doc, e);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(doc.id);
      }}
    >
      {isRenaming ? (
        <input
          autoFocus
          value={renameDraft}
          onChange={(e) => onRenameDraftChange(e.target.value)}
          onBlur={onRenameCommit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onRenameCommit();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              onRenameCancel();
            }
            e.stopPropagation();
          }}
          style={{
            minWidth: 0,
            height: 18,
            padding: '0 6px',
            background: 'var(--c-canvas)',
            border: '1px solid rgba(184,119,80,0.28)',
            borderRadius: 5,
            outline: 'none',
            fontFamily: FONTS.ui,
            fontSize: 9.75,
            color: 'var(--c-text-hi)',
          }}
        />
      ) : (
        <span style={{
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontFamily: FONTS.ui,
          fontSize: 9.75,
          fontWeight: isSelected ? 620 : 520,
          color: (isFocused || isSelected || isHovered) ? 'var(--c-sidebar-item-active-text)' : 'var(--c-sidebar-item-text)',
          overflow: 'hidden',
        }}>
          <span
            aria-hidden="true"
            style={{
              width: 13,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isCanvasDoc ? 'var(--c-line)' : 'var(--c-sidebar-item-text)',
              flexShrink: 0,
              fontSize: 11,
              lineHeight: 1,
            }}
          >
            {isCanvasDoc ? <IconCanvasDoc size={12} /> : (doc.emoji || <IconDoc />)}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {doc.title || (isCanvasDoc ? 'Untitled canvas' : 'Untitled note')}
          </span>
        </span>
      )}
      <span style={{ fontFamily: FONTS.ui, fontSize: 8.25, color: 'var(--c-sidebar-meta)', minWidth: 0, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {relativeTime(doc.updatedAt)}
      </span>
    </button>
  );
}
