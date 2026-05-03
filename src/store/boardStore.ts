import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CanvasNode, ConnectorNode, StickyNoteNode, Camera, Tool, BoardData, ShapeKind, TableNode, PageMeta, Document, DocumentNode } from '../types';
import { findDocumentPlacement } from '../utils/documentPlacement';

export interface TableCellRef { nodeId: string; row: number; col: number; }
interface BoardHistorySnapshot { nodes: CanvasNode[]; documents: Document[]; }

const MAX_HISTORY_SNAPSHOTS = 250;

function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function createHistorySnapshot(state: Pick<BoardState, 'nodes' | 'documents'>): BoardHistorySnapshot {
  return { nodes: state.nodes, documents: state.documents };
}

function pushHistorySnapshot(past: BoardHistorySnapshot[], snapshot: BoardHistorySnapshot): BoardHistorySnapshot[] {
  return [...past, snapshot].slice(-MAX_HISTORY_SNAPSHOTS);
}

function normalizeDocumentPageIds(
  documents: Document[],
  activePageId: string,
  nodes: CanvasNode[],
  pageSnapshots: Record<string, { nodes: CanvasNode[]; camera: Camera }>,
): Document[] {
  const docPageMap = new Map<string, string>();

  const collectDocPages = (list: CanvasNode[], pageId: string) => {
    for (const node of list) {
      if (node.type !== 'document') continue;
      const docId = (node as DocumentNode).docId;
      if (docId && !docPageMap.has(docId)) docPageMap.set(docId, pageId);
    }
  };

  collectDocPages(nodes, activePageId);
  for (const [pageId, snap] of Object.entries(pageSnapshots)) {
    collectDocPages(snap.nodes, pageId);
  }

  return documents.map((doc) =>
    doc.pageId
      ? doc
      : { ...doc, pageId: docPageMap.get(doc.id) ?? activePageId }
  );
}

// ── Migration: inline DocumentNode → Document entity + docId ref ─────────────
function migrateInlineDocuments(
  nodes: CanvasNode[],
  pageSnapshots: Record<string, { nodes: CanvasNode[]; camera: Camera }>,
  existingDocs: Document[],
  activePageId: string,
): { nodes: CanvasNode[]; pageSnapshots: Record<string, { nodes: CanvasNode[]; camera: Camera }>; documents: Document[] } {
  const documents: Document[] = normalizeDocumentPageIds(existingDocs, activePageId, nodes, pageSnapshots);
  const now = Date.now();

  const migrateList = (list: CanvasNode[], pageId: string): CanvasNode[] =>
    list.map((n) => {
      if (n.type === 'document' && !n.docId && n.content !== undefined) {
        const docId = `doc_${generateId()}`;
        documents.push({
          id: docId,
          title: n.title ?? 'Untitled',
          content: n.content,
          pageId,
          linkedFile: n.linkedFile,
          orderIndex: n.orderIndex,
          createdAt: now,
          updatedAt: now,
        });
        return {
          id: n.id,
          type: 'document',
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
          docId,
          locked: n.locked,
          groupId: n.groupId,
        } as DocumentNode;
      }
      return n;
    });

  return {
    nodes: migrateList(nodes, activePageId),
    pageSnapshots: Object.fromEntries(
      Object.entries(pageSnapshots).map(([id, snap]) => [
        id,
        { ...snap, nodes: migrateList(snap.nodes, id) },
      ]),
    ),
    documents,
  };
}

