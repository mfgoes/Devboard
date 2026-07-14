import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { caretHostForConvertedBlock } from '../components/documentBlockTransforms';
import { type LineHandleState } from '../components/DocumentLineHandle';

interface UseLineHandleDragArgs {
  contentRef: RefObject<HTMLDivElement>;
  editorScrollRef: RefObject<HTMLDivElement>;
  checkpointDocumentHistory: () => void;
  refreshEditorDomAfterBlockChange: (focusHost?: HTMLElement | null) => void;
}

// Drives the per-block drag handle: hover targeting, the "turn into" menu
// anchor, and pointer-driven drag-to-reorder (ghost preview + drop indicator).
// Wraps everything DocumentLineHandle.tsx needs, plus the drag machinery that
// reorders blocks directly in the contentEditable DOM.
export function useLineHandleDrag({ contentRef, editorScrollRef, checkpointDocumentHistory, refreshEditorDomAfterBlockChange }: UseLineHandleDragArgs) {
  const [lineHandle, setLineHandle] = useState<LineHandleState | null>(null);
  const [lineHandleMenu, setLineHandleMenu] = useState<LineHandleState | null>(null);
  const [lineDragGhost, setLineDragGhost] = useState<{ html: string; left: number; top: number; width: number } | null>(null);
  const [lineDropIndicator, setLineDropIndicator] = useState<{ left: number; top: number; width: number } | null>(null);
  const lineHandleHideTimerRef = useRef<number | null>(null);

  const updateLineHandleForBlock = useCallback((block: HTMLElement | null) => {
    if (lineHandleHideTimerRef.current !== null) {
      window.clearTimeout(lineHandleHideTimerRef.current);
      lineHandleHideTimerRef.current = null;
    }
    if (!block || !contentRef.current || !editorScrollRef.current) {
      setLineHandle(null);
      return;
    }
    const blockRect = block.getBoundingClientRect();
    const editorRect = editorScrollRef.current.getBoundingClientRect();
    if (blockRect.bottom < editorRect.top || blockRect.top > editorRect.bottom) {
      setLineHandle(null);
      return;
    }
    setLineHandle({
      block,
      rect: {
        left: blockRect.left,
        top: blockRect.top,
        width: blockRect.width,
        height: blockRect.height,
      },
    });
  }, [contentRef, editorScrollRef]);

  const cancelLineHandleHide = useCallback(() => {
    if (lineHandleHideTimerRef.current === null) return;
    window.clearTimeout(lineHandleHideTimerRef.current);
    lineHandleHideTimerRef.current = null;
  }, []);

  const scheduleLineHandleHide = useCallback(() => {
    if (lineHandleMenu) return;
    if (lineHandleHideTimerRef.current !== null) window.clearTimeout(lineHandleHideTimerRef.current);
    lineHandleHideTimerRef.current = window.setTimeout(() => {
      setLineHandle(null);
      lineHandleHideTimerRef.current = null;
    }, 650);
  }, [lineHandleMenu]);

  const computeDropBefore = useCallback((block: HTMLElement, y: number): HTMLElement | null => {
    const root = contentRef.current;
    if (!root) return null;
    const siblings = Array.from(root.children).filter((child) => child !== block) as HTMLElement[];
    return siblings.find((sibling) => {
      const rect = sibling.getBoundingClientRect();
      return y < rect.top + rect.height / 2;
    }) ?? null;
  }, [contentRef]);

  const computeDropIndicatorRect = useCallback((block: HTMLElement, before: HTMLElement | null) => {
    const root = contentRef.current;
    if (!root) return null;
    const containerRect = root.getBoundingClientRect();
    if (before) {
      const rect = before.getBoundingClientRect();
      return { left: containerRect.left, top: rect.top - 2, width: containerRect.width };
    }
    const siblings = Array.from(root.children).filter((child) => child !== block) as HTMLElement[];
    const last = siblings[siblings.length - 1];
    const anchor = (last ?? block).getBoundingClientRect();
    return { left: containerRect.left, top: anchor.bottom - 2, width: containerRect.width };
  }, [contentRef]);

  const beginLineHandlePointer = useCallback((event: React.PointerEvent<HTMLButtonElement>, handle: LineHandleState) => {
    const root = contentRef.current;
    if (!root || !root.contains(handle.block)) return;

    event.preventDefault();
    event.stopPropagation();

    const startY = event.clientY;
    const blockRectAtStart = handle.block.getBoundingClientRect();
    const pointerOffsetY = startY - blockRectAtStart.top;
    let lastY = startY;
    let dragging = false;
    let dragHtml: string | null = null;
    const originalUserSelect = document.body.style.userSelect;
    const originalCursor = document.body.style.cursor;

    const cleanup = () => {
      document.body.style.userSelect = originalUserSelect;
      document.body.style.cursor = originalCursor;
      handle.block.classList.remove('doc-block-dragging');
      setLineDragGhost(null);
      setLineDropIndicator(null);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      lastY = moveEvent.clientY;
      if (!dragging) {
        if (Math.abs(lastY - startY) < 5) return;
        dragging = true;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        setLineHandleMenu(null);
        dragHtml = handle.block.innerHTML;
        handle.block.classList.add('doc-block-dragging');
      }
      if (dragHtml !== null) {
        setLineDragGhost({
          html: dragHtml,
          left: blockRectAtStart.left,
          width: blockRectAtStart.width,
          top: lastY - pointerOffsetY,
        });
      }
      const before = computeDropBefore(handle.block, lastY);
      setLineDropIndicator(computeDropIndicatorRect(handle.block, before));
    };

    const onPointerCancel = () => {
      cleanup();
      setLineHandle(null);
    };

    const onPointerUp = () => {
      cleanup();

      if (!dragging) {
        setLineHandle(handle);
        setLineHandleMenu(handle);
        return;
      }

      const block = handle.block;
      if (!root.contains(block)) {
        setLineHandle(null);
        return;
      }

      const before = computeDropBefore(block, lastY);
      const alreadyInPlace = before === block.nextElementSibling || (!before && block === root.lastElementChild);

      if (!alreadyInPlace) {
        checkpointDocumentHistory();
        root.insertBefore(block, before);
        refreshEditorDomAfterBlockChange(caretHostForConvertedBlock(block));
      }

      updateLineHandleForBlock(block);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  }, [checkpointDocumentHistory, computeDropBefore, computeDropIndicatorRect, contentRef, refreshEditorDomAfterBlockChange, updateLineHandleForBlock]);

  const resetLineHandle = useCallback(() => {
    setLineHandle(null);
    setLineHandleMenu(null);
  }, []);

  // Close the "turn into" menu on outside pointerdown/scroll/Escape.
  useEffect(() => {
    if (!lineHandleMenu) return;
    const close = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('[data-line-turn-ui="true"]')) return;
      setLineHandleMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLineHandleMenu(null);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
    };
  }, [lineHandleMenu]);

  useEffect(() => () => {
    if (lineHandleHideTimerRef.current !== null) window.clearTimeout(lineHandleHideTimerRef.current);
  }, []);

  return {
    lineHandle,
    lineHandleMenu,
    lineDragGhost,
    lineDropIndicator,
    updateLineHandleForBlock,
    cancelLineHandleHide,
    scheduleLineHandleHide,
    beginLineHandlePointer,
    resetLineHandle,
  };
}
