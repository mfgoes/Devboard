import { useEffect, useMemo, useRef, useState } from 'react';
import { IMAGE_EXTS, SKIP_DIRS, ext, formatSize } from './explorer/fileTreeUtils';
import { hasWorkspaceHandle, listDirectory, readWorkspaceFileInfo } from '../utils/workspaceManager';

type AssetItem = {
  path: string;
  name: string;
  folder: string;
  size: number | null;
  url: string | null;
};

type ScopeFilter = 'page' | 'all';

interface AssetDrawerProps {
  open: boolean;
  title?: string;
  pageAssetPaths?: string[];
  onClose: () => void;
  onSelectAsset: (asset: AssetItem) => void | Promise<void>;
  onUploadFiles: (files: File[]) => void | Promise<void>;
}

const HIDDEN_ROOTS = new Set(['notes', 'documents', 'pages']);
const HIDDEN_FILES = new Set(['workspace.json']);

async function collectImageAssetPaths(pathParts: string[] = []): Promise<string[]> {
  const entries = await listDirectory(pathParts);
  const assets: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    if (pathParts.length === 0 && entry.kind === 'directory' && HIDDEN_ROOTS.has(entry.name)) continue;
    if (pathParts.length === 0 && entry.kind === 'file' && HIDDEN_FILES.has(entry.name)) continue;

    const nextPathParts = [...pathParts, entry.name];
    if (entry.kind === 'directory') {
      assets.push(...await collectImageAssetPaths(nextPathParts));
      continue;
    }

    if (IMAGE_EXTS.has(ext(entry.name))) {
      assets.push(nextPathParts.join('/'));
    }
  }

  return assets;
}

function uniqPaths(paths: string[]): string[] {
  return Array.from(new Set(paths.filter(Boolean)));
}

