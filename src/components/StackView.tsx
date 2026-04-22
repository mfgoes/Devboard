import { useMemo, useRef, useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { Document } from '../types';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatDate(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ms).toLocaleDateString();
}

interface StackCardProps {
  doc: Document;
  onOpen: (rect: DOMRect) => void;
}

function StackCard({ doc, onOpen }: StackCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const preview = useMemo(() => stripHtml(doc.content).slice(0, 300), [doc.content]);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      ref={cardRef}
      onClick={() => {
        const rect = cardRef.current?.getBoundingClientRect();
        if (rect) onOpen(rect);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '14px 18px',
        marginBottom: 8,
        background: hovered ? 'var(--c-hover)' : 'var(--c-panel)',
        border: `1px solid ${hovered ? 'rgba(184,119,80,0.3)' : 'var(--c-border)'}`,
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'background 140ms, border-color 140ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {doc.emoji ? (
          <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{doc.emoji}</span>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, color: 'var(--c-line)', opacity: 0.7 }}>
            <rect x="1" y="1" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M3.5 4h5M3.5 6h5M3.5 8h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          </svg>
        )}
        <span style={{
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: '-0.005em',
          color: 'var(--c-text-hi)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {doc.title || 'Untitled'}
        </span>
      </div>

      {preview && (
        <div style={{
          fontSize: 13,
          color: 'var(--c-text-md)',
          lineHeight: 1.5,
          maxHeight: '2.9em',
          overflow: 'hidden',
        }}>
          {preview}
        </div>
      )}

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 10.5,
        color: 'var(--c-text-lo)',
        fontFamily: 'monospace',
        marginTop: 2,
      }}>
        <span>{formatDate(doc.updatedAt)}</span>
        {doc.tags?.map((t) => (
          <span key={t} style={{
            fontFamily: 'var(--font-sans, sans-serif)',
            padding: '1px 7px',
            borderRadius: 10,
            background: 'rgba(184,119,80,0.1)',
            color: 'var(--c-line)',
            fontSize: 10,
            fontWeight: 600,
          }}>#{t}</span>
        ))}
      </div>
    </div>
  );
}

interface Props {
  pageId: string;
  pageName: string;
}

export default function StackView({ pageId, pageName }: Props) {
  const documents = useBoardStore((s) => s.documents);
  const addDocument = useBoardStore((s) => s.addDocument);
  const openDocumentWithMorph = useBoardStore((s) => s.openDocumentWithMorph);
  const [sort, setSort] = useState<'recent' | 'az' | 'tag'>('recent');
  const newBtnRef = useRef<HTMLDivElement>(null);

  const pageDocs = useMemo(() => {
    const filtered = documents.filter((d) => d.pageId === pageId);
    if (sort === 'az') return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'tag') return [...filtered].sort((a, b) => ((a.tags?.[0] ?? 'z').localeCompare(b.tags?.[0] ?? 'z')));
    return [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [documents, pageId, sort]);

  const handleOpen = (docId: string, rect: DOMRect) => {
    openDocumentWithMorph(docId, { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  };

  const handleNewDoc = () => {
    const id = addDocument({ title: '', content: '', pageId });
    const rect = newBtnRef.current?.getBoundingClientRect();
    openDocumentWithMorph(id, rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined);
  };

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      overflowY: 'auto',
      overflowX: 'hidden',
      background: 'var(--c-canvas)',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 32px 120px', fontFamily: 'inherit' }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', margin: 0, color: 'var(--c-text-hi)' }}>
            {pageName}
          </h1>
          <span style={{ fontSize: 11, color: 'var(--c-text-lo)', fontFamily: 'monospace' }}>
            {pageDocs.length} {pageDocs.length === 1 ? 'note' : 'notes'}
          </span>
        </div>

        {/* Sort controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 11, color: 'var(--c-text-md)' }}>
          <span>Sort</span>
          <div style={{ display: 'inline-flex', padding: 2, background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 6 }}>
            {(['recent', 'az', 'tag'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                style={{
                  padding: '3px 9px',
                  fontSize: 11,
                  fontFamily: 'inherit',
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: sort === s ? 'var(--c-canvas)' : 'transparent',
                  color: sort === s ? 'var(--c-text-hi)' : 'var(--c-text-md)',
                  boxShadow: sort === s ? '0 1px 2px rgba(40,32,26,.08)' : 'none',
                  transition: 'background 100ms',
                }}
              >
                {s === 'recent' ? 'Recent' : s === 'az' ? 'A–Z' : 'Tag'}
              </button>
            ))}
          </div>
        </div>

        {/* New note button */}
        <NewNoteButton ref={newBtnRef} onClick={handleNewDoc} />

        {/* Doc cards */}
        {pageDocs.map((doc) => (
          <StackCard key={doc.id} doc={doc} onOpen={(rect) => handleOpen(doc.id, rect)} />
        ))}

        {pageDocs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--c-text-lo)', fontSize: 13 }}>
            Nothing here yet. Press <strong>⌘N</strong> to start a note.
          </div>
        )}
      </div>
    </div>
  );
}

import { forwardRef } from 'react';

const NewNoteButton = forwardRef<HTMLDivElement, { onClick: () => void }>(({ onClick }, ref) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      ref={ref}
      role="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '11px 14px',
        marginBottom: 12,
        background: hovered ? 'var(--c-hover)' : 'var(--c-panel)',
        border: `1.5px dashed ${hovered ? 'rgba(184,119,80,0.4)' : 'var(--c-border)'}`,
        borderRadius: 10,
        color: hovered ? 'var(--c-text-md)' : 'var(--c-text-lo)',
        fontSize: 13,
        fontFamily: 'inherit',
        cursor: 'text',
        transition: 'background 120ms, border-color 120ms, color 120ms',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span>New note…</span>
      <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 3, fontFamily: 'monospace', fontSize: 10, color: 'var(--c-text-lo)' }}>
        <kbd style={{ padding: '1px 4px', border: '1px solid var(--c-border)', background: 'var(--c-canvas)', borderRadius: 3, fontSize: 9.5, lineHeight: '1.4' }}>⌘</kbd>
        <kbd style={{ padding: '1px 4px', border: '1px solid var(--c-border)', background: 'var(--c-canvas)', borderRadius: 3, fontSize: 9.5, lineHeight: '1.4' }}>N</kbd>
      </span>
    </div>
  );
});
NewNoteButton.displayName = 'NewNoteButton';
