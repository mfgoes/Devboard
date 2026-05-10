import { useBoardStore } from '../store/boardStore';
import { toast } from './toast';
import { cloudTimestamp, rememberCloudSyncContext, updateCloudBoard } from './cloudStorage';
import { getDeviceId, getDeviceLabel } from './deviceIdentity';
import { getWorkspacePathHint, saveWorkspace, setWorkspaceSyncMetadata } from './workspaceManager';

function openCloudModal() {
  window.dispatchEvent(new CustomEvent('devboard:open-cloud-modal'));
}

export function announceLocalSave(kind: 'workspace' | 'file') {
  const { cloudBoardId, cloudBoardTitle, markLocalSaved } = useBoardStore.getState();
  const target = kind === 'workspace' ? 'workspace folder' : 'local file';
  markLocalSaved();

  if (cloudBoardId && cloudBoardTitle) {
    void saveLinkedWorkspaceToCloud(target, {
      successMessage: `Saved locally to your ${target} and synced.`,
      failureMessage: `Saved locally to your ${target}. Sync failed.`,
    });
    return;
  }

  toast(`Saved locally to your ${target}.`);
}

export async function saveLinkedWorkspaceToCloud(
  target: string,
  messages: { successMessage?: string; failureMessage?: string } = {},
): Promise<boolean> {
  const {
    boardTitle,
    cloudBoardId,
    cloudBoardTitle,
    exportData,
    setCloudBoardState,
    workspaceName,
  } = useBoardStore.getState();

  if (!cloudBoardId) return false;
  setWorkspaceSyncMetadata({});

  const title = boardTitle.trim() || workspaceName || cloudBoardTitle || 'Untitled Workspace';

  try {
    const synced = await updateCloudBoard(cloudBoardId, title, exportData());
    setCloudBoardState({
      boardId: synced.id,
      title: synced.title,
      syncedAt: cloudTimestamp(synced.updatedAt),
    });
    setWorkspaceSyncMetadata({
      cloudBoardId: synced.id,
      cloudBoardTitle: synced.title,
      cloudWorkspaceId: synced.workspaceId,
      lastSyncedAt: cloudTimestamp(synced.updatedAt),
    });
    void saveWorkspace(exportData(), { notify: false });
    void rememberCloudSyncContext(synced.id, {
      eventType: 'sync',
      status: 'success',
      deviceId: getDeviceId(),
      deviceLabel: getDeviceLabel(),
      localPathHint: getWorkspacePathHint(),
      metadata: { target },
    });
    if (messages.successMessage) toast(messages.successMessage);
    return true;
  } catch (err) {
    console.warn('Workspace Sync after local save failed', err);
    void rememberCloudSyncContext(cloudBoardId, {
      eventType: 'sync',
      status: 'failure',
      deviceId: getDeviceId(),
      deviceLabel: getDeviceLabel(),
      localPathHint: getWorkspacePathHint(),
      metadata: { target, error: err instanceof Error ? err.message : String(err) },
    });
    toast(messages.failureMessage ?? 'Cloud save failed.', {
      label: 'Workspace Sync',
      onClick: openCloudModal,
    });
    return false;
  }
}
