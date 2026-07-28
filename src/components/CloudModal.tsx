import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SupabaseUnavailableError, useAuth } from '../contexts/AuthContext';
import { useBoardStore } from '../store/boardStore';
import { AccountMenu } from './AccountMenu';
import {
  IconAsset,
  IconCheck,
  IconChevronDown,
  IconDevice,
  IconEmptyCloud,
  IconFolderOpen,
  IconGitHub,
  IconGoogle,
  IconMore,
  IconNewWorkspace,
  IconNote,
  IconPage,
  IconRefresh,
  tablerDeviceClass,
} from './CloudModalIcons';
import ModalCloseButton from './ModalCloseButton';
import { cx, DropdownMenu, DropdownMenuItem, InlinePanel, ModalActionButton, ProgressPanel, SURFACE_CLASS } from './modalUi';
import {
  createCloudBoard as createCloudWorkspaceSnapshot,
  deleteCloudBoard as deleteCloudWorkspaceSnapshot,
  loadCloudBoard as loadCloudWorkspaceSnapshot,
  rememberCloudSyncContext,
  renameCloudBoard as renameCloudWorkspaceSnapshot,
  updateCloudBoard as updateCloudWorkspaceSnapshot,
  cloudTimestamp,
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
import { useCloudModalData } from '../hooks/useCloudModalData';
import {
  buildRecentWorkspaceRows,
  findCurrentLocalRecent,
  resolveWorkspaceLink,
  type RecentWorkspaceRow,
} from '../utils/workspaceSyncModel';
import {
  buildWorkspaceConflictGroups,
  clearLocalSyncLink,
  duplicateCopyLabel,
  errorMessage,
  formatDuplicateReviewDate,
  formatExactDate,
  getLocalSyncLink,
  mapWorkspaceConflicts,
  mergeWorkspaceLocations,
  normalizedConflictTitle,
  workspaceContentsLabel,
  writeLocalSyncLink,
  type CloudWorkspaceSummary,
  type DuplicateReviewRoute,
  type DuplicateReviewSelection,
} from './cloudModalUtils';

const SYNC_WORKSPACE_LIMIT = 10;
const CURRENT_WORKSPACE_DOWNLOAD_ROW_ID = 'current-workspace';
const GITHUB_ISSUES_URL = 'https://github.com/mfgoes/Devboard/issues';

function isSupabaseUnavailableError(err: unknown): boolean {
  if (err instanceof SupabaseUnavailableError) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /failed to fetch|networkerror|load failed|fetch failed/i.test(message);
}

export default function CloudModal({ open, onClose, initialTab = 'workspace' }: { open: boolean; onClose: () => void; initialTab?: 'workspace' | 'library' }) {
  const { isConfigured, isLoading: authLoading, user, signInWithGoogle, signInWithGitHub, signInWithMagicLink, signInWithEmail, signUpWithEmail, signOut } = useAuth();
  const exportData = useBoardStore((s) => s.exportData);
  const loadBoard = useBoardStore((s) => s.loadBoard);
  const boardTitle = useBoardStore((s) => s.boardTitle);
  const setBoardTitle = useBoardStore((s) => s.setBoardTitle);
  const workspaceName = useBoardStore((s) => s.workspaceName);
  const pages = useBoardStore((s) => s.pages);
  const documents = useBoardStore((s) => s.documents);
  const nodes = useBoardStore((s) => s.nodes);
  const pageSnapshots = useBoardStore((s) => s.pageSnapshots);
  const lastLocalSavedAt = useBoardStore((s) => s.lastLocalSavedAt);
  const cloudBoardId = useBoardStore((s) => s.cloudBoardId);
  const cloudBoardTitle = useBoardStore((s) => s.cloudBoardTitle);
  const cloudSyncedAt = useBoardStore((s) => s.cloudSyncedAt);
  const setCloudBoardState = useBoardStore((s) => s.setCloudBoardState);
  const clearCloudBoardState = useBoardStore((s) => s.clearCloudBoardState);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [workspaceMenuId, setWorkspaceMenuId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [renamingWorkspaceId, setRenamingWorkspaceId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [replaceConfirmId, setReplaceConfirmId] = useState<string | null>(null);
  const [detailsRowId, setDetailsRowId] = useState<string | null>(null);
  const [downloadChoiceRowId, setDownloadChoiceRowId] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ rowId: string; progress: WorkspaceDownloadProgress } | null>(null);
  const [syncedBaselines, setSyncedBaselines] = useState<Record<string, number>>({});
  const [syncJustFinished, setSyncJustFinished] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [signInMethod, setSignInMethod] = useState<'social' | 'email'>('social');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authUnavailable, setAuthUnavailable] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmingFirstSync, setConfirmingFirstSync] = useState(false);
  const [activeWorkspaceSyncTab, setActiveWorkspaceSyncTab] = useState<'workspace' | 'library'>('workspace');
  const [libraryTab, setLibraryTab] = useState<'cloud' | 'local'>('local');
  const [duplicateReviewRoute, setDuplicateReviewRoute] = useState<DuplicateReviewRoute | null>(null);
  const [duplicateReviewSelection, setDuplicateReviewSelection] = useState<DuplicateReviewSelection>('a');
  const passwordRef = useRef<HTMLInputElement>(null);
  const authTabsRef = useRef<HTMLDivElement>(null);
  const signInTabRef = useRef<HTMLButtonElement>(null);
  const signUpTabRef = useRef<HTMLButtonElement>(null);
  const syncFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [authTabIndicator, setAuthTabIndicator] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
  const accountLabel = user?.user_metadata?.user_name
    ?? user?.user_metadata?.preferred_username
    ?? user?.user_metadata?.name
    ?? user?.email
    ?? 'Account';
  const avatarUrl = typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null;
  const {
    workspaces,
    setWorkspaces,
    cloudLocations,
    setCloudLocations,
    localRecents,
    workspacesLoading,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    reloadLocalRecents,
    reloadRecentRows,
  } = useCloudModalData({
    open,
    user,
    cloudBoardId,
  });

  const currentWorkspaceName = boardTitle.trim() || workspaceName || cloudBoardTitle || 'Untitled Project';
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
    linkedCloudWorkspace,
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
  const duplicateReviewWorkspace = useMemo(
    () => duplicateReviewRoute ? workspaces.find((workspace) => workspace.id === duplicateReviewRoute.workspaceId) ?? null : null,
    [duplicateReviewRoute, workspaces],
  );
  const duplicateReviewWorkspaces = useMemo(
    () => duplicateReviewRoute
      ? duplicateReviewRoute.duplicateWorkspaceIds
        .map((id) => workspaces.find((workspace) => workspace.id === id) ?? null)
        .filter((workspace): workspace is CloudWorkspaceSummary => !!workspace)
      : [],
    [duplicateReviewRoute, workspaces],
  );
  const duplicateReviewCopyB = duplicateReviewWorkspaces[0] ?? null;
  const duplicateReviewOpen = !!duplicateReviewRoute && !!duplicateReviewWorkspace && !!duplicateReviewCopyB;
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
  const currentDeviceLabel = currentLocationLabel?.deviceLabel ?? currentRememberedLocationLabel?.deviceLabel ?? getDeviceLabel();
  const lastSyncedLabel = formatExactDate(effectiveCloudSyncedAt ?? linkedCloudUpdatedAt ?? null);
  const workspaceStatusParts = syncEnabled
    ? ['Synced to cloud', `Last synced ${lastSyncedLabel}`, currentDeviceLabel]
    : [currentStatus, currentDeviceLabel];
  const workspaceStatusDotClass = syncEnabled
    ? 'bg-[var(--c-green)]'
    : currentStatus === 'Local changes not synced' || currentStatus === 'Sync paused' || currentStatus === 'Folder access needed'
      ? 'bg-[var(--c-yellow)]'
      : 'bg-[var(--c-line)]';
  const newerCloudWorkspace = hasNewerCloudCopy
    ? linkedCloudWorkspace ?? inferredCloudWorkspace ?? workspaces.find((workspace) => workspace.id === effectiveCloudBoardId) ?? null
    : null;
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
    if (open) return;
    setConfirmingFirstSync(false);
    setAddMenuOpen(false);
    setWorkspaceMenuId(null);
    setDeleteConfirmId(null);
    setReplaceConfirmId(null);
    setRenamingWorkspaceId(null);
    setRenameDraft('');
    setDetailsRowId(null);
    setDownloadChoiceRowId(null);
    setAuthMessage(null);
    setAuthUnavailable(false);
    setActiveWorkspaceSyncTab('workspace');
    setLibraryTab('local');
    setDuplicateReviewRoute(null);
    setDuplicateReviewSelection('a');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActiveWorkspaceSyncTab(initialTab);
    if (initialTab === 'library') setLibraryTab('local');
  }, [initialTab, open]);

  useEffect(() => {
    setDuplicateReviewSelection('a');
  }, [duplicateReviewRoute?.workspaceId]);

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
      ?? (exactTitleMatches.length === 1 && currentWorkspaceName !== 'Untitled Project' ? exactTitleMatches[0] : null);

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
    setAuthUnavailable(false);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.warn('Google sign-in failed', err);
      if (isSupabaseUnavailableError(err)) {
        setAuthUnavailable(true);
      } else {
        toast('Google sign-in could not start.');
      }
    }
  };

  const handleGitHubSignIn = async () => {
    setAuthUnavailable(false);
    try {
      await signInWithGitHub();
    } catch (err) {
      console.warn('GitHub sign-in failed', err);
      if (isSupabaseUnavailableError(err)) {
        setAuthUnavailable(true);
      } else {
        toast('GitHub sign-in could not start.');
      }
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
    setAuthUnavailable(false);
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
      if (isSupabaseUnavailableError(err)) {
        setAuthUnavailable(true);
      } else {
        const message = err instanceof Error ? err.message : 'Email authentication failed.';
        setAuthMessage(message);
      }
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
    setAuthUnavailable(false);
    try {
      await signInWithMagicLink(trimmedEmail);
      setAuthMessage('Magic link sent. Check your inbox to sign in.');
    } catch (err) {
      console.warn('Magic link sign-in failed', err);
      if (isSupabaseUnavailableError(err)) {
        setAuthUnavailable(true);
      } else {
        const message = err instanceof Error ? err.message : 'Could not send magic link. Try again.';
        setAuthMessage(message);
      }
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
    setAuthUnavailable(false);
    try {
      if (!supabase) throw new Error('Supabase not configured.');
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
      if (error) throw error;
      setAuthMessage('Password reset email sent. Check your inbox.');
    } catch (err) {
      console.warn('Password reset failed', err);
      if (isSupabaseUnavailableError(err)) {
        setAuthUnavailable(true);
      } else {
        setAuthMessage('Could not send reset email. Try again.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleSignOut = async () => {
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
      toast(`Free beta sync currently supports ${SYNC_WORKSPACE_LIMIT} projects. Replace one later if you need to rotate projects.`);
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
      toast('Created online project copy.');
      await reloadRecentRows();
      setSelectedWorkspaceId(saved.id);
    } catch (err) {
      console.warn('Failed to create online project copy', err);
      toast(`Could not sync this project. ${errorMessage(err, '')}`.trim());
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateLinkedWorkspace = async () => {
    if (!user) return;
    const targetWorkspace = inferredCloudWorkspace ?? selectedWorkspace;
    if (!targetWorkspace) {
      toast('Pick a synced project first, or sync this project.');
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
      toast('Synced current project.');
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
      console.warn('Failed to sync project', err);
      toast(`Could not sync this project. ${errorMessage(err, '')}`.trim());
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
      toast(`Replaced "${workspace.title}" with the current project.`);
      await reloadRecentRows();
      setSelectedWorkspaceId(updated.id);
    } catch (err) {
      console.warn('Failed to replace synced project', err);
      toast(`Could not replace synced project. ${errorMessage(err, '')}`.trim());
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
      toast(`Connected "${workspace.title}" to this project.`);
    } catch (err) {
      console.warn('Failed to connect synced project', err);
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
      toast('Renamed synced project.');
      await reloadRecentRows();
    } catch (err) {
      console.warn('Failed to rename synced project', err);
      toast(`Could not rename synced project. ${errorMessage(err, '')}`.trim());
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
      const ok = window.confirm('Open this online project copy? Your current project has local changes that are not synced yet.');
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
      console.warn('Failed to open synced project', err);
      toast('Could not open that synced project.');
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
      const ok = window.confirm('Download this online project copy? Your current project has local changes that are not synced yet.');
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
        label: 'Loading synced project...',
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
      console.warn('Failed to download synced project', err);
      toast(`Could not download synced project. ${errorMessage(err, '')}`.trim());
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
      toast('This project already has a remembered local folder. Reconnect it, or save an explicit copy.');
      return;
    }

    if (inferredCloudWorkspace) {
      await handleDownloadWorkspace(inferredCloudWorkspace, CURRENT_WORKSPACE_DOWNLOAD_ROW_ID);
      return;
    }

    if (!IS_TAURI) {
      toast('Creating a new project folder from here is available in the desktop app.');
      return;
    }

    setActionLoading('create-local-folder');
    try {
      const result = await createWorkspace(exportData(), currentWorkspaceName || 'DevBoard Project');
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
          toast('Could not reopen that local project. Relocate the folder to reconnect it.');
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
        console.warn('Failed to open recent local project', err);
        toast('Could not reopen that local project.');
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

    if (row.local) toast('Relocate this project folder to open it.');
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
      console.warn('Failed to relocate recent project', err);
      toast('Could not relocate that project.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveRecent = async (recent: LocalRecentWorkspace) => {
    setActionLoading(`remove-recent:${recent.id}`);
    try {
      await removeLocalRecentWorkspace(recent.id);
      setWorkspaceMenuId(null);
      toast('Removed project from recents. Local files were not changed.');
      await reloadLocalRecents();
    } catch (err) {
      console.warn('Failed to remove recent project', err);
      toast('Could not remove that recent project.');
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
      toast('Deleted synced project. Local files were not changed.');
      await reloadRecentRows();
    } catch (err) {
      console.warn('Failed to delete synced project', err);
      toast(`Could not delete synced project. ${errorMessage(err, '')}`.trim());
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartNewWorkspace = () => {
    setAddMenuOpen(false);
    loadBoard({
      boardTitle: 'Untitled Project',
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

  const handleReviewDuplicates = (workspace: CloudWorkspaceSummary, duplicateWorkspaceIds: string[]) => {
    setDuplicateReviewRoute({ workspaceId: workspace.id, duplicateWorkspaceIds });
    setDuplicateReviewSelection('a');
    setActiveWorkspaceSyncTab('library');
    setLibraryTab('cloud');
    setSelectedWorkspaceId(workspace.id);
    setWorkspaceMenuId(null);
    setDetailsRowId(null);
    setDownloadChoiceRowId(null);
    setDeleteConfirmId(null);
    setReplaceConfirmId(null);
    cancelRenameWorkspace();
  };

  const handleBackToLibrary = () => {
    setDuplicateReviewRoute(null);
    setDuplicateReviewSelection('a');
    setActiveWorkspaceSyncTab('library');
    setLibraryTab('cloud');
    setWorkspaceMenuId(null);
    setDetailsRowId(null);
  };

  const getDuplicateReviewDevice = (workspace: CloudWorkspaceSummary): { name: string; kind: DeviceKind } => {
    const row = recentRows.find((candidate) => candidate.cloud?.id === workspace.id);
    const displayLocations = mergeWorkspaceLocations(row?.local, cloudLocations[workspace.id] ?? []);
    const primaryLocation = displayLocations[0] ?? null;
    if (!primaryLocation) return { name: 'DevBoard Sync', kind: 'device' };
    const label = formatWorkspaceLocationLabel(primaryLocation);
    return {
      name: label.deviceLabel,
      kind: label.deviceKind,
    };
  };

  const handleConfirmDuplicateReview = async () => {
    if (!duplicateReviewWorkspace || !duplicateReviewCopyB) return;
    const keep = duplicateReviewSelection === 'a' ? duplicateReviewWorkspace : duplicateReviewCopyB;
    const remove = duplicateReviewSelection === 'a' ? duplicateReviewCopyB : duplicateReviewWorkspace;

    setActionLoading(`delete-duplicate:${remove.id}`);
    try {
      await deleteCloudWorkspaceSnapshot(remove.id);
      rememberCloudEvent(remove, 'delete', {
        action: 'delete_duplicate_copy',
        keptWorkspaceId: keep.id,
        duplicateWorkspaceId: remove.id,
      });
      setWorkspaces((current) => current.filter((workspace) => workspace.id !== remove.id));
      setCloudLocations((current) => {
        const next = { ...current };
        delete next[remove.id];
        return next;
      });
      setSelectedWorkspaceId(keep.id);
      if (remove.id === effectiveCloudBoardId) {
        const syncedAt = cloudTimestamp(keep.updatedAt);
        setWorkspaceSyncMetadata({
          workspaceId: keep.logicalWorkspaceId ?? currentWorkspaceId ?? `cloud-board:${keep.id}`,
          cloudBoardId: keep.id,
          cloudBoardTitle: keep.title,
          cloudWorkspaceId: keep.workspaceId,
          lastSyncedAt: syncedAt,
        });
        setCloudBoardState({ boardId: keep.id, title: keep.title, syncedAt });
        if (user) {
          writeLocalSyncLink(user.id, currentWorkspaceName, {
            cloudBoardId: keep.id,
            title: keep.title,
            syncedAt,
          });
        }
      }
      setDuplicateReviewRoute(null);
      setDuplicateReviewSelection('a');
      toast(`Kept "${keep.title}" and deleted the duplicate cloud copy.`);
    } catch (err) {
      console.warn('Failed to delete duplicate cloud copy', err);
      toast(`Could not delete duplicate. ${errorMessage(err, '')}`.trim());
    } finally {
      setActionLoading(null);
    }
  };

  const renderWorkspaceRow = (row: RecentWorkspaceRow, options: { cloudShelf?: boolean; suppressDuplicateBar?: boolean } = {}) => {
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
    const duplicatePeers = workspace
      ? conflictPeers
        .filter((candidate) => normalizedConflictTitle(candidate.title) === normalizedConflictTitle(workspace.title))
        .sort((a, b) => cloudTimestamp(b.updatedAt) - cloudTimestamp(a.updatedAt))
      : [];
    const olderDuplicatePeers = workspace
      ? duplicatePeers.filter((candidate) => cloudTimestamp(candidate.updatedAt) < cloudTimestamp(workspace.updatedAt))
      : [];
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
    const syncLabel = workspace && recent ? 'Synced' : workspace && !recent ? 'Cloud only' : 'Local only';
    const syncDotClass = syncLabel === 'Synced' ? 'bg-[var(--c-green)]' : 'bg-[var(--c-text-lo)]';
    const metaDate = workspace ? formatExactDate(workspace.updatedAt) : formatExactDate(localUpdatedAt);
    const metaDeviceKind = primaryLocationLabel?.deviceKind ?? (recent ? formatWorkspaceLocationLabel({
      deviceId: getDeviceId(),
      deviceLabel: getDeviceLabel(),
      localPathHint: recent.localPathHint,
    }).deviceKind : 'device');
    const metaDeviceName = primaryLocationLabel?.deviceLabel ?? (recent ? getDeviceLabel() : 'DevBoard Sync');
    const duplicateReviewIds = olderDuplicatePeers.map((candidate) => candidate.id);
    const showDuplicateBar = !!workspace && !options.suppressDuplicateBar && duplicateReviewIds.length > 0;

    return (
      <div
        key={row.id}
        className={[
          'relative w-full overflow-visible rounded-xl border px-3 py-2.5 transition-colors',
          selected
            ? 'border-[var(--c-text-lo)] bg-[var(--c-hover)]'
            : options.cloudShelf
              ? 'border-[var(--c-green)]/35 bg-[color-mix(in_srgb,var(--c-green)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--c-green)_12%,transparent)]'
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
            <div className="min-w-0">
              <p className="truncate font-sans text-[12px] font-semibold text-[var(--c-text-hi)]">{row.title}</p>
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 font-sans text-[12px] text-[var(--color-text-secondary)]" title={primaryLocationLabel?.fullPath ?? undefined}>
              <span className={cx('h-[7px] w-[7px] shrink-0 rounded-full', syncDotClass)} aria-hidden="true" />
              <span className="shrink-0">{syncLabel}</span>
              {workspace && (
                <>
                  <span className="shrink-0 text-[var(--color-text-secondary)] opacity-70">·</span>
                  <span className="inline-flex shrink-0 items-center gap-1">
                    <i className="ti ti-cloud text-[13px]" aria-hidden="true" />
                    Cloud only
                  </span>
                </>
              )}
              <span className="shrink-0 text-[var(--color-text-secondary)] opacity-70">·</span>
              <span className="shrink-0">{metaDate}</span>
              <span className="shrink-0 text-[var(--color-text-secondary)] opacity-70">·</span>
              <span className="inline-flex min-w-0 items-center gap-1">
                <i className={`ti ${tablerDeviceClass(metaDeviceKind)} shrink-0 text-[13px]`} aria-hidden="true" />
                <span className="truncate">{metaDeviceName}</span>
              </span>
            </div>
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
          <InlinePanel className="mt-3">
            <p className="font-sans text-[12px] font-semibold text-[var(--c-text-hi)]">Open this synced project?</p>
            <p className="mt-1 font-sans text-[11px] leading-relaxed text-[var(--c-text-md)]">
              Open the online snapshot now, or download it into an empty local folder for normal project saves.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ModalActionButton onClick={() => void handleDownloadWorkspace(workspace, row.id)} disabled={actionLoading !== null} variant="primary">
                Download to folder...
              </ModalActionButton>
              <ModalActionButton onClick={() => void handleLoadWorkspace(workspace)} disabled={actionLoading !== null}>
                Open cloud
              </ModalActionButton>
              <ModalActionButton onClick={() => setDownloadChoiceRowId(null)} disabled={actionLoading !== null} variant="ghost" className="px-1">
                Cancel
              </ModalActionButton>
            </div>
          </InlinePanel>
        )}

        {rowDownloadProgress && (
          <ProgressPanel
            className="mt-3"
            label={rowDownloadProgress.label}
            percent={progressPercent}
            warning={rowDownloadProgress.warning}
          />
        )}

        {workspace && renaming && (
          <InlinePanel className="mt-3">
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--c-text-lo)]">Rename synced project</p>
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
              <ModalActionButton onClick={() => void handleRenameWorkspace(workspace)} disabled={actionLoading !== null} variant="primary">
                {renameBusy ? 'Renaming...' : 'Rename'}
              </ModalActionButton>
              <ModalActionButton onClick={cancelRenameWorkspace} disabled={actionLoading !== null} variant="ghost" className="px-1">
                Cancel
              </ModalActionButton>
            </div>
          </InlinePanel>
        )}

        {menuOpen && !confirmingDelete && !confirmingReplace && !renaming && (
          <DropdownMenu className="w-52 p-1.5" onMouseDown={(e) => e.stopPropagation()}>
            <DropdownMenuItem
              onClick={() => {
                setDetailsRowId((current) => current === row.id ? null : row.id);
                setWorkspaceMenuId(null);
              }}
            >
              {detailsOpen ? 'Hide details' : 'See details'}
            </DropdownMenuItem>
            {workspace && (
              <>
                <DropdownMenuItem onClick={() => startRenameWorkspace(workspace)}>Rename</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setReplaceConfirmId(workspace.id)}>Replace with current</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleDownloadWorkspace(workspace, row.id)}>Download to folder...</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDeleteConfirmId(workspace.id)} tone="danger">Delete synced copy</DropdownMenuItem>
              </>
            )}
            {recent && localUnavailable && (
              <DropdownMenuItem onClick={() => void handleRelocateRecent(recent)}>Relocate folder</DropdownMenuItem>
            )}
            {canRemoveRecent && (
              <DropdownMenuItem onClick={() => void handleRemoveRecent(recent)} tone="danger">Remove from recents</DropdownMenuItem>
            )}
          </DropdownMenu>
        )}

        {detailsOpen && (
          <InlinePanel className="mt-3">
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--c-text-lo)]">Project details</p>
            {contentSummary ? (
              <p className="mt-2 font-sans text-[12px] leading-relaxed text-[var(--c-text-hi)]">
                Pages: {contentSummary.pages} &middot; Notes: {contentSummary.notes} &middot; Canvas items: {contentSummary.canvasItems} &middot; Images: {contentSummary.images}
              </p>
            ) : (
              <p className="mt-2 font-sans text-[12px] leading-relaxed text-[var(--c-text-md)]">
                Content details will appear after this project is opened or synced again.
              </p>
            )}
            <div className="mt-2 grid gap-1 font-sans text-[11px] text-[var(--c-text-lo)]">
              {recent && <p>Local: <span className="text-[var(--c-text-md)]">{formatExactDate(localUpdatedAt)}</span></p>}
              {workspace && <p>Cloud: <span className="text-[var(--c-text-md)]">{formatExactDate(workspace.updatedAt)}</span></p>}
            </div>
            {workspaceConflicts.length > 0 && (
              <InlinePanel className="mt-3" tone="warning">
                <p className="font-sans text-[11px] font-semibold text-[var(--c-text-hi)]">Possible merge conflict</p>
                <p className="mt-1 font-sans text-[11px] leading-relaxed text-[var(--c-text-md)]">
                  {workspaceConflicts.map((group) => group.reason).join(', ')} with {conflictPeers.length} other cloud {conflictPeers.length === 1 ? 'copy' : 'copies'}.
                </p>
                {conflictPeers.length > 0 && (
                  <p className="mt-1 truncate font-sans text-[10px] text-[var(--c-text-lo)]" title={conflictPeers.map((peer) => peer.title).join(', ')}>
                    Also found: {conflictPeers.map((peer) => peer.title).join(', ')}
                  </p>
                )}
              </InlinePanel>
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
                      <InlinePanel key={location.key} className="px-2.5 py-2" tone="quiet">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <IconDevice kind={label.deviceKind} />
                          <p className="truncate font-sans text-[11px] font-semibold text-[var(--c-text-hi)]" title={label.fullPath ?? undefined}>{label.label}</p>
                        </div>
                        <div className="mt-1 grid gap-0.5 font-sans text-[10px] text-[var(--c-text-lo)]">
                          <p>{lastLabel}: <span className="text-[var(--c-text-md)]">{formatExactDate(lastValue)}</span></p>
                          {label.fullPath && <p className="truncate" title={label.fullPath}>Path: <span className="text-[var(--c-text-md)]">{label.fullPath}</span></p>}
                        </div>
                      </InlinePanel>
                    );
                  })}
                </div>
              </div>
            )}
          </InlinePanel>
        )}

        {workspace && confirmingReplace && (
          <InlinePanel className="mt-3" tone="accent">
            <p className="font-sans text-[12px] font-semibold text-[var(--c-text-hi)]">Replace this synced copy?</p>
            <p className="mt-1 font-sans text-[11px] leading-relaxed text-[var(--c-text-md)]">This overwrites the online copy with the project currently open here.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ModalActionButton onClick={() => void handleReplaceWorkspace(workspace)} disabled={actionLoading !== null} variant="primary">
                {replacing ? 'Replacing...' : 'Replace'}
              </ModalActionButton>
              <ModalActionButton onClick={() => { setReplaceConfirmId(null); setWorkspaceMenuId(null); }} disabled={actionLoading !== null} variant="ghost" className="px-1">Cancel</ModalActionButton>
            </div>
          </InlinePanel>
        )}

        {workspace && confirmingDelete && (
          <DropdownMenu className="w-64 border-[var(--c-red)]/25 px-3 py-3" onMouseDown={(e) => e.stopPropagation()}>
            <p className="font-sans text-[12px] font-semibold text-[var(--c-text-hi)]">Delete synced copy?</p>
            <p className="mt-1 font-sans text-[11px] leading-relaxed text-[var(--c-text-md)]">This removes the online copy only. Your local project stays on this device.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ModalActionButton onClick={() => void handleDeleteWorkspace(workspace)} disabled={actionLoading !== null} variant="danger">
                {deleting ? 'Deleting...' : 'Delete'}
              </ModalActionButton>
              <ModalActionButton onClick={() => { setDeleteConfirmId(null); setWorkspaceMenuId(null); }} disabled={actionLoading !== null} variant="ghost" className="px-1">Cancel</ModalActionButton>
            </div>
          </DropdownMenu>
        )}

        {showDuplicateBar && (
          <div className="-mx-3 -mb-2.5 mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--c-line)]/30 bg-[color-mix(in_srgb,var(--c-line)_10%,var(--c-panel))] px-[14px] py-2">
            <div className="flex min-w-0 items-center gap-2 font-sans text-[12px] text-[var(--c-text-md)]">
              <i className="ti ti-copy shrink-0 text-[14px]" aria-hidden="true" />
              <span className="truncate">{duplicateCopyLabel(duplicateReviewIds.length)}</span>
            </div>
            <ModalActionButton
              type="button"
              onClick={() => void handleReviewDuplicates(workspace, duplicateReviewIds)}
              className="border-[var(--c-line)]/40 bg-transparent px-2.5 py-1 text-[12px] text-[var(--c-line)] hover:bg-[color-mix(in_srgb,var(--c-line)_10%,transparent)]"
              disabled={actionLoading !== null}
            >
              Review {duplicateReviewIds.length === 1 ? 'duplicate' : 'duplicates'}
            </ModalActionButton>
          </div>
        )}
      </div>
    );
  };

  const renderDuplicateReviewCard = (
    copyKey: DuplicateReviewSelection,
    label: 'Copy A' | 'Copy B',
    workspace: CloudWorkspaceSummary,
    otherWorkspace: CloudWorkspaceSummary,
  ) => {
    const selected = duplicateReviewSelection === copyKey;
    const device = getDuplicateReviewDevice(workspace);
    const newer = cloudTimestamp(workspace.updatedAt) > cloudTimestamp(otherWorkspace.updatedAt);
    const headerClass = selected ? 'bg-[color-mix(in_srgb,var(--c-line)_12%,var(--c-panel))]' : SURFACE_CLASS.second;
    const labelClass = selected ? 'text-[var(--c-line)]' : 'text-[var(--color-text-secondary)]';
    const cardStyle: CSSProperties = {
      border: selected ? '1.5px solid var(--c-line)' : '1px solid var(--color-border-tertiary)',
    };
    const rows = [
      {
        icon: 'ti-clock',
        label: 'Last updated',
        value: formatDuplicateReviewDate(workspace.updatedAt),
        extra: newer ? (
          <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-[color-mix(in_srgb,var(--c-green)_16%,transparent)] px-1.5 py-0.5 font-sans text-[11px] font-medium text-[var(--c-green)]">
            <i className="ti ti-arrow-up text-[11px]" aria-hidden="true" />
            Newer
          </span>
        ) : null,
      },
      {
        icon: tablerDeviceClass(device.kind),
        label: 'Last device',
        value: device.name,
      },
      {
        icon: 'ti-file-description',
        label: 'Contents',
        value: workspaceContentsLabel(workspace),
      },
    ];

    return (
      <button
        key={copyKey}
        type="button"
        onClick={() => setDuplicateReviewSelection(copyKey)}
        className="overflow-hidden rounded-xl bg-[var(--c-panel)] text-left transition-colors"
        style={cardStyle}
      >
        <div className={`flex items-center justify-between gap-3 px-4 py-3 ${headerClass}`}>
          <div className="flex items-center gap-2">
            <span
              className={[
                'inline-flex h-4 w-4 items-center justify-center rounded-full border transition-colors',
                selected ? 'border-[var(--c-line)] bg-[var(--c-line)] text-white' : 'border-[var(--color-text-secondary)] bg-transparent',
              ].join(' ')}
              aria-hidden="true"
            >
              {selected && <i className="ti ti-check text-[11px]" aria-hidden="true" />}
            </span>
            <span className={`font-sans text-[11px] font-semibold uppercase ${labelClass}`}>{label}</span>
          </div>
          {selected && (
            <span className="inline-flex items-center gap-1 font-sans text-[12px] font-medium text-[var(--c-line)]">
              <i className="ti ti-check text-[12px]" aria-hidden="true" />
              Keep this
            </span>
          )}
        </div>

        <div className="grid gap-3 px-4 py-4">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-3">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--border-radius-md)] bg-[var(--color-background-secondary)] text-[var(--color-text-secondary)]">
                <i className={`ti ${row.icon} text-[15px]`} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-sans text-[11px] text-[var(--color-text-secondary)]">{row.label}</span>
                <span className="block truncate font-sans text-[13px] font-medium text-[var(--c-text-hi)]">
                  {row.value}
                  {row.extra}
                </span>
              </span>
            </div>
          ))}
        </div>
      </button>
    );
  };

  const renderDuplicateReviewView = () => {
    if (!duplicateReviewWorkspace || !duplicateReviewCopyB) return null;
    const copyA = duplicateReviewWorkspace;
    const copyB = duplicateReviewCopyB;
    const selectedLabel = duplicateReviewSelection === 'a' ? 'Copy A' : 'Copy B';
    const deleteLabel = duplicateReviewSelection === 'a' ? 'Copy B' : 'Copy A';
    const deleteWorkspace = duplicateReviewSelection === 'a' ? copyB : copyA;
    const deleteDevice = getDuplicateReviewDevice(deleteWorkspace);
    const deletingDuplicate = actionLoading === `delete-duplicate:${deleteWorkspace.id}`;

    return (
      <div
        className="min-h-[560px] px-6 py-5"
        data-review-workspace-id={duplicateReviewRoute?.workspaceId}
        data-duplicate-workspace-ids={duplicateReviewRoute?.duplicateWorkspaceIds.join(',')}
      >
        <div>
          <h3 className="font-sans text-[15px] font-medium text-[var(--c-text-hi)]">
            Review duplicate &mdash; {copyA.title}
          </h3>
          <p className="mt-1 font-sans text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
            Two cloud copies share the same name. Pick the one to keep &mdash; the other will be deleted.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {renderDuplicateReviewCard('a', 'Copy A', copyA, copyB)}
          {renderDuplicateReviewCard('b', 'Copy B', copyB, copyA)}
        </div>

        <div className="mt-5 rounded-[var(--border-radius-lg)] border border-[var(--color-border-tertiary)] bg-[var(--color-background-secondary)] px-4 py-3">
          <p className="font-sans text-[13px] font-medium text-[var(--c-text-hi)]">
            Keep {selectedLabel}, delete {deleteLabel}
          </p>
          <p className="mt-1 font-sans text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">
            {deleteLabel} ({formatDuplicateReviewDate(deleteWorkspace.updatedAt)} · {deleteDevice.name}) will be <span className="text-[var(--color-text-danger)]">permanently deleted</span> from cloud. This cannot be undone.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ModalActionButton
            type="button"
            onClick={() => void handleConfirmDuplicateReview()}
            disabled={actionLoading !== null}
            variant="primary"
            size="md"
          >
            {deletingDuplicate ? 'Deleting...' : 'Delete and keep selected'}
          </ModalActionButton>
          <ModalActionButton
            type="button"
            onClick={handleBackToLibrary}
            disabled={actionLoading !== null}
            size="md"
          >
            Cancel
          </ModalActionButton>
          <span className="ml-auto inline-flex items-center gap-1.5 font-sans text-[12px] text-[var(--color-text-secondary)]">
            <i className="ti ti-shield-check text-[14px]" aria-hidden="true" />
            Nothing deleted until you confirm
          </span>
        </div>
      </div>
    );
  };

  return (
    <div
      data-native-clipboard="true"
      className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/55 backdrop-blur-sm"
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
        <ModalCloseButton
          onClick={onClose}
          ariaLabel="Close project sync modal"
          className={[
            'absolute right-4 top-3 z-20',
            user
              ? ''
              : 'bg-[rgba(255,248,240,0.3)] backdrop-blur-sm hover:bg-[rgba(255,248,240,0.6)] md:right-4 md:top-3',
          ].join(' ')}
        />

        <div className={user ? cx('flex items-center justify-between gap-4 border-b border-[var(--c-border)] px-5 py-4 pr-16', SURFACE_CLASS.header) : 'hidden'}>
          <div className="min-w-0">
            {duplicateReviewOpen ? (
              <button
                type="button"
                onClick={handleBackToLibrary}
                className="inline-flex items-center gap-2 rounded-lg px-1 py-1 font-sans text-[13px] font-medium text-[var(--c-text-md)] transition-colors hover:text-[var(--c-text-hi)]"
              >
                <i className="ti ti-arrow-left text-[14px]" aria-hidden="true" />
                Back to all projects
              </button>
            ) : (
              <>
                <h2 className="font-sans text-[18px] font-semibold text-[var(--c-text-hi)]">
                  Project Sync
                </h2>
                <p className="mt-1 font-sans text-[12px] text-[var(--c-text-lo)]">
                  Your chosen projects, ready wherever you need them.
                </p>
              </>
            )}
          </div>
          {user && (
            <AccountMenu
              user={user}
              accountLabel={accountLabel}
              avatarUrl={avatarUrl}
              onSignOut={handleSignOut}
            />
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!isConfigured ? (
          <div className="px-6 py-8">
            <p className="font-sans text-[13px] leading-relaxed text-[var(--c-text-md)]">
              Supabase is not configured yet. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable Project Sync login and storage.
            </p>
          </div>
        ) : !user && activeWorkspaceSyncTab === 'library' ? (
          <div className="min-h-0 flex-1 px-5 py-5">
            <div className="mb-4">
              <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-lo)]">All projects</p>
              <p className="mt-0.5 max-w-[52ch] font-sans text-[11px] leading-snug text-[var(--c-text-md)]">
                Open a project from this device. Sign in any time to also see your cloud copies.
              </p>
            </div>

            <div className="mb-4 inline-flex rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] p-1">
              <button
                type="button"
                className="rounded-lg bg-[var(--c-line)] px-3 py-1.5 font-sans text-[11px] font-semibold text-white shadow-sm"
                aria-pressed="true"
              >
                On this device
              </button>
              <button
                type="button"
                onClick={() => setActiveWorkspaceSyncTab('workspace')}
                className="rounded-lg px-3 py-1.5 font-sans text-[11px] font-semibold text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                title="Sign in to see cloud projects"
              >
                Cloud (sign in)
              </button>
            </div>

            <section>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-lo)]">On this device</p>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleReconnectLocalFolder()}
                    disabled={actionLoading !== null}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-panel)] px-2.5 font-sans text-[11px] font-semibold text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)] disabled:cursor-default disabled:opacity-60"
                  >
                    {reconnectingLocalFolder ? 'Opening...' : 'Open local folder...'}
                  </button>
                  <button
                    type="button"
                    onClick={handleStartNewWorkspace}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-panel)] px-2.5 font-sans text-[11px] font-semibold text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                  >
                    New blank project
                  </button>
                </div>
              </div>
              <div className="space-y-1.5 overflow-y-auto pr-1" style={{ maxHeight: '420px' }}>
                {workspacesLoading && localAndRecentRows.length === 0 ? (
                  <InlinePanel className="rounded-xl px-4 py-4 font-sans text-[12px] text-[var(--c-text-md)]">Loading recent projects...</InlinePanel>
                ) : localAndRecentRows.length === 0 ? (
                  <InlinePanel className="rounded-2xl px-4 py-5 text-[var(--c-text-lo)]">
                    <p className="font-sans text-[14px] font-semibold text-[var(--c-text-hi)]">No recent projects yet</p>
                    <p className="mt-1 font-sans text-[12px] leading-relaxed text-[var(--c-text-md)]">Open a local folder above to make it one click away here.</p>
                  </InlinePanel>
                ) : localAndRecentRows.map((row) => renderWorkspaceRow(row))}
              </div>
            </section>
          </div>
        ) : !user ? (
          <div className="grid min-h-[640px] md:grid-cols-[minmax(0,1fr),420px]">
            <div className="flex min-w-0 items-center px-5 py-6 sm:px-8 md:px-10 md:py-10">
              <div className="mx-auto w-full max-w-[520px]">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--c-border)] bg-[var(--c-canvas)]/55 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-lo)]">
                  DevBoard Sync
                </div>

                <p className="mt-5 font-sans text-[28px] font-semibold leading-[1.05] text-[var(--c-text-hi)] sm:text-[36px]">
                  {authMode === 'signin' ? 'Sync selected projects anywhere.' : 'Create your DevBoard account.'}
                </p>
                <p className="mt-3 max-w-[42ch] font-sans text-[14px] leading-relaxed text-[var(--c-text-md)] sm:text-[15px]">
                  {authMode === 'signin'
                    ? 'Local work stays free and yours. Sign in to use free beta sync for selected project folders.'
                    : 'Create an account to use free beta sync, reopen projects on another device, and keep online copies of the projects you choose.'}
                </p>

                {authUnavailable && (
                  <div className="mt-5 rounded-xl border border-[var(--c-red)]/30 bg-[color-mix(in_srgb,var(--c-red)_10%,transparent)] px-4 py-3">
                    <p className="font-sans text-[13px] font-semibold text-[var(--c-red)]">Cloud sync is unavailable right now.</p>
                    <p className="mt-1 font-sans text-[12px] leading-relaxed text-[var(--c-red)]">
                      The sync server isn&apos;t responding. Your local work is unaffected. If this continues,{' '}
                      <a href={GITHUB_ISSUES_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:opacity-80">
                        please report it on GitHub
                      </a>.
                    </p>
                  </div>
                )}

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
                      setAuthUnavailable(false);
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
                      setAuthUnavailable(false);
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
                        setAuthUnavailable(false);
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
                          setAuthUnavailable(false);
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
                    Sync up to {SYNC_WORKSPACE_LIMIT} selected projects, reopen them on another device, and keep working locally whenever you want.
                  </p>
                </div>

                <div className="relative mt-8 min-h-[340px]">
                  <div className="absolute left-8 top-7 z-10 w-[246px] rounded-[28px] border border-white/60 bg-[rgba(255,255,255,0.72)] p-4 shadow-[0_24px_70px_rgba(54,35,24,0.16)] backdrop-blur" style={{ animation: 'auth-card-float-a 6.4s ease-in-out infinite' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--c-text-lo)]">Project</p>
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
                      Free during beta while we learn what serious project sync needs.
                      </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : duplicateReviewOpen ? (
          renderDuplicateReviewView()
        ) : (
          <div className={cx('flex min-h-[560px] flex-col', SURFACE_CLASS.leftPane)}>
            <div className="border-b border-[var(--c-border)] px-5 pt-4">
              <div className="flex flex-wrap items-end gap-6">
                <div className="flex items-end gap-6">
                  {[
                    { id: 'workspace' as const, label: 'Current' },
                    { id: 'library' as const, label: 'All projects' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveWorkspaceSyncTab(tab.id);
                        setWorkspaceMenuId(null);
                        setDetailsRowId(null);
                        setDuplicateReviewRoute(null);
                      }}
                      className={[
                        'relative border-b-2 px-0 pb-2 pt-1 font-sans text-[13px] transition-colors',
                        activeWorkspaceSyncTab === tab.id
                          ? 'border-[var(--c-line)] font-semibold text-[var(--c-text-hi)]'
                          : 'border-transparent font-medium text-[var(--color-text-secondary)] hover:text-[var(--c-text-hi)]',
                      ].join(' ')}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {activeWorkspaceSyncTab === 'workspace' ? (
              <div className="flex min-h-0 flex-1 flex-col gap-5 px-5 py-5">
                <section className="border-b border-[var(--c-border)] pb-5">
                  <h3 className="truncate font-sans text-[22px] font-semibold text-[var(--c-text-hi)]">
                    {currentWorkspaceName}
                  </h3>
                  <p className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 font-sans text-[12px] font-semibold text-[var(--c-text-md)]">
                    <span className={`h-2 w-2 rounded-full ${workspaceStatusDotClass}`} aria-hidden="true" />
                    {workspaceStatusParts.map((part, index) => (
                      <span key={`${part}-${index}`} className="inline-flex items-center gap-1.5">
                        {index > 0 && <span className="text-[var(--c-text-lo)]">·</span>}
                        <span>{part}</span>
                      </span>
                    ))}
                  </p>
                  {localFolderConnected && currentLocationLabel && (
                    <p className="mt-2 flex min-w-0 items-center gap-1.5 font-sans text-[11px] text-[var(--c-text-lo)]" title={currentLocationLabel.fullPath ?? currentLocalFolderTitle}>
                      <IconDevice kind={currentLocationLabel.deviceKind} />
                      <span className="truncate">{currentLocationLabel.fullPath ?? currentLocationLabel.label}</span>
                    </p>
                  )}
                </section>

                {newerCloudWorkspace && (
                  <section className="rounded-2xl border border-[var(--c-yellow)]/35 bg-[color-mix(in_srgb,var(--c-yellow)_10%,transparent)] p-4">
                    <div className="flex gap-3">
                      <span className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--c-yellow)]/30 bg-[color-mix(in_srgb,var(--c-yellow)_10%,transparent)] text-[var(--c-line)]">
                        <IconEmptyCloud />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-sans text-[14px] font-semibold text-[var(--c-text-hi)]">Cloud copy is newer than your local version</p>
                        <p className="mt-1 font-sans text-[12px] leading-relaxed text-[var(--c-text-md)]">
                          The cloud was updated more recently. Review before syncing to avoid overwriting local changes.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <ModalActionButton
                            type="button"
                            onClick={() => void handleLoadWorkspace(newerCloudWorkspace)}
                            disabled={actionLoading !== null}
                            size="sm"
                          >
                            {actionLoading === `load:${newerCloudWorkspace.id}` ? 'Opening...' : 'Review cloud copy'}
                          </ModalActionButton>
                          <ModalActionButton
                            type="button"
                            onClick={() => void handleCreateOnlineCopy()}
                            disabled={actionLoading !== null}
                            size="sm"
                          >
                            {actionLoading === 'save-new' ? 'Uploading...' : 'Save new copy first'}
                          </ModalActionButton>
                          <ModalActionButton
                            type="button"
                            onClick={() => {
                              keepCurrentWorkspaceLocalOnly();
                              rememberCloudEvent(newerCloudWorkspace, 'unlink');
                              toast('Kept the local project separate. No cloud copy was deleted.');
                            }}
                            disabled={actionLoading !== null}
                            size="sm"
                          >
                            Keep local
                          </ModalActionButton>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                <button
                  type="button"
                  onClick={() => void handleCreateOnlineCopy()}
                  disabled={actionLoading !== null}
                  className={cx('group flex w-full items-center gap-3 rounded-2xl border border-[var(--c-border)] p-4 text-left transition-colors hover:bg-[var(--c-hover)] disabled:cursor-default disabled:opacity-60', SURFACE_CLASS.second)}
                >
                  <span className={cx('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--c-border)] text-[var(--c-text-md)]', SURFACE_CLASS.quiet)}>
                    <IconNewWorkspace />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-sans text-[14px] font-semibold text-[var(--c-text-hi)]">
                      Save a new cloud copy
                    </span>
                    <span className="mt-1 block font-sans text-[12px] leading-snug text-[var(--c-text-md)]">
                      Snapshot this project to cloud as a separate copy. Useful before making big changes.
                    </span>
                  </span>
                  <span className="shrink-0 text-[var(--c-text-lo)] transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                    <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
                      <path d="M6.4 3.6 11.3 8.5l-4.9 4.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>

                {!localFolderConnected && (
                  <section className={cx('rounded-2xl border border-[var(--c-border)] p-4', SURFACE_CLASS.quiet)}>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--c-yellow)]/30 bg-[color-mix(in_srgb,var(--c-yellow)_10%,transparent)] text-[var(--c-line)]">
                        <IconFolderOpen />
                      </span>
                      <div className="min-w-[220px] flex-1">
                        <p className="font-sans text-[14px] font-semibold text-[var(--c-text-hi)]">No local folder connected</p>
                        <p className="mt-1 font-sans text-[12px] leading-snug text-[var(--c-text-md)]">
                          Connect a folder to keep a local backup alongside the cloud copy.
                        </p>
                      </div>
                      <ModalActionButton
                        type="button"
                        onClick={() => void handleReconnectLocalFolder()}
                        disabled={actionLoading !== null}
                        size="sm"
                      >
                        {reconnectingLocalFolder ? 'Reconnecting...' : 'Reconnect folder'}
                      </ModalActionButton>
                    </div>
                    {currentFolderDownloadProgress && (
                      <div className="mt-3">
                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--c-border)]">
                          <div className="h-full rounded-full bg-[var(--c-line)] transition-[width]" style={{ width: `${currentFolderDownloadPercent}%` }} />
                        </div>
                        <p className="mt-1 font-sans text-[10px] text-[var(--c-text-lo)]">{currentFolderDownloadProgress.label}</p>
                      </div>
                    )}
                  </section>
                )}

                <p className="mt-auto flex items-center justify-end gap-2 border-t border-[var(--c-border)] pt-4 font-sans text-[12px] text-[var(--c-text-md)]">
                  <IconCheck />
                  Nothing will be deleted until you confirm.
                </p>
              </div>
            ) : (
              <div className="min-h-0 flex-1 px-5 py-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-lo)]">All projects</p>
                    <p className="mt-0.5 max-w-[48ch] font-sans text-[11px] leading-snug text-[var(--c-text-md)]">
                      Open a project from this device, or browse cloud copies. Local work stays free and yours.
                    </p>
                  </div>
                  <div className="relative flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => { setAddMenuOpen(false); void reloadRecentRows(); }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--c-border)] bg-[var(--c-panel)] text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
                      title="Refresh projects"
                      aria-label="Refresh projects"
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
                          New blank project
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mb-4 inline-flex rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] p-1">
                  {[
                    { id: 'local' as const, label: 'On this device' },
                    { id: 'cloud' as const, label: 'Cloud' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setLibraryTab(tab.id);
                        setWorkspaceMenuId(null);
                        setDetailsRowId(null);
                        setDuplicateReviewRoute(null);
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
                  <section className="rounded-2xl border border-[var(--c-green)]/25 bg-[color-mix(in_srgb,var(--c-green)_7%,transparent)] p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-lo)]">On cloud</p>
                      <span className={cx('rounded-full px-2 py-0.5 font-sans text-[10px] font-semibold', workspaces.length >= SYNC_WORKSPACE_LIMIT ? 'bg-[var(--c-yellow)]/15 text-[var(--c-line)]' : 'bg-[var(--c-green)]/15 text-[var(--c-green)]')}>
                        {workspaces.length}/{SYNC_WORKSPACE_LIMIT}
                      </span>
                    </div>
                    {workspaces.length >= SYNC_WORKSPACE_LIMIT && (
                      <InlinePanel className="mb-2" tone="warning">
                        <p className="font-sans text-[11px] font-semibold text-[var(--c-text-hi)]">Sync limit reached</p>
                        <p className="mt-0.5 font-sans text-[10px] leading-snug text-[var(--c-text-md)]">{workspaces.length}/{SYNC_WORKSPACE_LIMIT} cloud copies used. Move a project offline or delete a synced copy to make room.</p>
                      </InlinePanel>
                    )}
                    <div className="space-y-1.5 overflow-y-auto pr-1" style={{ maxHeight: '360px' }}>
                      {workspacesLoading && cloudWorkspaceRows.length === 0 ? (
                        <InlinePanel className="rounded-xl px-4 py-4 font-sans text-[12px] text-[var(--c-text-md)]">Loading cloud projects...</InlinePanel>
                      ) : cloudWorkspaceRows.length === 0 ? (
                        <InlinePanel className="rounded-xl px-4 py-4">
                          <p className="font-sans text-[13px] font-semibold text-[var(--c-text-hi)]">Nothing on cloud yet</p>
                          <p className="mt-1 font-sans text-[11px] leading-relaxed text-[var(--c-text-md)]">Turn on sync for a project and it will appear here.</p>
                        </InlinePanel>
                      ) : (
                        cloudWorkspaceRows.map((row) => renderWorkspaceRow(row, { cloudShelf: true }))
                      )}
                    </div>
                  </section>
                )}

                {libraryTab === 'local' && (
                  <section>
                    <div className="mb-2">
                      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-lo)]">On this device</p>
                      <p className="mt-0.5 font-sans text-[11px] leading-snug text-[var(--c-text-md)]">Folders and recent projects stored locally — no account needed.</p>
                    </div>
                    <div className="space-y-1.5 overflow-y-auto pr-1" style={{ maxHeight: '390px' }}>
                      {workspacesLoading && localAndRecentRows.length === 0 ? (
                        <InlinePanel className="rounded-xl px-4 py-4 font-sans text-[12px] text-[var(--c-text-md)]">Loading recent projects...</InlinePanel>
                      ) : localAndRecentRows.length === 0 ? (
                        <InlinePanel className="rounded-2xl px-4 py-5 text-[var(--c-text-lo)]">
                          <p className="font-sans text-[14px] font-semibold text-[var(--c-text-hi)]">No recent projects yet</p>
                          <p className="mt-1 font-sans text-[12px] leading-relaxed text-[var(--c-text-md)]">Open a local folder or download a cloud project to make it one click away here.</p>
                        </InlinePanel>
                      ) : localAndRecentRows.map((row) => renderWorkspaceRow(row))}
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
