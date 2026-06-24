import type { CloudBoardSummary, CloudWorkspaceLocation } from '../utils/cloudStorage';
import { cloudTimestamp } from '../utils/cloudStorage';
import { getDeviceId, getDeviceLabel } from '../utils/deviceIdentity';
import type { LocalRecentWorkspace } from '../utils/workspaceManager';

const LOCAL_SYNC_LINKS_KEY = 'devboard:cloud-workspace-links';

export type CloudWorkspaceSummary = CloudBoardSummary;
export type LocalSyncLink = { cloudBoardId: string | null; title: string; syncedAt: number; disabled?: boolean };
export type WorkspaceDisplayLocation = {
  key: string;
  deviceId?: string | null;
  deviceLabel?: string | null;
  localPathHint?: string | null;
  lastOpenedAt?: string | number | null;
  lastSyncedAt?: string | number | null;
  lastLocalSavedAt?: number | null;
  updatedAt?: string | number | null;
};
export type WorkspaceConflictGroup = {
  key: string;
  reason: string;
  workspaces: CloudWorkspaceSummary[];
};
export type DuplicateReviewRoute = {
  workspaceId: string;
  duplicateWorkspaceIds: string[];
};
export type DuplicateReviewSelection = 'a' | 'b';

function syncLinkKey(userId: string, workspaceName: string): string {
  return `${userId}:${workspaceName.trim().toLowerCase()}`;
}

export function normalizedConflictTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function contentSignature(workspace: CloudWorkspaceSummary): string | null {
  const summary = workspace.contentSummary;
  if (!summary) return null;
  return [
    summary.pages,
    summary.notes,
    summary.canvasItems,
    summary.images,
  ].join(':');
}

export function buildWorkspaceConflictGroups(workspaces: CloudWorkspaceSummary[]): WorkspaceConflictGroup[] {
  const groups = new Map<string, WorkspaceConflictGroup>();
  const coveredSets = new Set<string>();

  const addGroup = (key: string, reason: string, items: CloudWorkspaceSummary[]) => {
    const unique = Array.from(new Map(items.map((workspace) => [workspace.id, workspace])).values());
    const setKey = unique.map((workspace) => workspace.id).sort().join('|');
    if (unique.length < 2 || groups.has(key) || coveredSets.has(setKey)) return;
    coveredSets.add(setKey);
    groups.set(key, {
      key,
      reason,
      workspaces: unique.sort((a, b) => cloudTimestamp(b.updatedAt) - cloudTimestamp(a.updatedAt)),
    });
  };

  const byIdentity = new Map<string, CloudWorkspaceSummary[]>();
  const byTitle = new Map<string, CloudWorkspaceSummary[]>();
  const byTitleAndContent = new Map<string, CloudWorkspaceSummary[]>();

  for (const workspace of workspaces) {
    if (workspace.logicalWorkspaceId) {
      const key = workspace.logicalWorkspaceId;
      byIdentity.set(key, [...(byIdentity.get(key) ?? []), workspace]);
    }

    const titleKey = normalizedConflictTitle(workspace.title);
    if (titleKey) {
      byTitle.set(titleKey, [...(byTitle.get(titleKey) ?? []), workspace]);
      const signature = contentSignature(workspace);
      if (signature) {
        const contentKey = `${titleKey}:${signature}`;
        byTitleAndContent.set(contentKey, [...(byTitleAndContent.get(contentKey) ?? []), workspace]);
      }
    }
  }

  for (const [key, items] of byIdentity) addGroup(`identity:${key}`, 'Same project identity', items);
  for (const [key, items] of byTitleAndContent) addGroup(`content:${key}`, 'Same name and matching contents', items);
  for (const [key, items] of byTitle) addGroup(`title:${key}`, 'Same name', items);

  return Array.from(groups.values()).sort((a, b) => {
    const newestA = cloudTimestamp(a.workspaces[0]?.updatedAt ?? '');
    const newestB = cloudTimestamp(b.workspaces[0]?.updatedAt ?? '');
    return newestB - newestA;
  });
}

