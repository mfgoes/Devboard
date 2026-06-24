import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  listCloudBoards as listCloudWorkspaces,
  listCloudWorkspaceLocations,
  type CloudWorkspaceLocation,
} from '../utils/cloudStorage';
import {
  listLocalRecentWorkspaces,
  type LocalRecentWorkspace,
} from '../utils/workspaceManager';
import { toast } from '../utils/toast';
import {
  errorMessage,
  type CloudWorkspaceSummary,
} from '../components/cloudModalUtils';

interface UseCloudModalDataArgs {
  open: boolean;
  user: User | null;
  cloudBoardId: string | null;
}

export function useCloudModalData({
  open,
  user,
  cloudBoardId,
}: UseCloudModalDataArgs) {
  const [workspaces, setWorkspaces] = useState<CloudWorkspaceSummary[]>([]);
  const [cloudLocations, setCloudLocations] = useState<Record<string, CloudWorkspaceLocation[]>>({});
  const [localRecents, setLocalRecents] = useState<LocalRecentWorkspace[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);

  const reloadLocalRecents = useCallback(async () => {
    try {
      setLocalRecents(await listLocalRecentWorkspaces());
    } catch (err) {
      console.warn('Failed to load recent projects', err);
      setLocalRecents([]);
    }
  }, []);

  const reloadWorkspaces = useCallback(async (): Promise<CloudWorkspaceSummary[]> => {
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
      console.warn('Failed to load synced projects', err);
      toast(`Could not load synced projects. ${errorMessage(err, '')}`.trim());
      setCloudLocations({});
      return [];
    } finally {
      setWorkspacesLoading(false);
    }
  }, [cloudBoardId, user]);

  const reloadRecentRows = useCallback(async () => {
    await reloadLocalRecents();
    return user ? reloadWorkspaces() : [];
  }, [reloadLocalRecents, reloadWorkspaces, user]);

  useEffect(() => {
    if (!open) return;
    void reloadLocalRecents();
    if (user) void reloadWorkspaces();
  }, [open, reloadLocalRecents, reloadWorkspaces, user]);

  return {
    workspaces,
    setWorkspaces,
    cloudLocations,
    setCloudLocations,
    localRecents,
    setLocalRecents,
    workspacesLoading,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    reloadLocalRecents,
    reloadWorkspaces,
    reloadRecentRows,
  };
}
