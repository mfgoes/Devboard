import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react';
import { useBoardStore } from '../store/boardStore';
import { Document, FolderDescriptor } from '../types';
import { IconCanvasDoc, IconDoc, IconFolder, IconFreeformPage, IconStackPage, IconStar } from './icons';
import { IS_TAURI, readWorkspaceFileInfo, revealInFinder } from '../utils/workspaceManager';
import { exportDocumentAsMarkdownFile, exportDocumentAsPdf, exportDocumentAsTextFile } from '../utils/documentExport';
import DocumentMode from './DocumentMode';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function clampAtWordBoundary(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const slice = text.slice(0, limit + 1);
  const boundary = Math.max(slice.lastIndexOf(' '), slice.lastIndexOf('/'), slice.lastIndexOf('-'));
  const trimmed = (boundary > limit * 0.55 ? slice.slice(0, boundary) : text.slice(0, limit)).trim();
  return `${trimmed}...`;
}

function previewLinesFromHtml(html: string, limit = 4): string[] {
  const text = html
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(ul|ol)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return text.slice(0, limit);
}

function formatDate(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function wordCountFromHtml(html: string): number {
  const text = stripHtml(html);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function sortDocumentsForPage(docs: Document[], sortMode: 'updated' | 'custom' = 'updated'): Document[] {
  if (sortMode === 'custom') {
    return [...docs].sort((a, b) => {
      if (a.orderIndex != null && b.orderIndex != null) return a.orderIndex - b.orderIndex;
      if (a.orderIndex != null) return -1;
      if (b.orderIndex != null) return 1;
      return b.updatedAt - a.updatedAt;
    });
  }
  return [...docs].sort((a, b) => b.updatedAt - a.updatedAt);
}

type StackSort = 'updated' | 'custom' | 'az' | 'tag';
type StackViewMode = 'grid' | 'list';
type StackBrowserMode = 'folders' | 'notes';
type FolderSort = 'updated' | 'custom' | 'az';
const STACK_PANEL_BREAKPOINT = 768;

interface StackCardProps {
	doc: Document;
	viewMode: StackViewMode;
	active: boolean;
  hasMissingImages?: boolean;
  compactGrid?: boolean;
	onOpen: (rect: DOMRect) => void;
	onContextOpen: (doc: Document, rect: DOMRect, x: number, y: number) => void;
	onToggleFavorite: () => void;
  isRenaming: boolean;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
}

function StackCard({
	doc,
	viewMode,
	active,
  hasMissingImages = false,
  compactGrid = false,
	onOpen,
	onContextOpen,
	onToggleFavorite,
  isRenaming,
  renameDraft,
  onRenameDraftChange,
  onRenameCommit,
  onRenameCancel,
}: StackCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const isGrid = viewMode === 'grid';
  const isCanvasDoc = doc.docType === 'canvas';
  const denseGrid = isGrid || compactGrid;
  const preview = useMemo(() => isCanvasDoc ? 'Freeform canvas' : clampAtWordBoundary(stripHtml(doc.content), isGrid ? 84 : 300), [doc.content, isCanvasDoc, isGrid]);
  const wordCount = useMemo(() => wordCountFromHtml(doc.content), [doc.content]);
	const [hovered, setHovered] = useState(false);
	const borderColor = active
		? 'rgba(184,119,80,0.8)'
		: hovered
			? 'rgba(184,119,80,0.3)'
			: 'var(--c-border)';
	const background = active
		? 'color-mix(in srgb, rgba(201,137,92,0.22) 72%, var(--c-panel))'
		: hovered
			? 'color-mix(in srgb, var(--c-hover) 65%, var(--c-panel))'
			: 'var(--c-panel)';
	const boxShadow = active
		? (isGrid ? '0 18px 34px rgba(25,18,14,0.12), 0 0 0 2px rgba(184,119,80,0.12)' : '0 10px 22px rgba(25,18,14,0.09), 0 0 0 2px rgba(184,119,80,0.12)')
		: hovered
			? (isGrid ? '0 10px 22px rgba(25,18,14,0.06)' : '0 6px 14px rgba(25,18,14,0.05)')
			: (isGrid ? '0 3px 10px rgba(25,18,14,0.03)' : '0 1px 4px rgba(25,18,14,0.025)');
	const openFromCard = () => {
		if (isRenaming) return;
		const rect = cardRef.current?.getBoundingClientRect();
    if (rect) onOpen(rect);
  };

  useEffect(() => {
    if (!isRenaming) return;
    const raf = requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [isRenaming]);

  return (
    <div
      ref={cardRef}
      data-side-panel-open-target="true"
      onClick={openFromCard}
      onDoubleClick={openFromCard}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = cardRef.current?.getBoundingClientRect();
        if (rect) onContextOpen(doc, rect, e.clientX, e.clientY);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
		style={{
			display: 'flex',
			flexDirection: 'column',
			minHeight: isGrid ? 118 : 68,
			width: '100%',
			maxWidth: isGrid ? 'none' : 780,
			background,
			border: `1px solid ${borderColor}`,
			borderRadius: 8,
			cursor: isRenaming ? 'text' : 'pointer',
			transition: 'background 140ms, border-color 140ms, transform 140ms, box-shadow 140ms',
			overflow: 'hidden',
			transform: active ? 'translateY(-1px)' : hovered ? 'translateY(-2px)' : 'translateY(0)',
			boxShadow,
		}}
	>
      {active && (
        <div
          aria-hidden="true"
          style={{
            height: 3,
            background: 'linear-gradient(90deg, rgba(184,119,80,0.95), rgba(212,131,90,0.72))',
          }}
        />
      )}
      <div
        style={{
          padding: isGrid ? '10px 10px 0' : '10px 12px 0',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {isRenaming ? (
            <input
              ref={titleInputRef}
              value={renameDraft}
              onChange={(e) => onRenameDraftChange(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onBlur={onRenameCommit}
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
                width: '100%',
                maxWidth: isGrid ? '100%' : 520,
                height: isGrid ? (denseGrid ? 32 : 34) : 30,
                padding: '0 10px',
                background: 'var(--c-canvas)',
                border: '1px solid rgba(184,119,80,0.32)',
                borderRadius: 8,
                color: 'var(--c-text-hi)',
                fontSize: isGrid ? (denseGrid ? 15 : 16) : 14,
                fontWeight: 700,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          ) : (
            <span
              style={{
                fontSize: isGrid ? 15 : 15,
                fontWeight: 700,
                letterSpacing: 0,
                color: 'var(--c-text-hi)',
                display: '-webkit-box',
                WebkitLineClamp: 1,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                lineHeight: 1.2,
                minHeight: '1.2em',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                <span style={{ display: 'inline-flex', color: isCanvasDoc ? 'var(--c-line)' : 'var(--c-text-lo)', flexShrink: 0 }}>
                  {isCanvasDoc ? <IconCanvasDoc size={15} /> : <IconDoc />}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {doc.title || (isCanvasDoc ? 'Untitled canvas' : 'Untitled')}
                </span>
              </span>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0 }}>
          {hasMissingImages && (
            <span
              title="This note has missing linked images"
              aria-label="This note has missing linked images"
              style={{
                width: isGrid ? 10 : 8,
                height: isGrid ? 10 : 8,
                borderRadius: 999,
                background: '#f59e0b',
                boxShadow: '0 0 0 3px rgba(245,158,11,0.14)',
                flexShrink: 0,
                marginTop: isGrid ? 9 : 7,
              }}
            />
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            title={doc.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-label={doc.isFavorite ? `Remove ${doc.title || 'Untitled'} from favorites` : `Add ${doc.title || 'Untitled'} to favorites`}
              style={{
              width: isGrid ? 26 : 24,
              height: isGrid ? 26 : 24,
              border: 'none',
              borderRadius: isGrid ? 8 : 7,
              background: doc.isFavorite ? 'rgba(214,160,69,0.14)' : 'rgba(255,255,255,0.3)',
              color: doc.isFavorite ? '#d6a045' : 'var(--c-text-lo)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <IconStar filled={!!doc.isFavorite} size={isGrid ? 14 : 12} />
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: isGrid ? 7 : 4,
          padding: isGrid ? '0 10px 10px' : '7px 12px 10px',
          flex: 1,
          minWidth: 0,
          justifyContent: isGrid ? 'flex-start' : 'center',
        }}
      >
        {preview && (
          <div
            style={{
              fontSize: isGrid ? 12 : 12.5,
              color: isGrid ? 'var(--c-text-lo)' : 'var(--c-text-md)',
              lineHeight: isGrid ? 1.35 : 1.45,
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              minHeight: '1.45em',
              maxWidth: isGrid ? '100%' : 'none',
              opacity: isGrid ? 0.86 : 1,
            }}
          >
            {preview}
          </div>
        )}
        {!preview && isGrid && (
          <div
            style={{
              minHeight: '1.45em',
              display: 'flex',
              alignItems: 'center',
              color: 'var(--c-text-lo)',
              fontSize: 12,
              fontStyle: 'italic',
              opacity: 0.72,
            }}
          >
            Empty note
          </div>
        )}

        {!!doc.tags?.length && isGrid && !denseGrid && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {doc.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                style={{
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: 'rgba(138,117,95,0.08)',
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--c-text-md)',
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isGrid ? 'space-between' : 'flex-start',
            gap: isGrid ? 10 : 12,
            marginTop: isGrid ? 'auto' : 0,
            fontSize: isGrid ? 11 : 11,
            color: 'var(--c-text-lo)',
            fontWeight: 400,
            flexWrap: 'wrap',
          }}
        >
          <span>{formatDate(doc.updatedAt)}</span>
          <span>{isCanvasDoc ? 'canvas' : `${wordCount} words`}</span>
        </div>
      </div>
    </div>
  );
}

interface Props {
  pageId: string;
  pageName: string;
}

type ToolbarMenuOption<T extends string> = {
  value: T;
  label: string;
};

interface ToolbarMenuSelectProps<T extends string> {
  label: string;
  ariaLabel: string;
  value: T;
  options: ToolbarMenuOption<T>[];
  onChange: (value: T) => void;
  minWidth?: number;
}

function ToolbarMenuSelect<T extends string>({
  label,
  ariaLabel,
  value,
  options,
  onChange,
  minWidth = 150,
}: ToolbarMenuSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 38,
        minWidth,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        style={{
          width: '100%',
          minHeight: 38,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '0 10px',
          background: open ? 'var(--c-hover)' : 'var(--c-panel)',
          border: `1px solid ${open ? 'rgba(184,119,80,0.34)' : 'var(--c-border)'}`,
          borderRadius: 8,
          color: 'var(--c-text-hi)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'background 120ms, border-color 120ms, color 120ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--c-hover)';
          e.currentTarget.style.borderColor = 'rgba(184,119,80,0.34)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = open ? 'var(--c-hover)' : 'var(--c-panel)';
          e.currentTarget.style.borderColor = open ? 'rgba(184,119,80,0.34)' : 'var(--c-border)';
        }}
      >
        {label ? <span style={{ fontSize: 11, fontWeight: 560, color: 'var(--c-text-lo)' }}>{label}</span> : null}
        <span style={{ fontSize: 12.5, fontWeight: 540, color: 'var(--c-text-md)', whiteSpace: 'nowrap' }}>
          {selected?.label ?? ''}
        </span>
        <svg
          aria-hidden="true"
          width="13"
          height="13"
          viewBox="0 0 13 13"
          fill="none"
          style={{
            marginLeft: 'auto',
            color: 'var(--c-text-lo)',
            flexShrink: 0,
            opacity: 0.9,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 120ms',
          }}
        >
          <path d="M3.25 5.1 6.5 8.35 9.75 5.1" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            left: 0,
            top: 'calc(100% + 6px)',
            zIndex: 9100,
            minWidth: '100%',
            width: 'max-content',
            maxWidth: 260,
          }}
          className="py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between gap-4 px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                style={{ fontFamily: 'inherit', color: active ? 'var(--c-text-hi)' : undefined }}
              >
                <span style={{ whiteSpace: 'nowrap' }}>{option.label}</span>
                <span aria-hidden="true" className="text-[10px] ml-3" style={{ color: active ? 'var(--c-line)' : 'transparent' }}>
                  {active ? '✓' : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type FolderSummary = {
  id: string;
  name: string;
  noteCount: number;
  favoriteCount: number;
  lastEditedAt: number | null;
  description: string;
  preview: string;
  noteTitles: string[];
  fileLabels: string[];
  tags: string[];
  descriptor?: FolderDescriptor;
};

function FolderCard({
  folder,
  viewMode,
  active,
  onOpen,
}: {
  folder: FolderSummary;
  viewMode: StackViewMode;
  active: boolean;
  onOpen: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isGrid = viewMode === 'grid';
  const description = folder.description || folder.preview;
  const files = folder.fileLabels.length > 0 ? folder.fileLabels : folder.noteTitles;
  const cardBorder = active
    ? 'rgba(184,119,80,0.42)'
    : hovered
      ? 'rgba(184,119,80,0.30)'
      : 'var(--c-border)';
  const folderFill = active
    ? 'color-mix(in srgb, rgba(201,137,92,0.16) 66%, var(--c-panel))'
    : hovered
      ? 'color-mix(in srgb, var(--c-hover) 72%, var(--c-panel))'
      : 'var(--c-panel)';

  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        width: '100%',
        maxWidth: isGrid ? 320 : 780,
        minHeight: isGrid ? 216 : 94,
        padding: 0,
        border: 'none',
        background: 'transparent',
        color: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'transform 140ms',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      <div
        style={{
          position: 'relative',
          minHeight: isGrid ? 216 : 94,
          display: isGrid ? 'flex' : 'grid',
          gridTemplateColumns: isGrid ? undefined : 'minmax(0, 1fr) minmax(220px, 0.65fr)',
          gap: isGrid ? 12 : 18,
          flexDirection: isGrid ? 'column' : undefined,
          padding: isGrid ? '16px 18px 15px' : '14px 16px',
          borderRadius: '8px',
          borderTopLeftRadius: 8,
          border: `1px solid ${cardBorder}`,
          background: folderFill,
          boxShadow: hovered
            ? (isGrid ? '0 12px 26px rgba(25,18,14,0.07)' : '0 8px 18px rgba(25,18,14,0.055)')
            : (isGrid ? '0 3px 10px rgba(25,18,14,0.035)' : '0 1px 4px rgba(25,18,14,0.025)'),
          transition: 'background 140ms, border-color 140ms, box-shadow 140ms',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  flexShrink: 0,
                  width: isGrid ? 34 : 30,
                  height: isGrid ? 34 : 30,
                  borderRadius: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(184,119,80,0.12)',
                  color: 'var(--c-line)',
                }}
              >
                <IconFolder size={isGrid ? 18 : 16} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: isGrid ? 17 : 15, fontWeight: 750, letterSpacing: '-0.03em', color: 'var(--c-text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {folder.name}
                </div>
                <div style={{ marginTop: 4, fontSize: 11.5, fontWeight: 650, color: 'var(--c-text-lo)' }}>
                  {folder.noteCount} {folder.noteCount === 1 ? 'file' : 'files'}
                  {folder.lastEditedAt ? ` · ${formatDate(folder.lastEditedAt)}` : ''}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: isGrid ? 14 : 10,
              fontSize: isGrid ? 12.5 : 12,
              color: description ? 'var(--c-text-md)' : 'var(--c-text-lo)',
              lineHeight: 1.45,
              display: '-webkit-box',
              WebkitLineClamp: isGrid ? 3 : 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              minHeight: isGrid ? '4.35em' : '2.9em',
              fontStyle: description ? 'normal' : 'italic',
            }}
          >
            {description || 'No Markdown files in this folder yet.'}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
            marginTop: isGrid ? 'auto' : 0,
            paddingTop: isGrid ? 2 : 4,
            minWidth: 0,
          }}
        >
          {files.slice(0, isGrid ? 3 : 2).map((title) => (
            <div
              key={title}
              style={{
                minHeight: 28,
                display: 'grid',
                gridTemplateColumns: '16px minmax(0, 1fr)',
                alignItems: 'center',
                gap: 7,
                padding: '0 8px',
                borderRadius: 6,
                background: 'rgba(138,117,95,0.075)',
                color: 'var(--c-text-md)',
              }}
            >
              <span style={{ display: 'inline-flex', color: 'var(--c-text-lo)' }}><IconDoc /></span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700 }}>
                {title}
              </span>
            </div>
          ))}
          {files.length === 0 && (
            <div style={{ minHeight: 28, display: 'flex', alignItems: 'center', padding: '0 8px', borderRadius: 6, background: 'rgba(138,117,95,0.06)', color: 'var(--c-text-lo)', fontSize: 11, fontWeight: 650 }}>
              Empty folder
            </div>
          )}
          {folder.favoriteCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 22, marginTop: 1 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, background: 'rgba(226,190,114,0.12)', fontSize: 9.5, fontWeight: 750, color: 'var(--c-text-md)' }}>
                <IconStar filled size={10} />
                {folder.favoriteCount}
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

type StackNoteMenuState = {
  docId: string;
  x: number;
  y: number;
  rect: { left: number; top: number; width: number; height: number };
};

export default function StackView({ pageId, pageName }: Props) {
  const documents = useBoardStore((s) => s.documents);
  const pages = useBoardStore((s) => s.pages);
  const folderDescriptors = useBoardStore((s) => s.folderDescriptors);
  const boardTitle = useBoardStore((s) => s.boardTitle);
  const workspaceName = useBoardStore((s) => s.workspaceName);
  const addDocument = useBoardStore((s) => s.addDocument);
  const addCanvasDocument = useBoardStore((s) => s.addCanvasDocument);
  const addPage = useBoardStore((s) => s.addPage);
  const updateDocument = useBoardStore((s) => s.updateDocument);
  const deleteDocument = useBoardStore((s) => s.deleteDocument);
	const openCanvasDocument = useBoardStore((s) => s.openCanvasDocument);
	const openDocumentWithMorph = useBoardStore((s) => s.openDocumentWithMorph);
	const openPanelDocId = useBoardStore((s) => s.openPanelDocId);
	const setOpenPanelDocId = useBoardStore((s) => s.setOpenPanelDocId);
	const setDocViewMode = useBoardStore((s) => s.setDocViewMode);
	const setPageLayoutMode = useBoardStore((s) => s.setPageLayoutMode);
	const setPageNoteSort = useBoardStore((s) => s.setPageNoteSort);
  const switchPage = useBoardStore((s) => s.switchPage);
  const toggleFavoriteDocument = useBoardStore((s) => s.toggleFavoriteDocument);
  const page = pages.find((entry) => entry.id === pageId);
  const [browserMode, setBrowserMode] = useState<StackBrowserMode>('notes');
  const [sort, setSort] = useState<StackSort>(() => page?.noteSort === 'custom' ? 'custom' : 'updated');
  const [folderSort, setFolderSort] = useState<FolderSort>('updated');
  const [viewMode, setViewMode] = useState<StackViewMode>('grid');
  const [noteMenu, setNoteMenu] = useState<StackNoteMenuState | null>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
	const [noteMenuExportOpen, setNoteMenuExportOpen] = useState(false);
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
	const [renameDraft, setRenameDraft] = useState('');
	const [searchQuery, setSearchQuery] = useState('');
	const [folderSearchQuery, setFolderSearchQuery] = useState('');
	const [activeTagFilter, setActiveTagFilter] = useState('__all__');
  const [showNoteFilter, setShowNoteFilter] = useState(false);
	const [isMobileViewport, setIsMobileViewport] = useState(() => (
		typeof window !== 'undefined' ? window.innerWidth < STACK_PANEL_BREAKPOINT : false
	));
	const newBtnRef = useRef<HTMLButtonElement>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);
	const mobileNewBtnRef = useRef<HTMLButtonElement>(null);
	const noteMenuRef = useRef<HTMLDivElement>(null);
	const noteMenuExportRef = useRef<HTMLDivElement>(null);
	const cardRectsRef = useRef<Record<string, { left: number; top: number; width: number; height: number }>>({});
  const panelResizeRef = useRef(false);
  const noteFilterInputRef = useRef<HTMLInputElement>(null);
  const [stackPanelWidth, setStackPanelWidth] = useState(380);

  const pageDocs = useMemo(() => {
    const filtered = documents.filter((d) => d.pageId === pageId);
    if (sort === 'az') return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'tag') return [...filtered].sort((a, b) => ((a.tags?.[0] ?? 'z').localeCompare(b.tags?.[0] ?? 'z')));
    return sortDocumentsForPage(filtered, sort);
  }, [documents, pageId, sort]);

  useEffect(() => {
    setSort(page?.noteSort === 'custom' ? 'custom' : 'updated');
  }, [page?.noteSort, pageId]);

  useEffect(() => {
    setBrowserMode('notes');
    setSearchQuery('');
    setActiveTagFilter('__all__');
    setShowNoteFilter(false);
  }, [pageId]);

  const handleSortChange = (nextSort: StackSort) => {
    if (!page) {
      setSort(nextSort);
      return;
    }

    if (nextSort === 'custom' && page.noteSort !== 'custom') {
      sortDocumentsForPage(
        documents.filter((doc) => doc.pageId === pageId),
        'updated',
      ).forEach((doc, index) => {
        if (doc.orderIndex !== index) updateDocument(doc.id, { orderIndex: index });
      });
      setPageNoteSort(page.id, 'custom');
    }

    if (nextSort === 'updated' && page.noteSort === 'custom') {
      setPageNoteSort(page.id, 'updated');
    }

    setSort(nextSort);
  };

	const handleOpen = useCallback((doc: Document, rect: DOMRect) => {
    if (doc.docType === 'canvas') {
      openCanvasDocument(doc.id);
      return;
    }
		cardRectsRef.current[doc.id] = {
			left: rect.left,
			top: rect.top,
			width: rect.width,
			height: rect.height,
		};
    setDocViewMode('fullscreen');
		openDocumentWithMorph(doc.id, cardRectsRef.current[doc.id]);
		setOpenPanelDocId(null);
	}, [openCanvasDocument, openDocumentWithMorph, setDocViewMode, setOpenPanelDocId]);

	const handleClosePanel = useCallback(() => {
		setOpenPanelDocId(null);
	}, [setOpenPanelDocId]);

	const handleExpandPanelDoc = useCallback(() => {
		if (!openPanelDocId) return;
		setDocViewMode('fullscreen');
		openDocumentWithMorph(openPanelDocId, cardRectsRef.current[openPanelDocId]);
		setOpenPanelDocId(null);
	}, [openDocumentWithMorph, openPanelDocId, setDocViewMode, setOpenPanelDocId]);

	const handleOpenFromMenu = (menu: StackNoteMenuState) => {
    const doc = documents.find((entry) => entry.id === menu.docId);
    if (doc?.docType === 'canvas') {
      openCanvasDocument(doc.id);
      setNoteMenu(null);
      setNoteMenuExportOpen(false);
      return;
    }
		cardRectsRef.current[menu.docId] = menu.rect;
    setDocViewMode('fullscreen');
		openDocumentWithMorph(menu.docId, menu.rect);
		setOpenPanelDocId(null);
		setNoteMenu(null);
		setNoteMenuExportOpen(false);
	};

	const handleOpenFullPage = (menu: StackNoteMenuState) => {
    const doc = documents.find((entry) => entry.id === menu.docId);
    if (doc?.docType === 'canvas') {
      openCanvasDocument(doc.id);
      setNoteMenu(null);
      setNoteMenuExportOpen(false);
      return;
    }
		cardRectsRef.current[menu.docId] = menu.rect;
		setDocViewMode('fullscreen');
		openDocumentWithMorph(menu.docId, menu.rect);
		setOpenPanelDocId(null);
		setNoteMenu(null);
		setNoteMenuExportOpen(false);
	};

  const beginRename = (doc: Document) => {
    setRenamingDocId(doc.id);
    setRenameDraft(doc.title || 'Untitled');
    setNoteMenu(null);
    setNoteMenuExportOpen(false);
  };

  const commitRename = () => {
    if (!renamingDocId) return;
    const current = documents.find((doc) => doc.id === renamingDocId);
    const nextTitle = renameDraft.trim() || 'Untitled';
    if (current && current.title !== nextTitle) updateDocument(renamingDocId, { title: nextTitle });
    setRenamingDocId(null);
    setRenameDraft('');
  };

  const cancelRename = () => {
    setRenamingDocId(null);
    setRenameDraft('');
  };

  const duplicateDocument = (doc: Document) => {
    if (doc.docType === 'canvas') {
      const id = addCanvasDocument(pageId);
      updateDocument(id, { title: `${doc.title?.trim() || 'Untitled canvas'} copy` });
      setNoteMenu(null);
      setNoteMenuExportOpen(false);
      return;
    }
    const title = `${doc.title?.trim() || 'Untitled'} copy`;
    let orderIndex: number | undefined;
    if ((page?.noteSort ?? 'updated') === 'custom') {
      const customDocs = sortDocumentsForPage(documents.filter((entry) => entry.pageId === pageId), 'custom');
      const sourceIndex = customDocs.findIndex((entry) => entry.id === doc.id);
      orderIndex = sourceIndex >= 0 ? sourceIndex + 1 : customDocs.length;
      customDocs.forEach((entry, index) => {
        if (sourceIndex >= 0 && index > sourceIndex) updateDocument(entry.id, { orderIndex: index + 1 });
        else if (entry.orderIndex !== index) updateDocument(entry.id, { orderIndex: index });
      });
    }
    const id = addDocument({
      title,
      content: doc.content,
      emoji: doc.emoji,
      pageId,
      tags: doc.tags ? [...doc.tags] : undefined,
      orderIndex,
    });
    setNoteMenu(null);
    setNoteMenuExportOpen(false);
  };

  const handleDelete = (doc: Document) => {
    const title = doc.title || 'Untitled note';
    if (!window.confirm(`Delete "${title}"? This also removes its canvas cards.`)) return;
    deleteDocument(doc.id);
    setNoteMenu(null);
    setNoteMenuExportOpen(false);
  };

  const handleNewDoc = (sourceEl: HTMLElement | null = newBtnRef.current) => {
    const existingPageDocs = sortDocumentsForPage(
      documents.filter((doc) => doc.pageId === pageId),
      page?.noteSort ?? 'updated'
    );
    const id = addDocument({
      title: '',
      content: '',
      pageId,
      orderIndex: page?.noteSort === 'custom' ? 0 : undefined,
    });
    if (page?.noteSort === 'custom') {
      existingPageDocs.forEach((doc, index) => {
        updateDocument(doc.id, { orderIndex: index + 1 });
      });
    }
    const rect = sourceEl?.getBoundingClientRect();
		if (rect) {
			cardRectsRef.current[id] = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
		}
    setDocViewMode('fullscreen');
		openDocumentWithMorph(id, rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined);
		setOpenPanelDocId(null);
	};

  const handleNewCanvasDoc = () => {
    addCanvasDocument(pageId);
    setNewMenuOpen(false);
  };

	useEffect(() => {
		if (!noteMenu) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (noteMenuRef.current?.contains(target) || noteMenuExportRef.current?.contains(target)) return;
      setNoteMenu(null);
      setNoteMenuExportOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setNoteMenu(null);
      setNoteMenuExportOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
	}, [noteMenu]);

  useEffect(() => {
    if (!newMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (newMenuRef.current?.contains(e.target as Node)) return;
      setNewMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNewMenuOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [newMenuOpen]);

	useEffect(() => {
		const onResize = () => {
			setIsMobileViewport(window.innerWidth < STACK_PANEL_BREAKPOINT);
      setStackPanelWidth((current) => Math.max(340, Math.min(760, current)));
		};
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, []);

	useEffect(() => {
		const activePanelDoc = documents.find((doc) => doc.id === openPanelDocId);
		if (!openPanelDocId) return;
		if (!activePanelDoc || activePanelDoc.pageId !== pageId || browserMode !== 'notes' || isMobileViewport) {
			setOpenPanelDocId(null);
		}
	}, [browserMode, documents, isMobileViewport, openPanelDocId, pageId, setOpenPanelDocId]);

  useEffect(() => {
    setOpenPanelDocId(null);
  }, [pageId, setOpenPanelDocId]);

	useEffect(() => {
		if (!openPanelDocId) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			setOpenPanelDocId(null);
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [openPanelDocId, setOpenPanelDocId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f' && browserMode === 'notes') {
        event.preventDefault();
        setShowNoteFilter(true);
        requestAnimationFrame(() => noteFilterInputRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [browserMode]);

  const activeMenuDoc = noteMenu ? documents.find((doc) => doc.id === noteMenu.docId) : null;
  const folderDescriptorById = useMemo(() => new Map(folderDescriptors.map((descriptor) => [descriptor.id, descriptor])), [folderDescriptors]);
  const folderSummaries = useMemo<FolderSummary[]>(() => {
    return pages.map((entry) => {
      const docs = sortDocumentsForPage(documents.filter((doc) => doc.pageId === entry.id), 'updated');
      const previewDoc = docs.find((doc) => stripHtml(doc.content));
      const descriptor = folderDescriptorById.get(entry.id);
      const descriptorFiles = descriptor?.files?.map((file) => file.title || file.path.split('/').pop() || file.path) ?? [];
      const tags = Array.from(new Set([
        ...(descriptor?.tags ?? []),
        ...docs.flatMap((doc) => doc.tags ?? []),
      ].map((tag) => tag.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
      return {
        id: entry.id,
        name: entry.name,
        noteCount: docs.length,
        favoriteCount: docs.filter((doc) => !!doc.isFavorite).length,
        lastEditedAt: docs.length > 0 ? Math.max(...docs.map((doc) => doc.updatedAt)) : null,
        description: descriptor?.description?.trim() || descriptor?.autoDescription?.trim() || '',
        preview: previewDoc ? stripHtml(previewDoc.content).slice(0, 220) : '',
        noteTitles: docs.slice(0, 3).map((doc) => doc.title || 'Untitled'),
        fileLabels: descriptorFiles.length > 0 ? descriptorFiles : docs.slice(0, 3).map((doc) => doc.linkedFile?.split('/').pop() ?? (doc.title || 'Untitled')),
        tags,
        descriptor,
      };
    });
  }, [documents, folderDescriptorById, pages]);
  const visibleFolders = useMemo(() => {
    const q = folderSearchQuery.trim().toLowerCase();
    const sorted = [...folderSummaries];
    if (folderSort === 'az') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (folderSort === 'updated') {
      sorted.sort((a, b) => (b.lastEditedAt ?? 0) - (a.lastEditedAt ?? 0));
    }
    return sorted.filter((folder) => {
      if (!q) return true;
      return [
        folder.name,
        folder.description,
        folder.preview,
        ...folder.noteTitles,
        ...folder.fileLabels,
        ...folder.tags,
      ].join(' ').toLowerCase().includes(q);
    });
  }, [folderSearchQuery, folderSort, folderSummaries]);
  const availableTags = useMemo(() => {
    return Array.from(
      new Set(
        pageDocs.flatMap((doc) => doc.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [pageDocs]);
  const visibleDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return pageDocs.filter((doc) => {
      const matchesQuery = !q || [doc.title || '', stripHtml(doc.content), ...(doc.tags ?? [])]
        .join(' ')
        .toLowerCase()
        .includes(q);
      const matchesTag = activeTagFilter === '__all__' || (doc.tags ?? []).includes(activeTagFilter);
      return matchesQuery && matchesTag;
    });
  }, [activeTagFilter, pageDocs, searchQuery]);
  const lastEditedAt = useMemo(() => {
    if (pageDocs.length === 0) return null;
    return Math.max(...pageDocs.map((doc) => doc.updatedAt));
  }, [pageDocs]);
  const breadcrumbLabel = (boardTitle.trim() || workspaceName || 'Workspace').trim();
  const breadcrumbButtonStyle: CSSProperties = {
    border: 'none',
    background: 'transparent',
    padding: '2px 6px',
    margin: '-2px -6px',
    borderRadius: 8,
    color: 'var(--c-text-lo)',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    transition: 'background 120ms, color 120ms',
  };
	const handleOpenFolderBrowser = () => {
		setOpenPanelDocId(null);
		setBrowserMode('folders');
		setNoteMenu(null);
		setNoteMenuExportOpen(false);
	};
	const handleOpenFolder = (targetPageId: string) => {
		setOpenPanelDocId(null);
		if (targetPageId !== pageId) switchPage(targetPageId);
		setBrowserMode('notes');
	};
  const handleNewFolder = () => {
    addPage('Untitled folder');
    const state = useBoardStore.getState();
    setPageLayoutMode(state.activePageId, 'stack');
    setBrowserMode('notes');
  };
	const showingFolders = browserMode === 'folders';
	const activeFolderSummary = folderSummaries.find((entry) => entry.id === pageId);
	const activePanelDoc = useMemo(
		() => documents.find((doc) => doc.id === openPanelDocId) ?? null,
		[documents, openPanelDocId],
	);
	const panelOpen = false;
	const workspaceBreadcrumbLabel = (workspaceName?.trim() || boardTitle.trim() || 'Workspace').trim();
  const stackSurfaceMaxWidth = 1360;
  const stackContentMaxWidth = showingFolders ? 1120 : 1240;
  const contentGridColumns = viewMode === 'grid'
    ? showingFolders
      ? 'repeat(auto-fill, minmax(min(100%, 300px), 320px))'
      : 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))'
    : '1fr';
  const [docMissingImageMap, setDocMissingImageMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    const docsToCheck = showingFolders ? [] : pageDocs;
    if (docsToCheck.length === 0) {
      setDocMissingImageMap({});
      return;
    }

    const extractImagePaths = (html: string): string[] => {
      const root = document.createElement('div');
      root.innerHTML = html;
      return Array.from(root.querySelectorAll('img'))
        .map((image) => image.getAttribute('data-workspace-src') ?? '')
        .filter(Boolean);
    };

    void (async () => {
      const entries = await Promise.all(docsToCheck.map(async (doc) => {
        const paths = extractImagePaths(doc.content);
        if (paths.length === 0) return [doc.id, false] as const;
        const checks = await Promise.all(paths.map(async (path) => {
          const info = await readWorkspaceFileInfo(path);
          if (info?.url) URL.revokeObjectURL(info.url);
          return !info;
        }));
        return [doc.id, checks.some(Boolean)] as const;
      }));
      if (cancelled) return;
      setDocMissingImageMap(Object.fromEntries(entries));
    })();

    return () => {
      cancelled = true;
    };
  }, [pageDocs, showingFolders]);

	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				overflow: 'hidden',
				background: 'var(--c-canvas)',
			}}
		>
			<div
				style={{
					position: 'relative',
					width: '100%',
					height: '100%',
          maxWidth: stackSurfaceMaxWidth,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'stretch',
				}}
			>
				<div
					style={{
						position: 'relative',
            flex: 1,
            minWidth: 0,
						overflowY: 'auto',
						overflowX: 'hidden',
					}}
				>
					<div style={{ maxWidth: stackContentMaxWidth, margin: '0 auto', padding: '36px 40px 120px', fontFamily: 'inherit' }}>

						{/* Folder header */}
						<div style={{ marginBottom: 18 }}>
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 8,
									marginBottom: 8,
									fontSize: 12,
									fontWeight: 600,
									color: 'var(--c-text-lo)',
								}}
							>
								{showingFolders ? (
									<>
										<span>{breadcrumbLabel}</span>
										<span style={{ opacity: 0.55 }}>/</span>
										<span style={{ color: 'var(--c-text-hi)' }}>Folders</span>
									</>
								) : (
									<>
										<button
											type="button"
											onClick={handleOpenFolderBrowser}
											title="Browse folders"
											style={{ ...breadcrumbButtonStyle, color: 'var(--c-text-md)' }}
											onMouseEnter={(e) => {
												e.currentTarget.style.background = 'rgba(138,117,95,0.08)';
												e.currentTarget.style.color = 'var(--c-text-hi)';
											}}
											onMouseLeave={(e) => {
												e.currentTarget.style.background = 'transparent';
												e.currentTarget.style.color = 'var(--c-text-md)';
											}}
										>
											{breadcrumbLabel}
										</button>
										<span style={{ opacity: 0.55 }}>/</span>
										<span style={{ color: 'var(--c-text-hi)' }}>{pageName}</span>
									</>
								)}
							</div>
							<h1 style={{ fontSize: showingFolders ? 28 : 22, fontWeight: 650, letterSpacing: '-0.035em', margin: 0, color: 'var(--c-text-hi)', lineHeight: 1.08 }}>
								{showingFolders ? 'Folders' : pageName}
							</h1>
							<div style={{ marginTop: 6, fontSize: showingFolders ? 13 : 12, color: 'var(--c-text-lo)' }}>
								{showingFolders ? (
									<>
										{folderSummaries.length} {folderSummaries.length === 1 ? 'folder' : 'folders'}
										{activeFolderSummary?.lastEditedAt ? ` · active folder edited ${formatDate(activeFolderSummary.lastEditedAt)}` : ''}
									</>
								) : (
									<>
										{pageDocs.length} {pageDocs.length === 1 ? 'document' : 'documents'}
										{lastEditedAt ? ` · last edited ${formatDate(lastEditedAt)}` : ''}
									</>
								)}
							</div>
						</div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
            {showingFolders ? (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 38,
                  minWidth: 220,
                  padding: '0 10px',
                  background: 'var(--c-panel)',
                  border: '1px solid var(--c-border)',
                  borderRadius: 8,
                  gap: 8,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ flexShrink: 0, color: 'var(--c-text-lo)', opacity: 0.82 }}>
                  <circle cx="6.1" cy="6.1" r="3.9" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M9.05 9.05 12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  value={folderSearchQuery}
                  onChange={(e) => setFolderSearchQuery(e.target.value)}
                  placeholder="Search folders…"
                  aria-label="Search folders"
                  style={{
                    width: '100%',
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    color: 'var(--c-text-hi)',
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            ) : (
              <>
                {(showNoteFilter || searchQuery) && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      minHeight: 38,
                      minWidth: 220,
                      maxWidth: 260,
                      padding: '0 10px',
                      background: 'var(--c-panel)',
                      border: '1px solid var(--c-border)',
                      borderRadius: 8,
                    }}
                  >
                    <input
                      ref={noteFilterInputRef}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter notes…"
                      aria-label="Filter notes in this folder"
                      onBlur={() => {
                        if (!searchQuery.trim()) setShowNoteFilter(false);
                      }}
                      style={{
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        color: 'var(--c-text-hi)',
                        fontSize: 13,
                        fontWeight: 500,
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowNoteFilter(true);
                    requestAnimationFrame(() => noteFilterInputRef.current?.focus());
                  }}
                  title="Filter notes"
                  aria-label="Filter notes"
                  style={{
                    minHeight: 38,
                    padding: '0 12px',
                    borderRadius: 8,
                    border: `1px solid ${showNoteFilter || searchQuery ? 'rgba(184,119,80,0.34)' : 'var(--c-border)'}`,
                    background: showNoteFilter || searchQuery ? 'var(--c-hover)' : 'var(--c-panel)',
                    color: showNoteFilter || searchQuery ? 'var(--c-text-hi)' : 'var(--c-text-md)',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontFamily: 'inherit',
                  }}
                >
                  <span>Filter</span>
                  <span style={{ fontSize: 11, color: 'var(--c-text-lo)' }}>⌘F</span>
                </button>
              </>
            )}
            {showingFolders ? (
              <ToolbarMenuSelect<FolderSort>
                label="Sort"
                ariaLabel="Sort folders"
                value={folderSort}
                onChange={setFolderSort}
                minWidth={162}
                options={[
                  { value: 'updated', label: 'Newest' },
                  { value: 'custom', label: 'Folder order' },
                  { value: 'az', label: 'A-Z' },
                ]}
              />
            ) : (
              <ToolbarMenuSelect<StackSort>
                label=""
                ariaLabel="Sort notes"
                value={sort}
                onChange={handleSortChange}
                minWidth={136}
                options={[
                  { value: 'updated', label: 'Newest' },
                  { value: 'custom', label: 'Folder order' },
                  { value: 'az', label: 'A-Z' },
                  { value: 'tag', label: 'Tag' },
                ]}
              />
            )}
            {!showingFolders && (
              <ToolbarMenuSelect<string>
                label=""
                ariaLabel="Filter notes by tag"
                value={activeTagFilter}
                onChange={setActiveTagFilter}
                minWidth={132}
                options={[
                  { value: '__all__', label: 'All tags' },
                  ...availableTags.map((tag) => ({ value: tag, label: tag })),
                ]}
              />
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto', flexWrap: 'nowrap' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                minHeight: 38,
                padding: 4,
                borderRadius: 8,
                border: '1px solid var(--c-border)',
                background: 'var(--c-panel)',
              }}
            >
              {([
                { id: 'grid' as const, label: 'Grid view', icon: <IconFreeformPage /> },
                { id: 'list' as const, label: 'List view', icon: <IconStackPage /> },
              ]).map(({ id, label, icon }) => {
                const active = viewMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    title={label}
                    aria-label={label}
                    onClick={() => setViewMode(id)}
                    style={{
                      width: 38,
                      height: 30,
                      border: 'none',
                      borderRadius: 6,
                      background: active ? 'var(--c-canvas)' : 'transparent',
                      color: active ? 'var(--c-text-hi)' : 'var(--c-text-lo)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: active ? '0 1px 2px rgba(40,32,26,.08)' : 'none',
                      transition: 'background 120ms, color 120ms, box-shadow 120ms',
                    }}
                    onMouseEnter={(e) => {
                      if (active) return;
                      e.currentTarget.style.background = 'rgba(138,117,95,0.08)';
                      e.currentTarget.style.color = 'var(--c-text-hi)';
                    }}
                    onMouseLeave={(e) => {
                      if (active) return;
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--c-text-lo)';
                    }}
                  >
                    {icon}
                  </button>
                );
              })}
            </div>
            <div ref={newMenuRef} style={{ position: 'relative' }}>
              <button
                ref={newBtnRef}
                type="button"
                onClick={() => {
                  if (showingFolders) {
                    handleNewFolder();
                    return;
                  }
                  setNewMenuOpen((open) => !open);
                }}
                aria-haspopup={showingFolders ? undefined : 'menu'}
                aria-expanded={showingFolders ? undefined : newMenuOpen}
                style={{
                  minHeight: 42,
                  padding: '0 18px',
                  borderRadius: 8,
                  border: '1px solid var(--c-line)',
                  background: 'var(--c-line)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 1px 2px rgba(40,32,26,.08)',
                  transition: 'opacity 120ms, transform 120ms, box-shadow 120ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.88';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 5px 14px rgba(40,32,26,.16)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 1px 2px rgba(40,32,26,.08)';
                }}
              >
                <span style={{ fontSize: 20, lineHeight: 1, transform: 'translateY(-1px)' }}>+</span>
                <span>{showingFolders ? 'New folder' : 'New'}</span>
                {!showingFolders && <span style={{ fontSize: 11, transform: 'translateY(-1px)' }}>▾</span>}
              </button>
              {newMenuOpen && !showingFolders && (
                <div
                  role="menu"
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 'calc(100% + 6px)',
                    zIndex: 9100,
                    minWidth: 168,
                  }}
                  className="py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setNewMenuOpen(false);
                      handleNewDoc(newBtnRef.current);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                    style={{ fontFamily: 'inherit' }}
                  >
                    <IconDoc />
                    <span>Note</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleNewCanvasDoc}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                    style={{ fontFamily: 'inherit' }}
                  >
                    <IconCanvasDoc size={13} />
                    <span>Canvas</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

						{showingFolders && visibleFolders.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: contentGridColumns,
              gap: viewMode === 'grid' ? 16 : 16,
              justifyContent: viewMode === 'grid' ? 'start' : 'center',
              justifyItems: viewMode === 'grid' ? 'stretch' : 'center',
            }}
          >
            {visibleFolders.map((folder) => (
              <FolderCard
                key={folder.id}
                folder={folder}
                viewMode={viewMode}
                active={folder.id === pageId}
                onOpen={() => handleOpenFolder(folder.id)}
              />
            ))}
          </div>
        )}

						{!showingFolders && visibleDocs.length > 0 && (
							<div
								style={{
              display: 'grid',
              gridTemplateColumns: contentGridColumns,
              gap: viewMode === 'grid' ? 14 : 16,
              justifyContent: viewMode === 'grid' ? 'start' : 'center',
              justifyItems: viewMode === 'grid' ? 'stretch' : 'center',
            }}
							>
								{visibleDocs.map((doc) => (
									<StackCard
										key={doc.id}
										doc={doc}
										viewMode={viewMode}
										active={false}
                    hasMissingImages={!!docMissingImageMap[doc.id]}
                    compactGrid={false}
										onOpen={(rect) => handleOpen(doc, rect)}
										onContextOpen={(targetDoc, rect, x, y) => {
											setNoteMenu({
                    docId: targetDoc.id,
                    x,
                    y,
                    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                  });
                  setNoteMenuExportOpen(false);
                }}
                onToggleFavorite={() => toggleFavoriteDocument(doc.id)}
                isRenaming={renamingDocId === doc.id}
                renameDraft={renamingDocId === doc.id ? renameDraft : doc.title}
                onRenameDraftChange={setRenameDraft}
                onRenameCommit={commitRename}
                onRenameCancel={cancelRename}
									/>
								))}
							</div>
						)}

						{showingFolders && folderSummaries.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '96px 20px',
              color: 'var(--c-text-lo)',
              fontSize: 14,
              border: '1px dashed var(--c-border)',
              borderRadius: 24,
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            No folders yet. Create one to start organizing your notes.
          </div>
        )}
						{showingFolders && folderSummaries.length > 0 && visibleFolders.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '72px 20px',
              color: 'var(--c-text-lo)',
              fontSize: 14,
              border: '1px dashed var(--c-border)',
              borderRadius: 24,
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            No folders match this search.
          </div>
        )}
						{!showingFolders && pageDocs.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '96px 20px',
              color: 'var(--c-text-lo)',
              fontSize: 14,
              border: '1px dashed var(--c-border)',
              borderRadius: 24,
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            Nothing here yet. Press <strong>⌘N</strong> or create a new document from this folder.
          </div>
        )}
						{!showingFolders && pageDocs.length > 0 && visibleDocs.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '72px 20px',
              color: 'var(--c-text-lo)',
              fontSize: 14,
              border: '1px dashed var(--c-border)',
              borderRadius: 24,
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            No documents match this filter.
          </div>
        )}
					</div>
				</div>
				<div
					style={{
						position: 'relative',
						width: panelOpen ? stackPanelWidth : 0,
						transition: 'width 200ms ease-out',
						borderLeft: panelOpen ? '1px solid var(--c-border)' : 'none',
						boxShadow: panelOpen ? '-10px 0 28px rgba(25,18,14,0.14)' : 'none',
						background: 'var(--c-panel)',
						overflow: 'hidden',
						zIndex: 30,
						pointerEvents: panelOpen ? 'auto' : 'none',
						flexShrink: 0,
					}}
				>
          {panelOpen && (
            <div
              aria-hidden="true"
              title="Drag to resize panel"
              style={{
                position: 'absolute',
                top: 0,
                left: -7,
                bottom: 0,
                width: 14,
                cursor: 'col-resize',
                zIndex: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                panelResizeRef.current = true;
                const startX = e.clientX;
                const startW = stackPanelWidth;
                const onMove = (ev: MouseEvent) => {
                  if (!panelResizeRef.current) return;
                  const next = Math.max(340, Math.min(760, startW - (ev.clientX - startX)));
                  setStackPanelWidth(next);
                };
                const onUp = () => {
                  panelResizeRef.current = false;
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
            >
              <div
                style={{
                  width: 3,
                  height: 56,
                  borderRadius: 999,
                  background: 'rgba(138,117,95,0.34)',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.32)',
                }}
              />
            </div>
          )}
					{panelOpen && activePanelDoc && (
						<DocumentMode
							documentId={activePanelDoc.id}
							panelMode
							onClosePanel={handleClosePanel}
							onExpand={handleExpandPanelDoc}
							onOpenDocument={setOpenPanelDocId}
							headerBreadcrumb={{
								workspaceLabel: workspaceBreadcrumbLabel,
								folderLabel: pageName,
								noteLabel: activePanelDoc.title || 'Untitled',
								onFolderClick: () => {
									setBrowserMode('notes');
									setOpenPanelDocId(null);
								},
							}}
						/>
					)}
				</div>
			</div>
			{noteMenu && activeMenuDoc && (
				<StackNoteContextMenu
					menu={noteMenu}
					doc={activeMenuDoc}
          menuRef={noteMenuRef}
          exportRef={noteMenuExportRef}
          exportOpen={noteMenuExportOpen}
          setExportOpen={setNoteMenuExportOpen}
          onOpen={() => handleOpenFromMenu(noteMenu)}
          onOpenFullPage={() => handleOpenFullPage(noteMenu)}
          onToggleFavorite={() => {
            toggleFavoriteDocument(activeMenuDoc.id);
            setNoteMenu(null);
            setNoteMenuExportOpen(false);
          }}
          onRename={() => beginRename(activeMenuDoc)}
          onDuplicate={() => duplicateDocument(activeMenuDoc)}
          onExportMarkdown={() => {
            exportDocumentAsMarkdownFile(activeMenuDoc);
            setNoteMenu(null);
            setNoteMenuExportOpen(false);
          }}
          onExportPdf={() => {
            exportDocumentAsPdf(activeMenuDoc);
            setNoteMenu(null);
            setNoteMenuExportOpen(false);
          }}
          onExportText={() => {
            exportDocumentAsTextFile(activeMenuDoc);
            setNoteMenu(null);
            setNoteMenuExportOpen(false);
          }}
          onReveal={() => {
            if (activeMenuDoc.linkedFile) void revealInFinder(activeMenuDoc.linkedFile);
            setNoteMenu(null);
            setNoteMenuExportOpen(false);
          }}
          onDelete={() => handleDelete(activeMenuDoc)}
        />
			)}
			<MobileNewNoteButton
				ref={mobileNewBtnRef}
				onClick={() => showingFolders ? handleNewFolder() : handleNewDoc(mobileNewBtnRef.current)}
				label={showingFolders ? 'New folder' : 'New note'}
			/>
		</div>
	);
}

