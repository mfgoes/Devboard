import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Document } from '../../types';
import { FONTS } from '../../utils/fonts';
import { exportDocumentAsMarkdownFile, exportDocumentAsPdf, exportDocumentAsTextFile } from '../../utils/documentExport';
import { DARK_MENU_COLORS } from '../darkMenuTheme';
import AppMenu from '../AppMenu';
import type { LocalRecentWorkspace } from '../../utils/workspaceManager';
import { MenuIcon } from './WorkspaceExplorerParts';
import { isCanvasDocument } from './workspaceExplorerUtils';

interface WorkspaceExplorerCommandMenuProps {
  workspaceDisplayName: string;
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
}

const WorkspaceExplorerCommandMenu = forwardRef<HTMLDivElement, WorkspaceExplorerCommandMenuProps>(
  function WorkspaceExplorerCommandMenu(
    {
      workspaceDisplayName,
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
    }: WorkspaceExplorerCommandMenuProps,
    ref,
  ) {
    const [commandMenuOpen, setCommandMenuOpen] = useState(false);
    const localRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleWindowClick = (event: MouseEvent) => {
        const target = event.target as Node | null;
        if (!target) return;
        if (localRef.current?.contains(target)) return;
        setCommandMenuOpen(false);
      };
      if (!commandMenuOpen) return;
      window.addEventListener('click', handleWindowClick);
      return () => window.removeEventListener('click', handleWindowClick);
    }, [commandMenuOpen]);

    useImperativeHandle(ref, () => localRef.current as HTMLDivElement);

    const closeCommandMenu = useCallback(() => {
      setCommandMenuOpen(false);
    }, []);

    return (
      <div
        ref={localRef}
        style={{ position: 'relative', minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}
      >
        <button
          type="button"
          aria-label="App menu"
          title="App menu"
          onClick={() => {
            if (commandMenuOpen) {
              setCommandMenuOpen(false);
              return;
            }
            onCloseSidebarMenus('command');
            setCommandMenuOpen(true);
            onLoadProjectSwitcherRecents();
          }}
          className="flex items-center justify-center transition-colors"
          style={{
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            border: commandMenuOpen ? `1.5px solid ${DARK_MENU_COLORS.border}` : '1px solid var(--c-border)',
            borderRadius: 9,
            background: commandMenuOpen ? DARK_MENU_COLORS.surface : 'color-mix(in srgb, var(--c-canvas) 52%, transparent)',
            cursor: 'pointer',
            color: commandMenuOpen ? DARK_MENU_COLORS.textHi : 'var(--c-text-hi)',
            boxShadow: commandMenuOpen ? '0 10px 24px rgba(0,0,0,0.22)' : 'none',
            flexShrink: 0,
          }}
        >
          <MenuIcon />
        </button>
        <span
          role="button"
          tabIndex={0}
          title="Double-click to rename workspace"
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setCommandMenuOpen(false);
            onRenameWorkspace();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setCommandMenuOpen(false);
            onWorkspaceNameContextMenu(e.clientX, e.clientY);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            setCommandMenuOpen(false);
            onRenameWorkspace();
          }}
          style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--c-text-hi)',
            fontFamily: FONTS.ui,
            fontSize: 11.5,
            fontWeight: 600,
            textAlign: 'left',
            cursor: 'text',
            outline: 'none',
          }}
        >
          {workspaceDisplayName}
        </span>
        {commandMenuOpen && (
          <AppMenu
            left={10}
            top={50}
            onRequestClose={closeCommandMenu}
            recentProjects={projectSwitcherRecents}
            currentProjectName={workspaceDisplayName}
            state={{
              canExportActiveNote: !!activeDocumentForMenu && !isCanvasDocument(activeDocumentForMenu),
              canExportBoardPng: true,
            }}
            actions={{
              newNote: onCreateNote,
              newCanvas: onCreateCanvas,
              newFolder: onCreateFolder,
              importMarkdown: onImportMarkdown,
              openLocalFolder: onOpenFolder,
              openRecentProject: onOpenRecentProject,
              allProjects: onOpenProjectsLibrary,
              saveProject: onSaveWorkspace,
              renameProject: onRenameWorkspace,
              projectSync: onOpenCloudModal,
              search: onToggleSearch,
              toggleTimer: onToggleTimer,
              toggleJira: onToggleJira,
              exportActiveNoteMarkdown: () => {
                if (activeDocumentForMenu && !isCanvasDocument(activeDocumentForMenu)) exportDocumentAsMarkdownFile(activeDocumentForMenu);
              },
              exportActiveNotePdf: () => {
                if (activeDocumentForMenu && !isCanvasDocument(activeDocumentForMenu)) exportDocumentAsPdf(activeDocumentForMenu);
              },
              exportActiveNoteText: () => {
                if (activeDocumentForMenu && !isCanvasDocument(activeDocumentForMenu)) exportDocumentAsTextFile(activeDocumentForMenu);
              },
              exportBoardPng: onExportBoardPng,
              downloadDesktopApp: () => window.open('https://devboard.app/download', '_blank'),
              preferences: onOpenPreferences,
              helpAbout: onOpenGetStarted,
            }}
          />
        )}
      </div>
    );
  }
);

export default WorkspaceExplorerCommandMenu;
