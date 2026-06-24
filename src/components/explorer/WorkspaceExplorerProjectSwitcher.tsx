import { type LocalRecentWorkspace } from '../../utils/workspaceManager';
import { FONTS } from '../../utils/fonts';
import { IconFolder } from '../icons';

type SyncDot = {
  label: string;
  title: string;
  tone: 'danger' | 'warning' | 'success' | 'cloud' | 'neutral';
  color: string;
  textColor: string;
} | null;

interface WorkspaceExplorerProjectSwitcherProps {
  open: boolean;
  loading: boolean;
  recents: LocalRecentWorkspace[];
  workspaceDisplayName: string;
  footerSyncDot: SyncDot;
  onToggleOpen: () => void;
  onContextMenu: (x: number, y: number) => void;
  onOpenRecentProject: (project: LocalRecentWorkspace) => void;
  onOpenProjectsLibrary: () => void;
}

export default function WorkspaceExplorerProjectSwitcher({
  open,
  loading,
  recents,
  workspaceDisplayName,
  footerSyncDot,
  onToggleOpen,
  onContextMenu,
  onOpenRecentProject,
  onOpenProjectsLibrary,
}: WorkspaceExplorerProjectSwitcherProps) {
  return (
    <>
      <button
        type="button"
        onClick={onToggleOpen}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(e.clientX, e.clientY);
        }}
        title={footerSyncDot ? `${workspaceDisplayName} · ${footerSyncDot.label}. ${footerSyncDot.title}` : `Switch project: ${workspaceDisplayName}`}
        aria-label={footerSyncDot ? `Switch project: ${workspaceDisplayName}. ${footerSyncDot.label}. ${footerSyncDot.title}` : `Switch project: ${workspaceDisplayName}`}
        style={{
          minWidth: 0,
          flex: 1,
          height: 32,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 9px',
          border: 'none',
          borderRadius: 10,
          background: 'transparent',
          color: footerSyncDot?.textColor ?? 'var(--c-text-hi)',
          cursor: 'pointer',
          fontFamily: FONTS.ui,
          textAlign: 'left',
          transition: 'background 120ms, color 120ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = footerSyncDot?.tone === 'danger'
            ? '#fee2e2'
            : footerSyncDot?.tone === 'warning'
              ? '#fdebd8'
              : 'var(--c-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = footerSyncDot?.tone === 'danger'
            ? '#fef0f0'
            : footerSyncDot?.tone === 'warning'
              ? '#fef5ec'
              : 'transparent';
        }}
      >
        <span style={{ position: 'relative', display: 'inline-flex', color: 'currentColor', flexShrink: 0 }}>
          <IconFolder size={15} />
          {footerSyncDot && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                right: -3,
                top: -3,
                width: 8,
                height: 8,
                borderRadius: 999,
                border: '1.5px solid var(--c-panel)',
                background: footerSyncDot.color,
              }}
            />
          )}
        </span>
        <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 760 }}>
          {workspaceDisplayName}
        </span>
        <span aria-hidden="true" style={{ flexShrink: 0, color: 'var(--c-text-lo)', fontSize: 12, lineHeight: 1 }}>
          ▾
        </span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 'calc(100% + 8px)',
            zIndex: 9200,
            overflow: 'hidden',
            border: '1px solid var(--c-border)',
            borderRadius: 12,
            background: 'var(--c-panel)',
            boxShadow: '0 18px 46px rgba(25,18,14,0.22)',
            fontFamily: FONTS.ui,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '9px 10px 7px', borderBottom: '1px solid var(--c-border)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 760, color: 'var(--c-text-hi)' }}>
              Switch project
            </div>
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto', padding: 5 }}>
            {loading && recents.length === 0 ? (
              <div style={{ padding: '10px 8px', fontSize: 11, fontWeight: 650, color: 'var(--c-text-lo)' }}>
                Loading recent projects...
              </div>
            ) : recents.length === 0 ? (
              <div style={{ padding: '10px 8px', fontSize: 11, lineHeight: 1.45, color: 'var(--c-text-lo)' }}>
                No recent projects yet.
              </div>
            ) : (
              recents.map((recent) => {
                const isCurrent = recent.title === workspaceDisplayName;
                const unavailable = recent.permissionState === 'denied' || recent.permissionState === 'missing';
                const subtitle = unavailable
                  ? 'Folder access needed'
                  : recent.localPathHint
                    ? recent.localPathHint.replace(/\\/g, '/').split('/').slice(-2).join('/')
                    : recent.source === 'tauri'
                      ? 'Desktop folder'
                      : 'Browser folder';
                return (
                  <button
                    key={recent.id}
                    type="button"
                    onClick={() => {
                      if (isCurrent) return;
                      onOpenRecentProject(recent);
                    }}
                    disabled={loading}
                    title={recent.localPathHint ?? recent.title}
                    style={{
                      width: '100%',
                      minHeight: 42,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      padding: '7px 8px',
                      border: 'none',
                      borderRadius: 9,
                      background: isCurrent ? 'var(--c-hover)' : 'transparent',
                      color: unavailable ? 'var(--c-text-lo)' : 'var(--c-text-hi)',
                      cursor: loading ? 'default' : 'pointer',
                      fontFamily: FONTS.ui,
                      textAlign: 'left',
                      opacity: loading ? 0.72 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!isCurrent) e.currentTarget.style.background = 'var(--c-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isCurrent) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span style={{ position: 'relative', display: 'inline-flex', color: unavailable ? 'var(--c-text-lo)' : 'var(--c-text-md)', flexShrink: 0 }}>
                      <IconFolder size={14} />
                      {recent.cloudBoardId && (
                        <span
                          aria-hidden="true"
                          style={{
                            position: 'absolute',
                            right: -3,
                            top: -3,
                            width: 7,
                            height: 7,
                            borderRadius: 999,
                            border: '1px solid var(--c-panel)',
                            background: '#4aa878',
                          }}
                        />
                      )}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 740 }}>
                        {recent.title}
                      </span>
                      <span style={{ display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, fontWeight: 600, color: unavailable ? '#b45309' : 'var(--c-text-lo)' }}>
                        {subtitle}
                      </span>
                    </span>
                    {isCurrent && (
                      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 760, color: 'var(--c-line)' }}>
                        Current
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          <div style={{ padding: 5, borderTop: '1px solid var(--c-border)' }}>
            <button
              type="button"
              onClick={onOpenProjectsLibrary}
              style={{
                width: '100%',
                height: 32,
                border: 'none',
                borderRadius: 8,
                background: 'var(--c-hover)',
                color: 'var(--c-text-hi)',
                cursor: 'pointer',
                fontFamily: FONTS.ui,
                fontSize: 11,
                fontWeight: 740,
              }}
            >
              All projects...
            </button>
          </div>
        </div>
      )}
    </>
  );
}
