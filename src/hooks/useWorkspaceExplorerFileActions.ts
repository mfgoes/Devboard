import { useCallback } from 'react';
import type React from 'react';
import type { TreeEntry } from '../components/explorer/fileTreeUtils';

type FilePreviewLike =
  | { kind: 'image'; entry: TreeEntry; url: string }
  | { kind: 'code'; entry: TreeEntry; content: string }
  | null;

interface UseWorkspaceExplorerFileActionsArgs {
  filePreview: FilePreviewLike;
  clearPreview: () => void;
  clearPagePreview: () => void;
  clearNotePreview: () => void;
  focusAssetPath: (path: string[]) => void;
  openFile: (entry: TreeEntry) => void;
  showFilePreview: (entry: TreeEntry, anchorY: number) => void;
}

export function useWorkspaceExplorerFileActions({
  filePreview,
  clearPreview,
  clearPagePreview,
  clearNotePreview,
  focusAssetPath,
  openFile,
  showFilePreview,
}: UseWorkspaceExplorerFileActionsArgs) {
  const handleFileOpen = useCallback((entry: TreeEntry) => {
    clearPagePreview();
    clearNotePreview();
    clearPreview();
    openFile(entry);
  }, [clearNotePreview, clearPagePreview, clearPreview, openFile]);

  const handleFileDragStart = useCallback((entry: TreeEntry, e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-devboard-entry', JSON.stringify(entry.path));
    e.dataTransfer.effectAllowed = 'copy';

    // Build a ghost drag image
    const ghost = document.createElement('div');
    ghost.style.cssText = [
      'position:fixed', 'top:-999px', 'left:-999px',
      'display:flex', 'align-items:center', 'gap:6px',
      'padding:5px 10px 5px 6px',
      'background:#1e1e2e', 'border:1px solid var(--c-line)',
      'border-radius:8px', 'color:#e2e8f0',
      'font:11px/1 \'JetBrains Mono\',monospace',
      'pointer-events:none', 'white-space:nowrap',
      'box-shadow:0 4px 16px rgba(0,0,0,0.5)',
    ].join(';');

    // Thumbnail if the image is currently previewed
    if (filePreview?.kind === 'image' && filePreview.entry.path.join('/') === entry.path.join('/')) {
      const img = document.createElement('img');
      img.src = filePreview.url;
      img.style.cssText = 'width:36px;height:36px;object-fit:contain;border-radius:4px;opacity:0.9;flex-shrink:0;';
      ghost.appendChild(img);
    }

    const label = document.createElement('span');
    label.textContent = entry.name;
    ghost.appendChild(label);

    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 20, 20);
    requestAnimationFrame(() => { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); });
  }, [filePreview]);

  const handleFileSingleClick = useCallback((entry: TreeEntry, clientY: number) => {
    focusAssetPath(entry.path);
    clearPagePreview();
    clearNotePreview();
    showFilePreview(entry, clientY);
  }, [clearNotePreview, clearPagePreview, focusAssetPath, showFilePreview]);

  return {
    handleFileOpen,
    handleFileDragStart,
    handleFileSingleClick,
  };
}
