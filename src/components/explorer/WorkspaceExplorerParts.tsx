import React, { useEffect, useRef, useState } from 'react';
import type { Document } from '../../types';
import { FSA_DIR_SUPPORTED, IN_IFRAME, IS_TAURI } from '../../utils/workspaceManager';
import { IconDoc, IconFolder, IconStar } from '../icons';
import './workspaceExplorer.css';

export function SectionChevron({ open }: { open: boolean }) {
  return (
    <span className={`workspace-section-chevron${open ? ' is-open' : ''}`} aria-hidden="true">
      <span className="workspace-section-chevron__glyph">
        ▾
      </span>
    </span>
  );
}

export function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export type CommandIconKind = 'search' | 'folder' | 'file' | 'edit' | 'view' | 'export' | 'settings' | 'download' | 'help';

export function CommandIcon({ kind }: { kind: CommandIconKind }) {
  if (kind === 'search') {
    return (
      <svg width="13" height="13" viewBox="0 0 17 17" fill="none" aria-hidden="true">
        <circle cx="7.2" cy="7.2" r="4.8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10.8 10.8 14.3 14.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'folder') return <IconFolder size={13} />;
  if (kind === 'file') {
    return (
      <svg width="13" height="13" viewBox="0 0 17 17" fill="none" aria-hidden="true">
        <path d="M4.2 2.5h5.1l3.5 3.5v8.5H4.2V2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M9.2 2.8v3.5h3.3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'edit') {
    return (
      <svg width="13" height="13" viewBox="0 0 17 17" fill="none" aria-hidden="true">
        <path d="M4 12.3 4.6 9.5l6.8-6.8 2.2 2.2-6.8 6.8-2.8.6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M10.5 3.6 12.7 5.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'view') {
    return (
      <svg width="13" height="13" viewBox="0 0 17 17" fill="none" aria-hidden="true">
        <path d="M2.2 8.5s2.3-4 6.3-4 6.3 4 6.3 4-2.3 4-6.3 4-6.3-4-6.3-4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="8.5" cy="8.5" r="1.8" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (kind === 'export') {
    return (
      <svg width="13" height="13" viewBox="0 0 17 17" fill="none" aria-hidden="true">
        <path d="M8.5 3v7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M5.8 7.8 8.5 10.5l2.7-2.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.5 13.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'settings') {
    return (
      <svg width="13" height="13" viewBox="0 0 17 17" fill="none" aria-hidden="true">
        <path d="M8.5 5.8a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8.5 2.2v1.7M8.5 13.1v1.7M2.2 8.5h1.7M13.1 8.5h1.7M4.1 4.1l1.2 1.2M11.7 11.7l1.2 1.2M4.1 12.9l1.2-1.2M11.7 5.3l1.2-1.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'download') {
    return (
      <svg width="13" height="13" viewBox="0 0 17 17" fill="none" aria-hidden="true">
        <path d="M8.5 2.5v8M5.6 7.9l2.9 2.9 2.9-2.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.2 14.2h10.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 17 17" fill="none" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="6.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.8 6.5a1.8 1.8 0 0 1 3.4.8c0 1.7-1.8 1.7-1.8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8.5" cy="12.6" r=".6" fill="currentColor" />
    </svg>
  );
}

export function CommandMenuItem({
  icon,
  label,
  onClick,
  disabled = false,
  trailing,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`workspace-command-menu-item${trailing ? ' has-trailing' : ''}`}
    >
      <span className="workspace-command-menu-item__icon">{icon}</span>
      <span className="workspace-command-menu-item__label">{label}</span>
      {trailing && <span className="workspace-command-menu-item__trailing">{trailing}</span>}
    </button>
  );
}

export function CommandMenuDivider() {
  return <div className="workspace-command-menu-divider" />;
}

export function CommandMenuSubItem({
  icon,
  label,
  open,
  onOpen,
  onClose,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="workspace-command-subitem" onMouseEnter={onOpen} onMouseLeave={onClose}>
      <CommandMenuItem
        icon={icon}
        label={label}
        trailing="›"
        onClick={(e) => {
          e.preventDefault();
          open ? onClose() : onOpen();
        }}
      />
      {open && (
        <div
          className="workspace-command-submenu"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function DarkMenuActionItem({
  label,
  onClick,
  trailing,
}: {
  label: React.ReactNode;
  onClick: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`workspace-dark-menu-action${trailing ? ' has-trailing' : ''}`}
    >
      <span className="workspace-dark-menu-action__label">{label}</span>
      {trailing && <span className="workspace-dark-menu-action__trailing">{trailing}</span>}
    </button>
  );
}

export function NoteShortcutRow({
  doc,
  active,
  onOpen,
  onToggleFavorite,
  onPreview,
  onPreviewEnd,
}: {
  doc: Document;
  active: boolean;
  onOpen: (doc: Document) => void;
  onToggleFavorite: (doc: Document) => void;
  onPreview: (doc: Document, clientY: number) => void;
  onPreviewEnd: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const favorite = !!doc.isFavorite;
  return (
    <button
      type="button"
      className="workspace-note-shortcut-row"
      data-active={active}
      data-hovered={hovered}
      onClick={() => onOpen(doc)}
      onMouseEnter={(e) => {
        setHovered(true);
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = setTimeout(() => onPreview(doc, e.clientY), 380);
      }}
      onMouseLeave={() => {
        setHovered(false);
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
        onPreviewEnd();
      }}
      title={doc.title || 'Untitled note'}
    >
      <span
        role="button"
        tabIndex={0}
        className="workspace-note-shortcut-favorite"
        data-favorite={favorite}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite(doc);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite(doc);
        }}
        title={favorite ? 'Remove from favorites' : 'Add to favorites'}
        aria-label={favorite ? `Remove ${doc.title || 'Untitled note'} from favorites` : `Add ${doc.title || 'Untitled note'} to favorites`}
      >
        <IconStar filled={favorite} size={12} />
      </span>
      <span
        aria-hidden="true"
        className={`workspace-note-shortcut-icon${doc.emoji ? ' has-emoji' : ''}`}
      >
        {doc.emoji || <IconDoc />}
      </span>
      <span className="workspace-note-shortcut-title">
        {doc.title || 'Untitled note'}
      </span>
    </button>
  );
}

export function NoWorkspaceState({ onOpen, onCreate }: { onOpen: () => void; onCreate?: () => void }) {
  const [isBrave, setIsBrave] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const braveApi = (navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }).brave;
    if (!braveApi?.isBrave) return;
    braveApi.isBrave().then((value) => {
      if (!cancelled) setIsBrave(Boolean(value));
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const browserWorkspaceUnavailable = !IS_TAURI && !FSA_DIR_SUPPORTED;
  const title = browserWorkspaceUnavailable
    ? 'Folder access is unavailable here'
    : isBrave
      ? 'Open a folder to start'
      : 'No folder open';
  const body = browserWorkspaceUnavailable
    ? IN_IFRAME
      ? 'This embedded browser view cannot grant folder access. Open DevBoard in its own tab or use the desktop app to work with project folders.'
      : 'This browser session cannot open project folders. Use the desktop app or a desktop Chromium browser with File System Access support.'
    : isBrave
      ? 'Brave desktop can usually open project folders, but Shields or privacy settings may block the folder picker on some setups.'
      : 'A project is a normal folder where DevBoard keeps your pages, notes, and assets so everything reopens together later.';
  const tip = browserWorkspaceUnavailable
    ? 'Project folders need desktop browser support or the desktop app.'
    : isBrave
      ? 'If Open folder does nothing in Brave, click the lion icon in the address bar, disable Shields for this page, and try again.'
      : 'Tip: use a dedicated project folder so workspace.json, pages/, notes/, and assets/ stay together.';

  return (
    <div className="workspace-empty-state">
      <svg className="workspace-empty-state__icon" width="36" height="36" viewBox="0 0 36 36" fill="none">
        <path d="M3 9a3 3 0 0 1 3-3h8l4 4H30a3 3 0 0 1 3 3v15a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9z" stroke="var(--c-text-hi)" strokeWidth="2" strokeLinejoin="round" />
        <line x1="18" y1="16" x2="18" y2="24" stroke="var(--c-text-hi)" strokeWidth="2" strokeLinecap="round" />
        <line x1="14" y1="20" x2="22" y2="20" stroke="var(--c-text-hi)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div>
        <p className="workspace-empty-state__title">{title}</p>
        <p className="workspace-empty-state__body">
          {body}
        </p>
      </div>
      <div className="workspace-empty-state__actions">
        {onCreate && !browserWorkspaceUnavailable && (
          <button
            onClick={onCreate}
            className="workspace-empty-state__button is-create"
          >
            Create project…
          </button>
        )}
        <button
          onClick={onOpen}
          disabled={browserWorkspaceUnavailable}
          className={`workspace-empty-state__button${onCreate ? ' is-secondary' : ''}`}
        >
          {onCreate ? 'Open existing folder…' : 'Open folder…'}
        </button>
      </div>
      <p className="workspace-empty-state__tip">
        {tip}
      </p>
    </div>
  );
}
