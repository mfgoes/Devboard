import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CanvasNode, ConnectorNode, StickyNoteNode, Camera, Tool, BoardData } from '../types';

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

  // Actions
  setBoardTitle: (title: string) => void;
  addNode: (node: CanvasNode) => void;
  updateNode: (id: string, updates: Partial<CanvasNode>) => void;
  deleteSelected: () => void;
  setActiveTool: (tool: Tool) => void;
  setCamera: (camera: Partial<Camera>) => void;
  selectIds: (ids: string[]) => void;
  setEditingId: (id: string | null) => void;
  loadBoard: (data: BoardData) => void;
  exportData: () => BoardData;
  copySelected: () => void;
  paste: () => void;
  duplicate: () => void;
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

      setBoardTitle: (title) => set({ boardTitle: title }),

      addNode: (node) =>
        set((state) => ({
          nodes: [...state.nodes, node],
          selectedIds: [node.id],
        })),

      updateNode: (id, updates) =>
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === id ? ({ ...n, ...updates } as CanvasNode) : n
          ),
        })),

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
          return { nodes: cleaned, selectedIds: [] };
        }),

      setActiveTool: (tool) =>
        set({ activeTool: tool, selectedIds: [], editingId: null }),

      setCamera: (camera) =>
        set((state) => ({ camera: { ...state.camera, ...camera } })),

      selectIds: (ids) => set({ selectedIds: ids }),

      setEditingId: (id) => set({ editingId: id }),

      loadBoard: (data) =>
        set({
          boardTitle: data.boardTitle,
          nodes: data.nodes,
          selectedIds: [],
          editingId: null,
          camera: { x: 0, y: 0, scale: 1 },
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
          nodes: [...state.nodes, ...newNodes],
          selectedIds: newNodes.map((n) => n.id),
        }));
      },
    }),
    {
      name: 'devboard-v1',
      partialize: (state) => ({
        boardTitle: state.boardTitle,
        nodes: state.nodes,
        camera: state.camera,
      }),
    }
  )
);
