import { useEffect, useRef, useState, useMemo } from 'react';
import { useBoardStore } from '../store/boardStore';
import { IconFreeformPage, IconStackPage } from './icons';

type ResultKind = 'page' | 'doc' | 'node';

interface Result {
  kind: ResultKind;
  id: string;
  label: string;
  sub: string;
  layoutMode?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPickPage: (id: string) => void;
  onPickDoc: (id: string) => void;
  onPickNode: (id: string) => void;
}

export default function QuickSwitcher({ open, onClose, onPickPage, onPickDoc, onPickNode }: Props) {
  const pages = useBoardStore((s) => s.pages);
  const documents = useBoardStore((s) => s.documents);
  const nodes = useBoardStore((s) => s.nodes);
  const activePageId = useBoardStore((s) => s.activePageId);
  const activePage = pages.find((p) => p.id === activePageId);

  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();

    const pageResults: Result[] = pages.map((p) => ({
      kind: 'page',
      id: p.id,
      label: p.name,
      sub: p.layoutMode === 'stack' ? 'Stack' : 'Freeform',
      layoutMode: p.layoutMode ?? 'freeform',
    }));

    const docResults: Result[] = documents.map((d) => {
      const page = pages.find((p) => p.id === d.pageId);
      return {
        kind: 'doc',
        id: d.id,
        label: d.title || 'Untitled',
        sub: page?.name ?? '',
      };
    });

    const nodeResults: Result[] = nodes
      .filter((n) => n.type === 'sticky' && (n as { text?: string }).text)
      .map((n) => ({
        kind: 'node',
        id: n.id,
        label: ((n as { text?: string }).text ?? '').replace(/\n+/g, ' ').slice(0, 80),
        sub: activePage?.name ?? '',
      }));

    const all = [...pageResults, ...docResults, ...nodeResults];
    if (!q) return all.slice(0, 30);
    return all
      .filter((r) => r.label.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q))
      .slice(0, 30);
  }, [query, pages, documents, nodes, activePageId]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  const pick = (r: Result) => {
    if (r.kind === 'page') onPickPage(r.id);
    else if (r.kind === 'doc') onPickDoc(r.id);
    else onPickNode(r.id);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[activeIdx]) pick(results[activeIdx]); }
  };

  if (!open) return null;

  const groups = {
    page: results.map((r, i) => ({ ...r, i })).filter((r) => r.kind === 'page'),
    doc:  results.map((r, i) => ({ ...r, i })).filter((r) => r.kind === 'doc'),
    node: results.map((r, i) => ({ ...r, i })).filter((r) => r.kind === 'node'),
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(40,32,26,.35)', backdropFilter: 'blur(4px)', zIndex: 500, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '14vh' }}
      onClick={onClose}
    >
      <div
        style={{ width: 560, maxWidth: 'calc(100vw - 32px)', background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 12, boxShadow: '0 30px 80px rgba(40,32,26,.35)', display: 'flex', flexDirection: 'column', maxHeight: '60vh', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder="Jump to page, note, or canvas node…"
          style={{ height: 48, padding: '0 16px', border: 0, borderBottom: '1px solid var(--c-border)', background: 'transparent', fontSize: 15, color: 'var(--c-text-hi)', outline: 'none', fontFamily: 'inherit', flexShrink: 0 }}
        />

        {/* Results */}
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
          {results.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--c-text-lo)', fontSize: 12 }}>No matches</div>
          )}

          {groups.page.length > 0 && (
            <>
              <SectionLabel>Pages</SectionLabel>
              {groups.page.map((r) => (
                <QSItem key={r.id} active={r.i === activeIdx} icon={r.layoutMode === 'stack' ? <IconStackPage /> : <IconFreeformPage />} label={r.label} sub={r.sub} onClick={() => pick(r)} onHover={() => setActiveIdx(r.i)} />
              ))}
            </>
          )}

          {groups.doc.length > 0 && (
            <>
              <SectionLabel>Notes</SectionLabel>
              {groups.doc.map((r) => (
                <QSItem key={r.id} active={r.i === activeIdx} icon={<DocIcon />} label={r.label} sub={r.sub} onClick={() => pick(r)} onHover={() => setActiveIdx(r.i)} />
              ))}
            </>
          )}

          {groups.node.length > 0 && (
            <>
              <SectionLabel>Canvas Nodes</SectionLabel>
              {groups.node.map((r) => (
                <QSItem key={r.id} active={r.i === activeIdx} icon={<StickyIcon />} label={r.label} sub={r.sub} onClick={() => pick(r)} onHover={() => setActiveIdx(r.i)} />
              ))}
            </>
          )}
        </div>

        {/* Footer hints */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 14px', borderTop: '1px solid var(--c-border)', fontSize: 10.5, color: 'var(--c-text-lo)', fontFamily: 'monospace', flexShrink: 0 }}>
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span><Kbd>↵</Kbd> open</span>
          <span><Kbd>esc</Kbd> close</span>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-text-lo)', padding: '8px 10px 4px' }}>
      {children}
    </div>
  );
}

function QSItem({ active, icon, label, sub, onClick, onHover }: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
  onHover: () => void;
}) {
  return (
    <div
      onMouseEnter={onHover}
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 7, cursor: 'pointer', background: active ? 'var(--c-hover)' : 'transparent', transition: 'background 80ms' }}
    >
      <span style={{ color: active ? 'var(--c-line)' : 'var(--c-text-lo)', flexShrink: 0 }}>{icon}</span>
      <span style={{ color: 'var(--c-text-hi)', fontWeight: 500, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {sub && <span style={{ color: 'var(--c-text-lo)', fontSize: 11, fontFamily: 'monospace', flexShrink: 0 }}>{sub}</span>}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{ padding: '1px 5px', border: '1px solid var(--c-border)', background: 'var(--c-canvas)', borderRadius: 3, fontSize: 9.5, lineHeight: 1.2 }}>
      {children}
    </kbd>
  );
}

function DocIcon() { return <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="1" width="10" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M4 5h5M4 7h5M4 9h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>; }
function StickyIcon() { return <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="1.5" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M4 5h5M4 7h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>; }
