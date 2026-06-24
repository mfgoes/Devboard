import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { FONTS } from '../../utils/fonts';
import { DARK_MENU_COLORS } from '../darkMenuTheme';
import { DarkMenuActionItem } from './WorkspaceExplorerParts';

interface WorkspaceExplorerAccountMenuProps {
  accountLabel: string;
  accountInitials: string;
  avatarUrl: string | null;
  userEmail: string | null;
  onSignOut: () => void;
  onSignIn: () => void;
}

const WorkspaceExplorerAccountMenu = forwardRef<HTMLDivElement, WorkspaceExplorerAccountMenuProps>(
  function WorkspaceExplorerAccountMenu(
    {
      accountLabel,
      accountInitials,
      avatarUrl,
      userEmail,
      onSignOut,
      onSignIn,
    }: WorkspaceExplorerAccountMenuProps,
    ref,
  ) {
    const [open, setOpen] = useState(false);
    const localRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => localRef.current as HTMLDivElement);

    useEffect(() => {
      if (!open) return;
      const handleWindowClick = (event: MouseEvent) => {
        const target = event.target as Node | null;
        if (!target) return;
        if (localRef.current?.contains(target)) return;
        setOpen(false);
      };
      window.addEventListener('click', handleWindowClick);
      return () => window.removeEventListener('click', handleWindowClick);
    }, [open]);

    return (
      <div ref={localRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          title={userEmail && userEmail !== accountLabel ? `${accountLabel} · ${userEmail}` : accountLabel}
          aria-label="Account"
          style={{
            minWidth: 0,
            maxWidth: 104,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: 0,
            border: 'none',
            background: 'transparent',
            color: 'var(--c-text-hi)',
            cursor: 'pointer',
            fontFamily: FONTS.ui,
            textAlign: 'left',
          }}
        >
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
              background: 'var(--c-line)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0,
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              accountInitials
            )}
          </span>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 720 }}>
            {accountLabel}
          </span>
        </button>

        {open && (
          <div
            style={{
              position: 'fixed',
              left: Math.min(Math.max(8, window.innerWidth - 320 - 8), (localRef.current?.getBoundingClientRect().right ?? 0) - 320),
              top: localRef.current ? localRef.current.getBoundingClientRect().bottom + 8 : 8,
              zIndex: 10000,
              overflow: 'hidden',
              border: `1px solid ${DARK_MENU_COLORS.border}`,
              borderRadius: 14,
              background: DARK_MENU_COLORS.surface,
              boxShadow: DARK_MENU_COLORS.shadow,
              fontFamily: FONTS.ui,
              width: 320,
              maxWidth: 'calc(100vw - 16px)',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '12px 12px 10px', borderBottom: `1px solid ${DARK_MENU_COLORS.border}` }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 750, color: DARK_MENU_COLORS.textHi }}>
                {accountLabel}
              </div>
              {userEmail && userEmail !== accountLabel && (
                <div style={{ marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10.5, color: DARK_MENU_COLORS.textMuted }}>
                  {userEmail}
                </div>
              )}
            </div>
            <div style={{ padding: 6 }}>
              {userEmail ? (
                <DarkMenuActionItem
                  label="Sign out"
                  onClick={() => {
                    setOpen(false);
                    onSignOut();
                  }}
                />
              ) : (
                <DarkMenuActionItem
                  label="Sign in"
                  onClick={() => {
                    setOpen(false);
                    onSignIn();
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);

export default WorkspaceExplorerAccountMenu;
