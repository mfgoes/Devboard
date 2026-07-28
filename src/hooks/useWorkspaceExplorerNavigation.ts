import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import type React from 'react';
import type { Document, PageMeta } from '../types';
import { TreeEntry, flatVisible, isOpenableEntry, isVisibleInAssets } from '../components/explorer/fileTreeUtils';
import { isCanvasDocument } from '../components/explorer/workspaceExplorerUtils';

type ExplorerKeyboardItem =
  | { kind: 'page'; pageId: string }
  | { kind: 'doc'; pageId: string; docId: string }
  | { kind: 'asset'; path: string[] };

interface UseWorkspaceExplorerNavigationArgs {
  tree: TreeEntry[];
  cloudTree: TreeEntry[];
  cloudOnlyWorkspace: boolean;
  advancedFilesVisible: boolean;
  unopenableFilesVisible: boolean;
  pages: PageMeta[];
  documents: Document[];
  activePageId: string;
  pageDocs: Map<string, Document[]>;
  folderPages: PageMeta[];
  pagesSectionOpen: boolean;
  assetsSectionOpen: boolean;
  collapsedPageIds: Record<string, boolean>;
  panelRef: RefObject<HTMLDivElement>;
  visibleEntriesRef: React.MutableRefObject<TreeEntry[]>;
  showFilePreview: (entry: TreeEntry, anchorY: number) => void;
  clearPreview: () => void;
  clearPagePreview: () => void;
  switchPage: (pageId: string) => void;
  openCanvasDocument: (docId: string) => void;
  openDocument: (docId: string) => void;
  openFile: (entry: TreeEntry) => void;
  placeFile: (entry: TreeEntry) => void;
  handleAssetToggle: (path: string[]) => void;
  startDelete: (entry: TreeEntry) => void;
  startRename: (entry: TreeEntry) => void;
}

