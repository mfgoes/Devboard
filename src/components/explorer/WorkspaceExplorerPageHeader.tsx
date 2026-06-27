import { useCallback, useEffect, useRef, useState } from 'react';
import { type PageMeta } from '../../types';
import { FONTS } from '../../utils/fonts';
import { IconChevronDown, IconFolder } from '../icons';
import WorkspaceExplorerPageMenu from './WorkspaceExplorerPageMenu';

interface WorkspaceExplorerPageHeaderProps {
  page: PageMeta;
  docCount: number;
  isActive: boolean;
  isCollapsed: boolean;
  coarsePointer: boolean;
  pageFocused: boolean;
  onToggleCollapsed: () => void;
  onOpenPageOverview: () => void;
  onRenamePage: (pageId: string, name: string) => void;
  onDeletePage: (page: PageMeta) => void;
  onRevealPage: (page: PageMeta) => void;
  onChangeSortMode: (page: PageMeta, sort: 'updated' | 'custom') => void;
  onCreateFolder: () => void;
  onCreateNote: () => void;
  onCreateCanvas: () => void;
  onFocusPage: (pageId: string) => void;
  onPageHover: (page: PageMeta, clientY: number) => void;
  onPageLeave: () => void;
}

export default function WorkspaceExplorerPageHeader({
  page,
  docCount,
  isActive,
  isCollapsed,
  coarsePointer,
  pageFocused,
  onToggleCollapsed,
  onOpenPageOverview,
  onRenamePage,
  onDeletePage,
  onRevealPage,
  onChangeSortMode,
  onCreateFolder,
  onCreateNote,
  onCreateCanvas,
  onFocusPage,
  onPageHover,
  onPageLeave,
}: WorkspaceExplorerPageHeaderProps) {
  const [renamingPage, setRenamingPage] = useState(false);
  const [pageRenameDraft, setPageRenameDraft] = useState(page.name);
  const [pageMenu, setPageMenu] = useState<{ x: number; y: number } | null>(null);
  const [pageHovered, setPageHovered] = useState(false);
  const pageHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageHeaderRef = useRef<HTMLDivElement>(null);

  const beginPageRename = useCallback(() => {
    setPageRenameDraft(page.name);
    setRenamingPage(true);
  }, [page.name]);

  useEffect(() => {
    setPageRenameDraft(page.name);
  }, [page.name]);

  useEffect(() => {
    if (!pageMenu) return;
    const handleWindowClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (pageHeaderRef.current?.contains(target)) return;
      setPageMenu(null);
    };
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, [pageMenu]);

  useEffect(() => () => {
    if (pageHoverTimerRef.current) clearTimeout(pageHoverTimerRef.current);
  }, []);

  return (
    <>
      <div
        ref={pageHeaderRef}
        onMouseEnter={(e) => {
          setPageHovered(true);
          if (pageHoverTimerRef.current) clearTimeout(pageHoverTimerRef.current);
          pageHoverTimerRef.current = setTimeout(() => onPageHover(page, e.clientY), 380);
        }}
        onMouseLeave={() => {
          setPageHovered(false);
          if (pageHoverTimerRef.current) clearTimeout(pageHoverTimerRef.current);
          onPageLeave();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onFocusPage(page.id);
          setPageMenu({ x: e.clientX, y: e.clientY });
        }}
        style={{
          position: 'relative',
          width: '100%',
          minHeight: 24,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 42px',
          alignItems: 'center',
          columnGap: 6,
          padding: '2px 6px',
          borderLeft: isActive ? '2px solid var(--c-line)' : '2px solid transparent',
          borderRadius: 5,
          ...(isActive ? {
            background: 'var(--c-sidebar-item-active)',
            borderLeft: '2px solid var(--c-line)',
            outline: 'none',
            outlineOffset: -1,
          } : {}),
          ...(!isActive && pageFocused ? {
            background: 'var(--c-sidebar-item-active)',
            borderLeft: '2px solid var(--c-line)',
            outline: 'none',
            outlineOffset: -1,
          } : {}),
          ...(!isActive && !pageFocused && pageHovered ? {
            background: 'var(--c-sidebar-item-hover)',
            outline: 'none',
            outlineOffset: -1,
          } : {}),
        }}
        data-focused={pageFocused ? 'true' : undefined}
        className="group transition-colors"
      >
        <div
          style={{
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            overflow: 'hidden',
          }}
        >
          <button
            onClick={onToggleCollapsed}
            title={isCollapsed ? `Expand "${page.name}"` : `Collapse "${page.name}"`}
            aria-label={isCollapsed ? `Expand ${page.name}` : `Collapse ${page.name}`}
            style={{
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              background: 'transparent',
              border: 'none',
              borderRadius: 5,
              color: isActive || pageHovered ? 'var(--c-sidebar-item-active-text)' : 'var(--c-sidebar-item-text)',
              flexShrink: 0,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--c-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span style={{
              lineHeight: 0,
              transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.16s cubic-bezier(0.22, 1, 0.36, 1)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <IconChevronDown size={14} />
            </span>
          </button>

          <button
            onClick={onToggleCollapsed}
            onFocus={() => onFocusPage(page.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onFocusPage(page.id);
              setPageMenu({ x: e.clientX, y: e.clientY });
            }}
            title={isCollapsed ? `Expand "${page.name}"` : `Collapse "${page.name}"`}
            aria-label={isCollapsed ? `Expand ${page.name}` : `Collapse ${page.name}`}
            style={{
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              background: 'transparent',
              border: 'none',
              borderRadius: 5,
              color: isActive ? 'var(--c-line)' : (pageHovered ? 'var(--c-sidebar-item-active-text)' : 'var(--c-sidebar-item-text)'),
              flexShrink: 0,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--c-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <IconFolder size={14} />
          </button>

          <button
            onClick={onOpenPageOverview}
            onFocus={() => onFocusPage(page.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onFocusPage(page.id);
              setPageMenu({ x: e.clientX, y: e.clientY });
            }}
            title={`Open "${page.name}" folder overview`}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              padding: 0,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {renamingPage ? (
              <input
                autoFocus
                value={pageRenameDraft}
                onChange={(e) => setPageRenameDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => {
                  const nextName = pageRenameDraft.trim() || page.name;
                  onRenamePage(page.id, nextName);
                  setRenamingPage(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const nextName = pageRenameDraft.trim() || page.name;
                    onRenamePage(page.id, nextName);
                    setRenamingPage(false);
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setRenamingPage(false);
                    setPageRenameDraft(page.name);
                  }
                  e.stopPropagation();
                }}
                style={{
                  flex: 1,
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
                fontFamily: FONTS.ui,
                fontSize: 10,
                fontWeight: isActive ? 650 : 560,
                color: isActive || pageHovered ? 'var(--c-sidebar-item-active-text)' : 'var(--c-sidebar-item-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}>
                {page.name}
              </span>
            )}
          </button>
        </div>
        <div
          style={{
            position: 'relative',
            minWidth: 0,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            alignSelf: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <span
            className="transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
            style={{
              minWidth: 0,
              fontFamily: FONTS.ui,
              fontSize: 8.5,
              color: isActive || pageHovered ? 'var(--c-sidebar-item-active-text)' : 'var(--c-sidebar-meta)',
              lineHeight: 1,
              textAlign: 'right',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {docCount}
          </span>
          <span
            style={{
              position: 'absolute',
              right: -2,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 2,
              minWidth: 38,
              paddingLeft: 5,
              background: (pageHovered || pageFocused || isActive || pageMenu)
                ? 'var(--c-sidebar-item-hover)'
                : 'var(--c-sidebar)',
              opacity: coarsePointer || pageHovered || pageFocused || isActive || pageMenu ? 1 : 0,
              transition: 'opacity 0.12s ease, background 0.12s ease',
              pointerEvents: coarsePointer || pageHovered || pageFocused || isActive || pageMenu ? 'auto' : 'none',
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCreateNote();
              }}
              title={`New note in ${page.name}`}
              style={{
                width: 16,
                height: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                border: 'none',
                background: 'transparent',
                color: 'var(--c-text-lo)',
                borderRadius: 4,
                cursor: 'pointer',
                lineHeight: 1,
                opacity: 0.92,
                transition: 'opacity 0.12s ease, background 0.12s ease, color 0.12s ease',
              }}
              className="group-hover:opacity-100 focus:opacity-100"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--c-hover)';
                e.currentTarget.style.color = 'var(--c-text-hi)';
                e.currentTarget.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--c-text-lo)';
                e.currentTarget.style.opacity = '0.92';
              }}
            >
              <span style={{ display: 'block', fontSize: 11, lineHeight: 1, transform: 'translateY(-1px)' }}>+</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setPageMenu((current) => current ? null : { x: rect.right - 180, y: rect.bottom + 4 });
              }}
              title={`${page.name} menu`}
              style={{
                width: 16,
                height: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                border: 'none',
                background: 'transparent',
                color: 'var(--c-text-off)',
                borderRadius: 4,
                cursor: 'pointer',
                lineHeight: 1,
                opacity: 0.92,
                transition: 'opacity 0.12s ease, background 0.12s ease, color 0.12s ease',
              }}
              className="group-hover:opacity-100 focus:opacity-100"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--c-hover)';
                e.currentTarget.style.color = 'var(--c-text-hi)';
                e.currentTarget.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--c-text-off)';
                e.currentTarget.style.opacity = '0.92';
              }}
            >
              <span style={{ fontSize: 13, lineHeight: 1, display: 'block', transform: 'translateY(-0.5px)' }}>⋯</span>
            </button>
          </span>
          {pageMenu && (
            <WorkspaceExplorerPageMenu
              page={pageMenu}
              noteSort={page.noteSort}
              onClose={() => setPageMenu(null)}
              onCreateFolder={onCreateFolder}
              onCreateNote={onCreateNote}
              onCreateCanvas={onCreateCanvas}
              onChangeSortMode={(sort) => onChangeSortMode(page, sort)}
              onRevealPage={() => onRevealPage(page)}
              onRenamePage={() => beginPageRename()}
              onDeletePage={() => onDeletePage(page)}
            />
          )}
        </div>
      </div>
    </>
  );
}
