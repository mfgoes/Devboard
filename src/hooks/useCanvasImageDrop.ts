import { useCallback } from 'react';
import type React from 'react';
import { useBoardStore } from '../store/boardStore';
import { saveImageAsset, saveWorkspace, getWorkspaceName } from '../utils/workspaceManager';
import { placeImageFileAt } from '../utils/canvasPlacement';
import { hasSeenImageNotice } from '../components/ImageFirstUseModal';
import type { ImageNode } from '../types';

function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

export interface UseCanvasImageDropOptions {
  pendingImagePos: React.MutableRefObject<{ x: number; y: number } | null>;
  pendingImageFile: React.MutableRefObject<{ file: File; worldX: number; worldY: number } | null>;
  setShowImageNotice: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useCanvasImageDrop({
  pendingImagePos,
  pendingImageFile,
  setShowImageNotice,
}: UseCanvasImageDropOptions) {
  const { addNode, setActiveTool } = useBoardStore();

  const placeImage = useCallback(
    (file: File, worldX: number, worldY: number, offsetIdx = 0) => {
      const inWorkspace = !!getWorkspaceName();

      const doPlace = (src: string, assetName: string, assetFolder?: string) => {
        const imgEl = new window.Image();
        imgEl.onload = () => {
          const maxW = 600;
          const w = Math.min(imgEl.width, maxW);
          const h = Math.round(imgEl.height * (w / imgEl.width));
          addNode({
            id: generateId(),
            type: 'image',
            x: worldX - w / 2 + offsetIdx * 24,
            y: worldY - h / 2 + offsetIdx * 24,
            width: w,
            height: h,
            src,
            assetName,
            ...(assetFolder ? { assetFolder } : {}),
          } satisfies ImageNode);
          setActiveTool('select');
          if (assetFolder && getWorkspaceName()) {
            setTimeout(() => saveWorkspace(useBoardStore.getState().exportData()), 0);
          }
        };
        imgEl.src = src;
      };

      if (inWorkspace) {
        const folder = useBoardStore.getState().imageAssetFolder;
        const ext = file.name.match(/\.[^.]+$/)?.[0] ?? '.png';
        const uniqueName = generateId() + ext;
        const objectUrl = URL.createObjectURL(file);
        saveImageAsset(uniqueName, file, folder);
        doPlace(objectUrl, uniqueName, folder);
      } else {
        if (!hasSeenImageNotice()) {
          pendingImageFile.current = { file, worldX, worldY };
          setShowImageNotice(true);
          return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          const src = ev.target?.result as string;
          doPlace(src, file.name);
        };
        reader.readAsDataURL(file);
      }
    },
    [addNode, setActiveTool, pendingImageFile, setShowImageNotice]
  );

  const handleImageFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !pendingImagePos.current) return;
      const pos = pendingImagePos.current;
      pendingImagePos.current = null;
      placeImage(file, pos.x, pos.y);
    },
    [placeImage, pendingImagePos]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();

      const entryJson = e.dataTransfer.getData('application/x-devboard-entry');
      if (entryJson) {
        try {
          const pathParts: string[] = JSON.parse(entryJson);
          const rect = e.currentTarget.getBoundingClientRect();
          const { camera: cam } = useBoardStore.getState();
          const worldX = (e.clientX - rect.left - cam.x) / cam.scale;
          const worldY = (e.clientY - rect.top - cam.y) / cam.scale;
          placeImageFileAt(pathParts, worldX, worldY);
        } catch { /* ignore malformed data */ }
        return;
      }

      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const { camera: cam } = useBoardStore.getState();
      const worldX = (e.clientX - rect.left - cam.x) / cam.scale;
      const worldY = (e.clientY - rect.top - cam.y) / cam.scale;
      files.forEach((file, i) => placeImage(file, worldX, worldY, i));
    },
    [placeImage]
  );

  return { placeImage, handleImageFileChange, handleDrop };
}
