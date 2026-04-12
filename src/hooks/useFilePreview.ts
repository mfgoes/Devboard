/**
 * Hook to manage file preview state and lifecycle.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import type React from 'react';
import { readWorkspaceFileAsUrl, readWorkspaceFile } from '../utils/workspaceManager';
import { IMAGE_EXTS, ext } from '../components/explorer/fileTreeUtils';
import type { TreeEntry } from '../components/explorer/fileTreeUtils';

type FilePreview =
  | { kind: 'image'; entry: TreeEntry; url: string; natW: number; natH: number; size: number; anchorY: number }
  | { kind: 'code'; entry: TreeEntry; content: string; anchorY: number };

export function useFilePreview(panelRef: React.RefObject<HTMLDivElement | null>) {
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  // Hide preview on click outside the explorer panel
  useEffect(() => {
    if (!filePreview) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setFilePreview(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filePreview, panelRef]);

  const showFilePreview = useCallback(async (entry: TreeEntry, anchorY: number) => {
    const e = ext(entry.name);
    if (IMAGE_EXTS.has(e)) {
      const url = await readWorkspaceFileAsUrl(entry.path.join('/'));
      if (!url) return;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      const img = new window.Image();
      img.onload = () => {
        setFilePreview({
          kind: 'image',
          entry,
          url,
          natW: img.width,
          natH: img.height,
          size: Math.round(img.width * img.height),
          anchorY,
        });
      };
      img.src = url;
    } else if (CODE_EXTS[e]) {
      const content = await readWorkspaceFile(entry.path.join('/'));
      if (content !== null) {
        setFilePreview({ kind: 'code', entry, content, anchorY });
      }
    }
  }, []);

  const handleFileHover = useCallback((entry: TreeEntry, clientY: number) => {
    showFilePreview(entry, clientY);
  }, [showFilePreview]);

  const clearPreview = useCallback(() => {
    setFilePreview(null);
  }, []);

  return { filePreview, showFilePreview, handleFileHover, clearPreview };
}

// CODE_EXTS is only used for type check; import it here
import { CODE_EXTS } from '../components/explorer/fileTreeUtils';