interface BoardState {
  boardTitle: string;
  nodes: CanvasNode[];
  camera: Camera;
  // Documents (Phase 2 — first-class entities)
  documents: Document[];
  schemaVersion: number;
  // Pages
  pages: PageMeta[];
  activePageId: string;
  pageSnapshots: Record<string, { nodes: CanvasNode[]; camera: Camera }>;
  // Ephemeral UI
  activeTool: Tool;
  selectedIds: string[];
  editingId: string | null;
  focusDocumentId: string | null;  // legacy — kept for backward compat during transition
  appMode: 'canvas' | 'document';  // not persisted
  activeDocId: string | null;       // not persisted
  recentDocIds: string[];           // not persisted
  morphSourceRect: { left: number; top: number; width: number; height: number } | null; // not persisted
  docViewMode: 'panel' | 'fullscreen'; // not persisted — defaults to 'panel'
  clipboard: CanvasNode[];
  past: BoardHistorySnapshot[];
  future: BoardHistorySnapshot[];
  activeShapeKind: ShapeKind;
  activeSticker: string;
  theme: 'dark' | 'light';
  tableEditState: TableCellRef | null;
  tableSelectionState: TableCellRef | null;
  tableHoverDivider: { nodeId: string; kind: 'col' | 'row'; idx: number } | null;
  tableHoverEdge: { nodeId: string; showBottom: boolean; showRight: boolean } | null;
  tableHoverCell: { nodeId: string; row: number; col: number } | null;
  workspaceName: string | null;
  workspaceSavedAt: number; // not persisted — bumped after each saveWorkspace call
  lastLocalSavedAt: number | null;
  explorerOpen: boolean;
  imageAssetFolder: string;
  noteAutosaveEnabled: boolean;
  cloudBoardId: string | null;
  cloudBoardTitle: string | null;
  cloudSyncedAt: number | null;

  // ── Existing actions ──────────────────────────────────────────────────────
  setBoardTitle: (title: string) => void;
  toggleTheme: () => void;
  addNode: (node: CanvasNode) => void;
  updateNode: (id: string, updates: Partial<CanvasNode>) => void;
  updateNodes: (updates: { id: string; updates: Partial<CanvasNode> }[]) => void;
  deleteSelected: () => void;
  setActiveTool: (tool: Tool) => void;
  setCamera: (camera: Partial<Camera>) => void;
  selectIds: (ids: string[]) => void;
  setEditingId: (id: string | null) => void;
  setFocusDocument: (id: string | null) => void;
  setDocViewMode: (mode: 'panel' | 'fullscreen') => void;
  setActiveShapeKind: (kind: ShapeKind) => void;
  setActiveSticker: (src: string) => void;
  setTableEditState: (s: TableCellRef | null) => void;
  setTableSelectionState: (s: TableCellRef | null) => void;
  setTableHoverDivider: (s: { nodeId: string; kind: 'col' | 'row'; idx: number } | null) => void;
  setTableHoverEdge: (s: { nodeId: string; showBottom: boolean; showRight: boolean } | null) => void;
  setTableHoverCell: (s: { nodeId: string; row: number; col: number } | null) => void;
  setReaction: (nodeId: string, emoji: string | null) => void;
  setWorkspaceName: (name: string | null) => void;
  bumpWorkspaceSaved: () => void;
  markLocalSaved: (savedAt?: number) => void;
  setExplorerOpen: (open: boolean) => void;
  setImageAssetFolder: (folder: string) => void;
  setNoteAutosaveEnabled: (enabled: boolean) => void;
  setCloudBoardState: (state: { boardId: string; title: string; syncedAt?: number }) => void;
  clearCloudBoardState: () => void;
  addPage: (name?: string) => void;
  deletePage: (id: string) => void;
  renamePage: (id: string, name: string) => void;
  setPageNoteSort: (id: string, sort: 'updated' | 'custom') => void;
  switchPage: (id: string) => void;
  duplicatePage: (id: string) => void;
  loadBoard: (data: BoardData) => void;
  exportData: () => BoardData;
  copySelected: () => void;
  paste: () => void;
  duplicate: () => void;
  saveHistory: () => void;
  undo: () => void;
  redo: () => void;
  toggleLock: (ids: string[]) => void;
  groupSelected: () => void;
  ungroupNodes: (groupId: string) => void;
  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;

