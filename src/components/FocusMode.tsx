import { useRef, useEffect, useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { DocumentNode } from '../types';
import DocFormattingBar from './DocFormattingBar';
import { htmlToMarkdown, markdownToHtml } from '../utils/exportMarkdown';
import { IconCode, IconEye } from './icons';

export default function FocusMode() {
  const { nodes, focusDocumentId, setFocusDocument, updateNode, saveHistory } = useBoardStore();
  const contentRef = useRef<HTMLDivElement>(null);
  const [, forceUpdate] = useState(0);
  const [viewMode, setViewMode] = useState<'edit' | 'source'>('edit');
  const [sourceText, setSourceText] = useState('');

  const editingNode = nodes.find(n => n.id === focusDocumentId) as DocumentNode | undefined;

  // Initialize contentEditable on mount/change
  useEffect(() => {
    if (!editingNode || !contentRef.current) return;
    contentRef.current.innerHTML = editingNode.content ?? '';
    contentRef.current.focus();
  }, [editingNode?.id]);

  // Re-render on selection change so formatting button states stay accurate
  useEffect(() => {
    const onSelChange = () => forceUpdate(n => n + 1);
    document.addEventListener('selectionchange', onSelChange);
    return () => document.removeEventListener('selectionchange', onSelChange);
  }, []);

  // Global keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setFocusDocument(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setFocusDocument]);

  if (!editingNode) return null;

  const switchToSource = () => {
    setSourceText(htmlToMarkdown(editingNode.content ?? ''));
    setViewMode('source');
  };

  const switchToEdit = () => {
    const html = markdownToHtml(sourceText);
    updateNode(editingNode.id, { content: html });
    setViewMode('edit');
    requestAnimationFrame(() => {
      if (contentRef.current) contentRef.current.innerHTML = html;
    });
  };

  const handleContentInput = () => {
    if (contentRef.current) {
      updateNode(editingNode.id, { content: contentRef.current.innerHTML });
    }
  };

  const handleContentFocus = () => {
    saveHistory();
  };

  // Prev/Next navigation
  const docs = nodes
    .filter(n => n.type === 'document')
    .sort((a, b) => {
      const aO = (a as DocumentNode).orderIndex;
      const bO = (b as DocumentNode).orderIndex;
      if (aO != null && bO != null) return aO - bO;
      if (aO != null) return -1;
      if (bO != null) return 1;
      return 0;
    }) as DocumentNode[];

  const currentIndex = docs.findIndex(d => d.id === focusDocumentId);
  const prevDoc = currentIndex > 0 ? docs[currentIndex - 1] : null;
  const nextDoc = currentIndex < docs.length - 1 ? docs[currentIndex + 1] : null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setFocusDocument(null);
  };

  const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 640;

  return (
    <div
      onClick={handleBackdropClick}
      className={isMobileViewport ? undefined : 'sm:p-5'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobileViewport ? 0 : '20px',
      }}
    >
      {/* Focus mode card */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '800px',
          width: '100%',
          height: isMobileViewport ? '100dvh' : '90vh',
          maxHeight: isMobileViewport ? 'none' : '900px',
          background: 'var(--c-panel)',
          borderRadius: isMobileViewport ? 0 : '16px',
          border: isMobileViewport ? 'none' : '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: isMobileViewport ? '12px 16px' : '24px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            flexShrink: 0,
          }}
        >
          <input
            type="text"
            value={editingNode.title ?? ''}
            onChange={(e) => updateNode(editingNode.id, { title: e.target.value })}
            placeholder="Untitled note"
            style={{
              flex: 1,
              fontSize: isMobileViewport ? '18px' : '24px',
              fontWeight: 600,
              color: 'var(--c-text-hi)',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={() => setFocusDocument(null)}
            title="Close (Esc)"
            style={{
              width: '40px',
              height: '40px',
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '8px',
              color: 'var(--c-text-lo)',
              cursor: 'pointer',
              fontSize: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s, color 0.2s',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
              e.currentTarget.style.color = 'var(--c-text-hi)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
              e.currentTarget.style.color = 'var(--c-text-lo)';
            }}
          >
            ✕
          </button>
        </div>

        {/* Toolbar row: formatting bar + Edit/Source toggle */}
        <div
          className="flex items-center"
          style={{
            overflowX: 'hidden',
            padding: '4px 8px 4px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.02)',
            flexShrink: 0,
            gap: 8,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {viewMode === 'edit' && <DocFormattingBar nodeId={editingNode.id} />}
          <div style={{ flex: 1 }} />
          {/* Edit / Source toggle */}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 7, padding: 2, flexShrink: 0 }}>
            <button
              title="Rich text editor"
              onClick={() => viewMode === 'source' ? switchToEdit() : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
                fontSize: 11, fontFamily: 'inherit', fontWeight: 500,
                background: viewMode === 'edit' ? 'var(--c-panel)' : 'transparent',
                color: viewMode === 'edit' ? 'var(--c-text-hi)' : 'var(--c-text-lo)',
                boxShadow: viewMode === 'edit' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              <IconEye /> Preview
            </button>
            <button
              title="Markdown source"
              onClick={() => viewMode === 'edit' ? switchToSource() : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
                fontSize: 11, fontFamily: 'inherit', fontWeight: 500,
                background: viewMode === 'source' ? 'var(--c-panel)' : 'transparent',
                color: viewMode === 'source' ? 'var(--c-text-hi)' : 'var(--c-text-lo)',
                boxShadow: viewMode === 'source' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              <IconCode /> Source
            </button>
          </div>
        </div>

        {/* Content — Edit mode */}
        {viewMode === 'edit' && (
          <div
            ref={contentRef}
            contentEditable
            suppressContentEditableWarning
            className="doc-content"
            onInput={handleContentInput}
            onFocus={handleContentFocus}
            style={{
              flex: 1,
              padding: '32px',
              overflowY: 'auto',
              color: 'var(--c-text-hi)',
              fontSize: '16px',
              lineHeight: 1.8,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              outline: 'none',
              wordWrap: 'break-word',
            }}
          />
        )}

        {/* Content — Source mode */}
        {viewMode === 'source' && (
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1,
              padding: '32px',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              color: 'var(--c-text-hi)',
              fontSize: '14px',
              lineHeight: 1.7,
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
              overflowY: 'auto',
              opacity: 0.85,
            }}
          />
        )}

        {/* Footer navigation */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <button
            onClick={() => prevDoc && setFocusDocument(prevDoc.id)}
            disabled={!prevDoc}
            title={prevDoc ? `Previous: ${prevDoc.title || 'Untitled'}` : undefined}
            style={{
              padding: '8px 16px',
              background: prevDoc ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
              border: prevDoc ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              color: prevDoc ? 'var(--c-text-hi)' : 'var(--c-text-lo)',
              cursor: prevDoc ? 'pointer' : 'not-allowed',
              fontSize: '13px',
              fontWeight: 500,
              opacity: prevDoc ? 1 : 0.5,
            }}
          >
            ← Previous
          </button>

          <div style={{ fontSize: '12px', color: 'var(--c-text-lo)' }}>
            {currentIndex + 1} of {docs.length}
          </div>

          <button
            onClick={() => nextDoc && setFocusDocument(nextDoc.id)}
            disabled={!nextDoc}
            title={nextDoc ? `Next: ${nextDoc.title || 'Untitled'}` : undefined}
            style={{
              padding: '8px 16px',
              background: nextDoc ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
              border: nextDoc ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              color: nextDoc ? 'var(--c-text-hi)' : 'var(--c-text-lo)',
              cursor: nextDoc ? 'pointer' : 'not-allowed',
              fontSize: '13px',
              fontWeight: 500,
              opacity: nextDoc ? 1 : 0.5,
            }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
