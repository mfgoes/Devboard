import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';

interface SelectedImageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface UseImageSelectionArgs {
  contentRef: RefObject<HTMLDivElement>;
  editorScrollRef: RefObject<HTMLDivElement>;
  savedSelectionRef: MutableRefObject<Range | null>;
  saveHistory: () => void;
}

// Selection, positioning overlay, deletion, and drag-resize for inline document
// images (<figure data-doc-image="true">). Fully self-contained: DocumentMode
// only needs `selectedImageId` to gate a couple of keyboard shortcuts and wires
// the returned handlers into its click/keydown/pointerdown listeners.
export function useImageSelection({ contentRef, editorScrollRef, savedSelectionRef, saveHistory }: UseImageSelectionArgs) {
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [selectedImageRect, setSelectedImageRect] = useState<SelectedImageRect | null>(null);
  const imageResizeStateRef = useRef<{ imageId: string; startX: number; startWidth: number } | null>(null);

  const syncSelectedImageOverlay = useCallback((imageId: string | null) => {
    if (!contentRef.current || !editorScrollRef.current) {
      setSelectedImageRect(null);
      return;
    }

    contentRef.current.querySelectorAll<HTMLElement>('figure[data-doc-image="true"]').forEach((figure) => {
      figure.dataset.selected = figure.dataset.docImageId === imageId ? 'true' : 'false';
    });

    if (!imageId) {
      setSelectedImageRect(null);
      return;
    }

    const figure = contentRef.current.querySelector<HTMLElement>(`figure[data-doc-image-id="${imageId}"]`);
    if (!figure) {
      setSelectedImageRect(null);
      return;
    }
    const scrollRect = editorScrollRef.current.getBoundingClientRect();
    const figureRect = figure.getBoundingClientRect();
    setSelectedImageRect({
      left: figureRect.left,
      top: figureRect.top,
      width: figureRect.width,
      height: figureRect.height,
    });
    if (figureRect.bottom < scrollRect.top || figureRect.top > scrollRect.bottom) {
      setSelectedImageRect(null);
    }
  }, [contentRef, editorScrollRef]);

  const selectImage = useCallback((imageId: string) => {
    setSelectedImageId(imageId);
    syncSelectedImageOverlay(imageId);
  }, [syncSelectedImageOverlay]);

  const clearSelectedImage = useCallback(() => {
    setSelectedImageId(null);
    syncSelectedImageOverlay(null);
  }, [syncSelectedImageOverlay]);

  const removeSelectedImage = useCallback(() => {
    if (!contentRef.current || !selectedImageId) return;
    const figure = contentRef.current.querySelector<HTMLElement>(`figure[data-doc-image-id="${selectedImageId}"]`);
    if (!figure) {
      clearSelectedImage();
      return;
    }
    saveHistory();
    const next = document.createElement('div');
    next.innerHTML = '<br>';
    figure.replaceWith(next);
    contentRef.current.focus();
    const range = document.createRange();
    range.selectNodeContents(next);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    savedSelectionRef.current = range.cloneRange();
    clearSelectedImage();
    contentRef.current.dispatchEvent(new Event('input', { bubbles: true }));
  }, [clearSelectedImage, contentRef, saveHistory, savedSelectionRef, selectedImageId]);

  const refreshOverlayPosition = useCallback(() => {
    syncSelectedImageOverlay(selectedImageId);
  }, [selectedImageId, syncSelectedImageOverlay]);

  const beginResize = useCallback((clientX: number) => {
    if (!selectedImageId) return;
    const figure = contentRef.current?.querySelector<HTMLElement>(`figure[data-doc-image-id="${selectedImageId}"]`);
    const image = figure?.querySelector<HTMLImageElement>('img');
    if (!image) return;
    imageResizeStateRef.current = {
      imageId: selectedImageId,
      startX: clientX,
      startWidth: image.getBoundingClientRect().width,
    };
    document.body.style.userSelect = 'none';
  }, [contentRef, selectedImageId]);

  useEffect(() => {
    syncSelectedImageOverlay(selectedImageId);
  }, [selectedImageId, syncSelectedImageOverlay]);

  useEffect(() => {
    const handleWindowResize = () => syncSelectedImageOverlay(selectedImageId);
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [selectedImageId, syncSelectedImageOverlay]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const resizeState = imageResizeStateRef.current;
      if (!resizeState || !contentRef.current) return;
      const figure = contentRef.current.querySelector<HTMLElement>(`figure[data-doc-image-id="${resizeState.imageId}"]`);
      const image = figure?.querySelector<HTMLImageElement>('img');
      if (!figure || !image) return;
      const nextWidth = Math.max(160, resizeState.startWidth + (event.clientX - resizeState.startX));
      image.style.width = `${nextWidth}px`;
      image.style.maxWidth = '100%';
      image.style.height = 'auto';
      syncSelectedImageOverlay(resizeState.imageId);
    };

    const onPointerUp = () => {
      if (!imageResizeStateRef.current || !contentRef.current) return;
      imageResizeStateRef.current = null;
      document.body.style.userSelect = '';
      contentRef.current.dispatchEvent(new Event('input', { bubbles: true }));
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [contentRef, syncSelectedImageOverlay]);

  return {
    selectedImageId,
    selectedImageRect,
    selectImage,
    clearSelectedImage,
    removeSelectedImage,
    refreshOverlayPosition,
    beginResize,
  };
}
