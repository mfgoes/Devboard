import type { ComponentProps, RefObject } from 'react';

import { type ImageNode } from '../../types';
import { type LocalRecentWorkspace } from '../../utils/workspaceManager';
import WorkspaceExplorerMissingImagesControl from './WorkspaceExplorerMissingImagesControl';
import WorkspaceExplorerProjectSwitcher from './WorkspaceExplorerProjectSwitcher';
import WorkspaceExplorerProjectMenu from './WorkspaceExplorerProjectMenu';

type FooterSyncDot = ComponentProps<typeof WorkspaceExplorerProjectSwitcher>['footerSyncDot'];

interface WorkspaceExplorerFooterProps {
  missingImagesOpen: boolean;
  missingImages: ImageNode[];
  missingImagesFixing: boolean;
  missingImagesPopoverRef: RefObject<HTMLDivElement>;
  footerSyncDot: FooterSyncDot;
  missingImagePath: (image: ImageNode) => string;
  onToggleMissingImages: () => void;
  onCloseMissingImages: () => void;
  onFindMissingImages: () => void;
  onIgnoreMissingImages: () => void;
  onOpenFolder: () => void;
  projectSwitcherOpen: boolean;
  projectSwitcherLoading: boolean;
  projectSwitcherRecents: LocalRecentWorkspace[];
  workspaceDisplayName: string;
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
  missingImagesOpen,
  missingImages,
  missingImagesFixing,
  missingImagesPopoverRef,
  footerSyncDot,
  missingImagePath,
  onToggleMissingImages,
  onCloseMissingImages,
  onFindMissingImages,
  onIgnoreMissingImages,
  onOpenFolder,
  projectSwitcherOpen,
  projectSwitcherLoading,
  projectSwitcherRecents,
  workspaceDisplayName,
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
      {false && missingImages.length > 0 && (
        <WorkspaceExplorerMissingImagesControl
          ref={missingImagesPopoverRef}
          open={missingImagesOpen}
          missingImages={missingImages}
          missingImagesFixing={missingImagesFixing}
          missingImagePath={missingImagePath}
          onToggleOpen={onToggleMissingImages}
          onClose={onCloseMissingImages}
          onFindMissingImages={onFindMissingImages}
          onIgnoreMissingImages={onIgnoreMissingImages}
          onOpenFolder={onOpenFolder}
        />
      )}

      <div style={{ position: 'relative', minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
        <WorkspaceExplorerProjectSwitcher
          open={projectSwitcherOpen}
          loading={projectSwitcherLoading}
          recents={projectSwitcherRecents}
          workspaceDisplayName={workspaceDisplayName}
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
