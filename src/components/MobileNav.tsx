import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBoardStore } from '../store/boardStore';
import type { Document, PageMeta } from '../types';
import { IconArrowLeft, IconCanvasDoc, IconCloud, IconDoc, IconFolder, IconFreeformPage, IconPlus, IconSearch, IconStackPage, IconUser } from './icons';
import CanvasTemplatePicker from './CanvasTemplatePicker';
import { CANVAS_TEMPLATES, instantiateCanvasTemplate, type Template } from '../templates';

type MobileTab = 'folders' | 'search' | 'sync' | 'account';

interface MobileNavProps {
  onOpenSync: () => void;
  onOpenAccount: () => void;
}

function isCanvasDocument(doc: Document): boolean {
  return doc.docType === 'canvas';
}

function sortDocuments(docs: Document[], sortMode: PageMeta['noteSort'] = 'updated'): Document[] {
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

function formatDate(ms?: number | null): string {
  if (!ms) return '--';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function MobileNav({ onOpenSync, onOpenAccount }: MobileNavProps) {
  const { user, isLoading } = useAuth();
  const boardTitle = useBoardStore((s) => s.boardTitle);
  const workspaceName = useBoardStore((s) => s.workspaceName);
  const pages = useBoardStore((s) => s.pages);
  const activePageId = useBoardStore((s) => s.activePageId);
  const documents = useBoardStore((s) => s.documents);
  const cloudBoardId = useBoardStore((s) => s.cloudBoardId);
  const cloudBoardTitle = useBoardStore((s) => s.cloudBoardTitle);
  const cloudSyncedAt = useBoardStore((s) => s.cloudSyncedAt);
  const lastLocalSavedAt = useBoardStore((s) => s.lastLocalSavedAt);
  const addDocument = useBoardStore((s) => s.addDocument);
  const addCanvasDocument = useBoardStore((s) => s.addCanvasDocument);
  const openDocument = useBoardStore((s) => s.openDocument);
  const openCanvasDocument = useBoardStore((s) => s.openCanvasDocument);
  const switchPage = useBoardStore((s) => s.switchPage);

  const [activeTab, setActiveTab] = useState<MobileTab>('folders');
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [folderView, setFolderView] = useState<'list' | 'grid'>('list');
  const [query, setQuery] = useState('');
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [canvasPickerPageId, setCanvasPickerPageId] = useState<string | null>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!newMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (newMenuRef.current?.contains(event.target as Node)) return;
      setNewMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [newMenuOpen]);

  const folderPages = useMemo(() => {
    const canvasPageIds = new Set(documents.filter((doc) => doc.docType === 'canvas' && doc.canvasPageId).map((doc) => doc.canvasPageId));
    return pages.filter((page) => !page.isCanvasDocument && !canvasPageIds.has(page.id));
  }, [documents, pages]);

  const selectedPage = selectedPageId
    ? folderPages.find((page) => page.id === selectedPageId) ?? null
    : null;

  const title = selectedPage?.name || workspaceName || boardTitle.trim() || 'DevBoard';

  const docsForPage = (pageId: string) => {
    const page = pages.find((entry) => entry.id === pageId);
    return sortDocuments(documents.filter((doc) => doc.pageId === pageId), page?.noteSort ?? 'updated');
  };

  const openDoc = (doc: Document) => {
    if (isCanvasDocument(doc)) {
      openCanvasDocument(doc.id);
      return;
    }
    if (doc.pageId && doc.pageId !== activePageId) switchPage(doc.pageId);
    openDocument(doc.id);
  };

  const createNote = () => {
    setNewMenuOpen(false);
    const currentPage = pages.find((entry) => entry.id === activePageId);
    const fallbackPageId = currentPage?.isCanvasDocument ? (currentPage.parentPageId ?? activePageId) : activePageId;
    const pageId = selectedPage?.id ?? fallbackPageId;
    if (pageId !== activePageId) switchPage(pageId);
    const existing = docsForPage(pageId);
    const id = addDocument({
      title: '',
      content: '',
      pageId,
      orderIndex: existing.length,
    });
    openDocument(id);
  };

  const createCanvas = () => {
    setNewMenuOpen(false);
    const currentPage = pages.find((entry) => entry.id === activePageId);
    const fallbackPageId = currentPage?.isCanvasDocument ? (currentPage.parentPageId ?? activePageId) : activePageId;
    const pageId = selectedPage?.id ?? fallbackPageId;
    if (CANVAS_TEMPLATES.length > 0) {
      setCanvasPickerPageId(pageId);
    } else {
      addCanvasDocument(pageId);
    }
  };

  const handleSelectCanvasTemplate = (template: Template | null) => {
    const pageId = canvasPickerPageId ?? undefined;
    setCanvasPickerPageId(null);
    const nodes = template ? instantiateCanvasTemplate(template) : [];
    const title = template && template.id !== 'scratch' ? template.name : undefined;
    addCanvasDocument(pageId, { nodes, title });
  };

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return documents.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);
    return documents
      .filter((doc) => {
        const haystack = `${doc.title} ${stripHtml(doc.content)}`.toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 20);
  }, [documents, query]);

  const accountLabel = String(user?.user_metadata?.user_name
    ?? user?.user_metadata?.preferred_username
    ?? user?.user_metadata?.name
    ?? user?.email
    ?? 'Local account');
  const accountInitial = accountLabel.trim().charAt(0).toUpperCase() || 'D';
  const hasUnsyncedChanges = !!user && !!cloudBoardId && !!lastLocalSavedAt && !!cloudSyncedAt && lastLocalSavedAt > cloudSyncedAt + 1000;
  const syncLabel = isLoading
    ? 'Checking sync'
    : hasUnsyncedChanges
      ? 'Unsynced changes'
      : cloudBoardId
        ? 'Synced'
        : 'Local only';

  const renderFolders = () => {
    if (selectedPage) {
      const docs = docsForPage(selectedPage.id);
      return (
        <div className="mobile-nav-list">
          <div className="mobile-nav-subtle">
            {docs.length} {docs.length === 1 ? 'document' : 'documents'}
            {docs[0]?.updatedAt ? ` · last edited ${formatDate(docs[0].updatedAt)}` : ''}
          </div>
          {docs.length === 0 ? (
            <div className="mobile-nav-empty">No documents yet.</div>
          ) : docs.map((doc) => (
            <button key={doc.id} type="button" className="mobile-nav-file-row" onClick={() => openDoc(doc)}>
              <span className="mobile-nav-file-icon">{isCanvasDocument(doc) ? '◇' : <IconDoc />}</span>
              <span className="mobile-nav-file-title">{doc.title || (isCanvasDocument(doc) ? 'Untitled canvas' : 'Untitled note')}</span>
              <span className="mobile-nav-file-date">{formatDate(doc.updatedAt)}</span>
            </button>
          ))}
        </div>
      );
    }

    return (
      <div className={`mobile-nav-folder-list is-${folderView}`}>
        {folderPages.map((page) => {
          const docs = docsForPage(page.id);
          const noteCount = docs.filter((doc) => !isCanvasDocument(doc)).length;
          const canvasCount = docs.filter(isCanvasDocument).length;
          const latest = docs[0]?.updatedAt ?? null;
          return (
            <button key={page.id} type="button" className="mobile-nav-folder-card" onClick={() => setSelectedPageId(page.id)}>
              <span className="mobile-nav-folder-icon"><IconFolder size={22} /></span>
              <span className="mobile-nav-folder-main">
                <span className="mobile-nav-folder-name">{page.name}</span>
                <span className="mobile-nav-folder-meta">
                  {noteCount === 0 && canvasCount === 0
                    ? 'Empty'
                    : `${noteCount} ${noteCount === 1 ? 'note' : 'notes'}${canvasCount ? ` · ${canvasCount} canvas` : ''}`}
                </span>
              </span>
              <span className="mobile-nav-folder-date">{docs.length} · {formatDate(latest)}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderSearch = () => (
    <div className="mobile-nav-search-view">
      <label className="mobile-nav-search-box">
        <IconSearch size={16} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes and canvases" />
      </label>
      <div className="mobile-nav-list">
        {searchResults.map((doc) => (
          <button key={doc.id} type="button" className="mobile-nav-file-row" onClick={() => openDoc(doc)}>
            <span className="mobile-nav-file-icon">{isCanvasDocument(doc) ? '◇' : <IconDoc />}</span>
            <span className="mobile-nav-file-title">{doc.title || (isCanvasDocument(doc) ? 'Untitled canvas' : 'Untitled note')}</span>
            <span className="mobile-nav-file-date">{formatDate(doc.updatedAt)}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderSync = () => (
    <div className="mobile-nav-panel">
      <span className="mobile-nav-panel-icon"><IconCloud size={20} /></span>
      <h2>{syncLabel}</h2>
      <p>{cloudBoardId ? (cloudBoardTitle || 'This workspace is linked to cloud sync.') : 'This workspace is currently local on this device.'}</p>
      <button type="button" onClick={onOpenSync}>Open Sync</button>
    </div>
  );

  const renderAccount = () => (
    <div className="mobile-nav-panel">
      <span className="mobile-nav-avatar">{accountInitial}</span>
      <h2>{accountLabel}</h2>
      <p>{user ? 'Manage account and cloud workspaces.' : 'Sign in to use cloud workspaces across devices.'}</p>
      <button type="button" onClick={onOpenAccount}>{user ? 'Manage Account' : 'Sign In'}</button>
    </div>
  );

  const content = activeTab === 'search'
    ? renderSearch()
    : activeTab === 'sync'
      ? renderSync()
      : activeTab === 'account'
        ? renderAccount()
        : renderFolders();

  const tabButton = (tab: MobileTab, icon: ReactNode, label: string) => (
    <button
      type="button"
      className={`mobile-nav-tab ${activeTab === tab ? 'is-active' : ''}`}
      onClick={() => {
        setActiveTab(tab);
        if (tab !== 'folders') setSelectedPageId(null);
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <section className="mobile-nav-shell" aria-label="Mobile navigation">
      <CanvasTemplatePicker
        open={canvasPickerPageId !== null}
        onClose={() => setCanvasPickerPageId(null)}
        onSelect={handleSelectCanvasTemplate}
      />
      <header className="mobile-nav-topbar">
        <div className="mobile-nav-title-group">
          {activeTab === 'folders' && selectedPage && (
            <button type="button" className="mobile-nav-back" aria-label="Back to folders" onClick={() => setSelectedPageId(null)}>
              <IconArrowLeft size={20} />
            </button>
          )}
          <h1>{activeTab === 'search' ? 'Search' : activeTab === 'sync' ? 'Sync' : activeTab === 'account' ? 'Account' : title}</h1>
        </div>
      </header>
      {activeTab === 'folders' && !selectedPage && (
        <div className="mobile-nav-view-toggle" role="group" aria-label="Folder view">
          <button
            type="button"
            className={folderView === 'list' ? 'is-active' : ''}
            aria-pressed={folderView === 'list'}
            aria-label="List view"
            onClick={() => setFolderView('list')}
            title="List view"
          >
            <IconStackPage />
          </button>
          <button
            type="button"
            className={folderView === 'grid' ? 'is-active' : ''}
            aria-pressed={folderView === 'grid'}
            aria-label="Grid view"
            onClick={() => setFolderView('grid')}
            title="Grid view"
          >
            <IconFreeformPage />
          </button>
        </div>
      )}
      <main className="mobile-nav-content">
        {content}
      </main>
      <nav className="mobile-nav-bottom" aria-label="Primary">
        {tabButton('folders', <IconFolder size={22} />, 'Folders')}
        {tabButton('search', <IconSearch size={22} />, 'Search')}
        <div ref={newMenuRef} className="mobile-nav-new-wrap">
          {newMenuOpen && (
            <div className="mobile-nav-new-menu" role="menu">
              <button type="button" role="menuitem" onClick={createNote}>
                <IconDoc />
                <span>New note</span>
              </button>
              <button type="button" role="menuitem" onClick={createCanvas}>
                <IconCanvasDoc size={15} />
                <span>New canvas</span>
              </button>
            </div>
          )}
          <button
            type="button"
            className="mobile-nav-new"
            aria-label="New"
            aria-haspopup="menu"
            aria-expanded={newMenuOpen}
            onClick={() => setNewMenuOpen((v) => !v)}
          >
            <IconPlus size={28} />
            <span>New</span>
          </button>
        </div>
        {tabButton('sync', <IconCloud size={22} />, 'Sync')}
        {tabButton('account', <IconUser size={22} />, 'Account')}
      </nav>
    </section>
  );
}