interface StackNoteContextMenuProps {
  menu: StackNoteMenuState;
  doc: Document;
  menuRef: RefObject<HTMLDivElement>;
  exportRef: RefObject<HTMLDivElement>;
  exportOpen: boolean;
  setExportOpen: Dispatch<SetStateAction<boolean>>;
  onOpen: () => void;
  onOpenFullPage: () => void;
  onToggleFavorite: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onExportMarkdown: () => void;
  onExportPdf: () => void;
  onExportText: () => void;
  onReveal: () => void;
  onDelete: () => void;
}

function StackNoteContextMenu({
  menu,
  doc,
  menuRef,
  exportRef,
  exportOpen,
  setExportOpen,
  onOpen,
  onOpenFullPage,
  onToggleFavorite,
  onRename,
  onDuplicate,
  onExportMarkdown,
  onExportPdf,
  onExportText,
  onReveal,
  onDelete,
}: StackNoteContextMenuProps) {
  const MENU_W = 188;
  const left = Math.min(menu.x, window.innerWidth - MENU_W - 8);
  const top = Math.min(menu.y, window.innerHeight - 236);
  const exportMenuLeft = Math.min(left + MENU_W - 8, window.innerWidth - 172 - 8);
  const exportMenuTop = Math.min(top + 96, window.innerHeight - 92);
  const isCanvasDoc = doc.docType === 'canvas';
  const itemStyle: CSSProperties = {
    fontFamily: 'inherit',
  };
  const sep = <div style={{ height: 1, background: 'var(--c-border)', margin: '3px 0' }} />;

  const MenuButton = ({
    children,
    onClick,
    danger = false,
    suffix,
    onMouseEnter,
  }: {
    children: ReactNode;
    onClick: () => void;
    danger?: boolean;
    suffix?: ReactNode;
    onMouseEnter?: () => void;
  }) => (
    <button
      className={[
        'w-full flex items-center justify-between px-3 py-1.5 text-[12px] rounded transition-colors text-left',
        danger
          ? 'hover:bg-[rgba(239,68,68,0.12)]'
          : 'text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]',
      ].join(' ')}
      style={{ ...itemStyle, color: danger ? '#f87171' : undefined }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <span>{children}</span>
      {suffix && <span className="text-[10px] ml-3 text-[var(--c-text-off)]">{suffix}</span>}
    </button>
  );

  return (
    <>
      <div
        ref={menuRef}
        style={{ position: 'fixed', left, top, zIndex: 9100, minWidth: MENU_W }}
        className="py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <MenuButton onClick={onOpen} suffix="↵">Open</MenuButton>
        <MenuButton onClick={onOpenFullPage}>Open as full page</MenuButton>
        {sep}
        <MenuButton onClick={onToggleFavorite} suffix={<span style={{ color: doc.isFavorite ? '#d6a045' : 'var(--c-text-off)' }}>★</span>}>
          {doc.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
        </MenuButton>
        <MenuButton onClick={onRename}>Rename</MenuButton>
        <MenuButton onClick={onDuplicate}>Duplicate</MenuButton>
        {sep}
        {!isCanvasDoc && (
          <>
            <MenuButton onClick={onExportMarkdown}>Export .md</MenuButton>
            <MenuButton onClick={() => setExportOpen((current) => !current)} onMouseEnter={() => setExportOpen(true)} suffix="›">
              Export as
            </MenuButton>
          </>
        )}
        {(IS_TAURI && doc.linkedFile) && (
          <>
            {sep}
            <MenuButton onClick={onReveal}>Show in Folder</MenuButton>
          </>
        )}
        {sep}
        <MenuButton onClick={onDelete} danger suffix="⌫">Delete</MenuButton>
      </div>

      {exportOpen && !isCanvasDoc && (
        <div
          ref={exportRef}
          style={{ position: 'fixed', left: exportMenuLeft, top: exportMenuTop, zIndex: 9101, minWidth: 172 }}
          className="py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseLeave={() => setExportOpen(false)}
        >
          <MenuButton onClick={onExportPdf}>PDF…</MenuButton>
          <MenuButton onClick={onExportText}>Plain text (.txt)</MenuButton>
        </div>
      )}
    </>
  );
}

const NewNoteButton = forwardRef<HTMLDivElement, { onClick: () => void; className?: string }>(({ onClick, className }, ref) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      ref={ref}
      role="button"
      data-side-panel-open-target="true"
      className={className}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        minHeight: 48,
        padding: '0 18px',
        marginBottom: 18,
        background: hovered
          ? 'color-mix(in srgb, var(--c-line) 20%, var(--c-panel))'
          : 'color-mix(in srgb, var(--c-line) 14%, var(--c-panel))',
        border: '1px solid rgba(184,119,80,0.36)',
        borderRadius: 10,
        boxShadow: hovered ? '0 10px 24px rgba(0,0,0,0.16)' : '0 6px 18px rgba(0,0,0,0.1)',
        color: 'var(--c-line)',
        fontSize: 13,
        fontWeight: 800,
        fontFamily: 'inherit',
        cursor: 'pointer',
        transition: 'background 120ms, box-shadow 120ms, transform 120ms',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span>New note</span>
    </div>
  );
});
NewNoteButton.displayName = 'NewNoteButton';

const MobileNewNoteButton = forwardRef<HTMLButtonElement, { onClick: () => void; label: string }>(({ onClick, label }, ref) => (
  <button
    ref={ref}
    type="button"
    className="stack-new-note-mobile"
    onClick={onClick}
    aria-label={label}
  >
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M7.5 2.2v10.6M2.2 7.5h10.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
    <span>{label}</span>
  </button>
));
MobileNewNoteButton.displayName = 'MobileNewNoteButton';
