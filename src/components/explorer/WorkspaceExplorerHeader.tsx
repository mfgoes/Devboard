import type { RefObject } from 'react';

import type { Document } from '../../types';
import { FONTS } from '../../utils/fonts';
import WorkspaceExplorerCommandMenu from './WorkspaceExplorerCommandMenu';
import { IconSidebarToggle, IconSearch, IconPlus } from '../icons';
import { IS_MACOS_DESKTOP, type LocalRecentWorkspace } from '../../utils/workspaceManager';
import { CollapsedRailTooltip } from '../CollapsedRailTooltip';

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
      // Tauri matches this attribute on the event target only, never on
      // ancestors, so the buttons inside keep working untouched.
      data-tauri-drag-region={IS_MACOS_DESKTOP ? '' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: isPreviewPanel ? 6 : 8,
        justifyContent: isPreviewPanel ? 'flex-start' : 'space-between',
        minHeight: 44,
        padding: '6px 12px',
        // Clear the macOS traffic lights, which now overlay the webview.
        paddingLeft: IS_MACOS_DESKTOP ? 78 : 12,
        flexShrink: 0,
        // macOS: the header is part of the title band, so it sits flush with
        // the sidebar body rather than reading as its own strip.
        borderBottom: IS_MACOS_DESKTOP ? 'none' : '0.5px solid var(--c-sidebar-header-border)',
        background: IS_MACOS_DESKTOP ? 'var(--c-sidebar)' : 'var(--c-sidebar-header)',
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
          data-tauri-drag-region={IS_MACOS_DESKTOP ? '' : undefined}
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
            title={`${workspaceDisplayName} — double-click to rename`}
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        {!isPreviewPanel && (
          <>
            <HeaderIconButton title="Search" ariaLabel="Search" onClick={onToggleSearch}>
              <IconSearch size={16} />
            </HeaderIconButton>
            <HeaderIconButton title="New note" ariaLabel="New note" onClick={onCreateNote}>
              <IconPlus size={16} />
            </HeaderIconButton>
          </>
        )}
        <HeaderIconButton
          title={isPreviewPanel ? 'Expand sidebar' : 'Collapse sidebar'}
          ariaLabel={isPreviewPanel ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={onCollapse}
        >
          <IconSidebarToggle size={16} />
        </HeaderIconButton>
      </div>
    </div>
  );
}

function HeaderIconButton({
  title,
  ariaLabel,
  onClick,
  children,
}: {
  title: string;
  ariaLabel: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    // The label comes from the tooltip, so no `title` — it would double up.
    <CollapsedRailTooltip label={title} placement="bottom">
      <button
        onClick={onClick}
        aria-label={ariaLabel}
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
        {children}
      </button>
    </CollapsedRailTooltip>
  );
}
