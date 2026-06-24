import { useCallback, useState } from 'react';
import type React from 'react';
import { deleteEntry, renameEntry } from '../utils/workspaceManager';
import { toast } from '../utils/toast';
import {
  isWorkspaceManagedEntry,
  sortTreeEntries,
  type TreeEntry,
} from '../components/explorer/fileTreeUtils';

interface UseWorkspaceExplorerRenameDeleteArgs {
  cloudOnlyWorkspace: boolean;
  setExplorerMenu: (value: { entry: TreeEntry; x: number; y: number } | null) => void;
  setTree: React.Dispatch<React.SetStateAction<TreeEntry[]>>;
}

export function useWorkspaceExplorerRenameDelete({
  cloudOnlyWorkspace,
  setExplorerMenu,
  setTree,
}: UseWorkspaceExplorerRenameDeleteArgs) {
  const [renameDraft, setRenameDraft] = useState('');
  const [renameExtWarning, setRenameExtWarning] = useState<{ entry: TreeEntry; newName: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<TreeEntry | null>(null);

  const startRename = useCallback((entry: TreeEntry) => {
    if (cloudOnlyWorkspace) {
      toast('Cloud files are read-only here. Download to a folder to edit filenames.');
      setExplorerMenu(null);
      return;
    }
    if (isWorkspaceManagedEntry(entry)) {
      toast('Workspace files are read-only here');
      setExplorerMenu(null);
      return;
    }
    setRenameDraft(entry.name);
    setExplorerMenu(null);
  }, [cloudOnlyWorkspace, setExplorerMenu]);

  const doRename = useCallback(async (entry: TreeEntry, newName: string) => {
    try {
      await renameEntry(entry.path, newName);
      const newPath = [...entry.path.slice(0, -1), newName];
      const oldPathKey = entry.path.join('/');
      const renameInTree = (entries: TreeEntry[]): TreeEntry[] => sortTreeEntries(entries.map((item) => {
        if (item.path.join('/') === oldPathKey) {
          const rewritePaths = (node: TreeEntry): TreeEntry => ({
            ...node,
            name: node.path.length === entry.path.length ? newName : node.name,
            path: [...newPath, ...node.path.slice(entry.path.length)],
            children: node.children?.map(rewritePaths),
          });
          return rewritePaths(item);
        }
        if (item.children && oldPathKey.startsWith(`${item.path.join('/')}/`)) {
          return { ...item, children: renameInTree(item.children) };
        }
        return item;
      }));
      setTree(renameInTree);
      toast(`Renamed to ${newName}`);
    } catch (err) {
      console.warn('Rename failed:', err);
      toast(err instanceof Error ? err.message : 'Could not rename item');
    }
  }, [setTree]);

  const commitRename = useCallback((entry: TreeEntry) => {
    const newName = renameDraft.trim();
    if (!newName || newName === entry.name) return;
    if (entry.kind === 'file') {
      const oldExt = entry.name.includes('.') ? entry.name.split('.').pop()!.toLowerCase() : '';
      const newExt = newName.includes('.') ? newName.split('.').pop()!.toLowerCase() : '';
      if (oldExt && oldExt !== newExt) {
        setRenameExtWarning({ entry, newName });
        return;
      }
    }
    void doRename(entry, newName);
  }, [doRename, renameDraft]);

  const removeFromTree = useCallback((pathParts: string[]) => {
    const remove = (entries: TreeEntry[], path: string[]): TreeEntry[] => {
      if (path.length === 1) return entries.filter((entry) => entry.name !== path[0]);
      return entries.map((entry) =>
        entry.name === path[0] && entry.children
          ? { ...entry, children: remove(entry.children, path.slice(1)) }
          : entry
      );
    };
    setTree((prev) => remove(prev, pathParts));
  }, [setTree]);

  const doDelete = useCallback(async (entry: TreeEntry) => {
    try {
      await deleteEntry(entry.path);
      removeFromTree(entry.path);
      return true;
    } catch (err) {
      console.warn('Delete failed:', err);
      return false;
    }
  }, [removeFromTree]);

  const startDelete = useCallback((entry: TreeEntry) => {
    if (cloudOnlyWorkspace) {
      toast('Cloud files are read-only here. Download to a folder to delete files.');
      setExplorerMenu(null);
      return;
    }
    if (isWorkspaceManagedEntry(entry)) {
      toast('Workspace files are read-only here');
      setExplorerMenu(null);
      return;
    }
    setDeleteConfirm(entry);
    setExplorerMenu(null);
  }, [cloudOnlyWorkspace, setExplorerMenu]);

  return {
    deleteConfirm,
    setDeleteConfirm,
    renameExtWarning,
    setRenameExtWarning,
    startRename,
    doRename,
    commitRename,
    doDelete,
    startDelete,
  };
}
