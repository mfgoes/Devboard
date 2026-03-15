import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CanvasNode, ConnectorNode, StickyNoteNode, Camera, Tool, BoardData, ShapeKind, TableNode } from '../types';

export interface TableCellRef { nodeId: string; row: number; col: number; }

function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

interface BoardState {
  boardTitle: string;
  nodes: CanvasNode[];
  camera: Camera;
  activeTool: Tool;
  selectedIds: string[];
  editingId: string | null;
  clipboard: CanvasNode[]; // not persisted
  past: CanvasNode[][]; // not persisted
  future: CanvasNode[][]; // not persisted
  activeShapeKind: ShapeKind; // not persisted
  activeSticker: string; // not persisted
  theme: 'dark' | 'light';
  tableEditState: TableCellRef | null;       // not persisted
  tableSelectionState: TableCellRef | null;  // not persisted
  tableHoverDivider: { nodeId: string; kind: 'col' | 'row'; idx: number } | null; // not persisted
  tableHoverEdge: { nodeId: string; showBottom: boolean; showRight: boolean } | null; // not persisted
  tableHoverCell: { nodeId: string; row: number; col: number } | null; // not persisted

  // Actions
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
  setActiveShapeKind: (kind: ShapeKind) => void;
  setActiveSticker: (src: string) => void;
  setTableEditState: (s: TableCellRef | null) => void;
  setTableSelectionState: (s: TableCellRef | null) => void;
  setTableHoverDivider: (s: { nodeId: string; kind: 'col' | 'row'; idx: number } | null) => void;
  setTableHoverEdge: (s: { nodeId: string; showBottom: boolean; showRight: boolean } | null) => void;
  setTableHoverCell: (s: { nodeId: string; row: number; col: number } | null) => void;
  loadBoard: (data: BoardData) => void;
  exportData: () => BoardData;
  copySelected: () => void;
  paste: () => void;
  duplicate: () => void;
  saveHistory: () => void;
  undo: () => void;
  redo: () => void;
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set, get) => ({
      boardTitle: 'Untitled Board',
      nodes: [],
      camera: { x: 0, y: 0, scale: 1 },
      activeTool: 'select',
      selectedIds: [],
      editingId: null,
      clipboard: [],
      past: [],
      future: [],
      activeShapeKind: 'rect',
      activeSticker: '/stickers/sticker__0004_Layer-6_happy.png',
      theme: 'dark',
      tableEditState: null,
      tableSelectionState: null,
      tableHoverDivider: null,
      tableHoverEdge: null,
      tableHoverCell: null,

      setBoardTitle: (title) => set({ boardTitle: title }),

      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      addNode: (node) =>
        set((state) => ({
          past: [...state.past, state.nodes],
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
            past: [...state.past, state.nodes],
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
          // Cascade: remove connectors whose endpoints reference deleted nodes
          const cleaned = remaining.filter((n) => {
            if (n.type === 'connector') {
              const c = n as ConnectorNode;
              if (c.fromNodeId && deletedIds.has(c.fromNodeId)) return false;
              if (c.toNodeId && deletedIds.has(c.toNodeId)) return false;
            }
            return true;
          });
          return { past: [...state.past, state.nodes], future: [], nodes: cleaned, selectedIds: [] };
        }),

      setActiveTool: (tool) =>
        set({ activeTool: tool, selectedIds: [], editingId: null, tableEditState: null, tableSelectionState: null }),

      setCamera: (camera) =>
        set((state) => ({ camera: { ...state.camera, ...camera } })),

      selectIds: (ids) => set((s) => ({
        selectedIds: ids,
        ...(ids.length === 0 ? { tableEditState: null, tableSelectionState: null } : {}),
        // Clear table state when switching to a different node
        ...(ids.length > 0 && s.tableSelectionState && !ids.includes(s.tableSelectionState.nodeId)
          ? { tableEditState: null, tableSelectionState: null } : {}),
      })),

      setEditingId: (id) => set({ editingId: id }),

      setActiveShapeKind: (kind) => set({ activeShapeKind: kind }),

      setActiveSticker: (src) => set({ activeSticker: src }),

      setTableEditState: (s) => set({ tableEditState: s }),

      setTableSelectionState: (s) => set({ tableSelectionState: s }),

      setTableHoverDivider: (s) => set({ tableHoverDivider: s }),

      setTableHoverEdge: (s) => set({ tableHoverEdge: s }),

      setTableHoverCell: (s) => set({ tableHoverCell: s }),

      loadBoard: (data) =>
        set({
          boardTitle: data.boardTitle,
          nodes: data.nodes,
          selectedIds: [],
          editingId: null,
          tableEditState: null,
          tableSelectionState: null,
          camera: { x: 0, y: 0, scale: 1 },
          past: [],
          future: [],
        }),

      exportData: () => {
        const { boardTitle, nodes } = get();
        return { boardTitle, nodes };
      },

      copySelected: () => {
        const { selectedIds, nodes } = get();
        // Copy only non-connector nodes
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
        // Update clipboard to the pasted copies so repeated Cmd+V keeps offsetting
        set((state) => ({
          past: [...state.past, state.nodes],
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
          past: [...state.past, state.nodes],
          future: [],
          nodes: [...state.nodes, ...newNodes],
          selectedIds: newNodes.map((n) => n.id),
        }));
      },

      saveHistory: () =>
        set((state) => ({
          past: [...state.past, state.nodes],
          future: [],
        })),

      undo: () => {
        const { nodes, past, future } = get();
        if (!past.length) return;
        const prev = past[past.length - 1];
        set({
          past: past.slice(0, -1),
          future: [nodes, ...future],
          nodes: prev,
          selectedIds: [],
        });
      },

      redo: () => {
        const { nodes, past, future } = get();
        if (!future.length) return;
        const next = future[0];
        set({
          past: [...past, nodes],
          future: future.slice(1),
          nodes: next,
          selectedIds: [],
        });
      },
    }),
    {
      name: 'devboard-v1',
      partialize: (state) => ({
        boardTitle: state.boardTitle,
        nodes: state.nodes,
        camera: state.camera,
        theme: state.theme,
      }),
    }
  )
);
