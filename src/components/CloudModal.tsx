import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBoardStore } from '../store/boardStore';
import {
  createCloudBoard as createCloudWorkspaceSnapshot,
  deleteCloudBoard as deleteCloudWorkspaceSnapshot,
  listCloudBoards as listCloudWorkspaces,
  listCloudWorkspaceLocations,
  loadCloudBoard as loadCloudWorkspaceSnapshot,
  rememberCloudSyncContext,
  renameCloudBoard as renameCloudWorkspaceSnapshot,
  updateCloudBoard as updateCloudWorkspaceSnapshot,
  cloudTimestamp,
  type CloudBoardSummary,
  type CloudWorkspaceLocation,
} from '../utils/cloudStorage';
import { toast } from '../utils/toast';
import { supabase } from '../utils/supabase';
import {
  buildWorkspaceLocationMetadata,
  formatWorkspaceLocationLabel,
  getDeviceId,
  getDeviceLabel,
  type DeviceKind,
} from '../utils/deviceIdentity';
import {
  getWorkspacePathHint,
  getWorkspaceSyncMetadata,
  clearWorkspaceCloudSyncMetadata,
  clearWorkspaceHandle,
  createWorkspace,
  downloadCloudWorkspaceToFolder,
  IS_TAURI,
  listLocalRecentWorkspaces,
  openWorkspace,
  openRecentWorkspace,
  revealInFinder,
  relocateRecentWorkspace,
  removeLocalRecentWorkspace,
  saveWorkspace,
  setWorkspaceSyncMetadata,
  type LocalRecentWorkspace,
  type WorkspaceDownloadProgress,
  type WorkspaceOpenResult,
} from '../utils/workspaceManager';
import { applyWorkspaceSyncFromOpenResult } from '../utils/applyWorkspaceSync';
import {
  buildRecentWorkspaceRows,
  findCurrentLocalRecent,
  resolveWorkspaceLink,
  type RecentWorkspaceRow,
} from '../utils/workspaceSyncModel';

const SYNC_WORKSPACE_LIMIT = 10;
const LOCAL_SYNC_LINKS_KEY = 'devboard:cloud-workspace-links';
const CURRENT_WORKSPACE_DOWNLOAD_ROW_ID = 'current-workspace';

type CloudWorkspaceSummary = CloudBoardSummary;
type LocalSyncLink = { cloudBoardId: string | null; title: string; syncedAt: number; disabled?: boolean };
type WorkspaceDisplayLocation = {
  key: string;
  deviceId?: string | null;
  deviceLabel?: string | null;
  localPathHint?: string | null;
  lastOpenedAt?: string | number | null;
  lastSyncedAt?: string | number | null;
  lastLocalSavedAt?: number | null;
  updatedAt?: string | number | null;
};
type WorkspaceConflictGroup = {
  key: string;
  reason: string;
  workspaces: CloudWorkspaceSummary[];
};

function syncLinkKey(userId: string, workspaceName: string): string {
  return `${userId}:${workspaceName.trim().toLowerCase()}`;
}

function normalizedConflictTitle(value: string): string {
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

function buildWorkspaceConflictGroups(workspaces: CloudWorkspaceSummary[]): WorkspaceConflictGroup[] {
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

  for (const [key, items] of byIdentity) addGroup(`identity:${key}`, 'Same workspace identity', items);
  for (const [key, items] of byTitleAndContent) addGroup(`content:${key}`, 'Same name and matching contents', items);
  for (const [key, items] of byTitle) addGroup(`title:${key}`, 'Same name', items);

  return Array.from(groups.values()).sort((a, b) => {
    const newestA = cloudTimestamp(a.workspaces[0]?.updatedAt ?? '');
    const newestB = cloudTimestamp(b.workspaces[0]?.updatedAt ?? '');
    return newestB - newestA;
  });
}

function mapWorkspaceConflicts(groups: WorkspaceConflictGroup[]): Record<string, WorkspaceConflictGroup[]> {
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

function writeLocalSyncLink(userId: string, workspaceName: string, link: LocalSyncLink): void {
  if (typeof window === 'undefined') return;
  const links = readLocalSyncLinks();
  links[syncLinkKey(userId, workspaceName)] = link;
  window.localStorage.setItem(LOCAL_SYNC_LINKS_KEY, JSON.stringify(links));
}

function clearLocalSyncLink(userId: string, workspaceName: string): void {
  if (typeof window === 'undefined') return;
  const links = readLocalSyncLinks();
  delete links[syncLinkKey(userId, workspaceName)];
  window.localStorage.setItem(LOCAL_SYNC_LINKS_KEY, JSON.stringify(links));
}

function getLocalSyncLink(userId: string, workspaceName: string): LocalSyncLink | null {
  return readLocalSyncLinks()[syncLinkKey(userId, workspaceName)] ?? null;
}

function formatRelativeDate(value: string | number | null): string {
  if (!value) return 'Not yet';
  const ms = typeof value === 'number' ? value : new Date(value).getTime();
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ms).toLocaleDateString();
}

function formatExactDate(value: string | number | null): string {
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

function IconGitHub() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1.2a6.8 6.8 0 0 0-2.15 13.25c.34.06.47-.15.47-.33v-1.18c-1.9.41-2.3-.8-2.3-.8-.3-.78-.74-.99-.74-.99-.6-.41.05-.4.05-.4.67.05 1.03.69 1.03.69.6 1.02 1.57.72 1.95.55.06-.43.24-.72.43-.89-1.52-.17-3.13-.76-3.13-3.38 0-.75.27-1.36.7-1.84-.07-.17-.3-.87.07-1.82 0 0 .58-.19 1.9.7a6.6 6.6 0 0 1 3.46 0c1.32-.89 1.89-.7 1.89-.7.38.95.15 1.65.08 1.82.44.48.7 1.09.7 1.84 0 2.63-1.61 3.2-3.15 3.37.25.21.46.62.46 1.26v1.87c0 .18.12.39.48.33A6.8 6.8 0 0 0 8 1.2Z" />
    </svg>
  );
}

function IconGoogle() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M16.45 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.18a3.58 3.58 0 0 1-1.55 2.35v2h2.52c1.48-1.36 2.3-3.37 2.3-5.99Z" fill="currentColor" />
      <path d="M9 16.75c2.09 0 3.85-.69 5.14-1.87l-2.52-2c-.7.47-1.6.75-2.62.75-2.01 0-3.71-1.36-4.32-3.19H2.08v2.06A7.75 7.75 0 0 0 9 16.75Z" fill="currentColor" opacity="0.9" />
      <path d="M4.68 10.44A4.66 4.66 0 0 1 4.44 9c0-.5.08-.99.24-1.44V5.5H2.08A7.75 7.75 0 0 0 1.25 9c0 1.24.3 2.42.83 3.5l2.6-2.06Z" fill="currentColor" opacity="0.75" />
      <path d="M9 4.37c1.14 0 2.16.39 2.96 1.16l2.22-2.22C12.84 2.06 11.09 1.25 9 1.25A7.75 7.75 0 0 0 2.08 5.5l2.6 2.06C5.29 5.73 6.99 4.37 9 4.37Z" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

function errorMessage(err: unknown, fallback: string): string {
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

function mergeWorkspaceLocations(
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

function IconDevice({ kind }: { kind: DeviceKind }) {
  if (kind === 'mac') {
    return (
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--c-text-lo)]" aria-label="Mac">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M11.9 8.5c0-1.5 1.2-2.2 1.3-2.3-.7-1-1.8-1.1-2.2-1.1-.9-.1-1.8.5-2.3.5s-1.2-.5-2-.5c-1 0-2 .6-2.5 1.5-1.1 1.9-.3 4.8.8 6.3.5.8 1.1 1.6 2 1.6.8 0 1.1-.5 2-.5s1.2.5 2 .5.1.1 2-1.7c.4-.6.6-1.2.7-1.3-.1 0-1.6-.6-1.6-2.5ZM10.4 4.1c.4-.5.7-1.2.6-1.9-.6 0-1.3.4-1.7.9-.4.5-.7 1.2-.6 1.8.6.1 1.3-.3 1.7-.8Z" />
        </svg>
      </span>
    );
  }
  if (kind === 'windows') {
    return (
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--c-text-lo)]" aria-label="Windows">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M1.7 3.1 7 2.4v5.1H1.7V3.1Zm6-.8 6.6-.9v6.1H7.7V2.3ZM1.7 8.2H7v5.2l-5.3-.7V8.2Zm6 0h6.6v6.1l-6.6-.9V8.2Z" />
        </svg>
      </span>
    );
  }
  if (kind === 'mobile') {
    return (
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--c-text-lo)]" aria-label="Mobile">
        <svg width="12" height="13" viewBox="0 0 12 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          <rect x="2.2" y="1.4" width="7.6" height="13.2" rx="1.6" />
          <path d="M5 12.2h2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--c-text-lo)]" aria-label="Device">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <rect x="2" y="3" width="12" height="8" rx="1.2" />
        <path d="M6 13h4M8 11v2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function IconRefresh() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M10.2 4.2a4.1 4.1 0 1 0 .2 4.1" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M10.4 1.9v2.6H7.8" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconFolderOpen() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M1.4 4.3a1 1 0 0 1 1-1h2.2l1 1h5a1 1 0 0 1 1 1v.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M1.8 5.6h9.8l-1 4.4a1 1 0 0 1-1 .8H2.8a1 1 0 0 1-1-.8l-.6-3.2a1 1 0 0 1 .6-1.2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <path d="M3 4.3 5.5 6.8 8 4.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconNewWorkspace() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M1.5 4.1a1 1 0 0 1 1-1h2.2l1 1h4.8a1 1 0 0 1 1 1v4.4a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V4.1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6.5 5.7v3M5 7.2h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconEmptyCloud() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M5.8 13.4H13a3 3 0 0 0 .3-6 4.3 4.3 0 0 0-8.2-1.1A3.6 3.6 0 0 0 5.8 13.4Z" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 8.2v3.2M7.4 9.8h3.2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="5" fill="currentColor" opacity="0.18" />
      <path d="M3.2 6.1 5.1 7.9 8.9 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPage() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.35" aria-hidden="true">
      <path d="M3 2h5.1L11 4.9V12H3V2Z" />
      <path d="M8 2v3h3M4.8 7.2h4.4M4.8 9.2h3" strokeLinecap="round" />
    </svg>
  );
}

function IconNote() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.35" aria-hidden="true">
      <path d="M3 2.5h8v9H3z" />
      <path d="M5 5h4M5 7h4M5 9h2.5" strokeLinecap="round" />
    </svg>
  );
}

function IconAsset() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.35" aria-hidden="true">
      <rect x="2.5" y="3" width="9" height="8" rx="1.4" />
      <path d="M4.3 9.2 6.2 7.3l1.3 1.2.9-1 1.4 1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.2" cy="5.4" r=".7" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="7" r="1.15" />
      <circle cx="7" cy="7" r="1.15" />
      <circle cx="11" cy="7" r="1.15" />
    </svg>
  );
}

