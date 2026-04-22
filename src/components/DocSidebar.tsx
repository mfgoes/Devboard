import { useState, useMemo } from 'react';
import { useBoardStore } from '../store/boardStore';
import { Document } from '../types';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function DocSidebar() {
  const { documents, activeDocId, recentDocIds, openDocument, closeDocument, addDocument, addNode, camera } =
    useBoardStore();
  const [query, setQuery] = useState('');

  const sorted = useMemo(
    () =>
      [...documents].sort((a, b) => {
        if (a.orderIndex != null && b.orderIndex != null) return a.orderIndex - b.orderIndex;
        if (a.orderIndex != null) return -1;
        if (b.orderIndex != null) return 1;
        return b.updatedAt - a.updatedAt;
      }),
    [documents],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return sorted;
    const q = query.toLowerCase();
    return sorted.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        stripHtml(d.content).toLowerCase().includes(q),
    );
  }, [sorted, query]);

  const recents = useMemo(
    () =>
      recentDocIds
        .map((id) => documents.find((d) => d.id === id))
        .filter((d): d is Document => !!d && d.id !== activeDocId)
        .slice(0, 5),
    [recentDocIds, documents, activeDocId],
  );

  const handleNew = () => {
    const id = addDocument({ title: 'Untitled', content: '' });
    openDocument(id);
  };

  const handlePlaceOnCanvas = () => {
    if (!activeDocId) return;
    const cx = (window.innerWidth / 2 - camera.x) / camera.scale;
    const cy = (window.innerHeight / 2 - camera.y) / camera.scale;
    const nodeId = Math.random().toString(36).slice(2, 11);
    addNode({
      id: nodeId,
      type: 'document',
      x: cx - 140,
      y: cy - 88,
      width: 280,
      height: 176,
      docId: activeDocId,
    } as import('../types').DocumentNode);
    closeDocument();
  };

  const itemStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    background: active ? 'rgba(184,119,80,0.18)' : 'transparent',
    border: active ? '1px solid rgba(184,119,80,0.35)' : '1px solid transparent',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    transition: 'background 0.12s',
  });

  return (
    <div
      style={{
        width: 240,
        flexShrink: 0,
        background: 'rgba(255,255,255,0.025)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Back button */}
      <div style={{ padding: '16px 12px 8px', flexShrink: 0 }}>
        <button
          onClick={closeDocument}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 10px',
            width: '100%',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 7,
            color: 'var(--c-text-md)',
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'inherit',
            fontWeight: 500,
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
            e.currentTarget.style.color = 'var(--c-text-hi)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            e.currentTarget.style.color = 'var(--c-text-md)';
          }}
        >
          ← Back to Canvas
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '4px 12px 8px', flexShrink: 0 }}>
        <input
          type="text"
          placeholder="Search notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '6px 10px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            color: 'var(--c-text-hi)',
            fontSize: 12,
            fontFamily: 'inherit',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* New note button */}
      <div style={{ padding: '0 12px 10px', flexShrink: 0 }}>
        <button
          onClick={handleNew}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            padding: '6px 10px',
            width: '100%',
            background: 'rgba(184,119,80,0.18)',
            border: '1px solid rgba(184,119,80,0.35)',
            borderRadius: 6,
            color: 'var(--c-line)',
            cursor: 'pointer',
            fontSize: 11.5,
            fontFamily: 'inherit',
            fontWeight: 600,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(184,119,80,0.28)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(184,119,80,0.18)'; }}
        >
          + New Note
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
        {/* Recent */}
        {recents.length > 0 && !query.trim() && (
          <section style={{ marginBottom: 12 }}>
            <div style={{ padding: '4px 4px 4px 8px', fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', color: 'var(--c-text-lo)', textTransform: 'uppercase' }}>
              Recent
            </div>
            {recents.map((d) => (
              <div
                key={d.id}
                onClick={() => openDocument(d.id)}
                style={itemStyle(false)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 12, color: 'var(--c-text-md)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {d.title || 'Untitled'}
                </span>
              </div>
            ))}
          </section>
        )}

        {/* All / filtered */}
        <section>
          <div style={{ padding: '4px 4px 4px 8px', fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', color: 'var(--c-text-lo)', textTransform: 'uppercase' }}>
            {query.trim() ? `Results (${filtered.length})` : `Notes (${documents.length})`}
          </div>
          {filtered.length === 0 && (
            <div style={{ padding: '10px 8px', fontSize: 12, color: 'var(--c-text-lo)', fontStyle: 'italic' }}>
              No notes found.
            </div>
          )}
          {filtered.map((d) => {
            const isActive = d.id === activeDocId;
            return (
              <div
                key={d.id}
                onClick={() => openDocument(d.id)}
                style={itemStyle(isActive)}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                }}
              >
                <span style={{
                  fontSize: 12.5,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--c-text-hi)' : 'var(--c-text-md)',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}>
                  {d.title || 'Untitled'}
                </span>
                <span style={{
                  fontSize: 10.5,
                  color: 'var(--c-text-lo)',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}>
                  {stripHtml(d.content).slice(0, 60) || 'Empty…'}
                </span>
              </div>
            );
          })}
        </section>
      </div>

      {/* Place on canvas */}
      {activeDocId && (
        <div style={{ padding: '8px 12px 12px', flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={handlePlaceOnCanvas}
            title="Add a card on the canvas referencing this note"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              padding: '6px 10px',
              width: '100%',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              color: 'var(--c-text-lo)',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'inherit',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
              e.currentTarget.style.color = 'var(--c-text-hi)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              e.currentTarget.style.color = 'var(--c-text-lo)';
            }}
          >
            Place on canvas
          </button>
        </div>
      )}
    </div>
  );
}
