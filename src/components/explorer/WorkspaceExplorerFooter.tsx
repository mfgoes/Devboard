import type { ComponentProps, RefObject } from 'react';

import { type LocalRecentWorkspace } from '../../utils/workspaceManager';
import WorkspaceExplorerProjectSwitcher from './WorkspaceExplorerProjectSwitcher';
import WorkspaceExplorerProjectMenu from './WorkspaceExplorerProjectMenu';

type FooterSyncDot = ComponentProps<typeof WorkspaceExplorerProjectSwitcher>['footerSyncDot'];

interface WorkspaceExplorerFooterProps {
  footerSyncDot: FooterSyncDot;
  projectSwitcherOpen: boolean;
  projectSwitcherLoading: boolean;
  projectSwitcherRecents: LocalRecentWorkspace[];
  workspaceDisplayName: string;
  footerStatusLabel?: string;
  onToggleProjectSwitcher: () => void;
  onProjectSwitcherContextMenu: (x: number, y: number) => void;
  onOpenRecentProject: (project: LocalRecentWorkspace) => void;
  onOpenProjectsLibrary: () => void;
  projectMenu: { x: number; y: number } | null;
  projectMenuRef: RefObject<HTMLDivElement>;
  onRenameProject: () => void;
  onOpenLocalFolder: () => void;
}

export default function WorkspaceExplorerFooter({
  footerSyncDot,
  projectSwitcherOpen,
  projectSwitcherLoading,
  projectSwitcherRecents,
  workspaceDisplayName,
  footerStatusLabel,
  onToggleProjectSwitcher,
  onProjectSwitcherContextMenu,
  onOpenRecentProject,
  onOpenProjectsLibrary,
  projectMenu,
  projectMenuRef,
  onRenameProject,
  onOpenLocalFolder,
}: WorkspaceExplorerFooterProps) {
  return (
    <div
      style={{
        marginTop: 'auto',
        borderTop: '0.5px solid var(--c-sidebar-border)',
        flexShrink: 0,
        padding: 10,
        position: 'relative',
      }}
    >
      <div style={{ position: 'relative', minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
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
          onOpenProjectsLibrary={onOpenProjectsLibrary}
        />
      </div>
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
