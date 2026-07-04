import React, { useCallback, useState } from 'react';
import { DARK_MENU_COLORS } from './darkMenuTheme';
import { IconCanvasDoc } from './icons';
import {
  CommandIcon,
  CommandMenuDivider,
  CommandMenuItem,
  CommandMenuSubItem,
} from './explorer/WorkspaceExplorerParts';
import type { LocalRecentWorkspace } from '../utils/workspaceManager';

export interface AppMenuActions {
  newNote: () => void;
  newCanvas: () => void;
  newFolder: () => void;
  importMarkdown: () => void;
  openLocalFolder: () => void;
  openRecentProject: (project: LocalRecentWorkspace) => void;
  allProjects: () => void;
  saveProject: () => void;
  renameProject: () => void;
  projectSync: () => void;
  search: () => void;
  toggleTimer: () => void;
  toggleJira: () => void;
  exportActiveNoteMarkdown: () => void;
  exportActiveNotePdf: () => void;
  exportActiveNoteText: () => void;
  exportBoardPng?: () => void;
  downloadDesktopApp: () => void;
  preferences: () => void;
  helpAbout: () => void;
}

export interface AppMenuState {
  timerVisible?: boolean;
  jiraOpen?: boolean;
  canExportActiveNote: boolean;
  canExportBoardPng?: boolean;
}

type AppMenuProps = {
  actions: AppMenuActions;
  state: AppMenuState;
  recentProjects?: LocalRecentWorkspace[];
  currentProjectName?: string;
  left: number;
  top: number;
  width?: number;
  onRequestClose: () => void;
};

export default function AppMenu({ actions, state, recentProjects = [], currentProjectName, left, top, width = 220, onRequestClose }: AppMenuProps) {
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);

  const runAction = useCallback((action: () => void) => {
    onRequestClose();
    action();
  }, [onRequestClose]);

  const closeSubmenu = useCallback((id: string) => {
    setActiveSubmenu((current) => current === id ? null : current);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top,
        left,
        zIndex: 10001,
        width,
        padding: '6px 0',
        border: `1px solid ${DARK_MENU_COLORS.border}`,
        borderRadius: 10,
        background: DARK_MENU_COLORS.surface,
        boxShadow: DARK_MENU_COLORS.shadow,
        overflow: 'visible',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <CommandMenuSubItem
        icon={<CommandIcon kind="file" />}
        label="File"
        open={activeSubmenu === 'file'}
        onOpen={() => setActiveSubmenu('file')}
        onClose={() => closeSubmenu('file')}
      >
        <CommandMenuItem icon={<CommandIcon kind="file" />} label="New note" onClick={() => runAction(actions.newNote)} />
        <CommandMenuItem icon={<IconCanvasDoc size={13} />} label="New canvas" onClick={() => runAction(actions.newCanvas)} />
        <CommandMenuItem icon={<CommandIcon kind="folder" />} label="New folder" onClick={() => runAction(actions.newFolder)} />
        <CommandMenuDivider />
        <CommandMenuItem icon={<CommandIcon kind="export" />} label="Import Markdown..." onClick={() => runAction(actions.importMarkdown)} />
        <CommandMenuItem icon={<CommandIcon kind="folder" />} label="Open local folder..." onClick={() => runAction(actions.openLocalFolder)} />
        <CommandMenuItem icon={<CommandIcon kind="view" />} label="Save project" onClick={() => runAction(actions.saveProject)} />
        <CommandMenuItem icon={<CommandIcon kind="settings" />} label="Rename workspace..." onClick={() => runAction(actions.renameProject)} />
        <CommandMenuItem icon={<CommandIcon kind="settings" />} label="Project Sync..." onClick={() => runAction(actions.projectSync)} />
      </CommandMenuSubItem>

      <CommandMenuSubItem
        icon={<CommandIcon kind="folder" />}
        label="Projects"
        open={activeSubmenu === 'projects'}
        onOpen={() => setActiveSubmenu('projects')}
        onClose={() => closeSubmenu('projects')}
      >
        {recentProjects.length > 0 ? (
          recentProjects.slice(0, 6).map((project) => {
            const isCurrent = !!currentProjectName && project.title === currentProjectName;
            return (
              <CommandMenuItem
                key={project.id}
                icon={<CommandIcon kind="folder" />}
                label={project.title || 'Untitled project'}
                disabled={isCurrent}
                trailing={isCurrent ? 'Current' : undefined}
                onClick={() => runAction(() => actions.openRecentProject(project))}
              />
            );
          })
        ) : (
          <CommandMenuItem
            icon={<CommandIcon kind="folder" />}
            label="No recent projects"
            disabled
          />
        )}
        <CommandMenuDivider />
        <CommandMenuItem icon={<CommandIcon kind="folder" />} label="All projects..." onClick={() => runAction(actions.allProjects)} />
      </CommandMenuSubItem>

      <CommandMenuSubItem
        icon={<CommandIcon kind="view" />}
        label="View"
        open={activeSubmenu === 'view'}
        onOpen={() => setActiveSubmenu('view')}
        onClose={() => closeSubmenu('view')}
      >
        <CommandMenuItem icon={<CommandIcon kind="search" />} label="Search..." onClick={() => runAction(actions.search)} />
        <CommandMenuItem
          icon={<CommandIcon kind="view" />}
          label="Timer"
          onClick={() => runAction(actions.toggleTimer)}
        />
        <CommandMenuItem
          icon={<CommandIcon kind="view" />}
          label="Jira panel"
          onClick={() => runAction(actions.toggleJira)}
        />
      </CommandMenuSubItem>

      <CommandMenuSubItem
        icon={<CommandIcon kind="export" />}
        label="Export"
        open={activeSubmenu === 'export'}
        onOpen={() => setActiveSubmenu('export')}
        onClose={() => closeSubmenu('export')}
      >
        <CommandMenuItem
          icon={<CommandIcon kind="export" />}
          label="Export active note as Markdown"
          disabled={!state.canExportActiveNote}
          onClick={() => runAction(actions.exportActiveNoteMarkdown)}
        />
        <CommandMenuItem
          icon={<CommandIcon kind="export" />}
          label="Export active note as PDF"
          disabled={!state.canExportActiveNote}
          onClick={() => runAction(actions.exportActiveNotePdf)}
        />
        <CommandMenuItem
          icon={<CommandIcon kind="export" />}
          label="Export active note as text"
          disabled={!state.canExportActiveNote}
          onClick={() => runAction(actions.exportActiveNoteText)}
        />
        {actions.exportBoardPng && (
          <CommandMenuItem
            icon={<CommandIcon kind="export" />}
            label="Export board as PNG"
            disabled={state.canExportBoardPng === false}
            onClick={() => runAction(actions.exportBoardPng!)}
          />
        )}
      </CommandMenuSubItem>

      <CommandMenuDivider />
      <CommandMenuItem
        icon={<CommandIcon kind="download" />}
        label="Download desktop app"
        onClick={() => runAction(actions.downloadDesktopApp)}
      />
      <CommandMenuDivider />
      <CommandMenuItem icon={<CommandIcon kind="settings" />} label="Preferences..." onClick={() => runAction(actions.preferences)} />
      <CommandMenuItem icon={<CommandIcon kind="help" />} label="Help & about" onClick={() => runAction(actions.helpAbout)} />
    </div>
  );
}
