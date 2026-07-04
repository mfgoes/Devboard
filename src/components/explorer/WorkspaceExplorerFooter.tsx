import type { ComponentProps, RefObject } from 'react';
import { useRef } from 'react';

import { useAuth } from '../../contexts/AuthContext';
import { FONTS } from '../../utils/fonts';
import { type LocalRecentWorkspace } from '../../utils/workspaceManager';
import WorkspaceExplorerAccountMenu from './WorkspaceExplorerAccountMenu';
import WorkspaceExplorerProjectSwitcher from './WorkspaceExplorerProjectSwitcher';
import WorkspaceExplorerProjectMenu from './WorkspaceExplorerProjectMenu';

type FooterSyncDot = ComponentProps<typeof WorkspaceExplorerProjectSwitcher>['footerSyncDot'];

interface WorkspaceExplorerFooterProps {
  footerSyncDot: FooterSyncDot;
  projectSwitcherRef: RefObject<HTMLDivElement>;
  projectSwitcherOpen: boolean;
  projectSwitcherLoading: boolean;
  projectSwitcherRecents: LocalRecentWorkspace[];
  workspaceDisplayName: string;
  footerStatusLabel?: string;
  onToggleProjectSwitcher: () => void;
  onProjectSwitcherContextMenu: (x: number, y: number) => void;
  onOpenRecentProject: (project: LocalRecentWorkspace) => void;
  onRelocateRecentProject: (project: LocalRecentWorkspace) => void;
  onOpenProjectsLibrary: () => void;
  projectMenu: { x: number; y: number } | null;
  projectMenuRef: RefObject<HTMLDivElement>;
  onRenameProject: () => void;
  onOpenLocalFolder: () => void;
  onOpenCloudModal: () => void;
}

export default function WorkspaceExplorerFooter({
  footerSyncDot,
  projectSwitcherRef,
  projectSwitcherOpen,
  projectSwitcherLoading,
  projectSwitcherRecents,
  workspaceDisplayName,
  footerStatusLabel,
  onToggleProjectSwitcher,
  onProjectSwitcherContextMenu,
  onOpenRecentProject,
  onRelocateRecentProject,
  onOpenProjectsLibrary,
  projectMenu,
  projectMenuRef,
  onRenameProject,
  onOpenLocalFolder,
  onOpenCloudModal,
}: WorkspaceExplorerFooterProps) {
  const { isConfigured, user, signOut } = useAuth();
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountLabel = user?.user_metadata?.user_name
    ?? user?.user_metadata?.preferred_username
    ?? user?.user_metadata?.name
    ?? user?.email
    ?? 'Account';
  const accountInitials = String(accountLabel).trim().charAt(0).toUpperCase() || 'A';
  const avatarUrl = typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null;

  return (
    <div
      style={{
        marginTop: 'auto',
        borderTop: '0.5px solid var(--c-sidebar-border)',
        flexShrink: 0,
        padding: 10,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <div ref={projectSwitcherRef} style={{ position: 'relative', minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
        <WorkspaceExplorerProjectSwitcher
          open={projectSwitcherOpen}
          loading={projectSwitcherLoading}
          recents={projectSwitcherRecents}
          workspaceDisplayName={workspaceDisplayName}
          footerLabel={footerStatusLabel}
          footerSyncDot={footerSyncDot}
          onToggleOpen={onToggleProjectSwitcher}
          onContextMenu={onProjectSwitcherContextMenu}
          onOpenRecentProject={onOpenRecentProject}
          onRelocateRecentProject={onRelocateRecentProject}
          onOpenProjectsLibrary={onOpenProjectsLibrary}
          onOpenCloudModal={onOpenCloudModal}
        />
      </div>

      {isConfigured && (
        user ? (
          <WorkspaceExplorerAccountMenu
            ref={accountMenuRef}
            accountLabel={accountLabel}
            accountInitials={accountInitials}
            avatarUrl={avatarUrl}
            userEmail={user.email ?? null}
            onSignIn={onOpenCloudModal}
            onSignOut={() => { void signOut(); }}
          />
        ) : (
          <button
            type="button"
            onClick={onOpenCloudModal}
            title="Sign in to sync projects"
            style={{
              flexShrink: 0,
              height: 28,
              padding: '0 10px',
              border: '1px solid var(--c-sidebar-border)',
              borderRadius: 7,
              background: 'transparent',
              color: 'var(--c-text-md)',
              cursor: 'pointer',
              fontFamily: FONTS.ui,
              fontSize: 11,
              fontWeight: 720,
              transition: 'background 0.12s ease, color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--c-hover)';
              e.currentTarget.style.color = 'var(--c-text-hi)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--c-text-md)';
            }}
          >
            Sign in
          </button>
        )
      )}

      <WorkspaceExplorerProjectMenu
        open={!!projectMenu}
        x={projectMenu?.x ?? 0}
        y={projectMenu?.y ?? 0}
        menuRef={projectMenuRef}
        onRenameProject={onRenameProject}
        onOpenLocalFolder={onOpenLocalFolder}
      />
    </div>
  );
}
