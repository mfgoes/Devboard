import { useEffect, useRef, useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { CanvasNode } from '../types';

export interface ContextMenuState {
  x: number;
  y: number;
  nodeIds: string[];  // empty = canvas (background) context
}

interface Props {
  menu: ContextMenuState;
  onClose: () => void;
}

export default function ContextMenu({ menu, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const store = useBoardStore.getState();
  const { nodeIds } = menu;
  const hasNodes = nodeIds.length > 0;

  // For node context menus, ensure those nodes are selected
  const selectedIds = nodeIds.length > 0 ? nodeIds : store.selectedIds;

  const nodes = store.nodes.filter((n) => selectedIds.includes(n.id));
  const nonConnectors = nodes.filter((n) => n.type !== 'connector');
  const imageNodes = nodes.filter((n) => n.type === 'image') as import('../types').ImageNode[];

  const anyLocked = nonConnectors.some((n) => (n as { locked?: boolean }).locked);
  const allLocked = nonConnectors.length > 0 && nonConnectors.every((n) => (n as { locked?: boolean }).locked);

  // Group state
  const groupIds = new Set(
    nonConnectors
      .map((n) => (n as { groupId?: string }).groupId)
      .filter(Boolean) as string[]
  );
  const allSameGroup = groupIds.size === 1 && nonConnectors.every((n) => !!(n as { groupId?: string }).groupId);
  const canGroup = nonConnectors.length >= 2;
  const canUngroup = allSameGroup;

  function run(action: () => void) {
    action();
    onClose();
  }

  // ── Clamp position so menu stays in viewport ──────────────────────────────
  const MENU_W = 192;
  const MENU_H = hasNodes ? 280 : 80; // approximate
  const left = Math.min(menu.x, window.innerWidth  - MENU_W - 8);
  const top  = Math.min(menu.y, window.innerHeight - MENU_H - 8);

  const Item = ({
    label,
    shortcut,
    onClick,
    danger = false,
    disabled = false,
  }: {
    label: string;
    shortcut?: string;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
  }) => (
    <button
      className={[
        'w-full flex items-center justify-between px-3 py-1.5 text-[12px] font-mono rounded transition-colors text-left',
        disabled
          ? 'opacity-40 cursor-default'
          : danger
            ? 'text-red-400 hover:bg-red-500/15'
            : 'text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]',
      ].join(' ')}
      onClick={disabled ? undefined : onClick}
    >
      <span>{label}</span>
      {shortcut && <span className="text-[10px] text-[var(--c-text-off)] ml-3">{shortcut}</span>}
    </button>
  );

  const Sep = () => <div className="my-1 h-px bg-[var(--c-border)]" />;

  // Submenu item — shows a flyout panel on hover
  const SubMenu = ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => {
    const [open, setOpen] = useState(false);
    const itemRef = useRef<HTMLDivElement>(null);
    const flyoutRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const show = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setOpen(true);
    };
    const hide = () => {
      timerRef.current = setTimeout(() => setOpen(false), 80);
    };

    // Position flyout: prefer right, fall back to left
    const [flyoutLeft, setFlyoutLeft] = useState(0);
    const [flyoutTop, setFlyoutTop] = useState(0);
    useEffect(() => {
      if (!open || !itemRef.current) return;
      const rect = itemRef.current.getBoundingClientRect();
      const flyoutW = 180;
      const spaceRight = window.innerWidth - rect.right - 4;
      setFlyoutLeft(spaceRight >= flyoutW ? rect.right + 4 : rect.left - flyoutW - 4);
      setFlyoutTop(rect.top - 4);
    }, [open]);

    return (
      <div
        ref={itemRef}
        className="relative"
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        <button
          className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] font-mono rounded transition-colors text-left text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
        >
          <span>{label}</span>
          <span className="text-[10px] text-[var(--c-text-off)] ml-3">▶</span>
        </button>
        {open && (
          <div
            ref={flyoutRef}
            style={{ position: 'fixed', left: flyoutLeft, top: flyoutTop, zIndex: 9100, minWidth: 180 }}
            className="py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
            onMouseEnter={show}
            onMouseLeave={hide}
          >
            {children}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left, top, zIndex: 9000, minWidth: MENU_W }}
      className="py-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {hasNodes ? (
        <>
          <Item
            label="Duplicate"
            shortcut="⌘D"
            onClick={() => run(() => {
              useBoardStore.getState().selectIds(selectedIds);
              useBoardStore.getState().duplicate();
            })}
            disabled={nonConnectors.length === 0}
          />
          <Item
            label="Copy"
            shortcut="⌘C"
            onClick={() => run(() => {
              useBoardStore.getState().selectIds(selectedIds);
              useBoardStore.getState().copySelected();
            })}
            disabled={nonConnectors.length === 0}
          />

          <Sep />

          <Item
            label={allLocked ? 'Unlock' : anyLocked ? 'Toggle lock' : 'Lock'}
            onClick={() => run(() => {
              useBoardStore.getState().selectIds(selectedIds);
              useBoardStore.getState().toggleLock(selectedIds);
            })}
            disabled={nonConnectors.length === 0}
          />

          <Sep />

          <Item
            label="Bring to front"
            onClick={() => run(() => useBoardStore.getState().bringToFront(selectedIds))}
          />
          <Item
            label="Send to back"
            onClick={() => run(() => useBoardStore.getState().sendToBack(selectedIds))}
          />

          {imageNodes.length > 0 && (
            <>
              <Sep />
              <SubMenu label="Render style">
                {(['smooth', 'pixelated'] as const).map((mode) => {
                  const label = mode === 'smooth' ? 'Smooth (default)' : 'Pixelated (nearest)';
                  const active = imageNodes.every((n) => (n.imageRendering ?? 'smooth') === mode);
                  return (
                    <Item
                      key={mode}
                      label={active ? `✓  ${label}` : `    ${label}`}
                      onClick={() => run(() => {
                        for (const n of imageNodes) useBoardStore.getState().updateNode(n.id, { imageRendering: mode });
                      })}
                    />
                  );
                })}
              </SubMenu>
            </>
          )}

          {canGroup && (
            <>
              <Sep />
              {canUngroup ? (
                <Item
                  label="Ungroup"
                  shortcut="⌘G"
                  onClick={() => run(() => {
                    for (const gid of groupIds) useBoardStore.getState().ungroupNodes(gid);
                  })}
                />
              ) : (
                <Item
                  label="Group"
                  shortcut="⌘G"
                  onClick={() => run(() => {
                    useBoardStore.getState().selectIds(selectedIds);
                    useBoardStore.getState().groupSelected();
                  })}
                />
              )}
            </>
          )}

          <Sep />

          <Item
            label="Delete"
            shortcut="⌫"
            danger
            onClick={() => run(() => {
              useBoardStore.getState().selectIds(selectedIds);
              useBoardStore.getState().deleteSelected();
            })}
          />
        </>
      ) : (
        <>
          <Item
            label="Paste"
            shortcut="⌘V"
            onClick={() => run(() => useBoardStore.getState().paste())}
            disabled={useBoardStore.getState().clipboard.length === 0}
          />
          <Item
            label="Select all"
            shortcut="⌘A"
            onClick={() => run(() => {
              const allIds = useBoardStore.getState().nodes.map((n: CanvasNode) => n.id);
              useBoardStore.getState().selectIds(allIds);
            })}
          />
        </>
      )}
    </div>
  );
}
