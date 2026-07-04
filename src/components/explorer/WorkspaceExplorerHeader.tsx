import type { RefObject } from 'react';

import type { Document } from '../../types';
import { FONTS } from '../../utils/fonts';
import WorkspaceExplorerCommandMenu from './WorkspaceExplorerCommandMenu';
import { IconSidebarToggle } from '../icons';
import type { LocalRecentWorkspace } from '../../utils/workspaceManager';

interface WorkspaceExplorerHeaderProps {
  isPreviewPanel: boolean;
  workspaceDisplayName: string;
  commandMenuRef: RefObject<HTMLDivElement>;
  activeDocumentForMenu: Document | null;
  projectSwitcherRecents: LocalRecentWorkspace[];
  onToggleSearch: () => void;
  onToggleTimer: () => void;
  onToggleJira: () => void;
  onExportBoardPng: () => void;
  onOpenFolder: () => void;
  onOpenRecentProject: (project: LocalRecentWorkspace) => void;
  onOpenProjectsLibrary: () => void;
  onOpenCloudModal: () => void;
  onOpenPreferences: () => void;
  onOpenGetStarted: () => void;
  onCloseSidebarMenus: (keep?: 'command' | 'missingImages' | 'projectSwitcher' | 'preferences') => void;
  onLoadProjectSwitcherRecents: () => void;
  onCreateNote: () => void;
  onCreateCanvas: () => void;
  onCreateFolder: () => void;
  onImportMarkdown: () => void;
  onSaveWorkspace: () => void;
  onRenameWorkspace: () => void;
  onWorkspaceNameContextMenu: (x: number, y: number) => void;
  onCollapse: () => void;
}

export default function WorkspaceExplorerHeader({
  isPreviewPanel,
  workspaceDisplayName,
  commandMenuRef,
  activeDocumentForMenu,
  projectSwitcherRecents,
  onToggleSearch,
  onToggleTimer,
  onToggleJira,
  onExportBoardPng,
  onOpenFolder,
  onOpenRecentProject,
  onOpenProjectsLibrary,
  onOpenCloudModal,
  onOpenPreferences,
  onOpenGetStarted,
  onCloseSidebarMenus,
  onLoadProjectSwitcherRecents,
  onCreateNote,
  onCreateCanvas,
  onCreateFolder,
  onImportMarkdown,
  onSaveWorkspace,
  onRenameWorkspace,
  onWorkspaceNameContextMenu,
  onCollapse,
}: WorkspaceExplorerHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: isPreviewPanel ? 6 : 8,
        justifyContent: isPreviewPanel ? 'flex-start' : 'space-between',
        minHeight: 44,
        padding: '6px 12px',
        flexShrink: 0,
        borderBottom: '0.5px solid #e8e6e2',
        background: '#ffffff',
      }}
    >
      {!isPreviewPanel ? (
        <WorkspaceExplorerCommandMenu
          ref={commandMenuRef}
          workspaceDisplayName={workspaceDisplayName}
          activeDocumentForMenu={activeDocumentForMenu}
          projectSwitcherRecents={projectSwitcherRecents}
          onToggleSearch={onToggleSearch}
          onToggleTimer={onToggleTimer}
          onToggleJira={onToggleJira}
          onExportBoardPng={onExportBoardPng}
          onOpenFolder={onOpenFolder}
          onOpenRecentProject={onOpenRecentProject}
          onOpenProjectsLibrary={onOpenProjectsLibrary}
          onOpenCloudModal={onOpenCloudModal}
          onOpenPreferences={onOpenPreferences}
          onOpenGetStarted={onOpenGetStarted}
          onCloseSidebarMenus={onCloseSidebarMenus}
          onLoadProjectSwitcherRecents={onLoadProjectSwitcherRecents}
          onCreateNote={onCreateNote}
          onCreateCanvas={onCreateCanvas}
          onCreateFolder={onCreateFolder}
          onImportMarkdown={onImportMarkdown}
          onSaveWorkspace={onSaveWorkspace}
          onRenameWorkspace={onRenameWorkspace}
          onWorkspaceNameContextMenu={onWorkspaceNameContextMenu}
        />
      ) : (
        <div
          style={{
            minWidth: 0,
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 2,
          }}
        >
          <span
            role="button"
            tabIndex={0}
            title="Double-click to rename workspace"
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRenameWorkspace();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onWorkspaceNameContextMenu(e.clientX, e.clientY);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              onRenameWorkspace();
            }}
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--c-text-md)',
              fontFamily: FONTS.ui,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.01em',
              cursor: 'text',
              outline: 'none',
            }}
          >
            {workspaceDisplayName}
          </span>
        </div>
      )}

      <button
        onClick={onCollapse}
        title={isPreviewPanel ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={isPreviewPanel ? 'Expand sidebar' : 'Collapse sidebar'}
        className="flex items-center justify-center transition-colors"
        style={{
          width: 28,
          height: 28,
          border: 'none',
          borderRadius: 'var(--border-radius-md)',
          background: 'transparent',
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-background-secondary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <IconSidebarToggle size={16} />
      </button>
    </div>
  );
}