export default function CloudModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isConfigured, isLoading: authLoading, user, signInWithGoogle, signInWithGitHub, signInWithMagicLink, signInWithEmail, signUpWithEmail, signOut } = useAuth();
  const exportData = useBoardStore((s) => s.exportData);
  const loadBoard = useBoardStore((s) => s.loadBoard);
  const boardTitle = useBoardStore((s) => s.boardTitle);
  const setBoardTitle = useBoardStore((s) => s.setBoardTitle);
  const workspaceName = useBoardStore((s) => s.workspaceName);
  const pages = useBoardStore((s) => s.pages);
  const documents = useBoardStore((s) => s.documents);
  const openDocument = useBoardStore((s) => s.openDocument);
  const nodes = useBoardStore((s) => s.nodes);
  const pageSnapshots = useBoardStore((s) => s.pageSnapshots);
  const lastLocalSavedAt = useBoardStore((s) => s.lastLocalSavedAt);
  const cloudBoardId = useBoardStore((s) => s.cloudBoardId);
  const cloudBoardTitle = useBoardStore((s) => s.cloudBoardTitle);
  const cloudSyncedAt = useBoardStore((s) => s.cloudSyncedAt);
  const setCloudBoardState = useBoardStore((s) => s.setCloudBoardState);
  const clearCloudBoardState = useBoardStore((s) => s.clearCloudBoardState);

  const [workspaces, setWorkspaces] = useState<CloudWorkspaceSummary[]>([]);
  const [cloudLocations, setCloudLocations] = useState<Record<string, CloudWorkspaceLocation[]>>({});
  const [localRecents, setLocalRecents] = useState<LocalRecentWorkspace[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [workspaceMenuId, setWorkspaceMenuId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [renamingWorkspaceId, setRenamingWorkspaceId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [replaceConfirmId, setReplaceConfirmId] = useState<string | null>(null);
  const [detailsRowId, setDetailsRowId] = useState<string | null>(null);
  const [downloadChoiceRowId, setDownloadChoiceRowId] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ rowId: string; progress: WorkspaceDownloadProgress } | null>(null);
  const [syncedBaselines, setSyncedBaselines] = useState<Record<string, number>>({});
  const [syncJustFinished, setSyncJustFinished] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [signInMethod, setSignInMethod] = useState<'social' | 'email'>('social');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmingFirstSync, setConfirmingFirstSync] = useState(false);
  const [activeWorkspaceSyncTab, setActiveWorkspaceSyncTab] = useState<'workspace' | 'library'>('workspace');
  const [libraryTab, setLibraryTab] = useState<'cloud' | 'local' | 'files'>('cloud');
  const passwordRef = useRef<HTMLInputElement>(null);
  const authTabsRef = useRef<HTMLDivElement>(null);
  const signInTabRef = useRef<HTMLButtonElement>(null);
  const signUpTabRef = useRef<HTMLButtonElement>(null);
  const syncFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const [authTabIndicator, setAuthTabIndicator] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
  const modalHeaderSurface = { background: 'color-mix(in srgb, var(--c-panel) 78%, var(--c-canvas))' };
  const leftPaneSurface = { background: 'color-mix(in srgb, var(--c-canvas) 82%, var(--c-panel))' };
  const secondSurface = { background: 'color-mix(in srgb, var(--c-canvas) 58%, var(--c-panel))' };
  const quietSurface = { background: 'color-mix(in srgb, var(--c-canvas) 42%, var(--c-panel))' };
  const betaSurface = { background: 'color-mix(in srgb, var(--c-canvas) 50%, var(--c-panel))' };
  const accountLabel = user?.user_metadata?.user_name
    ?? user?.user_metadata?.preferred_username
    ?? user?.user_metadata?.name
    ?? user?.email
    ?? 'Account';
  const avatarUrl = typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null;
  const accountInitial = accountLabel.trim().charAt(0).toUpperCase() || 'A';

  const currentWorkspaceName = boardTitle.trim() || workspaceName || cloudBoardTitle || 'Untitled Workspace';
  const currentSyncMetadata = getWorkspaceSyncMetadata();
  const currentWorkspaceId = currentSyncMetadata?.workspaceId ?? null;
  const localSyncLink = user ? getLocalSyncLink(user.id, currentWorkspaceName) : null;
  const localPathHint = getWorkspacePathHint();
  const currentLocationLabel = localPathHint
    ? formatWorkspaceLocationLabel({ deviceId: getDeviceId(), deviceLabel: getDeviceLabel(), localPathHint })
    : null;
  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [workspaces, selectedWorkspaceId]
  );
  const workspaceLink = useMemo(
    () => resolveWorkspaceLink({
      cloudBoardId,
      cloudSyncedAt,
      currentWorkspaceId,
      currentWorkspaceName,
      localSyncLink,
      workspaces,
    }),
    [cloudBoardId, cloudSyncedAt, currentWorkspaceId, currentWorkspaceName, localSyncLink, workspaces],
  );
  const {
    exactTitleMatches,
    identityCloudWorkspace,
    inferredCloudWorkspace,
    effectiveCloudBoardId,
    effectiveCloudUpdatedAt,
    syncEnabled,
  } = workspaceLink;
  const currentLocalRecent = useMemo(
    () => findCurrentLocalRecent({
      currentWorkspaceId,
      currentWorkspaceName,
      effectiveCloudBoardId,
      localRecents,
    }),
    [currentWorkspaceId, currentWorkspaceName, effectiveCloudBoardId, localRecents]
  );
  const currentRememberedLocationLabel = !currentLocationLabel && currentLocalRecent?.localPathHint
    ? formatWorkspaceLocationLabel({
        deviceId: getDeviceId(),
        deviceLabel: getDeviceLabel(),
        localPathHint: currentLocalRecent.localPathHint,
      })
    : null;
  const currentLocalFolderTitle = currentLocationLabel?.fullPath ?? currentRememberedLocationLabel?.fullPath ?? undefined;
  const reconnectLocalFolderLabel = currentRememberedLocationLabel
    ? `Reconnect ${currentRememberedLocationLabel.folderName ?? 'folder'}...`
    : 'Reconnect folder...';
  const recentRows = useMemo<RecentWorkspaceRow[]>(() => {
    return buildRecentWorkspaceRows({
      effectiveCloudBoardId,
      localPathHint,
      localRecents,
      workspaces,
    });
  }, [effectiveCloudBoardId, localPathHint, localRecents, workspaces]);
  const cloudWorkspaceRows = useMemo(
    () => workspaces
      .map((workspace) => recentRows.find((row) => row.cloud?.id === workspace.id))
      .filter((row): row is RecentWorkspaceRow => !!row),
    [recentRows, workspaces],
  );
  const localAndRecentRows = useMemo(
    () => recentRows.filter((row) => row.local),
    [recentRows],
  );
  const workspaceConflictGroups = useMemo(
    () => buildWorkspaceConflictGroups(workspaces),
    [workspaces],
  );
  const workspaceConflictsById = useMemo(
    () => mapWorkspaceConflicts(workspaceConflictGroups),
    [workspaceConflictGroups],
  );
  const currentCloudMatches = useMemo(() => {
    const matches = [identityCloudWorkspace, inferredCloudWorkspace, ...exactTitleMatches]
      .filter((workspace): workspace is CloudWorkspaceSummary => !!workspace);
    return Array.from(new Map(matches.map((workspace) => [workspace.id, workspace])).values())
      .sort((a, b) => cloudTimestamp(b.updatedAt) - cloudTimestamp(a.updatedAt));
  }, [exactTitleMatches, identityCloudWorkspace, inferredCloudWorkspace]);
  const recommendedCloudMatch = identityCloudWorkspace ?? inferredCloudWorkspace ?? currentCloudMatches[0] ?? null;
  const unresolvedCloudMatches = syncEnabled ? [] : currentCloudMatches;
  const linkedCloudUpdatedAt = effectiveCloudUpdatedAt;
  const effectiveCloudSyncedAt = effectiveCloudBoardId
    ? Math.max(cloudSyncedAt ?? 0, syncedBaselines[effectiveCloudBoardId] ?? 0) || null
    : cloudSyncedAt;
  const hasUnsyncedLocalChanges = !!cloudBoardId && !!lastLocalSavedAt && !!effectiveCloudSyncedAt && lastLocalSavedAt > effectiveCloudSyncedAt + 1000;
  const hasNewerCloudCopy = !!linkedCloudUpdatedAt && !!effectiveCloudSyncedAt && linkedCloudUpdatedAt > effectiveCloudSyncedAt + 1000;
  const isLinkedSyncSignedOut = !user && syncEnabled;
  const workingOnCloudOnly = !localPathHint && !!currentRememberedLocationLabel && syncEnabled;
  const localFolderAccessNeeded = !localPathHint && !!currentRememberedLocationLabel && !syncEnabled;
  const currentStatus = isLinkedSyncSignedOut
    ? 'Sync paused'
    : !user
      ? 'Local only'
      : localFolderAccessNeeded
      ? 'Folder access needed'
      : workingOnCloudOnly
      ? 'Working on cloud'
      : hasNewerCloudCopy
      ? 'Cloud copy newer'
      : hasUnsyncedLocalChanges
        ? 'Local changes not synced'
        : syncEnabled
          ? 'Synced'
          : 'Sync available';
  const statusTone = currentStatus === 'Synced'
    ? 'border border-[rgba(120,167,145,0.32)] bg-[rgba(120,167,145,0.18)] text-[rgb(72,112,92)]'
    : currentStatus === 'Local changes not synced' || currentStatus === 'Cloud copy newer' || currentStatus === 'Sync paused' || currentStatus === 'Folder access needed'
      ? 'border border-[#f59e0b]/30 bg-[#f59e0b]/15 text-[#b45309]'
      : 'border border-[rgba(54,137,151,0.36)] bg-[rgba(54,137,151,0.15)] text-[rgb(38,103,116)]';
  const primaryActionLabel = !syncEnabled
    ? 'Sync this workspace'
    : hasNewerCloudCopy
      ? 'Review cloud copy'
      : 'Sync now';
  const primaryBusyLabel = !syncEnabled
    ? 'Creating copy...'
    : hasNewerCloudCopy
      ? 'Opening...'
      : 'Syncing...';
  const allCanvasNodes = useMemo(
    () => [...nodes, ...Object.values(pageSnapshots).flatMap((snapshot) => snapshot.nodes)],
    [nodes, pageSnapshots]
  );
  const imageCount = allCanvasNodes.filter((node) => node.type === 'image').length;
  const localFolderConnected = !!localPathHint;
  const currentFolderDownloadProgress = downloadProgress?.rowId === CURRENT_WORKSPACE_DOWNLOAD_ROW_ID ? downloadProgress.progress : null;
  const currentFolderDownloadPercent = currentFolderDownloadProgress
    ? Math.round((currentFolderDownloadProgress.completedSteps / Math.max(currentFolderDownloadProgress.totalSteps, 1)) * 100)
    : 0;
  const openingLocalFolder = actionLoading === 'show-local-folder';
  const reconnectingLocalFolder = actionLoading === 'reconnect-local-folder';
  const creatingLocalFolder = actionLoading === 'create-local-folder' || (!!inferredCloudWorkspace && actionLoading === `download:${inferredCloudWorkspace.id}`);
  const authButtonBaseClass = 'inline-flex w-full items-center justify-center gap-[7px] rounded-lg px-[22px] py-[11px] font-sans text-[0.85rem] font-semibold transition-[opacity,transform,background,color,border-color] duration-150 disabled:cursor-default disabled:opacity-60';
  const authButtonPrimaryClass = `${authButtonBaseClass} border border-transparent bg-[var(--c-line)] text-white hover:-translate-y-px hover:opacity-[0.88]`;
  const authButtonGhostClass = `${authButtonBaseClass} border border-[var(--c-border)] bg-[var(--c-panel)] text-[var(--c-text-md)] hover:-translate-y-px hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]`;

  const reloadLocalRecents = async () => {
    try {
      setLocalRecents(await listLocalRecentWorkspaces());
    } catch (err) {
      console.warn('Failed to load recent workspaces', err);
      setLocalRecents([]);
    }
  };

  const reloadWorkspaces = async (): Promise<CloudWorkspaceSummary[]> => {
    if (!user) return [];
    setWorkspacesLoading(true);
    try {
      const nextWorkspaces = await listCloudWorkspaces(user);
      setWorkspaces(nextWorkspaces);
      setCloudLocations(await listCloudWorkspaceLocations(nextWorkspaces.map((workspace) => workspace.id)));
      setSelectedWorkspaceId((current) => {
        if (cloudBoardId && nextWorkspaces.some((workspace) => workspace.id === cloudBoardId)) return cloudBoardId;
        if (current && nextWorkspaces.some((workspace) => workspace.id === current)) return current;
        return nextWorkspaces[0]?.id ?? null;
      });
      return nextWorkspaces;
    } catch (err) {
      console.warn('Failed to load synced workspaces', err);
      toast(`Could not load synced workspaces. ${errorMessage(err, '')}`.trim());
      setCloudLocations({});
      return [];
    } finally {
      setWorkspacesLoading(false);
    }
  };

  const reloadRecentRows = async () => {
    await reloadLocalRecents();
    return user ? reloadWorkspaces() : [];
  };

  const rememberSyncLink = (workspace: CloudWorkspaceSummary) => {
    if (!user) return;
    const syncedAt = cloudTimestamp(workspace.updatedAt);
    writeLocalSyncLink(user.id, currentWorkspaceName, {
      cloudBoardId: workspace.id,
      title: workspace.title,
      syncedAt,
    });
    setWorkspaceSyncMetadata({
      cloudBoardId: workspace.id,
      cloudBoardTitle: workspace.title,
      cloudWorkspaceId: workspace.workspaceId,
      lastSyncedAt: syncedAt,
    });
    void saveWorkspace(useBoardStore.getState().exportData(), { notify: false });
  };

  const syncContext = (
    eventType: 'create' | 'sync' | 'open' | 'rename' | 'delete' | 'unlink',
    metadata: Record<string, unknown> = {},
  ) => {
    const localPath = getWorkspacePathHint();
    return {
      eventType,
      deviceId: getDeviceId(),
      deviceLabel: getDeviceLabel(),
      localPathHint: localPath,
      metadata: {
        ...buildWorkspaceLocationMetadata({
          workspaceName: currentWorkspaceName,
          localPathHint: localPath,
          lastLocalSavedAt,
          lastSyncedAt: cloudSyncedAt,
        }),
        ...metadata,
      },
    };
  };

  const rememberCloudEvent = (
    workspace: CloudWorkspaceSummary,
    eventType: 'create' | 'sync' | 'open' | 'rename' | 'delete' | 'unlink',
    metadata: Record<string, unknown> = {},
  ) => {
    void rememberCloudSyncContext(workspace.id, syncContext(eventType, metadata));
  };

  const keepCurrentWorkspaceLocalOnly = () => {
    clearCloudBoardState();
    clearWorkspaceCloudSyncMetadata();
    if (user) {
      writeLocalSyncLink(user.id, currentWorkspaceName, {
        cloudBoardId: null,
        title: currentWorkspaceName,
        syncedAt: Date.now(),
        disabled: true,
      });
    }
    void saveWorkspace(useBoardStore.getState().exportData(), { notify: false });
  };

  useEffect(() => {
    if (!open) return;
    void reloadLocalRecents();
    if (user) void reloadWorkspaces();
  }, [open, user]);

  useEffect(() => {
    if (open) return;
    setConfirmingFirstSync(false);
    setAddMenuOpen(false);
    setAccountMenuOpen(false);
    setWorkspaceMenuId(null);
    setDeleteConfirmId(null);
    setReplaceConfirmId(null);
    setRenamingWorkspaceId(null);
    setRenameDraft('');
    setDetailsRowId(null);
    setDownloadChoiceRowId(null);
    setAuthMessage(null);
    setActiveWorkspaceSyncTab('workspace');
    setLibraryTab('cloud');
  }, [open]);

  useEffect(() => {
    if (!open || !user || cloudBoardId || workspaces.length === 0) return;

    const stored = getLocalSyncLink(user.id, currentWorkspaceName);
    if (stored) {
      if (stored.disabled) return;
      const linked = workspaces.find((workspace) => workspace.id === stored.cloudBoardId);
      if (linked) {
        const syncedAt = cloudTimestamp(linked.updatedAt);
        setWorkspaceSyncMetadata({
          cloudBoardId: linked.id,
          cloudBoardTitle: linked.title,
          cloudWorkspaceId: linked.workspaceId,
          lastSyncedAt: syncedAt,
        });
        setCloudBoardState({ boardId: linked.id, title: linked.title, syncedAt });
        setSelectedWorkspaceId(linked.id);
        return;
      }
    }

    const linkedByIdentityOrTitle = identityCloudWorkspace
      ?? (exactTitleMatches.length === 1 && currentWorkspaceName !== 'Untitled Workspace' ? exactTitleMatches[0] : null);

    if (linkedByIdentityOrTitle) {
      const linked = linkedByIdentityOrTitle;
      const syncedAt = cloudTimestamp(linked.updatedAt);
      setWorkspaceSyncMetadata({
        cloudBoardId: linked.id,
        cloudBoardTitle: linked.title,
        cloudWorkspaceId: linked.workspaceId,
        lastSyncedAt: syncedAt,
      });
      setCloudBoardState({ boardId: linked.id, title: linked.title, syncedAt });
      setSelectedWorkspaceId(linked.id);
      writeLocalSyncLink(user.id, currentWorkspaceName, {
        cloudBoardId: linked.id,
        title: linked.title,
        syncedAt,
      });
    }
  }, [cloudBoardId, currentWorkspaceName, exactTitleMatches, identityCloudWorkspace, open, setCloudBoardState, user, workspaces]);

  useEffect(() => {
    if (authMode === 'signup') {
      setSignInMethod('email');
      return;
    }
    setSignInMethod('social');
  }, [authMode]);

  useEffect(() => {
    return () => {
      if (syncFeedbackTimerRef.current) clearTimeout(syncFeedbackTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [accountMenuOpen]);

  useLayoutEffect(() => {
    const container = authTabsRef.current;
    const activeTab = authMode === 'signin' ? signInTabRef.current : signUpTabRef.current;
    if (!container || !activeTab) return;

    const updateIndicator = () => {
      setAuthTabIndicator({
        left: activeTab.offsetLeft,
        width: activeTab.offsetWidth,
      });
    };

    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [authMode]);

  if (!open) return null;

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      console.warn('Google sign-in failed', err);
      toast('Google sign-in could not start.');
    }
  };

  const handleGitHubSignIn = async () => {
    try {
      await signInWithGitHub();
    } catch (err) {
      console.warn('GitHub sign-in failed', err);
      toast('GitHub sign-in could not start.');
    }
  };

  const handleEmailAuth = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password.trim()) {
      setAuthMessage('Enter both email and password.');
      return;
    }

    setActionLoading(authMode === 'signin' ? 'auth-email-signin' : 'auth-email-signup');
    setAuthMessage(null);
    try {
      if (authMode === 'signin') {
        await signInWithEmail(trimmedEmail, password);
        setAuthMessage('Signed in.');
      } else {
        const result = await signUpWithEmail(trimmedEmail, password);
        setAuthMessage(
          result.needsEmailConfirmation
            ? 'Check your email to confirm your account, then come back and sign in.'
            : 'Account created and signed in.'
        );
      }
    } catch (err) {
      console.warn('Email auth failed', err);
      const message = err instanceof Error ? err.message : 'Email authentication failed.';
      setAuthMessage(message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleMagicLinkSignIn = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setAuthMessage('Enter your email address first.');
      return;
    }

    setActionLoading('auth-magic-link');
    setAuthMessage(null);
    try {
      await signInWithMagicLink(trimmedEmail);
      setAuthMessage('Magic link sent. Check your inbox to sign in.');
    } catch (err) {
      console.warn('Magic link sign-in failed', err);
      const message = err instanceof Error ? err.message : 'Could not send magic link. Try again.';
      setAuthMessage(message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setAuthMessage('Enter your email address first.');
      return;
    }
    setActionLoading('forgot-password');
    setAuthMessage(null);
    try {
      if (!supabase) throw new Error('Supabase not configured.');
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
      if (error) throw error;
      setAuthMessage('Password reset email sent. Check your inbox.');
    } catch (err) {
      console.warn('Password reset failed', err);
      setAuthMessage('Could not send reset email. Try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSignOut = async () => {
    setAccountMenuOpen(false);
    try {
      await signOut();
      toast('Signed out.');
    } catch (err) {
      console.warn('Sign-out failed', err);
      toast('Could not sign out right now.');
    }
  };

  const handleCreateOnlineCopy = async () => {
    if (!user) return;
    if (!cloudBoardId && workspaces.length >= SYNC_WORKSPACE_LIMIT) {
      toast(`Free beta sync currently supports ${SYNC_WORKSPACE_LIMIT} workspaces. Replace one later if you need to rotate projects.`);
      return;
    }

    setActionLoading('save-new');
    try {
      setWorkspaceSyncMetadata(getWorkspaceSyncMetadata() ?? {});
      const saved = await createCloudWorkspaceSnapshot(user, currentWorkspaceName, exportData());
      setCloudBoardState({ boardId: saved.id, title: saved.title, syncedAt: cloudTimestamp(saved.updatedAt) });
      rememberSyncLink(saved);
      rememberCloudEvent(saved, 'create', { action: 'create_cloud_copy', lastSyncedAt: cloudTimestamp(saved.updatedAt) });
      setConfirmingFirstSync(false);
      toast('Created online workspace copy.');
      await reloadRecentRows();
      setSelectedWorkspaceId(saved.id);
    } catch (err) {
      console.warn('Failed to create online workspace copy', err);
      toast(`Could not sync this workspace. ${errorMessage(err, '')}`.trim());
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateLinkedWorkspace = async () => {
    if (!user) return;
    const targetWorkspace = inferredCloudWorkspace ?? selectedWorkspace;
    if (!targetWorkspace) {
      toast('Pick a synced workspace first, or sync this workspace.');
      return;
    }
    setSelectedWorkspaceId(targetWorkspace.id);
    setActionLoading(`update:${targetWorkspace.id}`);
    setSyncJustFinished(false);
    try {
      if (!getWorkspaceSyncMetadata()?.workspaceId && targetWorkspace.logicalWorkspaceId) {
        setWorkspaceSyncMetadata({ workspaceId: targetWorkspace.logicalWorkspaceId });
      } else {
        setWorkspaceSyncMetadata(getWorkspaceSyncMetadata() ?? {});
      }
      const updated = await updateCloudWorkspaceSnapshot(targetWorkspace.id, currentWorkspaceName || targetWorkspace.title, exportData());
      const syncedAt = cloudTimestamp(updated.updatedAt);
      setSyncedBaselines((current) => ({ ...current, [updated.id]: syncedAt }));
      setCloudBoardState({ boardId: updated.id, title: updated.title, syncedAt });
      rememberSyncLink(updated);
      rememberCloudEvent(updated, 'sync', { action: 'sync_now', lastSyncedAt: syncedAt });
      toast('Synced current workspace.');
      const reloadedWorkspaces = await reloadRecentRows();
      const reloadedWorkspace = reloadedWorkspaces.find((workspace) => workspace.id === updated.id);
      const finalSyncedAt = Math.max(
        syncedAt,
        reloadedWorkspace ? cloudTimestamp(reloadedWorkspace.updatedAt) : 0,
      );
      if (finalSyncedAt > syncedAt) {
        setSyncedBaselines((current) => ({ ...current, [updated.id]: finalSyncedAt }));
        setCloudBoardState({ boardId: updated.id, title: updated.title, syncedAt: finalSyncedAt });
      }
      setSelectedWorkspaceId(updated.id);
      setSyncJustFinished(true);
      if (syncFeedbackTimerRef.current) clearTimeout(syncFeedbackTimerRef.current);
      syncFeedbackTimerRef.current = setTimeout(() => setSyncJustFinished(false), 2400);
    } catch (err) {
      console.warn('Failed to sync workspace', err);
      toast(`Could not sync this workspace. ${errorMessage(err, '')}`.trim());
    } finally {
      setActionLoading(null);
    }
  };

  const handleReplaceWorkspace = async (workspace: CloudWorkspaceSummary) => {
    if (!user) return;
    setSelectedWorkspaceId(workspace.id);
    setActionLoading(`replace:${workspace.id}`);
    try {
      const updated = await updateCloudWorkspaceSnapshot(workspace.id, currentWorkspaceName || workspace.title, exportData());
      const syncedAt = cloudTimestamp(updated.updatedAt);
      setSyncedBaselines((current) => ({ ...current, [updated.id]: syncedAt }));
      setCloudBoardState({ boardId: updated.id, title: updated.title, syncedAt });
      rememberSyncLink(updated);
      rememberCloudEvent(updated, 'sync', { action: 'replace_with_current', lastSyncedAt: syncedAt });
      setWorkspaceMenuId(null);
      setReplaceConfirmId(null);
      toast(`Replaced "${workspace.title}" with the current workspace.`);
      await reloadRecentRows();
      setSelectedWorkspaceId(updated.id);
    } catch (err) {
      console.warn('Failed to replace synced workspace', err);
      toast(`Could not replace synced workspace. ${errorMessage(err, '')}`.trim());
    } finally {
      setActionLoading(null);
    }
  };

  const handleConnectCloudMatch = async (workspace: CloudWorkspaceSummary) => {
    if (!user) return;

    const syncedAt = cloudTimestamp(workspace.updatedAt);
    setActionLoading(`connect:${workspace.id}`);
    try {
      setWorkspaceSyncMetadata({
        workspaceId: workspace.logicalWorkspaceId ?? currentWorkspaceId ?? `cloud-board:${workspace.id}`,
        cloudBoardId: workspace.id,
        cloudBoardTitle: workspace.title,
        cloudWorkspaceId: workspace.workspaceId,
        lastSyncedAt: syncedAt,
      });
      setCloudBoardState({ boardId: workspace.id, title: workspace.title, syncedAt });
      writeLocalSyncLink(user.id, currentWorkspaceName, {
        cloudBoardId: workspace.id,
        title: workspace.title,
        syncedAt,
      });
      rememberCloudEvent(workspace, 'sync', { action: 'connect_existing_cloud_copy', lastSyncedAt: syncedAt });
      await saveWorkspace(useBoardStore.getState().exportData(), { notify: false });
      setSelectedWorkspaceId(workspace.id);
      setDetailsRowId(null);
      setConfirmingFirstSync(false);
      toast(`Connected "${workspace.title}" to this workspace.`);
    } catch (err) {
      console.warn('Failed to connect synced workspace', err);
      toast(`Could not connect cloud copy. ${errorMessage(err, '')}`.trim());
    } finally {
      setActionLoading(null);
    }
  };

  const startRenameWorkspace = (workspace: CloudWorkspaceSummary) => {
    setRenamingWorkspaceId(workspace.id);
    setRenameDraft(workspace.title);
    setDeleteConfirmId(null);
    setReplaceConfirmId(null);
    setDownloadChoiceRowId(null);
    setWorkspaceMenuId(null);
  };

  const cancelRenameWorkspace = () => {
    setRenamingWorkspaceId(null);
    setRenameDraft('');
  };

  const handleRenameWorkspace = async (workspace: CloudWorkspaceSummary) => {
    const nextTitle = renameDraft.trim();
    if (!nextTitle || nextTitle === workspace.title) {
      cancelRenameWorkspace();
      return;
    }

    setActionLoading(`rename:${workspace.id}`);
    try {
      const renamed = await renameCloudWorkspaceSnapshot(workspace.id, nextTitle);
      rememberCloudEvent(renamed, 'rename');
      if (workspace.id === cloudBoardId) {
        const syncedAt = cloudSyncedAt ?? cloudTimestamp(renamed.updatedAt);
        setWorkspaceSyncMetadata({
          cloudBoardId: renamed.id,
          cloudBoardTitle: renamed.title,
          cloudWorkspaceId: renamed.workspaceId,
          lastSyncedAt: syncedAt,
        });
        setCloudBoardState({ boardId: renamed.id, title: renamed.title, syncedAt });
        setBoardTitle(renamed.title);
        if (user) {
          writeLocalSyncLink(user.id, renamed.title, {
            cloudBoardId: renamed.id,
            title: renamed.title,
            syncedAt,
          });
        }
        void saveWorkspace(useBoardStore.getState().exportData(), { notify: false });
      }
      setWorkspaces((current) => current.map((item) => item.id === renamed.id ? renamed : item));
      cancelRenameWorkspace();
      toast('Renamed synced workspace.');
      await reloadRecentRows();
    } catch (err) {
      console.warn('Failed to rename synced workspace', err);
      toast(`Could not rename synced workspace. ${errorMessage(err, '')}`.trim());
    } finally {
      setActionLoading(null);
    }
  };

  const handlePrimaryAction = async () => {
    if (syncEnabled) {
      if (hasNewerCloudCopy && inferredCloudWorkspace) {
        await handleLoadWorkspace(inferredCloudWorkspace);
        return;
      }
      await handleUpdateLinkedWorkspace();
      return;
    }
    if (!confirmingFirstSync) {
      setConfirmingFirstSync(true);
      return;
    }
    await handleCreateOnlineCopy();
  };

  const handleLoadWorkspace = async (workspace: CloudWorkspaceSummary) => {
    if (hasUnsyncedLocalChanges) {
      const ok = window.confirm('Open this online workspace copy? Your current workspace has local changes that are not synced yet.');
      if (!ok) return;
    }
    setActionLoading(`load:${workspace.id}`);
    try {
      const cloudWorkspace = await loadCloudWorkspaceSnapshot(workspace.id);
      clearWorkspaceHandle();
      useBoardStore.getState().setWorkspaceName(null);
      loadBoard({ ...cloudWorkspace, boardTitle: workspace.title });
      setWorkspaceSyncMetadata({
        workspaceId: workspace.logicalWorkspaceId ?? cloudWorkspace.workspaceIdentity?.workspaceId ?? `cloud-board:${workspace.id}`,
        cloudBoardId: workspace.id,
        cloudBoardTitle: workspace.title,
        cloudWorkspaceId: workspace.workspaceId,
        lastSyncedAt: cloudTimestamp(workspace.updatedAt),
      });
      setCloudBoardState({ boardId: workspace.id, title: workspace.title, syncedAt: cloudTimestamp(workspace.updatedAt) });
      rememberCloudEvent(workspace, 'open', { action: 'open_cloud_snapshot', lastSyncedAt: cloudTimestamp(workspace.updatedAt) });
      setSelectedWorkspaceId(workspace.id);
      toast(`Opened "${workspace.title}" from DevBoard Sync.`);
      onClose();
    } catch (err) {
      console.warn('Failed to open synced workspace', err);
      toast('Could not open that synced workspace.');
    } finally {
      setActionLoading(null);
    }
  };

  const applyOpenedLocalWorkspace = (result: WorkspaceOpenResult | null) => {
    if (!result) return;
    useBoardStore.getState().setWorkspaceName(result.name);
    if (result.data) {
      loadBoard(result.data);
    } else {
      loadBoard({ boardTitle: result.name, nodes: [] });
    }
    applyWorkspaceSyncFromOpenResult(result);
  };

  const handleDownloadWorkspace = async (workspace: CloudWorkspaceSummary, rowId: string) => {
    if (hasUnsyncedLocalChanges) {
      const ok = window.confirm('Download this online workspace copy? Your current workspace has local changes that are not synced yet.');
      if (!ok) return;
    }

    setSelectedWorkspaceId(workspace.id);
    setWorkspaceMenuId(null);
    setDownloadChoiceRowId(null);
    setActionLoading(`download:${workspace.id}`);
    setDownloadProgress({
      rowId,
      progress: {
        totalSteps: 1,
        completedSteps: 0,
        label: 'Loading synced workspace...',
      },
    });

    try {
      const cloudWorkspace = await loadCloudWorkspaceSnapshot(workspace.id);
      const result = await downloadCloudWorkspaceToFolder({
        cloud: {
          boardId: workspace.id,
          title: workspace.title,
          workspaceId: workspace.workspaceId,
          logicalWorkspaceId: workspace.logicalWorkspaceId,
          updatedAt: workspace.updatedAt,
        },
        data: { ...cloudWorkspace, boardTitle: workspace.title },
        onProgress: (progress) => setDownloadProgress({ rowId, progress }),
      });
      if (!result) return;

      applyOpenedLocalWorkspace(result);
      setCloudBoardState({ boardId: workspace.id, title: workspace.title, syncedAt: cloudTimestamp(workspace.updatedAt) });
      rememberCloudEvent(workspace, 'open', { action: 'download_to_folder', lastSyncedAt: cloudTimestamp(workspace.updatedAt) });
      await reloadRecentRows();
      setSelectedWorkspaceId(workspace.id);
      onClose();
    } catch (err) {
      console.warn('Failed to download synced workspace', err);
      toast(`Could not download synced workspace. ${errorMessage(err, '')}`.trim());
    } finally {
      setActionLoading(null);
      setDownloadProgress(null);
    }
  };

  const handleOpenLocalFolder = async () => {
    if (!localPathHint) {
      toast('Reconnect a local folder first.');
      return;
    }
    if (!IS_TAURI) {
      toast('Folder access is connected in this browser. Use your system file picker to open it.');
      return;
    }

    setActionLoading('show-local-folder');
    try {
      const shown = await revealInFinder('');
      if (shown) toast('Opened local folder.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReconnectLocalFolder = async () => {
    setAddMenuOpen(false);
    setActionLoading('reconnect-local-folder');
    try {
      const result = await openWorkspace();
      if (!result) return;
      applyOpenedLocalWorkspace(result);
      await reloadRecentRows();
      toast(`Connected local folder · ${result.name}`);
    } catch (err) {
      console.warn('Failed to reconnect local folder', err);
      toast('Could not reconnect that folder.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateLocalFolder = async () => {
    setAddMenuOpen(false);
    if (!localPathHint && currentLocalRecent) {
      toast('This workspace already has a remembered local folder. Reconnect it, or save an explicit copy.');
      return;
    }

    if (inferredCloudWorkspace) {
      await handleDownloadWorkspace(inferredCloudWorkspace, CURRENT_WORKSPACE_DOWNLOAD_ROW_ID);
      return;
    }

    if (!IS_TAURI) {
      toast('Creating a new workspace folder from here is available in the desktop app.');
      return;
    }

    setActionLoading('create-local-folder');
    try {
      const result = await createWorkspace(exportData(), currentWorkspaceName || 'DevBoard Workspace');
      if (!result) return;

      useBoardStore.getState().setWorkspaceName(result.name);
      if (effectiveCloudBoardId) {
        const syncedAt = linkedCloudUpdatedAt ?? cloudSyncedAt ?? Date.now();
        setWorkspaceSyncMetadata({
          cloudBoardId: effectiveCloudBoardId,
          cloudBoardTitle: cloudBoardTitle ?? currentWorkspaceName,
          lastSyncedAt: syncedAt,
        });
        setCloudBoardState({
          boardId: effectiveCloudBoardId,
          title: cloudBoardTitle ?? currentWorkspaceName,
          syncedAt,
        });
        await saveWorkspace(exportData(), { notify: false });
      }
      await reloadRecentRows();
      toast(`Created local folder · ${result.name}`);
    } catch (err) {
      console.warn('Failed to create local folder', err);
      toast('Could not create a local folder.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenRecentRow = async (row: RecentWorkspaceRow) => {
    if (row.local && row.local.permissionState !== 'denied' && row.local.permissionState !== 'missing') {
      setActionLoading(`open-local:${row.local.id}`);
      try {
        const result = await openRecentWorkspace(row.local.id);
        if (!result) {
          toast('Could not reopen that local workspace. Relocate the folder to reconnect it.');
          await reloadLocalRecents();
          return;
        }
        applyOpenedLocalWorkspace(result);
        if (row.cloud) {
          rememberCloudEvent(row.cloud, 'open', {
            action: 'open_local_folder',
            lastLocalSavedAt: row.local.lastSavedAt ?? null,
            lastSyncedAt: row.local.cloudSyncedAt ?? null,
          });
        }
        onClose();
        return;
      } catch (err) {
        console.warn('Failed to open recent local workspace', err);
        toast('Could not reopen that local workspace.');
      } finally {
        setActionLoading(null);
      }
    }

    if (row.cloud) {
      if (!row.local) {
        setSelectedWorkspaceId(row.cloud.id);
        setWorkspaceMenuId(null);
        setDownloadChoiceRowId((current) => current === row.id ? null : row.id);
        return;
      }
      await handleLoadWorkspace(row.cloud);
      return;
    }

    if (row.local) toast('Relocate this workspace folder to open it.');
  };

  const handleRelocateRecent = async (recent: LocalRecentWorkspace) => {
    setActionLoading(`relocate:${recent.id}`);
    try {
      const result = await relocateRecentWorkspace(recent.id);
      if (!result) return;
      applyOpenedLocalWorkspace(result);
      await reloadLocalRecents();
      onClose();
    } catch (err) {
      console.warn('Failed to relocate recent workspace', err);
      toast('Could not relocate that workspace.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveRecent = async (recent: LocalRecentWorkspace) => {
    setActionLoading(`remove-recent:${recent.id}`);
    try {
      await removeLocalRecentWorkspace(recent.id);
      setWorkspaceMenuId(null);
      toast('Removed workspace from recents. Local files were not changed.');
      await reloadLocalRecents();
    } catch (err) {
      console.warn('Failed to remove recent workspace', err);
      toast('Could not remove that recent workspace.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteWorkspace = async (workspace: CloudWorkspaceSummary) => {
    setActionLoading(`delete:${workspace.id}`);
    try {
      await deleteCloudWorkspaceSnapshot(workspace.id);
      rememberCloudEvent(workspace, 'delete');
      if (workspace.id === effectiveCloudBoardId) {
        keepCurrentWorkspaceLocalOnly();
        if (user) clearLocalSyncLink(user.id, currentWorkspaceName);
      }
      setWorkspaceMenuId(null);
      setDeleteConfirmId(null);
      setReplaceConfirmId(null);
      if (renamingWorkspaceId === workspace.id) cancelRenameWorkspace();
      setSelectedWorkspaceId((current) => current === workspace.id ? null : current);
      toast('Deleted synced workspace. Local files were not changed.');
      await reloadRecentRows();
    } catch (err) {
      console.warn('Failed to delete synced workspace', err);
      toast(`Could not delete synced workspace. ${errorMessage(err, '')}`.trim());
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartNewWorkspace = () => {
    setAddMenuOpen(false);
    loadBoard({
      boardTitle: 'Untitled Workspace',
      nodes: [],
      pages: [
        {
          id: 'page-1',
          name: 'Page 1',
          layoutMode: 'freeform',
          noteSort: 'updated',
          nodes: [],
          camera: { x: 0, y: 0, scale: 1 },
        },
      ],
      activePageId: 'page-1',
      documents: [],
      schemaVersion: 3,
    });
    onClose();
  };

  const renderWorkspaceRow = (row: RecentWorkspaceRow, options: { cloudShelf?: boolean } = {}) => {
    const workspace = row.cloud;
    const recent = row.local;
    const selected = workspace ? workspace.id === selectedWorkspaceId : workspaceMenuId === row.id;
    const localUnavailable = recent?.permissionState === 'denied' || recent?.permissionState === 'missing';
    const cloudUpdatedAt = workspace ? cloudTimestamp(workspace.updatedAt) : null;
    const localUpdatedAt = recent ? Math.max(recent.lastSavedAt ?? 0, recent.lastOpenedAt) : null;
    const optimisticSyncedAt = workspace ? syncedBaselines[workspace.id] ?? null : null;
    const recentMatchesWorkspace = !!workspace && !!recent && (
      recent.cloudBoardId === workspace.id
      || (!!workspace.logicalWorkspaceId && recent.workspaceId === workspace.logicalWorkspaceId)
    );
    const syncedLocalBaseline = workspace && recentMatchesWorkspace
      ? Math.max(
          recent.cloudSyncedAt ?? 0,
          optimisticSyncedAt ?? 0,
          row.isCurrent && workspace.id === effectiveCloudBoardId ? cloudSyncedAt ?? 0 : 0,
          localUpdatedAt ?? 0,
        )
      : localUpdatedAt;
    const cloudNewer = !!cloudUpdatedAt && !!syncedLocalBaseline && cloudUpdatedAt > syncedLocalBaseline + 1000;
    const localChanges = !!cloudUpdatedAt
      && !!recent?.lastSavedAt
      && recent.lastSavedAt > cloudUpdatedAt + 1000
      && (!syncedLocalBaseline || syncedLocalBaseline < recent.lastSavedAt - 1000);
    const downloading = workspace && actionLoading === `download:${workspace.id}`;
    const busy = (workspace && actionLoading === `load:${workspace.id}`) || (recent && actionLoading === `open-local:${recent.id}`) || downloading;
    const deleting = workspace && actionLoading === `delete:${workspace.id}`;
    const replacing = workspace && actionLoading === `replace:${workspace.id}`;
    const renaming = !!workspace && renamingWorkspaceId === workspace.id;
    const renameBusy = workspace && actionLoading === `rename:${workspace.id}`;
    const menuOpen = workspaceMenuId === row.id;
    const detailsOpen = detailsRowId === row.id;
    const confirmingDelete = !!workspace && deleteConfirmId === workspace.id;
    const confirmingReplace = !!workspace && replaceConfirmId === workspace.id;
    const canRemoveRecent = !!recent && (!workspace || localUnavailable);
    const primaryLabel = localUnavailable && recent
      ? 'Relocate'
      : cloudNewer
        ? 'Review cloud copy'
        : workspace && !recent
          ? 'Open cloud'
          : 'Open';
    const contentSummary = workspace?.contentSummary ?? recent?.contentSummary;
    const cloudOnly = !!workspace && !recent;
    const workspaceConflicts = workspace ? workspaceConflictsById[workspace.id] ?? [] : [];
    const conflictPeers = workspaceConflicts
      .flatMap((group) => group.workspaces)
      .filter((candidate, index, all) => candidate.id !== workspace?.id && all.findIndex((item) => item.id === candidate.id) === index);
    const choiceOpen = cloudOnly && downloadChoiceRowId === row.id;
    const displayLocations = mergeWorkspaceLocations(recent, workspace ? cloudLocations[workspace.id] ?? [] : []);
    const primaryLocation = displayLocations[0] ?? null;
    const primaryLocationLabel = primaryLocation ? formatWorkspaceLocationLabel(primaryLocation) : null;
    const rowDownloadProgress = downloadProgress?.rowId === row.id ? downloadProgress.progress : null;
    const progressPercent = rowDownloadProgress
      ? Math.round((rowDownloadProgress.completedSteps / Math.max(rowDownloadProgress.totalSteps, 1)) * 100)
      : 0;
    const timingLabel = options.cloudShelf && workspace
      ? `Cloud ${formatExactDate(workspace.updatedAt)}${recent ? ` · Local ${formatExactDate(localUpdatedAt)}` : ''}`
      : `${recent ? `Local ${formatExactDate(localUpdatedAt)}` : `Updated ${formatExactDate(workspace?.updatedAt ?? null)}`}${workspace && recent ? ` · Cloud ${formatExactDate(workspace.updatedAt)}` : ''}`;

    return (
      <div
        key={row.id}
        className={[
          'relative w-full overflow-visible rounded-xl border px-3 py-2.5 transition-colors',
          selected
            ? 'border-[var(--c-text-lo)] bg-[var(--c-hover)]'
            : options.cloudShelf
              ? 'border-[rgba(120,167,145,0.34)] bg-[rgba(120,167,145,0.08)] hover:bg-[rgba(120,167,145,0.12)]'
              : 'border-[var(--c-border)] bg-[var(--c-panel)] hover:bg-[var(--c-hover)]',
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-3">
          <button
            onClick={() => {
              if (workspace) setSelectedWorkspaceId(workspace.id);
              setWorkspaceMenuId(null);
            }}
            className="min-w-0 flex-1 text-left"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <p className="truncate font-sans text-[12px] font-semibold text-[var(--c-text-hi)]">{row.title}</p>
              {row.isCurrent && <span className="shrink-0 rounded-md border border-[var(--c-border)] bg-[var(--c-panel)] px-1.5 py-0.5 font-sans text-[10px] font-semibold text-[var(--c-text-md)]">Current</span>}
              {workspace && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[rgba(120,167,145,0.18)] px-2 py-0.5 font-sans text-[10px] font-semibold text-[rgb(72,112,92)]"><IconCheck /> Synced</span>}
              {!workspace && <span className="shrink-0 rounded-full bg-[var(--c-hover)] px-2 py-0.5 font-sans text-[10px] font-semibold text-[var(--c-text-md)]">Local only</span>}
              {workspace && !recent && <span className="shrink-0 rounded-full bg-[var(--c-hover)] px-2 py-0.5 font-sans text-[10px] font-semibold text-[var(--c-text-md)]">Cloud only</span>}
              {workspaceConflicts.length > 0 && <span className="shrink-0 rounded-full bg-[#f59e0b]/15 px-2 py-0.5 font-sans text-[10px] font-semibold text-[#b45309]">Merge candidate</span>}
              {localUnavailable && <span className="shrink-0 rounded-full bg-[#f59e0b]/15 px-2 py-0.5 font-sans text-[10px] font-semibold text-[#b45309]">Needs folder access</span>}
              {cloudNewer && <span className="shrink-0 rounded-full bg-[#f59e0b]/15 px-2 py-0.5 font-sans text-[10px] font-semibold text-[#b45309]">Cloud newer</span>}
              {localChanges && <span className="shrink-0 rounded-full bg-[#f59e0b]/15 px-2 py-0.5 font-sans text-[10px] font-semibold text-[#b45309]">Local changes</span>}
            </div>
            <p className="mt-0.5 font-sans text-[10px] text-[var(--c-text-lo)]">
              {timingLabel}
            </p>
            {(primaryLocationLabel || workspace) && (
              <p className="mt-0.5 flex min-w-0 items-center gap-1 truncate font-sans text-[10px] text-[var(--c-text-lo)]" title={primaryLocationLabel?.fullPath ?? undefined}>
                {primaryLocationLabel && <IconDevice kind={primaryLocationLabel.deviceKind} />}
                <span className="truncate">
                  {primaryLocationLabel ? primaryLocationLabel.label : 'Available from DevBoard Sync'}
                </span>
              </p>
            )}
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => localUnavailable && recent ? void handleRelocateRecent(recent) : void handleOpenRecentRow(row)}
              disabled={actionLoading !== null}
              className="rounded-lg border border-[var(--c-border)] bg-[var(--c-panel)] px-2.5 py-1.5 font-sans text-[10px] text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-canvas)] hover:text-[var(--c-text-hi)] disabled:cursor-default disabled:opacity-50"
            >
              {downloading ? 'Downloading...' : busy ? 'Opening...' : primaryLabel}
            </button>
            <button
              onClick={() => {
                if (workspace) setSelectedWorkspaceId(workspace.id);
                setWorkspaceMenuId((current) => current === row.id ? null : row.id);
                setDeleteConfirmId(null);
                setReplaceConfirmId(null);
                setDetailsRowId(null);
                setDownloadChoiceRowId(null);
                cancelRenameWorkspace();
              }}
              disabled={actionLoading !== null}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--c-text-lo)] transition-colors hover:bg-[var(--c-canvas)] hover:text-[var(--c-text-hi)] disabled:cursor-default disabled:opacity-50"
              aria-label={`More actions for ${row.title}`}
            >
              <IconMore />
            </button>
          </div>
        </div>

        {workspace && choiceOpen && !rowDownloadProgress && (
          <div className="mt-3 rounded-lg border border-[var(--c-border)] px-3 py-2" style={secondSurface}>
            <p className="font-sans text-[12px] font-semibold text-[var(--c-text-hi)]">Open this synced workspace?</p>
            <p className="mt-1 font-sans text-[11px] leading-relaxed text-[var(--c-text-md)]">
              Open the online snapshot now, or download it into an empty local folder for normal workspace saves.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => void handleDownloadWorkspace(workspace, row.id)} disabled={actionLoading !== null} className="rounded-lg bg-[var(--c-line)] px-2.5 py-1.5 font-sans text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-60">
                Download to folder...
              </button>
              <button onClick={() => void handleLoadWorkspace(workspace)} disabled={actionLoading !== null} className="rounded-lg border border-[var(--c-border)] px-2.5 py-1.5 font-sans text-[11px] font-semibold text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-canvas)] hover:text-[var(--c-text-hi)] disabled:cursor-default disabled:opacity-60">
                Open cloud
              </button>
              <button onClick={() => setDownloadChoiceRowId(null)} disabled={actionLoading !== null} className="px-1 py-1.5 font-sans text-[11px] text-[var(--c-text-lo)] transition-colors hover:text-[var(--c-text-hi)] disabled:cursor-default disabled:opacity-60">
                Cancel
              </button>
            </div>
          </div>
        )}

        {rowDownloadProgress && (
          <div className="mt-3 rounded-lg border border-[rgba(54,137,151,0.26)] bg-[rgba(54,137,151,0.08)] px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate font-sans text-[11px] font-semibold text-[var(--c-text-hi)]">{rowDownloadProgress.label}</p>
              <span className="shrink-0 font-sans text-[11px] font-semibold text-[rgb(38,103,116)]">{progressPercent}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--c-border)]/60">
              <div className="h-full rounded-full bg-[var(--c-line)] transition-[width] duration-200" style={{ width: `${progressPercent}%` }} />
            </div>
            {rowDownloadProgress.warning && (
              <p className="mt-2 font-sans text-[11px] leading-relaxed text-[#b45309]">{rowDownloadProgress.warning}</p>
            )}
          </div>
        )}

        {workspace && renaming && (
          <div className="mt-3 rounded-lg border border-[var(--c-border)] px-3 py-2" style={secondSurface}>
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--c-text-lo)]">Rename synced workspace</p>
            <input
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleRenameWorkspace(workspace);
                if (e.key === 'Escape') cancelRenameWorkspace();
                e.stopPropagation();
              }}
              className="mt-2 w-full rounded-lg border border-[var(--c-border)] bg-[var(--c-panel)] px-3 py-2 font-sans text-[12px] text-[var(--c-text-hi)] outline-none focus:border-[var(--c-line)]"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => void handleRenameWorkspace(workspace)} disabled={actionLoading !== null} className="rounded-lg bg-[var(--c-line)] px-2.5 py-1.5 font-sans text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-60">
                {renameBusy ? 'Renaming...' : 'Rename'}
              </button>
              <button onClick={cancelRenameWorkspace} disabled={actionLoading !== null} className="px-1 py-1.5 font-sans text-[11px] text-[var(--c-text-lo)] transition-colors hover:text-[var(--c-text-hi)] disabled:cursor-default disabled:opacity-60">
                Cancel
              </button>
            </div>
          </div>
        )}

        {menuOpen && !confirmingDelete && !confirmingReplace && !renaming && (
          <div className="absolute right-4 top-12 z-30 w-52 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] p-1.5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                setDetailsRowId((current) => current === row.id ? null : row.id);
                setWorkspaceMenuId(null);
              }}
              className="w-full rounded-lg px-2.5 py-2 text-left font-sans text-[11px] font-semibold text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
            >
              {detailsOpen ? 'Hide details' : 'See details'}
            </button>
            {workspace && (
              <>
                <button onClick={() => startRenameWorkspace(workspace)} className="w-full rounded-lg px-2.5 py-2 text-left font-sans text-[11px] font-semibold text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]">Rename</button>
                <button onClick={() => setReplaceConfirmId(workspace.id)} className="w-full rounded-lg px-2.5 py-2 text-left font-sans text-[11px] font-semibold text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]">Replace with current</button>
                <button onClick={() => void handleDownloadWorkspace(workspace, row.id)} className="w-full rounded-lg px-2.5 py-2 text-left font-sans text-[11px] font-semibold text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]">Download to folder...</button>
                <button onClick={() => setDeleteConfirmId(workspace.id)} className="w-full rounded-lg px-2.5 py-2 text-left font-sans text-[11px] font-semibold text-[#b45309] transition-colors hover:bg-[#f59e0b]/10 hover:text-[#92400e]">Delete synced copy</button>
              </>
            )}
            {recent && localUnavailable && (
              <button onClick={() => void handleRelocateRecent(recent)} className="w-full rounded-lg px-2.5 py-2 text-left font-sans text-[11px] font-semibold text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]">Relocate folder</button>
            )}
            {canRemoveRecent && (
              <button onClick={() => void handleRemoveRecent(recent)} className="w-full rounded-lg px-2.5 py-2 text-left font-sans text-[11px] font-semibold text-[#b45309] transition-colors hover:bg-[#f59e0b]/10 hover:text-[#92400e]">Remove from recents</button>
            )}
          </div>
        )}

        {detailsOpen && (
          <div className="mt-3 rounded-lg border border-[var(--c-border)] px-3 py-2" style={secondSurface}>
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--c-text-lo)]">Workspace details</p>
            {contentSummary ? (
              <p className="mt-2 font-sans text-[12px] leading-relaxed text-[var(--c-text-hi)]">
                Pages: {contentSummary.pages} &middot; Notes: {contentSummary.notes} &middot; Canvas items: {contentSummary.canvasItems} &middot; Images: {contentSummary.images}
              </p>
            ) : (
              <p className="mt-2 font-sans text-[12px] leading-relaxed text-[var(--c-text-md)]">
                Content details will appear after this workspace is opened or synced again.
              </p>
            )}
            <div className="mt-2 grid gap-1 font-sans text-[11px] text-[var(--c-text-lo)]">
              {recent && <p>Local: <span className="text-[var(--c-text-md)]">{formatExactDate(localUpdatedAt)}</span></p>}
              {workspace && <p>Cloud: <span className="text-[var(--c-text-md)]">{formatExactDate(workspace.updatedAt)}</span></p>}
            </div>
            {workspaceConflicts.length > 0 && (
              <div className="mt-3 rounded-lg border border-[#f59e0b]/25 bg-[#f59e0b]/10 px-3 py-2">
                <p className="font-sans text-[11px] font-semibold text-[#92400e]">Possible merge conflict</p>
                <p className="mt-1 font-sans text-[11px] leading-relaxed text-[#b45309]">
                  {workspaceConflicts.map((group) => group.reason).join(', ')} with {conflictPeers.length} other cloud {conflictPeers.length === 1 ? 'copy' : 'copies'}.
                </p>
                {conflictPeers.length > 0 && (
                  <p className="mt-1 truncate font-sans text-[10px] text-[var(--c-text-lo)]" title={conflictPeers.map((peer) => peer.title).join(', ')}>
                    Also found: {conflictPeers.map((peer) => peer.title).join(', ')}
                  </p>
                )}
              </div>
            )}
            {displayLocations.length > 0 && (
              <div className="mt-3 border-t border-[var(--c-border)]/70 pt-2">
                <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--c-text-lo)]">Locations</p>
                <div className="mt-2 grid gap-2">
                  {displayLocations.map((location) => {
                    const label = formatWorkspaceLocationLabel(location);
                    const lastLabel = location.lastLocalSavedAt
                      ? 'Last edited'
                      : location.lastSyncedAt
                        ? 'Last synced'
                        : 'Last opened';
                    const lastValue = location.lastLocalSavedAt ?? location.lastSyncedAt ?? location.lastOpenedAt ?? null;
                    return (
                      <div key={location.key} className="rounded-lg border border-[var(--c-border)]/70 px-2.5 py-2" style={quietSurface}>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <IconDevice kind={label.deviceKind} />
                          <p className="truncate font-sans text-[11px] font-semibold text-[var(--c-text-hi)]" title={label.fullPath ?? undefined}>{label.label}</p>
                        </div>
                        <div className="mt-1 grid gap-0.5 font-sans text-[10px] text-[var(--c-text-lo)]">
                          <p>{lastLabel}: <span className="text-[var(--c-text-md)]">{formatExactDate(lastValue)}</span></p>
                          {label.fullPath && <p className="truncate" title={label.fullPath}>Path: <span className="text-[var(--c-text-md)]">{label.fullPath}</span></p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {workspace && confirmingReplace && (
          <div className="mt-3 rounded-lg border border-[var(--c-line)]/25 bg-[rgba(184,119,80,0.10)] px-3 py-2">
            <p className="font-sans text-[12px] font-semibold text-[var(--c-text-hi)]">Replace this synced copy?</p>
            <p className="mt-1 font-sans text-[11px] leading-relaxed text-[var(--c-text-md)]">This overwrites the online copy with the workspace currently open here.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => void handleReplaceWorkspace(workspace)} disabled={actionLoading !== null} className="rounded-lg bg-[var(--c-line)] px-2.5 py-1.5 font-sans text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-60">
                {replacing ? 'Replacing...' : 'Replace'}
              </button>
              <button onClick={() => { setReplaceConfirmId(null); setWorkspaceMenuId(null); }} disabled={actionLoading !== null} className="px-1 py-1.5 font-sans text-[11px] text-[var(--c-text-lo)] transition-colors hover:text-[var(--c-text-hi)] disabled:cursor-default disabled:opacity-60">Cancel</button>
            </div>
          </div>
        )}

        {workspace && confirmingDelete && (
          <div className="absolute right-4 top-12 z-30 w-64 rounded-xl border border-[#f59e0b]/25 bg-[var(--c-panel)] px-3 py-3 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <p className="font-sans text-[12px] font-semibold text-[var(--c-text-hi)]">Delete synced copy?</p>
            <p className="mt-1 font-sans text-[11px] leading-relaxed text-[var(--c-text-md)]">This removes the online copy only. Your local workspace stays on this device.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => void handleDeleteWorkspace(workspace)} disabled={actionLoading !== null} className="rounded-lg bg-[#b45309] px-2.5 py-1.5 font-sans text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-60">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
              <button onClick={() => { setDeleteConfirmId(null); setWorkspaceMenuId(null); }} disabled={actionLoading !== null} className="px-1 py-1.5 font-sans text-[11px] text-[var(--c-text-lo)] transition-colors hover:text-[var(--c-text-hi)] disabled:cursor-default disabled:opacity-60">Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      data-native-clipboard="true"
      className="fixed inset-0 z-[260] flex items-center justify-center bg-black/55 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={[
          'relative flex max-h-[86vh] select-text flex-col overflow-hidden rounded-2xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl',
          user ? 'w-[min(94vw,900px)]' : 'w-[min(94vw,1080px)]',
        ].join(' ')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className={[
            'absolute right-4 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--c-text-lo)] transition-all',
            user
              ? 'hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]'
              : 'bg-[rgba(255,248,240,0.3)] backdrop-blur-sm hover:bg-[rgba(255,248,240,0.6)] hover:text-[var(--c-text-hi)] md:right-4 md:top-3',
          ].join(' ')}
          aria-label="Close workspace sync modal"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M3.5 3.5 12.5 12.5" />
            <path d="M12.5 3.5 3.5 12.5" />
          </svg>
        </button>

        <div className={user ? 'flex items-center justify-between gap-4 border-b border-[var(--c-border)] px-5 py-4 pr-16' : 'hidden'} style={user ? modalHeaderSurface : undefined}>
          <div className="min-w-0">
            <h2 className="font-sans text-[18px] font-semibold text-[var(--c-text-hi)]">
              Workspace Sync
            </h2>
            <p className="mt-1 font-sans text-[12px] text-[var(--c-text-lo)]">
              Your chosen workspaces, ready wherever you need them.
            </p>
          </div>
          <div className="relative shrink-0" ref={accountMenuRef}>
            <button
              type="button"
              onClick={() => setAccountMenuOpen((current) => !current)}
              className={[
                'flex h-8 min-w-0 max-w-[220px] items-center gap-2 rounded border px-2 font-sans text-[11px] transition-colors',
                accountMenuOpen
                  ? 'border-[var(--c-line)] bg-[var(--c-hover)] text-[var(--c-text-hi)]'
                  : 'border-[var(--c-border)] text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]',
              ].join(' ')}
              title={user?.email ?? accountLabel}
              aria-expanded={accountMenuOpen}
            >
              <div className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--c-line)] font-sans text-[9px] font-semibold text-white">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  accountInitial
                )}
              </div>
              <span className="min-w-0 max-w-[120px] truncate">
                {accountLabel}
              </span>
              <IconChevronDown />
            </button>
            {accountMenuOpen && (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-60 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] py-1.5 shadow-2xl">
                <div className="px-3 py-2">
                  <p className="truncate font-sans text-[11px] font-semibold text-[var(--c-text-hi)]">{accountLabel}</p>
                  {user?.email && (
                    <p className="mt-0.5 truncate font-sans text-[10px] text-[var(--c-text-lo)]">{user.email}</p>
                  )}
                </div>
                <div className="my-1 border-t border-[var(--c-border)]" />
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left font-sans text-[12px] font-semibold text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                >
                  <IconGitHub />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!isConfigured ? (
          <div className="px-6 py-8">
            <p className="font-sans text-[13px] leading-relaxed text-[var(--c-text-md)]">
              Supabase is not configured yet. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable Workspace Sync login and storage.
            </p>
          </div>
        ) : !user ? (
          <div className="grid min-h-[640px] md:grid-cols-[minmax(0,1fr),420px]">
            <div className="flex min-w-0 items-center px-5 py-6 sm:px-8 md:px-10 md:py-10">
              <div className="mx-auto w-full max-w-[520px]">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--c-border)] bg-[var(--c-canvas)]/55 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-lo)]">
                  DevBoard Sync
                </div>

                <p className="mt-5 font-sans text-[28px] font-semibold leading-[1.05] text-[var(--c-text-hi)] sm:text-[36px]">
                  {authMode === 'signin' ? 'Sync selected workspaces anywhere.' : 'Create your DevBoard account.'}
                </p>
                <p className="mt-3 max-w-[42ch] font-sans text-[14px] leading-relaxed text-[var(--c-text-md)] sm:text-[15px]">
                  {authMode === 'signin'
                    ? 'Local work stays free and yours. Sign in to use free beta sync for selected project folders.'
                    : 'Create an account to use free beta sync, reopen workspaces on another device, and keep online copies of the projects you choose.'}
                </p>

                <div ref={authTabsRef} className="relative mt-7 flex gap-6 border-b border-[var(--c-border)]">
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 h-[2px] bg-[var(--c-line)] transition-[left,width] duration-200 ease-out"
                    style={{ left: authTabIndicator.left, width: authTabIndicator.width }}
                  />
                  <button
                    ref={signInTabRef}
                    onClick={() => {
                      setAuthMode('signin');
                      setAuthMessage(null);
                    }}
                    className={`relative z-[1] -mb-px pb-2 font-sans text-[14px] font-semibold transition-colors ${authMode === 'signin' ? 'text-[var(--c-text-hi)]' : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)]'}`}
                  >
                    Sign in
                  </button>
                  <button
                    ref={signUpTabRef}
                    onClick={() => {
                      setAuthMode('signup');
                      setAuthMessage(null);
                    }}
                    className={`relative z-[1] -mb-px pb-2 font-sans text-[14px] font-semibold transition-colors ${authMode === 'signup' ? 'text-[var(--c-text-hi)]' : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)]'}`}
                  >
                    Create account
                  </button>
                </div>

                {authMode === 'signin' && signInMethod === 'social' && (
                  <div className="mt-7 space-y-3">
                    <button onClick={handleGitHubSignIn} disabled={authLoading} className={authButtonPrimaryClass}>
                      <IconGitHub />
                      {authLoading ? 'Checking session...' : 'Continue with GitHub'}
                    </button>

                    <button onClick={handleGoogleSignIn} disabled={authLoading} className={authButtonGhostClass}>
                      <IconGoogle />
                      Continue with Google
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSignInMethod('email');
                        setAuthMessage(null);
                      }}
                      className="pt-1 font-sans text-[12px] font-medium text-[var(--c-text-lo)] underline decoration-[var(--c-border)] underline-offset-4 transition-colors hover:text-[var(--c-text-hi)]"
                    >
                      Use email instead
                    </button>
                  </div>
                )}

                {(authMode === 'signup' || signInMethod === 'email') && (
                  <div className={['mt-7', authMode === 'signin' ? 'rounded-2xl border border-[var(--c-border)] bg-[var(--c-canvas)]/5 p-4 sm:p-5' : ''].join(' ')}>
                    {authMode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setSignInMethod('social');
                          setAuthMessage(null);
                        }}
                        className="mb-4 font-sans text-[12px] font-medium text-[var(--c-text-lo)] transition-colors hover:text-[var(--c-text-hi)]"
                      >
                        Back to social sign-in
                      </button>
                    )}

                    <div className="mb-4">
                      <p className="font-sans text-[14px] font-semibold text-[var(--c-text-hi)]">
                        {authMode === 'signin' ? 'Email sign-in' : 'Create account with email'}
                      </p>
                      <p className="mt-1 font-sans text-[12px] leading-relaxed text-[var(--c-text-lo)]">
                        {authMode === 'signin'
                          ? 'Handy for testing or internal access.'
                          : 'Use a password-based account if you prefer email auth.'}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') passwordRef.current?.focus(); }}
                        placeholder="name@example.com"
                        autoComplete="email"
                        inputMode="email"
                        enterKeyHint="next"
                        className="w-full rounded-lg border border-[var(--c-border)] bg-[var(--c-panel)] px-4 py-3 font-sans text-[14px] text-[var(--c-text-hi)] outline-none transition-colors focus:border-[var(--c-line)]"
                      />
                      <div className="relative">
                        <input
                          ref={passwordRef}
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') void handleEmailAuth(); }}
                          placeholder="Password"
                          autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                          enterKeyHint="done"
                          className="w-full rounded-lg border border-[var(--c-border)] bg-[var(--c-panel)] py-3 pl-4 pr-11 font-sans text-[14px] text-[var(--c-text-hi)] outline-none transition-colors focus:border-[var(--c-line)]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[var(--c-text-lo)] transition-colors hover:text-[var(--c-text-hi)]"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                              <line x1="1" y1="1" x2="23" y2="23"/>
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </svg>
                          )}
                        </button>
                      </div>
                      {authMode === 'signin' && (
                        <div className="flex justify-end">
                          <button type="button" onClick={() => void handleForgotPassword()} disabled={actionLoading === 'forgot-password'} className="font-sans text-[12px] text-[var(--c-text-lo)] transition-colors hover:text-[var(--c-text-md)] disabled:opacity-60">
                            Forgot password?
                          </button>
                        </div>
                      )}
                      <button onClick={() => void handleEmailAuth()} disabled={actionLoading === 'auth-email-signin' || actionLoading === 'auth-email-signup'} className={authButtonPrimaryClass}>
                        {actionLoading === 'auth-email-signin'
                          ? 'Signing in...'
                          : actionLoading === 'auth-email-signup'
                            ? 'Creating account...'
                            : authMode === 'signin'
                              ? 'Sign in with email'
                              : 'Create account'}
                      </button>
                      {authMode === 'signin' && (
                        <button
                          type="button"
                          onClick={() => void handleMagicLinkSignIn()}
                          disabled={actionLoading === 'auth-magic-link'}
                          className={authButtonGhostClass}
                        >
                          {actionLoading === 'auth-magic-link' ? 'Sending link...' : 'Email me a magic link'}
                        </button>
                      )}
                      {authMessage && <p className="font-sans text-[12px] leading-relaxed text-[var(--c-text-md)]">{authMessage}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="relative hidden overflow-hidden border-l border-[var(--c-border)] bg-[linear-gradient(180deg,rgba(184,119,80,0.14),rgba(184,119,80,0.04)_38%,rgba(255,255,255,0))] md:block">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(184,119,80,0.18),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(120,167,145,0.16),transparent_34%)]" />
              <div className="relative flex h-full flex-col justify-between p-7">
                <div className="max-w-[280px]">
                  <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-lo)]">
                    Free beta sync, local-first
                  </p>
                  <h3 className="mt-3 font-sans text-[28px] font-semibold leading-tight text-[var(--c-text-hi)]">
                    Your folder stays yours. Sync is the convenience layer.
                  </h3>
                  <p className="mt-3 font-sans text-[13px] leading-relaxed text-[var(--c-text-md)]">
                    Sync up to {SYNC_WORKSPACE_LIMIT} selected workspaces, reopen them on another device, and keep working locally whenever you want.
                  </p>
                </div>

                <div className="relative mt-8 min-h-[340px]">
                  <div className="absolute left-8 top-7 z-10 w-[246px] rounded-[28px] border border-white/60 bg-[rgba(255,255,255,0.72)] p-4 shadow-[0_24px_70px_rgba(54,35,24,0.16)] backdrop-blur" style={{ animation: 'auth-card-float-a 6.4s ease-in-out infinite' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--c-text-lo)]">Workspace</p>
                        <p className="mt-1 font-sans text-[15px] font-semibold text-[var(--c-text-hi)]">Novel draft</p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(120,167,145,0.18)] px-2 py-1 text-[10px] font-semibold text-[rgb(72,112,92)]"><IconCheck /> Synced</span>
                    </div>
                    <div className="mt-4 space-y-2 font-sans text-[11px] text-[var(--c-text-lo)]">
                      <div className="flex justify-between"><span>Local save</span><span>today 16:58</span></div>
                      <div className="flex justify-between"><span>Cloud sync</span><span>today 17:00</span></div>
                    </div>
                  </div>

                  <div className="absolute bottom-11 right-11 z-20 w-[236px] rounded-[28px] border border-[rgba(57,42,30,0.12)] bg-[rgba(43,33,26,0.96)] p-4 text-white shadow-[0_28px_80px_rgba(22,14,10,0.34)]" style={{ animation: 'auth-card-float-b 5.8s ease-in-out infinite 0.6s' }}>
                      <p className="font-sans text-[13px] font-semibold text-white">DevBoard Sync</p>
                      <p className="mt-2 font-sans text-[11px] leading-relaxed text-white/60">
                      Free during beta while we learn what serious workspace sync needs.
                      </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[560px] flex-col" style={leftPaneSurface}>
            <div className="border-b border-[var(--c-border)] px-5 pt-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex gap-1 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] p-1">
                  {[
                    { id: 'workspace' as const, label: 'This workspace' },
                    { id: 'library' as const, label: 'Library' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveWorkspaceSyncTab(tab.id);
                        setWorkspaceMenuId(null);
                        setDetailsRowId(null);
                      }}
                      className={[
                        'rounded-lg px-3 py-2 font-sans text-[12px] font-semibold transition-colors',
                        activeWorkspaceSyncTab === tab.id
                          ? 'bg-[var(--c-line)] text-white shadow-sm'
                          : 'text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]',
                      ].join(' ')}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <p className="pb-2 font-sans text-[11px] font-semibold text-[var(--c-text-lo)]">
                  Nothing will be deleted until you confirm.
                </p>
              </div>
            </div>

            {activeWorkspaceSyncTab === 'workspace' ? (
              <div className="grid min-h-0 flex-1 gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1fr),320px]">
                <div className="space-y-4">
                  <section className="rounded-2xl border border-[var(--c-border)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]" style={secondSurface}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-lo)]">This workspace</p>
                        <h3 className="mt-1 truncate font-sans text-[20px] font-semibold text-[var(--c-text-hi)]">
                          {currentWorkspaceName}
                        </h3>
                      </div>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-sans text-[10px] font-semibold uppercase tracking-[0.12em] ${statusTone}`}>
                        {currentStatus === 'Synced' && <IconCheck />}
                        {currentStatus}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-[var(--c-border)] px-3 py-3" style={quietSurface}>
                        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--c-text-lo)]">Local status</p>
                        <p className="mt-1 font-sans text-[13px] font-semibold text-[var(--c-text-hi)]">
                          {localFolderConnected ? 'Folder connected' : currentRememberedLocationLabel ? 'Reconnect folder' : 'Local-only draft'}
                        </p>
                        <p className="mt-0.5 truncate font-sans text-[11px] text-[var(--c-text-md)]" title={currentLocalFolderTitle}>
                          {currentLocationLabel?.label ?? currentRememberedLocationLabel?.label ?? 'No local folder connected'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[var(--c-border)] px-3 py-3" style={quietSurface}>
                        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--c-text-lo)]">Cloud status</p>
                        <p className="mt-1 font-sans text-[13px] font-semibold text-[var(--c-text-hi)]">
                          {syncEnabled ? 'Connected to cloud' : unresolvedCloudMatches.length > 0 ? 'Matches need review' : 'Not synced yet'}
                        </p>
                        <p className="mt-0.5 font-sans text-[11px] text-[var(--c-text-md)]">
                          {syncEnabled ? `Last synced ${formatExactDate(linkedCloudUpdatedAt)}` : `${unresolvedCloudMatches.length} possible ${unresolvedCloudMatches.length === 1 ? 'copy' : 'copies'}`}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                      {[
                        { label: 'Pages', value: pages.length, icon: <IconPage /> },
                        { label: 'Notes', value: documents.length, icon: <IconNote /> },
                        { label: 'Canvas items', value: allCanvasNodes.length, icon: <IconAsset /> },
                        { label: 'Images', value: imageCount, icon: <IconAsset /> },
                      ].map((item) => (
                        <div key={item.label} className="rounded-xl border border-[var(--c-border)] px-3 py-2.5" style={quietSurface}>
                          <div className="flex items-center gap-2 text-[var(--c-line)]">{item.icon}</div>
                          <p className="mt-2 font-sans text-[18px] font-semibold text-[var(--c-text-hi)]">{item.value}</p>
                          <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--c-text-lo)]">{item.label}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  {unresolvedCloudMatches.length > 0 && recommendedCloudMatch ? (
                    <section className="rounded-2xl border border-[#f59e0b]/30 bg-[#f59e0b]/10 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-sans text-[13px] font-semibold text-[#92400e]">
                            {unresolvedCloudMatches.length} cloud {unresolvedCloudMatches.length === 1 ? 'match' : 'matches'} found
                          </p>
                          <p className="mt-1 font-sans text-[11px] leading-relaxed text-[#b45309]">
                            Choose whether this workspace should connect to the matching cloud copy or stay separate.
                          </p>
                        </div>
                        <span className="rounded-full bg-[#f59e0b]/15 px-2.5 py-1 font-sans text-[10px] font-semibold text-[#b45309]">
                          Review before syncing
                        </span>
                      </div>

                      <div className="mt-3 rounded-xl border border-[#f59e0b]/25 bg-[var(--c-panel)] px-3 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--c-text-lo)]">Recommended cloud copy</p>
                            <p className="mt-1 truncate font-sans text-[16px] font-semibold text-[var(--c-text-hi)]">{recommendedCloudMatch.title}</p>
                            <p className="mt-0.5 font-sans text-[11px] text-[var(--c-text-md)]">
                              Cloud {formatExactDate(recommendedCloudMatch.updatedAt)}
                              {recommendedCloudMatch.contentSummary ? ` · ${recommendedCloudMatch.contentSummary.pages} pages · ${recommendedCloudMatch.contentSummary.notes} notes` : ''}
                            </p>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[rgba(120,167,145,0.18)] px-2 py-1 font-sans text-[10px] font-semibold text-[rgb(72,112,92)]">
                            <IconCheck />
                            Best match
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setDetailsRowId((current) => current === `match:${recommendedCloudMatch.id}` ? null : `match:${recommendedCloudMatch.id}`)}
                            className="rounded-lg border border-[var(--c-border)] px-3 py-2 font-sans text-[11px] font-semibold text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                          >
                            {detailsRowId === `match:${recommendedCloudMatch.id}` ? 'Hide compare' : 'Compare'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleConnectCloudMatch(recommendedCloudMatch)}
                            disabled={actionLoading !== null}
                            className="rounded-lg bg-[var(--c-line)] px-3 py-2 font-sans text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-60"
                          >
                            {actionLoading === `connect:${recommendedCloudMatch.id}` ? 'Connecting...' : 'Connect'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCreateOnlineCopy()}
                            disabled={actionLoading !== null}
                            className="rounded-lg border border-[var(--c-border)] px-3 py-2 font-sans text-[11px] font-semibold text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)] disabled:cursor-default disabled:opacity-60"
                          >
                            {actionLoading === 'save-new' ? 'Uploading...' : 'Upload as new copy'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              keepCurrentWorkspaceLocalOnly();
                              rememberCloudEvent(recommendedCloudMatch, 'unlink');
                              toast('Kept this workspace separate. No cloud copy was deleted.');
                            }}
                            disabled={actionLoading !== null}
                            className="rounded-lg px-3 py-2 font-sans text-[11px] font-semibold text-[var(--c-text-lo)] transition-colors hover:bg-[rgba(184,119,80,0.1)] hover:text-[var(--c-line)] disabled:cursor-default disabled:opacity-60"
                          >
                            Keep separate
                          </button>
                        </div>

                        {detailsRowId === `match:${recommendedCloudMatch.id}` && (
                          <div className="mt-3 grid gap-3 rounded-lg border border-[var(--c-border)] px-3 py-3 sm:grid-cols-2" style={quietSurface}>
                            <div>
                              <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--c-text-lo)]">This workspace</p>
                              <p className="mt-2 font-sans text-[12px] leading-relaxed text-[var(--c-text-md)]">
                                Pages: {pages.length} · Notes: {documents.length} · Canvas items: {allCanvasNodes.length} · Images: {imageCount}
                              </p>
                              <p className="mt-1 font-sans text-[11px] text-[var(--c-text-lo)]">Saved locally {formatExactDate(lastLocalSavedAt)}</p>
                            </div>
                            <div>
                              <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--c-text-lo)]">Cloud copy</p>
                              {recommendedCloudMatch.contentSummary ? (
                                <p className="mt-2 font-sans text-[12px] leading-relaxed text-[var(--c-text-md)]">
                                  Pages: {recommendedCloudMatch.contentSummary.pages} · Notes: {recommendedCloudMatch.contentSummary.notes} · Canvas items: {recommendedCloudMatch.contentSummary.canvasItems} · Images: {recommendedCloudMatch.contentSummary.images}
                                </p>
                              ) : (
                                <p className="mt-2 font-sans text-[12px] leading-relaxed text-[var(--c-text-md)]">
                                  Content details will appear after this workspace is opened or synced again.
                                </p>
                              )}
                              <p className="mt-1 font-sans text-[11px] text-[var(--c-text-lo)]">Updated {formatExactDate(recommendedCloudMatch.updatedAt)}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  ) : (
                    <section className="rounded-2xl border border-[rgba(120,167,145,0.26)] bg-[rgba(120,167,145,0.08)] p-4">
                      <p className="font-sans text-[13px] font-semibold text-[var(--c-text-hi)]">
                        {syncEnabled ? 'This workspace is connected' : 'No cloud matches found'}
                      </p>
                      <p className="mt-1 font-sans text-[11px] leading-relaxed text-[var(--c-text-md)]">
                        {syncEnabled
                          ? 'Sync changes to the connected cloud copy, or save a separate cloud copy when you need a fresh version.'
                          : 'You can upload this workspace as a new cloud copy when you are ready.'}
                      </p>
                      {confirmingFirstSync && !syncEnabled && (
                        <div className="mt-3 rounded-xl border border-[rgba(54,137,151,0.28)] bg-[rgba(54,137,151,0.08)] px-3 py-2">
                          <p className="font-sans text-[11px] font-semibold text-[var(--c-text-hi)]">Sync this workspace?</p>
                          <p className="mt-1 font-sans text-[11px] leading-relaxed text-[var(--c-text-md)]">
                            Sync includes pages, canvas, notes, and document structure. Your local folder remains yours.
                          </p>
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handlePrimaryAction()}
                          disabled={actionLoading !== null}
                          className="rounded-lg bg-[var(--c-line)] px-3 py-2 font-sans text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-60"
                        >
                          {actionLoading?.startsWith('update:') || actionLoading === 'save-new' ? primaryBusyLabel : primaryActionLabel}
                        </button>
                        {syncEnabled && (
                          <button onClick={() => void handleCreateOnlineCopy()} disabled={actionLoading !== null} className="rounded-lg border border-[var(--c-border)] px-3 py-2 font-sans text-[11px] font-semibold text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)] disabled:cursor-default disabled:opacity-60">
                            Save new copy
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            keepCurrentWorkspaceLocalOnly();
                            if (inferredCloudWorkspace) rememberCloudEvent(inferredCloudWorkspace, 'unlink');
                            setConfirmingFirstSync(false);
                            toast('Workspace kept local-only. The cloud copy was not deleted.');
                          }}
                          disabled={actionLoading !== null}
                          className="rounded-lg px-3 py-2 font-sans text-[11px] font-semibold text-[var(--c-text-lo)] transition-colors hover:bg-[rgba(184,119,80,0.1)] hover:text-[var(--c-line)] disabled:cursor-default disabled:opacity-60"
                        >
                          Keep local-only
                        </button>
                      </div>
                      {(actionLoading?.startsWith('update:') || syncJustFinished) && (
                        <div className="mt-3">
                          {actionLoading?.startsWith('update:') && (
                            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--c-border)]/60">
                              <div className="h-full w-2/3 rounded-full bg-[var(--c-line)]" style={{ animation: 'download-progress-shimmer 1.1s ease-in-out infinite alternate' }} />
                            </div>
                          )}
                          <p className="mt-1 font-sans text-[10px] text-[var(--c-text-lo)]">
                            {actionLoading?.startsWith('update:') ? 'Syncing changes...' : 'Synced just now'}
                          </p>
                        </div>
                      )}
                    </section>
                  )}
                </div>

                <aside className="space-y-3">
                  <div className="rounded-2xl border border-[var(--c-border)] p-4" style={secondSurface}>
                    <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-lo)]">Local folder</p>
                    <div className="mt-2 flex min-w-0 items-center gap-2 font-sans text-[13px] font-semibold text-[var(--c-text-hi)]" title={currentLocalFolderTitle}>
                      {currentLocationLabel || currentRememberedLocationLabel ? (
                        <IconDevice kind={(currentLocationLabel ?? currentRememberedLocationLabel)!.deviceKind} />
                      ) : (
                        <IconNewWorkspace />
                      )}
                      <span className="truncate">{currentLocationLabel?.label ?? currentRememberedLocationLabel?.label ?? 'No folder connected'}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {localFolderConnected ? (
                        <button type="button" onClick={() => void handleOpenLocalFolder()} disabled={actionLoading !== null} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--c-border)] px-3 py-2 font-sans text-[11px] font-semibold text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)] disabled:cursor-default disabled:opacity-60">
                          <IconFolderOpen />
                          {openingLocalFolder ? 'Opening...' : 'Open folder'}
                        </button>
                      ) : (
                        <button type="button" onClick={() => void handleReconnectLocalFolder()} disabled={actionLoading !== null} className="inline-flex items-center gap-1.5 rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-3 py-2 font-sans text-[11px] font-semibold text-[#b45309] transition-colors hover:bg-[#f59e0b]/15 hover:text-[#92400e] disabled:cursor-default disabled:opacity-60">
                          <IconFolderOpen />
                          {reconnectingLocalFolder ? 'Reconnecting...' : 'Reconnect folder'}
                        </button>
                      )}
                    </div>
                    {currentFolderDownloadProgress && (
                      <div className="mt-3">
                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--c-border)]">
                          <div className="h-full rounded-full bg-[var(--c-line)] transition-[width]" style={{ width: `${currentFolderDownloadPercent}%` }} />
                        </div>
                        <p className="mt-1 font-sans text-[10px] text-[var(--c-text-lo)]">{currentFolderDownloadProgress.label}</p>
                      </div>
                    )}
                  </div>
                  <p className="rounded-xl border border-[var(--c-border)] px-3 py-2 font-sans text-[11px] leading-relaxed text-[var(--c-text-md)]" style={quietSurface}>
                    Nothing will be deleted until you confirm.
                  </p>
                </aside>
              </div>
            ) : (
              <div className="min-h-0 flex-1 px-5 py-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-lo)]">Workspace library</p>
                    <p className="mt-0.5 max-w-[48ch] font-sans text-[11px] leading-snug text-[var(--c-text-md)]">
                      Browse and open other workspaces here. Current-workspace resolution stays in the first tab.
                    </p>
                  </div>
                  <div className="relative flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => { setAddMenuOpen(false); void reloadRecentRows(); }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--c-border)] bg-[var(--c-panel)] text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                      title="Refresh workspaces"
                      aria-label="Refresh workspaces"
                    >
                      <IconRefresh />
                    </button>
                    <button
                      onClick={() => setAddMenuOpen((current) => !current)}
                      disabled={actionLoading !== null}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-panel)] px-2.5 font-sans text-[11px] font-semibold text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)] disabled:cursor-default disabled:opacity-60"
                      aria-expanded={addMenuOpen}
                    >
                      Add
                      <IconChevronDown />
                    </button>
                    {addMenuOpen && (
                      <div className="absolute right-0 top-full z-30 mt-1.5 w-[230px] overflow-hidden rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] py-1 shadow-2xl">
                        <button type="button" onClick={() => void handleReconnectLocalFolder()} disabled={actionLoading !== null} className="flex w-full items-center gap-2 px-3 py-2 text-left font-sans text-[12px] font-semibold text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)] disabled:cursor-default disabled:opacity-60">
                          <span className="text-[var(--c-text-lo)]"><IconFolderOpen /></span>
                          <span className="min-w-0">
                            <span className="block truncate">{reconnectingLocalFolder ? 'Reconnecting folder...' : reconnectLocalFolderLabel}</span>
                            {currentRememberedLocationLabel && (
                              <span className="mt-0.5 block truncate text-[10px] font-medium text-[var(--c-text-lo)]" title={currentRememberedLocationLabel.fullPath ?? undefined}>{currentRememberedLocationLabel.label}</span>
                            )}
                          </span>
                        </button>
                        <button type="button" onClick={() => void handleCreateLocalFolder()} disabled={actionLoading !== null} className="flex w-full items-center gap-2 px-3 py-2 text-left font-sans text-[12px] font-semibold text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)] disabled:cursor-default disabled:opacity-60">
                          <span className="text-[var(--c-text-lo)]"><IconNewWorkspace /></span>
                          {creatingLocalFolder ? 'Making folder...' : localFolderConnected ? 'Save local copy...' : 'Make local folder...'}
                        </button>
                        <div className="my-1 border-t border-[var(--c-border)]" />
                        <button type="button" onClick={handleStartNewWorkspace} className="flex w-full items-center gap-2 px-3 py-2 text-left font-sans text-[12px] font-semibold text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]">
                          <span className="text-[var(--c-text-lo)]"><IconNewWorkspace /></span>
                          New blank workspace
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mb-4 inline-flex rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] p-1">
                  {[
                    { id: 'cloud' as const, label: 'Cloud' },
                    { id: 'local' as const, label: 'Local & recent' },
                    { id: 'files' as const, label: 'Open files' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setLibraryTab(tab.id);
                        setWorkspaceMenuId(null);
                        setDetailsRowId(null);
                      }}
                      className={[
                        'rounded-lg px-3 py-1.5 font-sans text-[11px] font-semibold transition-colors',
                        libraryTab === tab.id
                          ? 'bg-[var(--c-line)] text-white shadow-sm'
                          : 'text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]',
                      ].join(' ')}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {libraryTab === 'cloud' && (
                  <section className="rounded-2xl border border-[rgba(120,167,145,0.22)] bg-[rgba(120,167,145,0.06)] p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-lo)]">On cloud</p>
                      <span className={['rounded-full px-2 py-0.5 font-sans text-[10px] font-semibold', workspaces.length >= SYNC_WORKSPACE_LIMIT ? 'bg-[#f59e0b]/15 text-[#b45309]' : 'bg-[rgba(120,167,145,0.16)] text-[rgb(72,112,92)]'].join(' ')}>
                        {workspaces.length}/{SYNC_WORKSPACE_LIMIT}
                      </span>
                    </div>
                    {workspaces.length >= SYNC_WORKSPACE_LIMIT && (
                      <div className="mb-2 rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-3 py-2">
                        <p className="font-sans text-[11px] font-semibold text-[#92400e]">Sync limit reached</p>
                        <p className="mt-0.5 font-sans text-[10px] leading-snug text-[#b45309]">{workspaces.length}/{SYNC_WORKSPACE_LIMIT} cloud copies used. Move a workspace offline or delete a synced copy to make room.</p>
                      </div>
                    )}
                    {workspaceConflictGroups.length > 0 && (
                      <div className="mb-2 rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-sans text-[11px] font-semibold text-[#92400e]">Possible merge candidates</p>
                          <span className="rounded-full bg-[#f59e0b]/15 px-2 py-0.5 font-sans text-[10px] font-semibold text-[#b45309]">{workspaceConflictGroups.length} {workspaceConflictGroups.length === 1 ? 'group' : 'groups'}</span>
                        </div>
                        <p className="mt-1 font-sans text-[10px] leading-snug text-[#b45309]">Some cloud copies share a name, workspace identity, or matching content counts. Review details before replacing or deleting.</p>
                      </div>
                    )}
                    <div className="space-y-1.5 overflow-y-auto pr-1" style={{ maxHeight: '360px' }}>
                      {workspacesLoading && cloudWorkspaceRows.length === 0 ? (
                        <div className="rounded-xl border border-[var(--c-border)] px-4 py-4 font-sans text-[12px] text-[var(--c-text-md)]" style={secondSurface}>Loading cloud workspaces...</div>
                      ) : cloudWorkspaceRows.length === 0 ? (
                        <div className="rounded-xl border border-[var(--c-border)] px-4 py-4" style={secondSurface}>
                          <p className="font-sans text-[13px] font-semibold text-[var(--c-text-hi)]">Nothing on cloud yet</p>
                          <p className="mt-1 font-sans text-[11px] leading-relaxed text-[var(--c-text-md)]">Turn on sync for a workspace and it will appear here.</p>
                        </div>
                      ) : (
                        cloudWorkspaceRows.map((row) => renderWorkspaceRow(row, { cloudShelf: true }))
                      )}
                    </div>
                  </section>
                )}

                {libraryTab === 'local' && (
                  <section>
                    <div className="mb-2">
                      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-lo)]">Local & recent</p>
                      <p className="mt-0.5 font-sans text-[11px] leading-snug text-[var(--c-text-md)]">Local folders and remembered workspaces on this device.</p>
                    </div>
                    <div className="space-y-1.5 overflow-y-auto pr-1" style={{ maxHeight: '390px' }}>
                      {workspacesLoading && localAndRecentRows.length === 0 ? (
                        <div className="rounded-xl border border-[var(--c-border)] px-4 py-4 font-sans text-[12px] text-[var(--c-text-md)]" style={secondSurface}>Loading recent workspaces...</div>
                      ) : localAndRecentRows.length === 0 ? (
                        <div className="rounded-2xl border border-[var(--c-border)] px-4 py-5 text-[var(--c-text-lo)]" style={secondSurface}>
                          <p className="font-sans text-[14px] font-semibold text-[var(--c-text-hi)]">No recent workspaces yet</p>
                          <p className="mt-1 font-sans text-[12px] leading-relaxed text-[var(--c-text-md)]">Open a local folder or download a cloud workspace to make it one click away here.</p>
                        </div>
                      ) : localAndRecentRows.map((row) => renderWorkspaceRow(row))}
                    </div>
                  </section>
                )}

                {libraryTab === 'files' && (
                  <section>
                    <div className="mb-2">
                      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-lo)]">Open files</p>
                      <p className="mt-0.5 font-sans text-[11px] leading-snug text-[var(--c-text-md)]">Notes and documents from the currently open workspace.</p>
                    </div>
                    <div className="space-y-1.5 overflow-y-auto pr-1" style={{ maxHeight: '390px' }}>
                      {documents.length === 0 ? (
                        <div className="rounded-2xl border border-[var(--c-border)] px-4 py-5" style={secondSurface}>
                          <p className="font-sans text-[14px] font-semibold text-[var(--c-text-hi)]">No open files yet</p>
                          <p className="mt-1 font-sans text-[12px] leading-relaxed text-[var(--c-text-md)]">Documents in this workspace will appear here.</p>
                        </div>
                      ) : documents.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              openDocument(doc.id);
                              onClose();
                            }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="truncate font-sans text-[12px] font-semibold text-[var(--c-text-hi)]">{doc.title || 'Untitled note'}</p>
                            <p className="mt-0.5 truncate font-sans text-[10px] text-[var(--c-text-lo)]">{doc.linkedFile ?? 'Workspace document'}</p>
                          </button>
                          <button type="button" onClick={() => { openDocument(doc.id); onClose(); }} className="rounded-lg border border-[var(--c-border)] px-2.5 py-1.5 font-sans text-[10px] text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-canvas)] hover:text-[var(--c-text-hi)]">
                            Open
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
