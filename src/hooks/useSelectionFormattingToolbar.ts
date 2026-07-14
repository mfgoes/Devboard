import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { activeWikiChipFromRange } from '../components/documentModeUtils';
import { type SelectionToolbarAnchor } from '../components/DocumentToolbars';

interface UseSelectionFormattingToolbarArgs {
  viewMode: 'edit' | 'source' | 'split';
  contentRef: RefObject<HTMLDivElement>;
  editorScrollRef: RefObject<HTMLDivElement>;
}

// Positions the floating SelectionFormattingToolbar above/below the current text
// selection (or an active wiki-link chip) and keeps it in sync with
// `selectionchange`/resize. Also forces a re-render on selection change so the
// rest of the editor (block-type indicators, etc.) that reads live selection
// state inline stays current — this is the one thing DocumentMode used to do
// itself via a plain `forceUpdate` tick, folded in here since it only exists
// to drive this listener.
export function useSelectionFormattingToolbar({ viewMode, contentRef, editorScrollRef }: UseSelectionFormattingToolbarArgs) {
  const [, forceUpdate] = useState(0);
  const [anchor, setAnchor] = useState<SelectionToolbarAnchor | null>(null);
  const interactingRef = useRef(false);

  const update = useCallback(() => {
    if (viewMode !== 'edit' || !contentRef.current) {
      setAnchor(null);
      return;
    }

    if (interactingRef.current) return;

    const activeElement = document.activeElement as HTMLElement | null;
    if (activeElement?.closest('[data-selection-toolbar="true"]')) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      setAnchor(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const activeWikiChip = activeWikiChipFromRange(range, contentRef.current);
    const startNode = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentNode : range.startContainer;
    const endNode = range.endContainer.nodeType === Node.TEXT_NODE ? range.endContainer.parentNode : range.endContainer;

    if (
      !activeWikiChip &&
      (!startNode || !endNode || !contentRef.current.contains(startNode) || !contentRef.current.contains(endNode))
    ) {
      setAnchor(null);
      return;
    }

    if (!activeWikiChip && sel.isCollapsed) {
      setAnchor(null);
      return;
    }

    const rect = activeWikiChip?.getBoundingClientRect() ?? range.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      setAnchor(null);
      return;
    }

    const editorRect = editorScrollRef.current?.getBoundingClientRect();
    const toolbarHeight = 76;
    const verticalGap = 8;
    const desiredBelow = rect.bottom + verticalGap;
    const desiredAbove = rect.top - toolbarHeight - verticalGap;
    const hasRoomBelow = desiredBelow + toolbarHeight <= window.innerHeight - 12;
    const top = hasRoomBelow ? desiredBelow : Math.max(12, desiredAbove);
    const unclampedLeft = rect.left + rect.width / 2;
    const clampedLeft = editorRect
      ? Math.max(editorRect.left + 24, Math.min(editorRect.right - 24, unclampedLeft))
      : unclampedLeft;
    setAnchor({
      left: clampedLeft,
      top,
    });
  }, [viewMode, contentRef, editorScrollRef]);

  useEffect(() => {
    const handleSelectionChange = () => {
      forceUpdate((n) => n + 1);
      update();
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    window.addEventListener('resize', update);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      window.removeEventListener('resize', update);
    };
  }, [update]);

  const markInteraction = useCallback(() => {
    interactingRef.current = true;
    window.setTimeout(() => {
      interactingRef.current = false;
    }, 0);
  }, []);

  const close = useCallback(() => setAnchor(null), []);

  return { anchor, update, markInteraction, close };
}
