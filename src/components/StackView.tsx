import { forwardRef, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react';
import { useBoardStore } from '../store/boardStore';
import { Document } from '../types';
import { IconStar } from './icons';
import { IS_TAURI, revealInFinder } from '../utils/workspaceManager';
import { exportDocumentAsMarkdownFile, exportDocumentAsPdf, exportDocumentAsTextFile } from '../utils/documentExport';

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

interface StackCardProps {
  doc: Document;
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
  const preview = useMemo(() => stripHtml(doc.content).slice(0, 300), [doc.content]);
  const [hovered, setHovered] = useState(false);
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
        gap: 6,
        padding: '14px 18px',
        marginBottom: 8,
        background: hovered ? 'var(--c-hover)' : 'var(--c-panel)',
        border: `1px solid ${hovered ? 'rgba(184,119,80,0.3)' : 'var(--c-border)'}`,
        borderRadius: 10,
        cursor: isRenaming ? 'text' : 'pointer',
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
              flex: 1,
              minWidth: 0,
              height: 28,
              padding: '0 8px',
              background: 'var(--c-canvas)',
              border: '1px solid rgba(184,119,80,0.32)',
              borderRadius: 6,
              color: 'var(--c-text-hi)',
              fontSize: 15,
              fontWeight: 600,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
        ) : (
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
            width: 28,
            height: 28,
            border: 'none',
            borderRadius: 7,
            background: 'transparent',
            color: doc.isFavorite ? '#d6a045' : 'var(--c-text-lo)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <IconStar filled={!!doc.isFavorite} size={14} />
        </button>
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

type StackNoteMenuState = {
  docId: string;
  x: number;
  y: number;
  rect: { left: number; top: number; width: number; height: number };
};

export default function StackView({ pageId, pageName }: Props) {
  const documents = useBoardStore((s) => s.documents);
  const pages = useBoardStore((s) => s.pages);
  const addDocument = useBoardStore((s) => s.addDocument);
  const updateDocument = useBoardStore((s) => s.updateDocument);
  const deleteDocument = useBoardStore((s) => s.deleteDocument);
  const ensureDocumentNode = useBoardStore((s) => s.ensureDocumentNode);
  const openDocumentWithMorph = useBoardStore((s) => s.openDocumentWithMorph);
  const setDocViewMode = useBoardStore((s) => s.setDocViewMode);
  const setPageNoteSort = useBoardStore((s) => s.setPageNoteSort);
  const toggleFavoriteDocument = useBoardStore((s) => s.toggleFavoriteDocument);
  const page = pages.find((entry) => entry.id === pageId);
  const [sort, setSort] = useState<StackSort>(() => page?.noteSort === 'custom' ? 'custom' : 'updated');
  const [noteMenu, setNoteMenu] = useState<StackNoteMenuState | null>(null);
  const [noteMenuExportOpen, setNoteMenuExportOpen] = useState(false);
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const newBtnRef = useRef<HTMLDivElement>(null);
  const mobileNewBtnRef = useRef<HTMLButtonElement>(null);
  const noteMenuRef = useRef<HTMLDivElement>(null);
  const noteMenuExportRef = useRef<HTMLDivElement>(null);

  const pageDocs = useMemo(() => {
    const filtered = documents.filter((d) => d.pageId === pageId);
    if (sort === 'az') return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'tag') return [...filtered].sort((a, b) => ((a.tags?.[0] ?? 'z').localeCompare(b.tags?.[0] ?? 'z')));
    return sortDocumentsForPage(filtered, sort);
  }, [documents, pageId, sort]);

  useEffect(() => {
    setSort(page?.noteSort === 'custom' ? 'custom' : 'updated');
  }, [page?.noteSort, pageId]);

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

  const handleOpen = (docId: string, rect: DOMRect) => {
    openDocumentWithMorph(docId, { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  };

  const handleOpenFromMenu = (menu: StackNoteMenuState) => {
    openDocumentWithMorph(menu.docId, menu.rect);
    setNoteMenu(null);
    setNoteMenuExportOpen(false);
  };

  const handleOpenFullPage = (menu: StackNoteMenuState) => {
    setDocViewMode('fullscreen');
    openDocumentWithMorph(menu.docId, menu.rect);
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
    ensureDocumentNode(id, pageId);
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
    ensureDocumentNode(id, pageId);
    const rect = sourceEl?.getBoundingClientRect();
    openDocumentWithMorph(id, rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined);
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

  const activeMenuDoc = noteMenu ? documents.find((doc) => doc.id === noteMenu.docId) : null;

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
            {([
              { id: 'updated' as const, label: 'Newest' },
              { id: 'custom' as const, label: 'Page order' },
              { id: 'az' as const, label: 'A-Z' },
              { id: 'tag' as const, label: 'Tag' },
            ]).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => handleSortChange(id)}
                style={{
                  padding: '3px 9px',
                  fontSize: 11,
                  fontFamily: 'inherit',
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  background: sort === id ? 'var(--c-canvas)' : 'transparent',
                  color: sort === id ? 'var(--c-text-hi)' : 'var(--c-text-md)',
                  boxShadow: sort === id ? '0 1px 2px rgba(40,32,26,.08)' : 'none',
                  transition: 'background 100ms',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* New note button */}
        <NewNoteButton ref={newBtnRef} onClick={() => handleNewDoc(newBtnRef.current)} className="stack-new-note-top" />

        {/* Doc cards */}
        {pageDocs.map((doc) => (
          <StackCard
            key={doc.id}
            doc={doc}
            onOpen={(rect) => handleOpen(doc.id, rect)}
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

        {pageDocs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--c-text-lo)', fontSize: 13 }}>
            Nothing here yet. Press <strong>⌘N</strong> to start a note.
          </div>
        )}
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
      <MobileNewNoteButton ref={mobileNewBtnRef} onClick={() => handleNewDoc(mobileNewBtnRef.current)} />
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
        <MenuButton onClick={onExportMarkdown}>Export .md</MenuButton>
        <MenuButton onClick={() => setExportOpen((current) => !current)} onMouseEnter={() => setExportOpen(true)} suffix="›">
          Export as
        </MenuButton>
        {(IS_TAURI && doc.linkedFile) && (
          <>
            {sep}
            <MenuButton onClick={onReveal}>Show in Folder</MenuButton>
          </>
        )}
        {sep}
        <MenuButton onClick={onDelete} danger suffix="⌫">Delete</MenuButton>
      </div>

      {exportOpen && (
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

const MobileNewNoteButton = forwardRef<HTMLButtonElement, { onClick: () => void }>(({ onClick }, ref) => (
  <button
    ref={ref}
    type="button"
    className="stack-new-note-mobile"
    onClick={onClick}
    aria-label="New note"
  >
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M7.5 2.2v10.6M2.2 7.5h10.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
    <span>New note</span>
  </button>
));
MobileNewNoteButton.displayName = 'MobileNewNoteButton';
