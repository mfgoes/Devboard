import { useBoardStore } from '../store/boardStore';
import { toast } from './toast';
import { cloudTimestamp, rememberCloudSyncContext, updateCloudBoard } from './cloudStorage';
import { getDeviceId, getDeviceLabel } from './deviceIdentity';
import { getWorkspacePathHint, saveWorkspace, setWorkspaceSyncMetadata } from './workspaceManager';

export type NoteSaveDestination = 'local' | 'cloud' | 'none';
export type NoteSavePhase = 'idle' | 'queued' | 'saving' | 'saved' | 'error';

export interface NoteSaveStatus {
  phase: NoteSavePhase;
  destination: NoteSaveDestination;
  errorMessage?: string | null;
}

export interface NoteSavePresentation {
  label: string;
  title: string;
  tone: 'neutral' | 'busy' | 'success' | 'warning' | 'danger';
}

export function describeNoteSaveStatus(status: NoteSaveStatus, autosaveEnabled: boolean): NoteSavePresentation {
  const destinationLabel = status.destination === 'cloud' ? 'cloud' : 'local';

  if (!autosaveEnabled) {
    if (status.destination === 'none') {
      return {
        label: 'Manual save only',
        title: 'No workspace folder or cloud workspace is attached. Use Save to download a copy.',
        tone: 'warning',
      };
    }

    return {
      label: 'Manual save mode',
      title: `Auto-save is off. Use Save or Cmd+S to write changes to the ${destinationLabel} workspace.`,
      tone: 'neutral',
    };
  }

  if (status.destination === 'none') {
    return {
      label: 'Manual save only',
      title: 'No workspace folder or cloud workspace is attached. Use Save to download a copy.',
      tone: 'warning',
    };
  }

  if (status.phase === 'queued') {
    return {
      label: status.destination === 'cloud' ? 'Autosaving to cloud...' : 'Autosaving locally...',
      title: status.destination === 'cloud'
        ? 'A cloud autosave is queued and will run shortly.'
        : 'A local autosave is queued and will run shortly.',
      tone: 'busy',
    };
  }

  if (status.phase === 'saving') {
    return {
      label: status.destination === 'cloud' ? 'Syncing to cloud...' : 'Saving locally...',
      title: status.destination === 'cloud'
        ? 'Your changes are syncing to cloud storage now.'
        : 'Your changes are being written to the local workspace now.',
      tone: 'busy',
    };
  }

  if (status.phase === 'saved') {
    return {
      label: status.destination === 'cloud' ? 'Saved to cloud' : 'Saved locally',
      title: status.destination === 'cloud'
        ? 'The latest note state is saved in cloud storage.'
        : 'The latest note state is saved in the local workspace folder.',
      tone: 'success',
    };
  }

  if (status.phase === 'error') {
    return {
      label: status.destination === 'cloud' ? 'Cloud save failed' : 'Save failed',
      title: status.errorMessage ?? (status.destination === 'cloud'
        ? 'The note could not be synced to cloud storage.'
        : 'The note could not be written to the local workspace.'),
      tone: 'danger',
    };
  }

  return {
    label: 'Autosave on',
    title: status.destination === 'cloud'
      ? 'Autosave is enabled and changes will sync to cloud storage.'
      : 'Autosave is enabled and changes will be written to the local workspace.',
    tone: 'neutral',
  };
}

function openCloudModal() {
  window.dispatchEvent(new CustomEvent('devboard:open-cloud-modal'));
}

export function announceLocalSave(kind: 'workspace' | 'file', name?: string | null) {
  const { cloudBoardId, cloudBoardTitle, markLocalSaved } = useBoardStore.getState();
  const target = kind === 'workspace' ? 'workspace folder' : 'local file';
  markLocalSaved(Date.now(), { kind, name });

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
