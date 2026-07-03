import { useCallback } from 'react';
import { useBoardStore } from '../store/boardStore';
import type { LocalRecentWorkspace, WorkspaceOpenResult } from '../utils/workspaceManager';
import { hasWorkspaceHandle, listLocalRecentWorkspaces, openRecentWorkspace, openWorkspace, reconnectStoredWorkspace, saveWorkspace } from '../utils/workspaceManager';
import { toast } from '../utils/toast';

interface UseWorkspaceExplorerProjectActionsArgs {
  workspaceDisplayName: string;
  projectSwitcherOpen: boolean;
  projectRenameDraft: string;
  setProjectMenu: (value: { x: number; y: number } | null) => void;
  setProjectRenameDraft: (value: string) => void;
  setProjectRenameOpen: (value: boolean) => void;
  setProjectSwitcherOpen: (value: boolean) => void;
  setProjectSwitcherLoading: (value: boolean) => void;
  setProjectSwitcherRecents: (value: LocalRecentWorkspace[]) => void;
  setBoardTitle: (value: string) => void;
  applyOpenedWorkspaceResult: (result: WorkspaceOpenResult) => void;
  closeSidebarMenus: (keep?: 'command' | 'missingImages' | 'projectSwitcher' | 'preferences') => void;
  openCloudModal: (tab?: 'workspace' | 'library') => void;
}

export function useWorkspaceExplorerProjectActions({
  workspaceDisplayName,
  projectSwitcherOpen,
  projectRenameDraft,
  setProjectMenu,
  setProjectRenameDraft,
  setProjectRenameOpen,
  setProjectSwitcherOpen,
  setProjectSwitcherLoading,
  setProjectSwitcherRecents,
  setBoardTitle,
  applyOpenedWorkspaceResult,
  closeSidebarMenus,
  openCloudModal,
}: UseWorkspaceExplorerProjectActionsArgs) {
  const loadProjectSwitcherRecents = useCallback(async () => {
    setProjectSwitcherLoading(true);
    try {
      setProjectSwitcherRecents((await listLocalRecentWorkspaces()).slice(0, 6));
    } catch (err) {
      console.warn('Failed to load recent workspaces', err);
      setProjectSwitcherRecents([]);
    } finally {
      setProjectSwitcherLoading(false);
    }
  }, [setProjectSwitcherLoading, setProjectSwitcherRecents]);

  const handleOpenFolder = useCallback(async () => {
    closeSidebarMenus();
    const result = await openWorkspace();
    if (result) {
      applyOpenedWorkspaceResult(result);
    }
  }, [applyOpenedWorkspaceResult, closeSidebarMenus]);

  const handleReconnectWorkspace = useCallback(async () => {
    const result = await reconnectStoredWorkspace();
    if (!result) {
      toast('Could not reconnect that folder. Choose Open folder… instead.');
      useBoardStore.getState().setPendingLocalWorkspaceName(null);
      return;
    }
    applyOpenedWorkspaceResult(result);
  }, [applyOpenedWorkspaceResult]);

  const handleToggleProjectSwitcher = useCallback(() => {
    if (projectSwitcherOpen) {
      setProjectSwitcherOpen(false);
      return;
    }
    closeSidebarMenus('projectSwitcher');
    setProjectSwitcherOpen(true);
    void loadProjectSwitcherRecents();
  }, [closeSidebarMenus, loadProjectSwitcherRecents, projectSwitcherOpen, setProjectSwitcherOpen]);

  const handleOpenProjectsLibrary = useCallback(() => {
    setProjectSwitcherOpen(false);
    openCloudModal('library');
  }, [openCloudModal, setProjectSwitcherOpen]);

  const beginProjectRename = useCallback(() => {
    setProjectMenu(null);
    setProjectSwitcherOpen(false);
    setProjectRenameDraft(workspaceDisplayName);
    setProjectRenameOpen(true);
  }, [setProjectMenu, setProjectRenameDraft, setProjectRenameOpen, setProjectSwitcherOpen, workspaceDisplayName]);

  const commitProjectRename = useCallback(() => {
    const nextTitle = projectRenameDraft.trim();
    if (!nextTitle) return;
    setBoardTitle(nextTitle);
    setProjectRenameOpen(false);
    window.setTimeout(() => {
      const state = useBoardStore.getState();
      if (state.workspaceName || hasWorkspaceHandle()) {
        void saveWorkspace(state.exportData(), { notify: false }).then((result) => {
          if (result.workspaceName) state.setWorkspaceName(result.workspaceName);
          toast(`Renamed workspace to ${nextTitle}`);
          void loadProjectSwitcherRecents();
        });
      } else {
        toast('Renamed workspace locally. Use Project Sync to save it to cloud.');
      }
    }, 0);
  }, [loadProjectSwitcherRecents, projectRenameDraft, setBoardTitle, setProjectRenameOpen]);

  const handleOpenRecentProject = useCallback(async (recent: LocalRecentWorkspace) => {
    setProjectSwitcherLoading(true);
    try {
      const result = await openRecentWorkspace(recent.id);
      if (!result) {
        toast('Could not reopen that project. Relocate the folder or choose another project.');
        await loadProjectSwitcherRecents();
        return;
      }
      applyOpenedWorkspaceResult(result);
    } catch (err) {
      console.warn('Failed to open recent project', err);
      toast('Could not reopen that project.');
    } finally {
      setProjectSwitcherLoading(false);
    }
  }, [applyOpenedWorkspaceResult, loadProjectSwitcherRecents, setProjectSwitcherLoading]);

  return {
    handleOpenFolder,
    handleReconnectWorkspace,
    loadProjectSwitcherRecents,
    handleToggleProjectSwitcher,
    handleOpenProjectsLibrary,
    beginProjectRename,
    commitProjectRename,
    handleOpenRecentProject,
  };
}
