import { useEffect, useState } from 'react';
import { type LocalRecentWorkspace } from '../../utils/workspaceManager';
import { FONTS } from '../../utils/fonts';
import { IconChevronDown, IconFolder } from '../icons';
import { DARK_MENU_COLORS } from '../darkMenuTheme';

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
  footerLabel?: string;
  footerSyncDot: SyncDot;
  /**
   * Label for the sync-issue primary action. Names the concrete thing the click
   * does ("Sign in to save"), because a generic "Fix" gives the user no way to
   * tell a working button from a broken one.
   */
  syncIssueActionLabel: string;
  /** Primary recovery for the current issue — varies by what actually broke. */
  onSyncIssueAction: () => void;
  /** Detach a local folder from cloud sync without deleting either copy. */
  canKeepOffline?: boolean;
  onKeepOffline?: () => void;
  onToggleOpen: () => void;
  onContextMenu: (x: number, y: number) => void;
  onOpenRecentProject: (project: LocalRecentWorkspace) => void;
  onRelocateRecentProject: (project: LocalRecentWorkspace) => void;
  onOpenProjectsLibrary: () => void;
  /** Escape hatch that never depends on the broken link. Resolves false if the user cancelled. */
  onSaveToNewFolder: () => Promise<boolean>;
}

export default function WorkspaceExplorerProjectSwitcher({
  open,
  loading,
  recents,
  workspaceDisplayName,
  footerLabel,
  footerSyncDot,
  syncIssueActionLabel,
  onSyncIssueAction,
  canKeepOffline = false,
  onKeepOffline,
  onToggleOpen,
  onContextMenu,
  onOpenRecentProject,
  onRelocateRecentProject,
  onOpenProjectsLibrary,
  onSaveToNewFolder,
}: WorkspaceExplorerProjectSwitcherProps) {
  const syncIssue = footerSyncDot && (footerSyncDot.tone === 'danger' || footerSyncDot.tone === 'warning') ? footerSyncDot : null;
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [savingToNewFolder, setSavingToNewFolder] = useState(false);
  const [saveToNewFolderError, setSaveToNewFolderError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) setOpeningId(null);
  }, [loading]);

  useEffect(() => {
    if (!open) setOpeningId(null);
  }, [open]);
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
          {footerLabel ?? workspaceDisplayName}
        </span>
        <span aria-hidden="true" style={{ flexShrink: 0, color: 'var(--c-text-lo)', display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}>
          <IconChevronDown size={14} />
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
            border: `1px solid ${DARK_MENU_COLORS.border}`,
            borderRadius: 12,
            background: DARK_MENU_COLORS.surface,
            boxShadow: DARK_MENU_COLORS.shadow,
            fontFamily: FONTS.ui,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '9px 10px 7px', borderBottom: `1px solid ${DARK_MENU_COLORS.border}` }}>
            <div style={{ fontSize: 10.5, fontWeight: 760, color: DARK_MENU_COLORS.textHi }}>
              Switch project
            </div>
          </div>
          {syncIssue && (
            <div
              style={{
                margin: 7,
                padding: '8px 9px',
                borderRadius: 8,
                background: syncIssue.tone === 'danger' ? '#fef0f0' : '#fef5ec',
                border: `1px solid ${syncIssue.tone === 'danger' ? '#f3caca' : '#f3ddc0'}`,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 760, color: syncIssue.textColor }}>
                {syncIssue.label}
              </div>
              <div style={{ marginTop: 3, fontSize: 10.5, lineHeight: 1.4, color: 'var(--c-text-md)' }}>
                {syncIssue.title}
              </div>
              {/* Stacked, not side by side: the sidebar is ~185px wide, which is
                  too narrow for two labels to sit on one row without wrapping. */}
              <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <button
                  type="button"
                  onClick={onSyncIssueAction}
                  disabled={savingToNewFolder}
                  style={{
                    minHeight: 26,
                    padding: '5px 10px',
                    lineHeight: 1.3,
                    border: 'none',
                    borderRadius: 7,
                    background: syncIssue.tone === 'danger' ? '#ef4444' : '#d97706',
                    color: '#fff',
                    cursor: savingToNewFolder ? 'default' : 'pointer',
                    opacity: savingToNewFolder ? 0.55 : 1,
                    fontFamily: FONTS.ui,
                    fontSize: 10.5,
                    fontWeight: 740,
                  }}
                >
                  {syncIssueActionLabel}
                </button>
                {canKeepOffline && onKeepOffline && (
                  <button
                    type="button"
                    onClick={onKeepOffline}
                    disabled={savingToNewFolder}
                    style={{
                      minHeight: 26,
                      padding: '5px 10px',
                      lineHeight: 1.3,
                      border: '1px solid #d8cfc4',
                      borderRadius: 7,
                      background: '#fff',
                      color: 'var(--c-text-hi)',
                      cursor: savingToNewFolder ? 'default' : 'pointer',
                      opacity: savingToNewFolder ? 0.55 : 1,
                      fontFamily: FONTS.ui,
                      fontSize: 10.5,
                      fontWeight: 740,
                    }}
                  >
                    Keep working offline
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSaveToNewFolderError(null);
                    setSavingToNewFolder(true);
                    onSaveToNewFolder()
                      .catch(() => {
                        setSaveToNewFolderError("That folder couldn't be written to. Try another one.");
                      })
                      .finally(() => setSavingToNewFolder(false));
                  }}
                  disabled={savingToNewFolder}
                  style={{
                    minHeight: 26,
                    padding: '5px 10px',
                    lineHeight: 1.3,
                    border: '1px solid #d8cfc4',
                    borderRadius: 7,
                    background: '#fff',
                    color: 'var(--c-text-hi)',
                    cursor: savingToNewFolder ? 'default' : 'pointer',
                    opacity: savingToNewFolder ? 0.55 : 1,
                    fontFamily: FONTS.ui,
                    fontSize: 10.5,
                    fontWeight: 740,
                  }}
                >
                  {savingToNewFolder ? 'Choosing folder…' : 'Save to a new folder…'}
                </button>
              </div>
              <div style={{ marginTop: 5, fontSize: 10, lineHeight: 1.45, color: 'var(--c-text-md)' }}>
                {canKeepOffline && 'Keeping offline stops cloud sync for this folder; your local files and cloud copy are both kept. '}
                Saving to a new folder copies this project to a folder you pick and keeps working from
                there. Nothing is deleted, and the old location is left as it is.
              </div>
              {saveToNewFolderError && (
                <div style={{ marginTop: 5, fontSize: 10, lineHeight: 1.45, fontWeight: 700, color: '#c93636' }}>
                  {saveToNewFolderError}
                </div>
              )}
            </div>
          )}
          <div style={{ maxHeight: 240, overflowY: 'auto', padding: 5 }}>
            {loading && recents.length === 0 ? (
              <div style={{ padding: '10px 8px', fontSize: 11, fontWeight: 650, color: DARK_MENU_COLORS.textMuted }}>
                Loading recent projects...
              </div>
            ) : recents.length === 0 ? (
              <div style={{ padding: '10px 8px', fontSize: 11, lineHeight: 1.45, color: DARK_MENU_COLORS.textMuted }}>
                No recent projects yet
              </div>
            ) : (
              recents.map((recent) => {
                const isCurrent = recent.title === workspaceDisplayName;
                const unavailable = recent.permissionState === 'denied' || recent.permissionState === 'missing';
                const isOpening = openingId === recent.id;
                const subtitle = isOpening
                  ? (unavailable ? 'Opening folder picker…' : 'Opening…')
                  : unavailable
                    ? 'Needs folder access · click to locate'
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
                      if (isCurrent || loading) return;
                      setOpeningId(recent.id);
                      if (unavailable) {
                        onRelocateRecentProject(recent);
                      } else {
                        onOpenRecentProject(recent);
                      }
                    }}
                    disabled={loading}
                    title={unavailable ? `${recent.title} — folder access needed, click to locate it` : (recent.localPathHint ?? recent.title)}
                    style={{
                      width: '100%',
                      minHeight: 42,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      padding: '7px 8px',
                      border: 'none',
                      borderRadius: 9,
                      background: isCurrent ? DARK_MENU_COLORS.hover : isOpening ? DARK_MENU_COLORS.hover : 'transparent',
                      color: unavailable ? DARK_MENU_COLORS.textMuted : DARK_MENU_COLORS.textHi,
                      cursor: loading ? 'default' : 'pointer',
                      fontFamily: FONTS.ui,
                      textAlign: 'left',
                      opacity: loading && !isOpening ? 0.55 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!isCurrent) e.currentTarget.style.background = DARK_MENU_COLORS.hover;
                    }}
                    onMouseLeave={(e) => {
                      if (!isCurrent && !isOpening) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span style={{ position: 'relative', display: 'inline-flex', color: unavailable ? DARK_MENU_COLORS.textMuted : DARK_MENU_COLORS.text, flexShrink: 0 }}>
                      {isOpening ? (
                        <span
                          aria-hidden="true"
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            border: `1.6px solid ${DARK_MENU_COLORS.textMuted}`,
                            borderTopColor: 'transparent',
                            animation: 'spin 0.7s linear infinite',
                            display: 'inline-block',
                            boxSizing: 'border-box',
                          }}
                        />
                      ) : (
                        <IconFolder size={14} />
                      )}
                      {recent.cloudBoardId && !isOpening && (
                        <span
                          aria-hidden="true"
                          style={{
                            position: 'absolute',
                            right: -3,
                            top: -3,
                            width: 7,
                            height: 7,
                            borderRadius: 999,
                            border: `1px solid ${DARK_MENU_COLORS.surface}`,
                            background: '#4aa878',
                          }}
                        />
                      )}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 740 }}>
                        {recent.title}
                      </span>
                      <span style={{ display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, fontWeight: 600, color: isOpening ? DARK_MENU_COLORS.text : unavailable ? '#e0a458' : DARK_MENU_COLORS.textMuted }}>
                        {subtitle}
                      </span>
                    </span>
                    {isCurrent && (
                      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 760, color: DARK_MENU_COLORS.accent }}>
                        Current
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          <div style={{ padding: 5, borderTop: `1px solid ${DARK_MENU_COLORS.border}` }}>
            <button
              type="button"
              onClick={onOpenProjectsLibrary}
              style={{
                width: '100%',
                height: 32,
                border: 'none',
                borderRadius: 8,
                background: DARK_MENU_COLORS.hover,
                color: DARK_MENU_COLORS.textHi,
                cursor: 'pointer',
                fontFamily: FONTS.ui,
                fontSize: 11,
                fontWeight: 740,
                textAlign: 'left',
                padding: '0 9px',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = DARK_MENU_COLORS.hoverStrong; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = DARK_MENU_COLORS.hover; }}
            >
              All projects...
            </button>
          </div>
        </div>
      )}
    </>
  );
}
