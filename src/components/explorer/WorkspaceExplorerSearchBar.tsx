import type { KeyboardEvent, RefObject } from 'react';

import { FONTS } from '../../utils/fonts';

interface WorkspaceExplorerSearchBarProps {
  open: boolean;
  value: string;
  inputRef: RefObject<HTMLInputElement>;
  onOpen: () => void;
  onChange: (value: string) => void;
  onClose: () => void;
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onCloseSidebarMenus: () => void;
}

export default function WorkspaceExplorerSearchBar({
  open,
  value,
  inputRef,
  onOpen,
  onChange,
  onClose,
  onSearchKeyDown,
  onCloseSidebarMenus,
}: WorkspaceExplorerSearchBarProps) {
  return (
    <div
      style={{
        padding: '10px 12px 11px',
        borderBottom: '0.5px solid var(--c-sidebar-border)',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
          height: 30,
          padding: '0 9px',
          border: `1px solid ${open ? 'rgba(184,119,80,0.32)' : 'transparent'}`,
          borderRadius: 8,
          background: open ? '#ffffff' : 'var(--c-sidebar-item-hover)',
          transition: 'border-color 120ms, background 120ms',
        }}
        onMouseDown={() => {
          onCloseSidebarMenus();
          onOpen();
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink: 0, opacity: 0.62 }}>
          <circle cx="4.5" cy="4.5" r="3.5" stroke="var(--c-text-hi)" strokeWidth="1.3" />
          <line x1="7.5" y1="7.5" x2="10" y2="10" stroke="var(--c-text-hi)" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onOpen}
          onBlur={onClose}
          onKeyDown={onSearchKeyDown}
          placeholder="Search folders, notes, files..."
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontFamily: FONTS.ui,
            fontSize: 11,
            fontWeight: 550,
            color: 'var(--c-text-hi)',
            caretColor: 'var(--c-line)',
          }}
        />
      </div>
    </div>
  );
}
