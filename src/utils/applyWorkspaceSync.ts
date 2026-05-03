import { useBoardStore } from '../store/boardStore';
import type { WorkspaceOpenResult } from './workspaceManager';

export function applyWorkspaceSyncFromOpenResult(result: WorkspaceOpenResult): void {
  const sync = result.sync;
  if (!sync?.cloudBoardId) return;
  useBoardStore.getState().setCloudBoardState({
    boardId: sync.cloudBoardId,
    title: sync.cloudBoardTitle || result.data?.boardTitle || result.name,
    syncedAt: sync.lastSyncedAt ?? undefined,
  });
}