export default function AssetDrawer({
  open,
  title = 'Assets',
  pageAssetPaths = [],
  onClose,
  onSelectAsset,
  onUploadFiles,
}: AssetDrawerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const revokeUrlsRef = useRef<string[]>([]);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<ScopeFilter>('page');
  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState<AssetItem[]>([]);

  const pagePaths = useMemo(() => uniqPaths(pageAssetPaths), [pageAssetPaths]);
  const pagePathSet = useMemo(() => new Set(pagePaths), [pagePaths]);

  useEffect(() => {
    if (!open) return;
    setScope(pagePaths.length > 0 ? 'page' : 'all');
    setQuery('');
  }, [open, pagePaths.length]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const revokeUrls = () => {
      for (const url of revokeUrlsRef.current) URL.revokeObjectURL(url);
      revokeUrlsRef.current = [];
    };

    const loadAssets = async () => {
      setLoading(true);
      try {
        const paths = hasWorkspaceHandle() ? await collectImageAssetPaths() : [];
        const items = await Promise.all(
          uniqPaths(paths).map(async (path) => {
            const info = await readWorkspaceFileInfo(path);
            return {
              path,
              name: path.split('/').pop() ?? path,
              folder: path.split('/').slice(0, -1).join('/'),
              size: info?.size ?? null,
              url: info?.url ?? null,
            } satisfies AssetItem;
          }),
        );

        if (cancelled) {
          for (const item of items) {
            if (item.url) URL.revokeObjectURL(item.url);
          }
          return;
        }

        revokeUrls();
        revokeUrlsRef.current = items.flatMap((item) => (item.url ? [item.url] : []));
        setAssets(items);
      } catch {
        if (!cancelled) setAssets([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadAssets();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => () => {
    for (const url of revokeUrlsRef.current) URL.revokeObjectURL(url);
  }, []);

  const visibleAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (scope === 'page' && pagePaths.length > 0 && !pagePathSet.has(asset.path)) return false;
      if (!normalizedQuery) return true;
      return asset.name.toLowerCase().includes(normalizedQuery) || asset.folder.toLowerCase().includes(normalizedQuery);
    });
  }, [assets, pagePathSet, pagePaths.length, query, scope]);

  if (!open) return null;

  return (
    <aside
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(380px, 100%)',
        borderLeft: '1px solid var(--c-border)',
        background: 'var(--c-panel)',
        boxShadow: '-18px 0 38px rgba(0,0,0,0.16)',
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '16px 18px',
          borderBottom: '1px solid var(--c-border)',
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-text-hi)' }}>{title}</div>
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--c-text-lo)' }}>
            Choose an existing image or upload a new one
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            title="Upload image"
            onClick={() => inputRef.current?.click()}
            style={{
              width: 40,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 12,
              border: '1px solid var(--c-border)',
              background: 'var(--c-canvas)',
              color: 'var(--c-text-hi)',
              cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 11.5V3.5M8 3.5 5.2 6.3M8 3.5l2.8 2.8M3 12.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            title="Close assets"
            onClick={onClose}
            style={{
              width: 40,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 12,
              border: '1px solid var(--c-border)',
              background: 'transparent',
              color: 'var(--c-text-hi)',
              cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4 12 12M12 4 4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length === 0) return;
          void Promise.resolve(onUploadFiles(files)).then(onClose);
        }}
      />

      <div style={{ padding: '16px 18px 14px', borderBottom: '1px solid var(--c-border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minHeight: 52,
            padding: '0 14px',
            borderRadius: 14,
            border: '1px solid var(--c-border)',
            background: 'var(--c-canvas)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" style={{ color: 'var(--c-text-lo)', flexShrink: 0 }}>
            <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="m12 12 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter assets…"
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--c-text-hi)',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          />
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FilterChip
            active={scope === 'page'}
            disabled={pagePaths.length === 0}
            onClick={() => setScope('page')}
          >
            This page
          </FilterChip>
          <FilterChip active={scope === 'all'} onClick={() => setScope('all')}>
            All
          </FilterChip>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 18px' }}>
        {loading ? (
          <DrawerMessage>Loading assets…</DrawerMessage>
        ) : !hasWorkspaceHandle() ? (
          <DrawerMessage>No workspace folder is attached yet. Upload an image to insert one here.</DrawerMessage>
        ) : visibleAssets.length === 0 ? (
          <DrawerMessage>
            {scope === 'page' && pagePaths.length > 0
              ? 'No images from this page yet. Switch to All or upload something new.'
              : 'No image assets found in this workspace yet.'}
          </DrawerMessage>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            {visibleAssets.map((asset) => (
              <button
                key={asset.path}
                type="button"
                onClick={() => {
                  void Promise.resolve(onSelectAsset(asset)).then(onClose);
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    aspectRatio: '1 / 1',
                    borderRadius: 14,
                    border: '1px solid var(--c-border)',
                    background: 'color-mix(in srgb, var(--c-panel) 65%, var(--c-hover))',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {asset.url ? (
                    <img
                      src={asset.url}
                      alt={asset.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--c-text-lo)' }}>Preview unavailable</span>
                  )}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--c-text-hi)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {asset.name}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 10.5,
                      color: 'var(--c-text-lo)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={asset.folder || 'Workspace root'}
                  >
                    {asset.folder || 'Workspace root'}
                  </div>
                  {asset.size !== null && (
                    <div style={{ marginTop: 4, fontSize: 10, color: 'var(--c-text-lo)' }}>{formatSize(asset.size)}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function FilterChip({
  active,
  disabled = false,
  children,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        minHeight: 34,
        padding: '0 14px',
        borderRadius: 999,
        border: `1px solid ${active ? 'rgba(184,119,80,0.4)' : 'var(--c-border)'}`,
        background: active ? 'rgba(184,119,80,0.14)' : 'var(--c-canvas)',
        color: disabled ? 'var(--c-text-lo)' : active ? 'var(--c-line)' : 'var(--c-text-md)',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 11,
        fontWeight: 700,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function DrawerMessage({ children }: { children: string }) {
  return (
    <div
      style={{
        minHeight: 180,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 16px',
        borderRadius: 18,
        border: '1px dashed var(--c-border)',
        color: 'var(--c-text-lo)',
        fontSize: 12,
        lineHeight: 1.5,
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  );
}
