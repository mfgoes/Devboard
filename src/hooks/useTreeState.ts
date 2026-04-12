/**
 * Hook to manage the file tree state and mutations.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { listDirectory, createDirectory, renameEntry } from '../utils/workspaceManager';
import { SKIP_DIRS, TreeEntry, buildEntry } from '../components/explorer/fileTreeUtils';

export function useTreeState(imageAssetFolder: string) {
  const [tree, setTree] = useState<TreeEntry[]>([]);
  const [rootLoading, setRootLoading] = useState(true);
  const [rootError, setRootError] = useState<string | null>(null);
  const [newFolderParent, setNewFolderParent] = useState<string[] | null>(null);
  const [newFolderName, setNewFolderName] = useState('');

  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const visibleEntriesRef = useRef<TreeEntry[]>([]);
  const assetsAutoExpandedRef = useRef(false);

  // Load root directory on mount
  useEffect(() => {
    setRootLoading(true);
    setRootError(null);
    listDirectory([])
      .then((entries) => {
        const filtered = entries.filter((e) => {
          if (e.name.startsWith('.')) return false;
          if (e.kind === 'directory' && SKIP_DIRS.has(e.name)) return false;
          return true;
        });
        setTree(filtered.map((e) => buildEntry(e.name, e.kind, [])));
        setRootLoading(false);
      })
      .catch(() => {
        // No workspace open — show the empty state (rootError stays null, tree stays [])
        setRootLoading(false);
      });
  }, []);

  // Auto-expand the assets/images folder once when the workspace first loads
  useEffect(() => {
    if (assetsAutoExpandedRef.current || tree.length === 0) return;
    const assetEntry = tree.find((e) => e.kind === 'directory' && e.name === imageAssetFolder);
    if (assetEntry) {
      assetsAutoExpandedRef.current = true;
      handleToggle(assetEntry.path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]);

  // Focus the new folder input once it appears
  useEffect(() => {
    if (newFolderParent !== null) {
      requestAnimationFrame(() => newFolderInputRef.current?.focus());
    }
  }, [newFolderParent]);

  const updateEntry = useCallback(
    (entries: TreeEntry[], path: string[], updater: (e: TreeEntry) => TreeEntry): TreeEntry[] =>
      entries.map((e) => {
        if (e.path.join('/') === path.join('/')) return updater(e);
        if (e.children && path.join('/').startsWith(e.path.join('/'))) {
          return { ...e, children: updateEntry(e.children, path, updater) };
        }
        return e;
      }),
    []
  );

  const handleToggle = useCallback(
    async (path: string[]) => {
      const findEntry = (entries: TreeEntry[], p: string[]): TreeEntry | null => {
        for (const e of entries) {
          if (e.path.join('/') === p.join('/')) return e;
          if (e.children) {
            const found = findEntry(e.children, p);
            if (found) return found;
          }
        }
        return null;
      };

      setTree((prev) => {
        const entry = findEntry(prev, path);
        if (!entry) return prev;
        if (entry.expanded) return updateEntry(prev, path, (e) => ({ ...e, expanded: false }));
        if (entry.children !== undefined) return updateEntry(prev, path, (e) => ({ ...e, expanded: true }));
        return updateEntry(prev, path, (e) => ({ ...e, expanded: true, loading: true }));
      });

      try {
        const rawChildren = await listDirectory(path);
        const filtered = rawChildren.filter((e) => {
          if (e.name.startsWith('.')) return false;
          if (e.kind === 'directory' && SKIP_DIRS.has(e.name)) return false;
          return true;
        });
        const children = filtered.map((e) => buildEntry(e.name, e.kind, path));
        setTree((prev) =>
          updateEntry(prev, path, (e) =>
            e.expanded ? { ...e, children, loading: false } : { ...e, children, loading: false, expanded: false }
          )
        );
      } catch {
        setTree((prev) => updateEntry(prev, path, (e) => ({ ...e, children: [], loading: false })));
      }
    },
    [updateEntry]
  );

  const startNewFolder = useCallback((parentPath: string[] = []) => {
    setNewFolderParent(parentPath);
    setNewFolderName('');
  }, []);

  const commitNewFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name || newFolderParent === null) {
      setNewFolderParent(null);
      return;
    }
    try {
      await createDirectory([...newFolderParent, name]);
      // Refresh the affected level
      const refreshPath = newFolderParent;
      const rawChildren = await listDirectory(refreshPath);
      const filtered = rawChildren.filter(
        (e) => !e.name.startsWith('.') && !(e.kind === 'directory' && SKIP_DIRS.has(e.name))
      );
      if (refreshPath.length === 0) {
        setTree(filtered.map((e) => buildEntry(e.name, e.kind, [])));
      } else {
        setTree((prev) =>
          updateEntry(prev, refreshPath, (e) => ({
            ...e,
            children: filtered.map((c) => buildEntry(c.name, c.kind, refreshPath)),
          }))
        );
      }
    } catch (err) {
      console.warn('Failed to create folder', err);
    }
    setNewFolderParent(null);
  }, [newFolderName, newFolderParent, updateEntry]);

  return {
    tree,
    setTree,
    rootLoading,
    setRootLoading,
    rootError,
    setRootError,
    newFolderParent,
    setNewFolderParent,
    newFolderName,
    setNewFolderName,
    newFolderInputRef,
    visibleEntriesRef,
    updateEntry,
    handleToggle,
    startNewFolder,
    commitNewFolder,
  };
}
