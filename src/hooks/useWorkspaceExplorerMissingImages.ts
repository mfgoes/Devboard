import { useCallback } from 'react';
import { useBoardStore } from '../store/boardStore';
import type { ImageNode } from '../types';
import { findImageInWorkspace, loadImageAsset, saveWorkspace } from '../utils/workspaceManager';
import { toast } from '../utils/toast';

interface UseWorkspaceExplorerMissingImagesArgs {
  missingImages: ImageNode[];
  missingImagesFixing: boolean;
  missingImagesSignature: string | null;
  hasWorkspaceContext: boolean;
  imageAssetFolder: string | null;
  setMissingImagesOpen: (value: boolean) => void;
  setMissingImagesFixing: (value: boolean) => void;
  updateNode: (id: string, patch: Partial<ImageNode>) => void;
}

export function useWorkspaceExplorerMissingImages({
  missingImages,
  missingImagesFixing,
  missingImagesSignature,
  hasWorkspaceContext,
  imageAssetFolder,
  setMissingImagesOpen,
  setMissingImagesFixing,
  updateNode,
}: UseWorkspaceExplorerMissingImagesArgs) {
  const handleFindMissingImages = useCallback(async () => {
    if (missingImagesFixing || missingImages.length === 0) return;
    setMissingImagesFixing(true);
    let restored = 0;

    try {
      for (const image of missingImages) {
        if (!image.assetName) continue;
        let src = await loadImageAsset(image.assetName, image.assetFolder ?? imageAssetFolder ?? undefined);
        let assetFolder = image.assetFolder ?? imageAssetFolder ?? undefined;

        if (!src) {
          const found = await findImageInWorkspace(image.assetName);
          if (found) {
            src = found.url;
            assetFolder = found.folder;
          }
        }

        if (src) {
          updateNode(image.id, { src, assetFolder } as Partial<ImageNode>);
          restored += 1;
        }
      }

      const remaining = missingImages.length - restored;
      if (restored === missingImages.length) {
        useBoardStore.getState().setIgnoredMissingImagesSignature(null);
        toast(`Restored ${restored} image${restored === 1 ? '' : 's'}`);
        setMissingImagesOpen(false);
      } else if (restored > 0) {
        toast(`Restored ${restored} image${restored === 1 ? '' : 's'}. ${remaining} still missing.`);
      } else {
        toast('Could not find the missing image files. Reopen the workspace folder or place them back in assets/.');
      }
      if (restored > 0 && hasWorkspaceContext) {
        void saveWorkspace(useBoardStore.getState().exportData(), { notify: false });
      }
    } finally {
      setMissingImagesFixing(false);
    }
  }, [hasWorkspaceContext, imageAssetFolder, missingImages, missingImagesFixing, setMissingImagesFixing, setMissingImagesOpen, updateNode]);

  const handleIgnoreMissingImages = useCallback(() => {
    if (!missingImagesSignature) return;
    useBoardStore.getState().setIgnoredMissingImagesSignature(missingImagesSignature);
    setMissingImagesOpen(false);
    if (hasWorkspaceContext) {
      void saveWorkspace(useBoardStore.getState().exportData(), { notify: false });
    }
  }, [hasWorkspaceContext, missingImagesSignature, setMissingImagesOpen]);

  return {
    handleFindMissingImages,
    handleIgnoreMissingImages,
  };
}
