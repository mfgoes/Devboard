import type { CloudBoardSummary } from './cloudStorage';
import type { LocalRecentWorkspace } from './workspaceManager';

export type LocalSyncLinkState = { cloudBoardId: string | null; disabled?: boolean } | null;

export interface RecentWorkspaceRow {
  id: string;
  title: string;
  local?: LocalRecentWorkspace;
  cloud?: CloudBoardSummary;
  isCurrent: boolean;
  sortTime: number;
}

export interface WorkspaceLinkResolution {
  linkedCloudWorkspace: CloudBoardSummary | null;
  exactTitleMatches: CloudBoardSummary[];
  identityCloudWorkspace: CloudBoardSummary | null;
  inferredCloudWorkspace: CloudBoardSummary | null;
  effectiveCloudBoardId: string | null;
  effectiveCloudUpdatedAt: number | null;
  syncEnabled: boolean;
}

function normalizedTitle(value: string): string {
  return value.trim().toLowerCase();
}

function cloudTime(workspace: CloudBoardSummary | null | undefined): number {
  return workspace ? new Date(workspace.updatedAt).getTime() : 0;
}

export function resolveWorkspaceLink(options: {
  cloudBoardId: string | null;
  cloudSyncedAt: number | null;
  currentWorkspaceId: string | null;
  currentWorkspaceName: string;
  localSyncLink: LocalSyncLinkState;
  workspaces: CloudBoardSummary[];
}): WorkspaceLinkResolution {
  const {
    cloudBoardId,
    cloudSyncedAt,
    currentWorkspaceId,
    currentWorkspaceName,
    localSyncLink,
    workspaces,
  } = options;

  const linkedCloudWorkspace = workspaces.find((workspace) => workspace.id === cloudBoardId) ?? null;
  const exactTitleMatches = workspaces.filter((workspace) => normalizedTitle(workspace.title) === normalizedTitle(currentWorkspaceName));
  const identityCloudWorkspace = currentWorkspaceId
    ? workspaces.find((workspace) => workspace.logicalWorkspaceId === currentWorkspaceId) ?? null
    : null;
  const linkedByLocalStorage = !localSyncLink?.disabled && localSyncLink?.cloudBoardId
    ? workspaces.find((workspace) => workspace.id === localSyncLink.cloudBoardId) ?? null
    : null;
  const titleMatch = !localSyncLink?.disabled && exactTitleMatches.length === 1 ? exactTitleMatches[0] : null;
  const inferredCloudWorkspace = linkedCloudWorkspace ?? linkedByLocalStorage ?? identityCloudWorkspace ?? titleMatch;
  const effectiveCloudBoardId = cloudBoardId ?? inferredCloudWorkspace?.id ?? null;
  const effectiveCloudUpdatedAt = inferredCloudWorkspace ? cloudTime(inferredCloudWorkspace) : cloudSyncedAt;

  return {
    linkedCloudWorkspace,
    exactTitleMatches,
    identityCloudWorkspace,
    inferredCloudWorkspace,
    effectiveCloudBoardId,
    effectiveCloudUpdatedAt,
    syncEnabled: !!effectiveCloudBoardId,
  };
}

export function findCurrentLocalRecent(options: {
  currentWorkspaceId: string | null;
  currentWorkspaceName: string;
  effectiveCloudBoardId: string | null;
  localRecents: LocalRecentWorkspace[];
}): LocalRecentWorkspace | null {
  const { currentWorkspaceId, currentWorkspaceName, effectiveCloudBoardId, localRecents } = options;
  const currentTitle = normalizedTitle(currentWorkspaceName);
  return localRecents.find((recent) => (
    (!!currentWorkspaceId && recent.workspaceId === currentWorkspaceId)
    || (!!effectiveCloudBoardId && recent.cloudBoardId === effectiveCloudBoardId)
    || normalizedTitle(recent.title) === currentTitle
  )) ?? null;
}

export function buildRecentWorkspaceRows(options: {
  effectiveCloudBoardId: string | null;
  localPathHint: string | null;
  localRecents: LocalRecentWorkspace[];
  workspaces: CloudBoardSummary[];
}): RecentWorkspaceRow[] {
  const { effectiveCloudBoardId, localPathHint, localRecents, workspaces } = options;
  const rows = new Map<string, RecentWorkspaceRow>();

  for (const recent of localRecents) {
    const cloudById = recent.cloudBoardId ? workspaces.find((workspace) => workspace.id === recent.cloudBoardId) : undefined;
    const cloudByWorkspaceId = recent.workspaceId ? workspaces.find((workspace) => workspace.logicalWorkspaceId === recent.workspaceId) : undefined;
    const sameTitleMatches = workspaces.filter((workspace) => normalizedTitle(workspace.title) === normalizedTitle(recent.title));
    const cloud = cloudById ?? cloudByWorkspaceId ?? (sameTitleMatches.length === 1 ? sameTitleMatches[0] : undefined);
    const id = cloud ? `cloud:${cloud.id}` : `local:${recent.id}`;
    const sortTime = Math.max(
      recent.lastSavedAt ?? 0,
      recent.lastOpenedAt,
      cloud?.lastOpenedAt ? new Date(cloud.lastOpenedAt).getTime() : 0,
      cloud ? new Date(cloud.updatedAt).getTime() : 0,
    );
    rows.set(id, {
      id,
      title: cloud?.title ?? recent.cloudBoardTitle ?? recent.title,
      local: recent,
      cloud,
      isCurrent: (!!cloud && cloud.id === effectiveCloudBoardId) || (!!recent.localPathHint && recent.localPathHint === localPathHint),
      sortTime,
    });
  }

  for (const cloud of workspaces) {
    const id = `cloud:${cloud.id}`;
    if (rows.has(id)) {
      const existing = rows.get(id)!;
      rows.set(id, {
        ...existing,
        cloud,
        title: cloud.title,
        isCurrent: existing.isCurrent || cloud.id === effectiveCloudBoardId,
        sortTime: Math.max(
          existing.sortTime,
          cloud.lastOpenedAt ? new Date(cloud.lastOpenedAt).getTime() : 0,
          new Date(cloud.updatedAt).getTime(),
        ),
      });
      continue;
    }
    rows.set(id, {
      id,
      title: cloud.title,
      cloud,
      isCurrent: cloud.id === effectiveCloudBoardId,
      sortTime: Math.max(cloud.lastOpenedAt ? new Date(cloud.lastOpenedAt).getTime() : 0, new Date(cloud.updatedAt).getTime()),
    });
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return b.sortTime - a.sortTime;
  });
}
