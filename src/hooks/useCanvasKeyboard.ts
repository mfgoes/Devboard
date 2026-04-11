import { useEffect } from 'react';
import type React from 'react';
import { useBoardStore } from '../store/boardStore';

export interface UseCanvasKeyboardOptions {
  spacePressed: React.MutableRefObject<boolean>;
  isPanning: React.MutableRefObject<boolean>;
  setCursorOverride: React.Dispatch<React.SetStateAction<string | null>>;
  cancelAll: () => void;
}

export function useCanvasKeyboard({
  spacePressed,
  isPanning,
  setCursorOverride,
  cancelAll,
}: UseCanvasKeyboardOptions) {
  const { deleteSelected, setActiveTool, selectIds } = useBoardStore();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.code === 'Space') {
        e.preventDefault();
        spacePressed.current = true;
        setCursorOverride('grab');
      }
      if (e.code === 'Backspace' || e.code === 'Delete') {
        deleteSelected();
      }
      // Arrow key nudge — move selected nodes (1px; Shift = 10px)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const state = useBoardStore.getState();
        if (state.selectedIds.length > 0) {
          e.preventDefault();
          if (!e.repeat) state.saveHistory();
          const delta = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -delta : e.key === 'ArrowRight' ? delta : 0;
          const dy = e.key === 'ArrowUp' ? -delta : e.key === 'ArrowDown' ? delta : 0;
          for (const id of state.selectedIds) {
            const n = state.nodes.find((x) => x.id === id);
            if (!n || n.type === 'connector') continue;
            state.updateNode(id, {
              x: ((n as { x?: number }).x ?? 0) + dx,
              y: ((n as { y?: number }).y ?? 0) + dy,
            } as Parameters<typeof state.updateNode>[1]);
          }
        }
      }
      // Tool shortcuts (no modifier)
      if (!e.metaKey && !e.ctrlKey) {
        const shortcuts: Record<string, Parameters<typeof setActiveTool>[0]> = {
          KeyV: 'select',
          KeyH: 'pan',
          KeyS: 'sticky',
          KeyR: 'shape',
          KeyT: 'text',
          KeyL: 'line',
          KeyF: 'section',
          KeyG: 'table',
          KeyK: 'code',
          KeyI: 'image',
          KeyU: 'link',
        };
        if (shortcuts[e.code]) setActiveTool(shortcuts[e.code]);
      }
      if (e.code === 'Escape') {
        cancelAll();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spacePressed.current = false;
        isPanning.current = false;
        setCursorOverride(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [deleteSelected, setActiveTool, selectIds, cancelAll]);
}
