import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useBoardStore } from '../store/boardStore';
import type { CanvasNode, TableNode, CodeBlockNode, LinkNode, SectionNode } from '../types';

interface SearchMatch {
  nodeId: string;
  pageId: string;
  pageName: string;
  snippet: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function extractText(node: CanvasNode): string {
  switch (node.type) {
    case 'sticky':
      return node.text;
    case 'textblock':
      return node.text;
    case 'shape':
      return node.text ?? '';
    case 'section':
      return (node as SectionNode).name;
    case 'codeblock': {
      const c = node as CodeBlockNode;
      return [c.title, c.code, c.description ?? ''].join(' ');
    }
    case 'table': {
      const t = node as TableNode;
      return t.cells.flat().join(' ');
    }
    case 'link': {
      const l = node as LinkNode;
      return [l.title ?? '', l.description ?? '', l.url].join(' ');
    }
    default:
      return '';
  }
}

function getNodeDimensions(node: CanvasNode): { w: number; h: number } {
  if ('width' in node && 'height' in node) {
    return { w: (node as { width: number }).width, h: (node as { height: number }).height };
  }
  return { w: 200, h: 100 };
}

function buildMatches(
  query: string,
  nodes: CanvasNode[],
  pageId: string,
  pageName: string,
): SearchMatch[] {
  if (!query) return [];
  const q = query.toLowerCase();
  const results: SearchMatch[] = [];
  for (const node of nodes) {
    // Skip nodes without x/y (connectors)
    if (!('x' in node) || !('y' in node)) continue;
    const text = extractText(node);
    if (!text) continue;
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) continue;
    const dim = getNodeDimensions(node);
    // Build a short snippet around the match
    const start = Math.max(0, idx - 20);
    const end = Math.min(text.length, idx + query.length + 30);
    const snippet = (start > 0 ? '…' : '') + text.slice(start, end).replace(/\n/g, ' ') + (end < text.length ? '…' : '');
    results.push({
      nodeId: node.id,
      pageId,
      pageName,
      snippet,
      x: (node as { x: number }).x,
      y: (node as { y: number }).y,
      width: dim.w,
      height: dim.h,
    });
  }
  return results;
}

export default function SearchBar({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [allPages, setAllPages] = useState(false);

  const nodes = useBoardStore((s) => s.nodes);
  const pages = useBoardStore((s) => s.pages);
  const activePageId = useBoardStore((s) => s.activePageId);
  const pageSnapshots = useBoardStore((s) => s.pageSnapshots);
  const setCamera = useBoardStore((s) => s.setCamera);
  const selectIds = useBoardStore((s) => s.selectIds);
  const switchPage = useBoardStore((s) => s.switchPage);
  const camera = useBoardStore((s) => s.camera);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Compute matches
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim();
    // Current page
    const activePage = pages.find((p) => p.id === activePageId);
    let results = buildMatches(q, nodes, activePageId, activePage?.name ?? 'Page');

    if (allPages) {
      for (const page of pages) {
        if (page.id === activePageId) continue;
        const snap = pageSnapshots[page.id];
        if (!snap) continue;
        results = results.concat(buildMatches(q, snap.nodes, page.id, page.name));
      }
    }
    return results;
  }, [query, nodes, pages, activePageId, pageSnapshots, allPages]);

  // Clamp activeIndex when matches change
  useEffect(() => {
    if (matches.length === 0) {
      setActiveIndex(0);
    } else if (activeIndex >= matches.length) {
      setActiveIndex(0);
    }
  }, [matches.length, activeIndex]);

  const navigateToMatch = useCallback((match: SearchMatch) => {
    // Switch page if needed
    if (match.pageId !== useBoardStore.getState().activePageId) {
      switchPage(match.pageId);
    }
    const scale = useBoardStore.getState().camera.scale;
    const cx = match.x + match.width / 2;
    const cy = match.y + match.height / 2;
    setCamera({
      x: window.innerWidth / 2 - cx * scale,
      y: window.innerHeight / 2 - cy * scale,
    });
    selectIds([match.nodeId]);
  }, [switchPage, setCamera, selectIds]);

  // Navigate to active match when it changes
  useEffect(() => {
    if (matches.length > 0 && matches[activeIndex]) {
      navigateToMatch(matches[activeIndex]);
    }
  }, [activeIndex, matches, navigateToMatch]);

  // Navigate on first match when query changes
  const prevQuery = useRef(query);
  useEffect(() => {
    if (query !== prevQuery.current) {
      prevQuery.current = query;
      setActiveIndex(0);
      if (matches.length > 0) {
        navigateToMatch(matches[0]);
      }
    }
  }, [query, matches, navigateToMatch]);

  const goNext = () => {
    if (matches.length === 0) return;
    setActiveIndex((i) => (i + 1) % matches.length);
  };
  const goPrev = () => {
    if (matches.length === 0) return;
    setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      goPrev();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      goNext();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      goNext();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      goPrev();
    }
  };

  const activeMatch = matches[activeIndex];
  const showPageName = allPages && activeMatch && activeMatch.pageId !== activePageId;

  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-1.5 px-3 py-1.5 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-lg font-sans text-[12px] select-none animate-fade-in">
      {/* Search icon */}
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-[var(--c-text-off)] shrink-0">
        <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8.5 8.5L11.5 11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>

      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find on board…"
        className="w-48 bg-transparent text-[var(--c-text-hi)] text-[12px] font-sans placeholder:text-[var(--c-text-off)] focus:outline-none"
      />

      {/* Match counter */}
      {query.trim() && (
        <span className="text-[10px] text-[var(--c-text-off)] whitespace-nowrap shrink-0">
          {matches.length === 0
            ? '0 results'
            : `${activeIndex + 1} of ${matches.length}`}
          {showPageName && (
            <span className="ml-1 text-[var(--c-line)]">({activeMatch.pageName})</span>
          )}
        </span>
      )}

      {/* All pages toggle */}
      {pages.length > 1 && (
        <button
          onClick={() => setAllPages((v) => !v)}
          className={[
            'text-[9px] px-1.5 py-0.5 rounded border transition-colors whitespace-nowrap shrink-0',
            allPages
              ? 'border-[var(--c-line)]/40 bg-[var(--c-line)]/10 text-[var(--c-line)]'
              : 'border-[var(--c-border)] text-[var(--c-text-off)] hover:text-[var(--c-text-md)]',
          ].join(' ')}
          title="Search all pages"
        >
          All pages
        </button>
      )}

      {/* Prev / Next */}
      <button
        onClick={goPrev}
        disabled={matches.length === 0}
        className="p-1 rounded hover:bg-[var(--c-hover)] text-[var(--c-text-md)] disabled:opacity-30 transition-colors"
        title="Previous match (Shift+Enter)"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 6.5L5 3.5L8 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        onClick={goNext}
        disabled={matches.length === 0}
        className="p-1 rounded hover:bg-[var(--c-hover)] text-[var(--c-text-md)] disabled:opacity-30 transition-colors"
        title="Next match (Enter)"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Close */}
      <button
        onClick={onClose}
        className="p-1 rounded hover:bg-[var(--c-hover)] text-[var(--c-text-md)] transition-colors"
        title="Close (Esc)"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