export function mapWorkspaceConflicts(groups: WorkspaceConflictGroup[]): Record<string, WorkspaceConflictGroup[]> {
  const byId: Record<string, WorkspaceConflictGroup[]> = {};
  for (const group of groups) {
    for (const workspace of group.workspaces) {
      byId[workspace.id] = [...(byId[workspace.id] ?? []), group];
    }
  }
  return byId;
}

function readLocalSyncLinks(): Record<string, LocalSyncLink> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_SYNC_LINKS_KEY) ?? '{}') as Record<string, LocalSyncLink>;
  } catch {
    return {};
  }
}

export function writeLocalSyncLink(userId: string, workspaceName: string, link: LocalSyncLink): void {
  if (typeof window === 'undefined') return;
  const links = readLocalSyncLinks();
  links[syncLinkKey(userId, workspaceName)] = link;
  window.localStorage.setItem(LOCAL_SYNC_LINKS_KEY, JSON.stringify(links));
}

export function clearLocalSyncLink(userId: string, workspaceName: string): void {
  if (typeof window === 'undefined') return;
  const links = readLocalSyncLinks();
  delete links[syncLinkKey(userId, workspaceName)];
  window.localStorage.setItem(LOCAL_SYNC_LINKS_KEY, JSON.stringify(links));
}

export function getLocalSyncLink(userId: string, workspaceName: string): LocalSyncLink | null {
  return readLocalSyncLinks()[syncLinkKey(userId, workspaceName)] ?? null;
}

export function formatRelativeDate(value: string | number | null): string {
  if (!value) return 'Not yet';
  const ms = typeof value === 'number' ? value : new Date(value).getTime();
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ms).toLocaleDateString();
}

export function formatExactDate(value: string | number | null): string {
  if (!value) return 'Not yet';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDuplicateReviewDate(value: string | number | null): string {
  if (!value) return 'Not yet';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function workspaceContentsLabel(workspace: CloudWorkspaceSummary): string {
  const summary = workspace.contentSummary;
  if (!summary) return 'Content details unavailable';
  return `${summary.notes} notes · ${summary.canvasItems} canvas items`;
}

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function isoFromMs(value: number | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

function bestLocationTime(location: WorkspaceDisplayLocation): number {
  return Math.max(
    location.updatedAt ? new Date(location.updatedAt).getTime() : 0,
    location.lastSyncedAt ? new Date(location.lastSyncedAt).getTime() : 0,
    location.lastLocalSavedAt ?? 0,
    location.lastOpenedAt ? new Date(location.lastOpenedAt).getTime() : 0,
  );
}

export function mergeWorkspaceLocations(
  recent: LocalRecentWorkspace | undefined,
  remoteLocations: CloudWorkspaceLocation[],
): WorkspaceDisplayLocation[] {
  const merged = new Map<string, WorkspaceDisplayLocation>();
  const currentDeviceId = getDeviceId();

  for (const location of remoteLocations) {
    merged.set(location.deviceId, {
      key: location.id,
      deviceId: location.deviceId,
      deviceLabel: location.deviceLabel,
      localPathHint: location.localPathHint,
      lastOpenedAt: location.lastOpenedAt,
      lastSyncedAt: location.lastSyncedAt,
      updatedAt: location.updatedAt,
    });
  }

  if (recent) {
    merged.set(currentDeviceId, {
      key: `local:${recent.id}`,
      deviceId: currentDeviceId,
      deviceLabel: getDeviceLabel(),
      localPathHint: recent.localPathHint,
      lastOpenedAt: isoFromMs(recent.lastOpenedAt),
      lastSyncedAt: isoFromMs(recent.cloudSyncedAt),
      lastLocalSavedAt: recent.lastSavedAt ?? null,
      updatedAt: isoFromMs(Math.max(recent.lastSavedAt ?? 0, recent.lastOpenedAt)),
    });
  }

  return Array.from(merged.values()).sort((a, b) => bestLocationTime(b) - bestLocationTime(a));
}

export function duplicateCopyLabel(count: number): string {
  return `${count} older ${count === 1 ? 'copy' : 'copies'} with the same name found`;
}