export function useWorkspaceExplorerNavigation({
  tree,
  cloudTree,
  cloudOnlyWorkspace,
  advancedFilesVisible,
  unopenableFilesVisible,
  pages,
  documents,
  activePageId,
  pageDocs,
  folderPages,
  pagesSectionOpen,
  assetsSectionOpen,
  collapsedPageIds,
  panelRef,
  visibleEntriesRef,
  showFilePreview,
  clearPreview,
  clearPagePreview,
  switchPage,
  openCanvasDocument,
  openDocument,
  openFile,
  placeFile,
  handleAssetToggle,
  startDelete,
  startRename,
}: UseWorkspaceExplorerNavigationArgs) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);

  const flattenTree = useCallback((entries: TreeEntry[]): TreeEntry[] => {
    const result: TreeEntry[] = [];
    for (const entry of entries) {
      result.push(entry);
      if (entry.children) result.push(...flattenTree(entry.children));
    }
    return result;
  }, []);

  const assetTree = useMemo(
    () => {
      const sourceTree = cloudOnlyWorkspace ? cloudTree : tree;
      if (cloudOnlyWorkspace) return sourceTree;
      return advancedFilesVisible ? sourceTree : sourceTree.filter(isVisibleInAssets);
    },
    [advancedFilesVisible, cloudOnlyWorkspace, cloudTree, tree],
  );

  const assetSearchResults = useMemo(
    () => {
      if (!searchQuery.trim()) return null;
      const results = flattenTree(cloudOnlyWorkspace ? cloudTree : tree)
        .filter((entry) => entry.name.toLowerCase().includes(searchQuery.toLowerCase()));
      if (cloudOnlyWorkspace || advancedFilesVisible) return results;
      return results.filter(isVisibleInAssets);
    },
    [advancedFilesVisible, cloudOnlyWorkspace, cloudTree, flattenTree, searchQuery, tree],
  );

  const assetVisibleEntries = useMemo(
    () => {
      const base = assetSearchResults ?? flatVisible(assetTree);
      // Filtering here (not in the row component) keeps keyboard nav in step
      // with what is actually on screen.
      return unopenableFilesVisible ? base : base.filter(isOpenableEntry);
    },
    [assetSearchResults, assetTree, unopenableFilesVisible],
  );

  const keyboardItems = useMemo<ExplorerKeyboardItem[]>(() => {
    const items: ExplorerKeyboardItem[] = [];
    const activePage = pages.find((entry) => entry.id === activePageId);
    if (folderPages.length > 0 && pagesSectionOpen) {
      for (const page of folderPages) {
        items.push({ kind: 'page', pageId: page.id });
        const shouldExpand = page.id === activePageId || activePage?.parentPageId === page.id;
        const isCollapsed = collapsedPageIds[page.id] ?? !shouldExpand;
        if (isCollapsed) continue;
        const docsForPage = pageDocs.get(page.id) ?? [];
        for (const doc of docsForPage) items.push({ kind: 'doc', pageId: page.id, docId: doc.id });
      }
    }
    if (assetsSectionOpen) {
      for (const entry of assetVisibleEntries) items.push({ kind: 'asset', path: entry.path });
    }
    return items;
  }, [activePageId, assetVisibleEntries, assetsSectionOpen, collapsedPageIds, folderPages, pageDocs, pages, pagesSectionOpen]);

  useEffect(() => {
    visibleEntriesRef.current = assetVisibleEntries;
  }, [assetVisibleEntries, visibleEntriesRef]);

  const focusedItem = focusedIdx !== null ? keyboardItems[focusedIdx] ?? null : null;
  const focusedPageId = focusedItem?.kind === 'page' ? focusedItem.pageId : null;
  const focusedDocId = focusedItem?.kind === 'doc' ? focusedItem.docId : null;

  useEffect(() => {
    setFocusedIdx(null);
    clearPagePreview();
  }, [clearPagePreview, searchQuery]);

  useEffect(() => {
    if (focusedIdx === null) return;
    if (keyboardItems[focusedIdx]) return;
    setFocusedIdx(keyboardItems.length ? Math.min(focusedIdx, keyboardItems.length - 1) : null);
  }, [focusedIdx, keyboardItems]);

  useEffect(() => {
    const activeCanvasDoc = documents.find((doc) => doc.docType === 'canvas' && doc.canvasPageId === activePageId);
    if (!activeCanvasDoc) return;
    if (focusedItem?.kind === 'doc' && focusedItem.docId === activeCanvasDoc.id) return;
    const idx = keyboardItems.findIndex((item) => item.kind === 'doc' && item.docId === activeCanvasDoc.id);
    if (idx !== -1) setFocusedIdx(idx);
  }, [activePageId, documents, focusedItem, keyboardItems]);

  useEffect(() => {
    if (focusedIdx === null) return;
    const el = panelRef.current?.querySelector<HTMLElement>('[data-focused="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusedIdx, panelRef]);

  useEffect(() => {
    if (focusedIdx === null) { clearPreview(); return; }
    if (!focusedItem || focusedItem.kind !== 'asset') { clearPreview(); return; }
    const entry = assetVisibleEntries.find((item) => item.path.join('/') === focusedItem.path.join('/'));
    if (!entry || entry.kind === 'directory') { clearPreview(); return; }
    const rect = panelRef.current?.getBoundingClientRect();
    const panelMidY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    showFilePreview(entry, panelMidY);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetVisibleEntries, focusedIdx, focusedItem, panelRef, showFilePreview]);

  const focusAssetPath = useCallback((path: string[]) => {
    const idx = keyboardItems.findIndex((item) => item.kind === 'asset' && item.path.join('/') === path.join('/'));
    if (idx !== -1) setFocusedIdx(idx);
  }, [keyboardItems]);

  const focusPage = useCallback((pageId: string) => {
    const idx = keyboardItems.findIndex((item) => item.kind === 'page' && item.pageId === pageId);
    if (idx !== -1) setFocusedIdx(idx);
  }, [keyboardItems]);

  const focusDocument = useCallback((pageId: string, docId: string) => {
    const idx = keyboardItems.findIndex((item) => item.kind === 'doc' && item.docId === docId && (!pageId || item.pageId === pageId));
    if (idx !== -1) setFocusedIdx(idx);
  }, [keyboardItems]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && searchOpen) {
      e.preventDefault();
      setSearchOpen(false);
      setSearchQuery('');
      return;
    }
    if (keyboardItems.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIdx((prev) => (prev === null ? 0 : Math.min(prev + 1, keyboardItems.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIdx((prev) => (prev === null ? keyboardItems.length - 1 : Math.max(prev - 1, 0)));
    } else if (e.key === 'Enter') {
      if (focusedIdx === null) return;
      const item = keyboardItems[focusedIdx];
      if (!item) return;
      e.preventDefault();
      if (item.kind === 'page') {
        clearPagePreview();
        if (item.pageId !== activePageId) switchPage(item.pageId);
        window.dispatchEvent(new CustomEvent('devboard:snap-close-document'));
      } else if (item.kind === 'doc') {
        clearPagePreview();
        const doc = documents.find((entry) => entry.id === item.docId);
        if (doc && isCanvasDocument(doc)) {
          openCanvasDocument(doc.id);
        } else {
          if (item.pageId !== activePageId) switchPage(item.pageId);
          openDocument(item.docId);
        }
      } else {
        const entry = assetVisibleEntries.find((candidate) => candidate.path.join('/') === item.path.join('/'));
        if (!entry) return;
        if (entry.kind === 'directory') {
          handleAssetToggle(entry.path);
        } else if (e.shiftKey) {
          clearPreview();
          placeFile(entry);
        } else {
          clearPreview();
          openFile(entry);
        }
      }
    } else if (e.key === 'F2') {
      if (focusedItem?.kind !== 'asset') return;
      const entry = assetVisibleEntries.find((candidate) => candidate.path.join('/') === focusedItem.path.join('/'));
      if (entry) { e.preventDefault(); startRename(entry); }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (focusedItem?.kind !== 'asset') return;
      const entry = assetVisibleEntries.find((candidate) => candidate.path.join('/') === focusedItem.path.join('/'));
      if (entry) { e.preventDefault(); startDelete(entry); }
    } else if (e.key === 'Escape') {
      setFocusedIdx(null);
      clearPagePreview();
      clearPreview();
    }
  }, [activePageId, assetVisibleEntries, clearPagePreview, clearPreview, documents, focusedIdx, focusedItem, handleAssetToggle, keyboardItems, openCanvasDocument, openDocument, openFile, placeFile, searchOpen, startDelete, startRename, switchPage]);

  return {
    searchQuery,
    setSearchQuery,
    searchOpen,
    setSearchOpen,
    focusedIdx,
    setFocusedIdx,
    focusedItem,
    focusedPageId,
    focusedDocId,
    focusAssetPath,
    focusPage,
    focusDocument,
    handleKeyDown,
    assetVisibleEntries,
  };
}
