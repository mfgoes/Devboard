import { useRef, useState, useEffect } from 'react';

function IconChevronDown() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <path d="M3 4.3 5.5 6.8 8 4.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface AccountMenuProps {
  user: any;
  accountLabel: string;
  avatarUrl: string | null;
  onSignOut: () => Promise<void>;
}

export function AccountMenu({ user, accountLabel, avatarUrl, onSignOut }: AccountMenuProps) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountInitial = accountLabel.trim().charAt(0).toUpperCase() || 'A';

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [accountMenuOpen]);

  return (
    <div className="relative shrink-0" ref={accountMenuRef}>
      <button
        type="button"
        onClick={() => setAccountMenuOpen((current) => !current)}
        className={[
          'flex h-8 min-w-0 max-w-[220px] items-center gap-1.5 rounded border px-2 font-sans text-[11px] transition-colors',
          accountMenuOpen
            ? 'border-[var(--c-line)] bg-[var(--c-hover)] text-[var(--c-text-hi)]'
            : 'border-[var(--c-border)] text-[var(--c-text-md)] hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]',
        ].join(' ')}
        title={user?.email ?? accountLabel}
        aria-expanded={accountMenuOpen}
      >
        <div className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--c-line)] font-sans text-[9px] font-semibold text-white">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            accountInitial
          )}
        </div>
        <span className="min-w-0 max-w-[120px] truncate">
          {accountLabel}
        </span>
        <IconChevronDown />
      </button>
      {accountMenuOpen && (
        <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-[var(--c-border)] bg-[var(--c-panel)] py-1 shadow-xl">
          <div className="px-2.5 py-1.5">
            <p className="truncate font-sans text-[11px] font-semibold text-[var(--c-text-hi)]">{accountLabel}</p>
            {user?.email && (
              <p className="mt-0.5 truncate font-sans text-[10px] text-[var(--c-text-lo)]">{user.email}</p>
            )}
          </div>
          <div className="my-0.5 border-t border-[var(--c-border)]" />
          <button
            type="button"
            onClick={() => {
              setAccountMenuOpen(false);
              void onSignOut();
            }}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-sans text-[11px] font-semibold text-[var(--c-text-md)] transition-colors hover:bg-[var(--c-hover)] hover:text-[var(--c-text-hi)]"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