  // ── Document entity actions ───────────────────────────────────────────────
  addDocument: (partial: Partial<Document>) => string;
  updateDocument: (id: string, patch: Partial<Document>) => void;
  deleteDocument: (id: string) => void;
  openDocument: (id: string) => void;
  openDocumentWithMorph: (id: string, rect?: { left: number; top: number; width: number; height: number }) => void;
  closeDocument: () => void;
  ensureDocumentNode: (docId: string, pageId?: string) => string | null;
  setPageLayoutMode: (id: string, mode: 'freeform' | 'stack') => void;
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set, get) => ({
      boardTitle: 'Untitled Board',
      nodes: [],
      camera: { x: 0, y: 0, scale: 1 },
      documents: [],
      schemaVersion: 3,
      pages: [{ id: 'page-1', name: 'Page 1', noteSort: 'updated' }],
      activePageId: 'page-1',
      pageSnapshots: {},
      activeTool: 'select',
      selectedIds: [],
      editingId: null,
      focusDocumentId: null,
      appMode: 'canvas',
      activeDocId: null,
      recentDocIds: [],
      morphSourceRect: null,
      docViewMode: 'panel',
      clipboard: [],
      past: [],
      future: [],
      activeShapeKind: 'rect',
      activeSticker: '/stickers/sticker__0004_Layer-6_happy.png',
      theme: 'light',
      tableEditState: null,
      tableSelectionState: null,
      tableHoverDivider: null,
      tableHoverEdge: null,
      tableHoverCell: null,
      workspaceName: null,
      workspaceSavedAt: 0,
      lastLocalSavedAt: null,
      explorerOpen: false,
      imageAssetFolder: 'assets',
      noteAutosaveEnabled: true,
      cloudBoardId: null,
      cloudBoardTitle: null,
      cloudSyncedAt: null,

      setBoardTitle: (title) => set({ boardTitle: title }),

      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      addNode: (node) =>
        set((state) => ({
          past: pushHistorySnapshot(state.past, createHistorySnapshot(state)),
          future: [],
          nodes: [...state.nodes, node],
          selectedIds: [node.id],
        })),

      updateNode: (id, updates) =>
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === id ? ({ ...n, ...updates } as CanvasNode) : n
          ),
        })),

      updateNodes: (updates) =>
        set((state) => {
          const map = new Map(updates.map((u) => [u.id, u.updates]));
          return {
            past: pushHistorySnapshot(state.past, createHistorySnapshot(state)),
            future: [],
            nodes: state.nodes.map((n) => {
              const u = map.get(n.id);
              return u ? ({ ...n, ...u } as CanvasNode) : n;
            }),
          };
        }),

      deleteSelected: () =>
        set((state) => {
          const deletedIds = new Set(state.selectedIds);
          const remaining = state.nodes.filter((n) => !deletedIds.has(n.id));
          const cleaned = remaining.filter((n) => {
            if (n.type === 'connector') {
              const c = n as ConnectorNode;
              if (c.fromNodeId && deletedIds.has(c.fromNodeId)) return false;
              if (c.toNodeId && deletedIds.has(c.toNodeId)) return false;
            }
            return true;
          });
          return { past: pushHistorySnapshot(state.past, createHistorySnapshot(state)), future: [], nodes: cleaned, selectedIds: [] };
        }),

      setActiveTool: (tool) =>
        set({ activeTool: tool, selectedIds: [], editingId: null, tableEditState: null, tableSelectionState: null }),

      setCamera: (camera) =>
        set((state) => ({ camera: { ...state.camera, ...camera } })),

      selectIds: (ids) => set((s) => ({
        selectedIds: ids,
        ...(ids.length === 0 ? { tableEditState: null, tableSelectionState: null } : {}),
        ...(ids.length > 0 && s.tableSelectionState && !ids.includes(s.tableSelectionState.nodeId)
          ? { tableEditState: null, tableSelectionState: null } : {}),
      })),

      setEditingId: (id) => set({ editingId: id }),

      setFocusDocument: (id) => set({ focusDocumentId: id }),

      setActiveShapeKind: (kind) => set({ activeShapeKind: kind }),

      setActiveSticker: (src) => set({ activeSticker: src }),

      setTableEditState: (s) => set({ tableEditState: s }),

      setTableSelectionState: (s) => set({ tableSelectionState: s }),

      setTableHoverDivider: (s) => set({ tableHoverDivider: s }),

      setTableHoverEdge: (s) => set({ tableHoverEdge: s }),

      setTableHoverCell: (s) => set({ tableHoverCell: s }),

      setWorkspaceName: (name) => set({ workspaceName: name }),
      bumpWorkspaceSaved: () => {
        const savedAt = Date.now();
        set({ workspaceSavedAt: savedAt, lastLocalSavedAt: savedAt });
      },
      markLocalSaved: (savedAt = Date.now()) => set({ lastLocalSavedAt: savedAt }),
      setExplorerOpen: (open) => set({ explorerOpen: open }),
      setImageAssetFolder: (folder) => set({ imageAssetFolder: folder }),
      setNoteAutosaveEnabled: (enabled) => set({ noteAutosaveEnabled: enabled }),
      setCloudBoardState: ({ boardId, title, syncedAt }) => set({
        cloudBoardId: boardId,
        cloudBoardTitle: title,
        cloudSyncedAt: syncedAt ?? Date.now(),
      }),
      clearCloudBoardState: () => set({
        cloudBoardId: null,
        cloudBoardTitle: null,
        cloudSyncedAt: null,
      }),

      setReaction: (nodeId, emoji) =>
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === nodeId && n.type === 'sticky'
              ? ({ ...n, reaction: emoji ?? undefined } as CanvasNode)
              : n
          ),
        })),

      addPage: (name) => {
        const { nodes, camera, activePageId, pages, pageSnapshots } = get();
        const newId = generateId();
        const newName = name ?? `Page ${pages.length + 1}`;
        set({
          pageSnapshots: { ...pageSnapshots, [activePageId]: { nodes, camera } },
          pages: [...pages, { id: newId, name: newName, layoutMode: 'freeform' as const, noteSort: 'updated' as const }],
          activePageId: newId,
          nodes: [],
          camera: { x: 0, y: 0, scale: 1 },
          selectedIds: [],
          editingId: null,
          past: [],
          future: [],
        });
      },

      deletePage: (id) => {
        const { nodes, camera, activePageId, pages, pageSnapshots } = get();
        if (pages.length <= 1) return;
        const idx = pages.findIndex((p) => p.id === id);
        const newPages = pages.filter((p) => p.id !== id);
        const newSnapshots = { ...pageSnapshots };
        delete newSnapshots[id];
        if (id === activePageId) {
          const nextPage = newPages[Math.max(0, idx - 1)];
          const snap = newSnapshots[nextPage.id] ?? { nodes: [], camera: { x: 0, y: 0, scale: 1 } };
          delete newSnapshots[nextPage.id];
          set({
            pages: newPages,
            pageSnapshots: newSnapshots,
            activePageId: nextPage.id,
            nodes: snap.nodes,
            camera: snap.camera,
            selectedIds: [],
            editingId: null,
            past: [],
            future: [],
          });
        } else {
          set({
            pages: newPages,
            pageSnapshots: { ...newSnapshots, [activePageId]: { nodes, camera } },
          });
        }
      },

      renamePage: (id, name) =>
        set((state) => ({
          pages: state.pages.map((p) => (p.id === id ? { ...p, name } : p)),
        })),

      setPageNoteSort: (id, sort) =>
        set((state) => ({
          pages: state.pages.map((p) => (p.id === id ? { ...p, noteSort: sort } : p)),
        })),

      switchPage: (id) => {
        const { nodes, camera, activePageId, pageSnapshots } = get();
        if (id === activePageId) return;
        const snap = pageSnapshots[id] ?? { nodes: [], camera: { x: 0, y: 0, scale: 1 } };
        set({
          pageSnapshots: { ...pageSnapshots, [activePageId]: { nodes, camera } },
          activePageId: id,
          nodes: snap.nodes,
          camera: snap.camera,
          selectedIds: [],
          editingId: null,
          tableEditState: null,
          tableSelectionState: null,
          past: [],
          future: [],
        });
      },

      duplicatePage: (id) => {
        const { nodes, camera, activePageId, pages, pageSnapshots } = get();
        const srcData = id === activePageId
          ? { nodes, camera }
          : (pageSnapshots[id] ?? { nodes: [], camera: { x: 0, y: 0, scale: 1 } });
        const srcMeta = pages.find((p) => p.id === id);
        const newId = generateId();
        const newName = `${srcMeta?.name ?? 'Page'} copy`;
        const newNodes = srcData.nodes.map((n) => ({ ...n, id: generateId() }));
        set({
          pageSnapshots: {
            ...pageSnapshots,
            [activePageId]: { nodes, camera },
            [newId]: { nodes: newNodes, camera: { ...srcData.camera } },
          },
          pages: [...pages, { id: newId, name: newName, layoutMode: srcMeta?.layoutMode ?? 'freeform', noteSort: srcMeta?.noteSort ?? 'updated' }],
        });
      },

      loadBoard: (data) => {
        const incomingDocs = data.documents ?? [];
        if (data.pages && data.pages.length > 0 && data.activePageId) {
          const activePg = data.pages.find((p) => p.id === data.activePageId) ?? data.pages[0];
          const snapshots: Record<string, { nodes: CanvasNode[]; camera: Camera }> = {};
          for (const p of data.pages) {
            if (p.id !== activePg.id) {
              snapshots[p.id] = { nodes: p.nodes, camera: p.camera };
            }
          }
          // Run migration if needed
          const needsMigration = !data.schemaVersion || data.schemaVersion < 3;
          const { nodes: migratedNodes, pageSnapshots: migratedSnaps, documents } = needsMigration
            ? migrateInlineDocuments(activePg.nodes, snapshots, incomingDocs, activePg.id)
            : { nodes: activePg.nodes, pageSnapshots: snapshots, documents: normalizeDocumentPageIds(incomingDocs, activePg.id, activePg.nodes, snapshots) };
          set({
            boardTitle: data.boardTitle,
            pages: data.pages.map((p) => ({ id: p.id, name: p.name, layoutMode: p.layoutMode, noteSort: p.noteSort ?? 'updated' })),
            activePageId: activePg.id,
            pageSnapshots: migratedSnaps,
            nodes: migratedNodes,
            camera: activePg.camera ?? { x: 0, y: 0, scale: 1 },
            documents,
            schemaVersion: 3,
            cloudBoardId: null,
            cloudBoardTitle: null,
            cloudSyncedAt: null,
            lastLocalSavedAt: null,
            selectedIds: [],
            editingId: null,
            tableEditState: null,
            tableSelectionState: null,
            past: [],
            future: [],
          });
        } else {
          const needsMigration = !data.schemaVersion || data.schemaVersion < 3;
          const { nodes: migratedNodes, documents } = needsMigration
            ? migrateInlineDocuments(data.nodes, {}, incomingDocs, 'page-1')
            : { nodes: data.nodes, documents: normalizeDocumentPageIds(incomingDocs, 'page-1', data.nodes, {}) };
          set({
            boardTitle: data.boardTitle,
            nodes: migratedNodes,
            pages: [{ id: 'page-1', name: 'Page 1', noteSort: 'updated' }],
            activePageId: 'page-1',
            pageSnapshots: {},
            documents,
            schemaVersion: 3,
            cloudBoardId: null,
            cloudBoardTitle: null,
            cloudSyncedAt: null,
            lastLocalSavedAt: null,
            selectedIds: [],
            editingId: null,
            tableEditState: null,
            tableSelectionState: null,
            camera: { x: 0, y: 0, scale: 1 },
            past: [],
            future: [],
          });
        }
      },

      exportData: () => {
        const { boardTitle, nodes, camera, pages, activePageId, pageSnapshots, documents, schemaVersion } = get();
        const allPages = pages.map((p) => {
          if (p.id === activePageId) return { ...p, nodes, camera };
          const snap = pageSnapshots[p.id] ?? { nodes: [], camera: { x: 0, y: 0, scale: 1 } };
          return { ...p, ...snap };
        });
        return { boardTitle, nodes, pages: allPages, activePageId, documents, schemaVersion };
      },

      copySelected: () => {
        const { selectedIds, nodes } = get();
        const copied = nodes.filter(
          (n) => selectedIds.includes(n.id) && n.type !== 'connector'
        );
        set({ clipboard: copied });
      },

      paste: () => {
        const { clipboard } = get();
        if (!clipboard.length) return;
        const OFFSET = 28;
        const newNodes = (clipboard as StickyNoteNode[]).map((n) => ({
          ...n,
          id: generateId(),
          x: n.x + OFFSET,
          y: n.y + OFFSET,
        }));
        set((state) => ({
          past: pushHistorySnapshot(state.past, createHistorySnapshot(state)),
          future: [],
          nodes: [...state.nodes, ...newNodes],
          selectedIds: newNodes.map((n) => n.id),
          clipboard: newNodes,
        }));
      },

      duplicate: () => {
        const { selectedIds, nodes } = get();
        const copied = nodes.filter(
          (n) => selectedIds.includes(n.id) && n.type !== 'connector'
        ) as StickyNoteNode[];
        if (!copied.length) return;
        const OFFSET = 28;
        const newNodes = copied.map((n) => ({
          ...n,
          id: generateId(),
          x: n.x + OFFSET,
          y: n.y + OFFSET,
        }));
        set((state) => ({
          past: pushHistorySnapshot(state.past, createHistorySnapshot(state)),
          future: [],
          nodes: [...state.nodes, ...newNodes],
          selectedIds: newNodes.map((n) => n.id),
        }));
      },

      saveHistory: () =>
        set((state) => ({
          past: pushHistorySnapshot(state.past, createHistorySnapshot(state)),
          future: [],
        })),

      undo: () => {
        const { nodes, documents, past, future } = get();
        if (!past.length) return;
        const prev = past[past.length - 1];
        set({
          past: past.slice(0, -1),
          future: [createHistorySnapshot({ nodes, documents }), ...future].slice(0, MAX_HISTORY_SNAPSHOTS),
          nodes: prev.nodes,
          documents: prev.documents,
          selectedIds: [],
        });
      },

      redo: () => {
        const { nodes, documents, past, future } = get();
        if (!future.length) return;
        const next = future[0];
        set({
          past: pushHistorySnapshot(past, createHistorySnapshot({ nodes, documents })),
          future: future.slice(1),
          nodes: next.nodes,
          documents: next.documents,
          selectedIds: [],
        });
      },

      toggleLock: (ids) =>
        set((state) => {
          const set_ = new Set(ids);
          const anyUnlocked = state.nodes.some(
            (n) => set_.has(n.id) && !(n as { locked?: boolean }).locked
          );
          return {
            past: pushHistorySnapshot(state.past, createHistorySnapshot(state)),
            future: [],
            nodes: state.nodes.map((n) =>
              set_.has(n.id) ? ({ ...n, locked: anyUnlocked } as CanvasNode) : n
            ),
          };
        }),

      groupSelected: () => {
        const { selectedIds, nodes } = get();
        const eligible = nodes.filter(
          (n) => selectedIds.includes(n.id) && n.type !== 'connector'
        );
        if (eligible.length < 2) return;
        const newGroupId = generateId();
        set((state) => ({
          past: pushHistorySnapshot(state.past, createHistorySnapshot(state)),
          future: [],
          nodes: state.nodes.map((n) =>
            selectedIds.includes(n.id) && n.type !== 'connector'
              ? ({ ...n, groupId: newGroupId } as CanvasNode)
              : n
          ),
        }));
      },

      ungroupNodes: (groupId) =>
        set((state) => ({
          past: pushHistorySnapshot(state.past, createHistorySnapshot(state)),
          future: [],
          nodes: state.nodes.map((n) =>
            (n as { groupId?: string }).groupId === groupId
              ? ({ ...n, groupId: undefined } as CanvasNode)
              : n
          ),
        })),

      bringToFront: (ids) =>
        set((state) => {
          const set_ = new Set(ids);
          const rest = state.nodes.filter((n) => !set_.has(n.id));
          const moved = state.nodes.filter((n) => set_.has(n.id));
          return { past: pushHistorySnapshot(state.past, createHistorySnapshot(state)), future: [], nodes: [...rest, ...moved] };
        }),

      sendToBack: (ids) =>
        set((state) => {
          const set_ = new Set(ids);
          const rest = state.nodes.filter((n) => !set_.has(n.id));
          const moved = state.nodes.filter((n) => set_.has(n.id));
          return { past: pushHistorySnapshot(state.past, createHistorySnapshot(state)), future: [], nodes: [...moved, ...rest] };
        }),

      // ── Document entity actions ─────────────────────────────────────────────

      addDocument: (partial) => {
        const id = partial.id ?? `doc_${generateId()}`;
        const now = Date.now();
        const doc: Document = {
          id,
          title: partial.title ?? 'Untitled',
          content: partial.content ?? '',
          pageId: partial.pageId ?? get().activePageId,
          linkedFile: partial.linkedFile,
          orderIndex: partial.orderIndex,
          createdAt: partial.createdAt ?? now,
          updatedAt: partial.updatedAt ?? now,
          tags: partial.tags,
        };
        set((state) => ({
          past: pushHistorySnapshot(state.past, createHistorySnapshot(state)),
          future: [],
          documents: [...state.documents, doc],
        }));
        return id;
      },

      updateDocument: (id, patch) =>
        set((state) => ({
          documents: state.documents.map((d) =>
            d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d
          ),
        })),

      deleteDocument: (docId) =>
        set((state) => {
          // Find all canvas card IDs referencing this document across all pages
          const allNodes = [
            ...state.nodes,
            ...Object.values(state.pageSnapshots).flatMap((s) => s.nodes),
          ];
          const cardIds = new Set(
            allNodes
              .filter((n) => n.type === 'document' && (n as DocumentNode).docId === docId)
              .map((n) => n.id)
          );

          // Remove those cards + their connectors from current nodes
          const cleanNodes = (list: CanvasNode[]) =>
            list.filter((n) => {
              if (cardIds.has(n.id)) return false;
              if (n.type === 'connector') {
                const c = n as ConnectorNode;
                if (c.fromNodeId && cardIds.has(c.fromNodeId)) return false;
                if (c.toNodeId && cardIds.has(c.toNodeId)) return false;
              }
              return true;
            });

          return {
            past: pushHistorySnapshot(state.past, createHistorySnapshot(state)),
            future: [],
            documents: state.documents.filter((d) => d.id !== docId),
            nodes: cleanNodes(state.nodes),
            pageSnapshots: Object.fromEntries(
              Object.entries(state.pageSnapshots).map(([pid, snap]) => [
                pid,
                { ...snap, nodes: cleanNodes(snap.nodes) },
              ]),
            ),
            ...(state.activeDocId === docId ? { appMode: 'canvas' as const, activeDocId: null } : {}),
            selectedIds: state.selectedIds.filter((id) => !cardIds.has(id)),
          };
        }),

      openDocument: (id) =>
        set((state) => ({
          appMode: 'document',
          activeDocId: id,
          focusDocumentId: id,
          morphSourceRect: null,
          recentDocIds: [id, ...state.recentDocIds.filter((r) => r !== id)].slice(0, 10),
        })),

      openDocumentWithMorph: (id, rect) =>
        set((state) => ({
          appMode: 'document',
          activeDocId: id,
          focusDocumentId: id,
          morphSourceRect: rect ?? null,
          recentDocIds: [id, ...state.recentDocIds.filter((r) => r !== id)].slice(0, 10),
        })),

      closeDocument: () =>
        set({ appMode: 'canvas', focusDocumentId: null, activeDocId: null, morphSourceRect: null }),

      setDocViewMode: (mode) => set({ docViewMode: mode }),

      ensureDocumentNode: (docId, pageId) => {
        const targetPageId = pageId ?? get().activePageId;
        const CARD_W = 280;
        const CARD_H = 176;
        const state = get();
        const targetNodes = targetPageId === state.activePageId
          ? state.nodes
          : (state.pageSnapshots[targetPageId]?.nodes ?? []);

        const existingNode = targetNodes.find(
          (node) => node.type === 'document' && (node as DocumentNode).docId === docId
        ) as DocumentNode | undefined;
        if (existingNode) return existingNode.id;

        const targetCamera = targetPageId === state.activePageId
          ? state.camera
          : (state.pageSnapshots[targetPageId]?.camera ?? { x: 0, y: 0, scale: 1 });
        const { x, y } = findDocumentPlacement(targetNodes, targetCamera, CARD_W, CARD_H);
        const newNode: DocumentNode = {
          id: generateId(),
          type: 'document',
          x,
          y,
          width: CARD_W,
          height: CARD_H,
          docId,
        };

        if (targetPageId === state.activePageId) {
          set((current) => ({
            past: pushHistorySnapshot(current.past, createHistorySnapshot(current)),
            future: [],
            nodes: [...current.nodes, newNode],
            selectedIds: [newNode.id],
          }));
        } else {
          set((current) => ({
            pageSnapshots: {
              ...current.pageSnapshots,
              [targetPageId]: {
                nodes: [...(current.pageSnapshots[targetPageId]?.nodes ?? []), newNode],
                camera: current.pageSnapshots[targetPageId]?.camera ?? { x: 0, y: 0, scale: 1 },
              },
            },
          }));
        }

        return newNode.id;
      },

      setPageLayoutMode: (id, mode) =>
        set((state) => {
          const updatedPages = state.pages.map((p) => (p.id === id ? { ...p, layoutMode: mode } : p));
          if (mode !== 'freeform') return { pages: updatedPages };

          // When switching to freeform, materialize any documents that have no canvas node yet.
          const CARD_W = 280, CARD_H = 176;
          const existingDocIds = new Set(
            state.nodes
              .filter((n) => n.type === 'document')
              .map((n) => (n as DocumentNode).docId)
              .filter(Boolean)
          );
          const orphans = state.documents.filter(
            (d) => (d.pageId ?? id) === id && !existingDocIds.has(d.id)
          );
          if (orphans.length === 0) return { pages: updatedPages };

          const stagedNodes = [...state.nodes];
          const newNodes: DocumentNode[] = orphans.map((doc) => {
            const { x, y } = findDocumentPlacement(stagedNodes, state.camera, CARD_W, CARD_H);
            const newNode: DocumentNode = {
              id: generateId(),
              type: 'document',
              x,
              y,
              width: CARD_W,
              height: CARD_H,
              docId: doc.id,
            };
            stagedNodes.push(newNode);
            return newNode;
          });

          return { pages: updatedPages, nodes: [...state.nodes, ...newNodes] };
        }),
    }),
    {
      name: 'devboard-v2',
      version: 3,
      migrate: (persistedState: unknown, version: number) => {
        // Runs when the stored version is older than the current version (3).
        // Pre-version-3 stores have no schemaVersion and inline content on DocumentNodes.
        const state = persistedState as Partial<BoardState>;
        if (version < 3) {
          const nodes = (state.nodes ?? []) as CanvasNode[];
          const snapshots = (state.pageSnapshots ?? {}) as Record<string, { nodes: CanvasNode[]; camera: Camera }>;
          const { nodes: migratedNodes, pageSnapshots, documents } =
            migrateInlineDocuments(nodes, snapshots, [], state.activePageId ?? 'page-1');
          return { ...state, nodes: migratedNodes, pageSnapshots, documents, schemaVersion: 3 };
        }
        return state;
      },
      partialize: (state) => {
        const sanitiseNodes = (nodes: CanvasNode[]) =>
          nodes.map((n) => {
            if (n.type === 'image' && n.assetName && n.src && !n.src.startsWith('data:')) {
              return { ...n, src: '' };
            }
            return n;
          });
        return {
          boardTitle: state.boardTitle,
          nodes: sanitiseNodes(state.nodes),
          camera: state.camera,
          theme: state.theme,
          pages: state.pages,
          activePageId: state.activePageId,
          explorerOpen: state.explorerOpen,
          imageAssetFolder: state.imageAssetFolder,
          noteAutosaveEnabled: state.noteAutosaveEnabled,
          lastLocalSavedAt: state.lastLocalSavedAt,
          cloudBoardId: state.cloudBoardId,
          cloudBoardTitle: state.cloudBoardTitle,
          cloudSyncedAt: state.cloudSyncedAt,
          documents: state.documents,
          schemaVersion: state.schemaVersion,
          pageSnapshots: Object.fromEntries(
            Object.entries(state.pageSnapshots).map(([id, snap]) => [
              id,
              { ...snap, nodes: sanitiseNodes(snap.nodes) },
            ])
          ),
        };
      },
    }
  )
);
