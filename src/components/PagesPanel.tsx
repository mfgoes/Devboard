import { useRef, useState, useEffect } from 'react';
import { useBoardStore } from '../store/boardStore';

interface Props {
  onClose: () => void;
}

export default function PagesPanel({ onClose }: Props) {
  const { pages, activePageId, addPage, deletePage, renamePage, switchPage, duplicatePage } =
    useBoardStore();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Close kebab menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-kebab-menu]')) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpenId]);

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  // Close panel on outside click — but not when clicking the toggle button itself
  // (the toggle button fires mousedown→close then click→reopen, so we skip it here)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if ((e.target as Element).closest('[data-pages-toggle]')) return;
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const commitRename = () => {
    if (renamingId) {
      const trimmed = renameDraft.trim();
      if (trimmed) renamePage(renamingId, trimmed);
    }
    setRenamingId(null);
  };

  const startRename = (id: string, currentName: string) => {
    setMenuOpenId(null);
    setRenamingId(id);
    setRenameDraft(currentName);
  };

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: 52,
        left: 8,
        width: 220,
        zIndex: 185,
        borderRadius: 12,
        border: '1px solid var(--c-border)',
        background: 'var(--c-panel)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px 8px',
          borderBottom: '1px solid var(--c-border)',
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--c-text-hi)',
            letterSpacing: '0.04em',
          }}
        >
          Pages
        </span>
        <button
          onClick={() => addPage()}
          title="Add page"
          style={{
            width: 22,
            height: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--c-text-lo)',
            fontSize: 18,
            lineHeight: 1,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          +
        </button>
      </div>

      {/* Page list */}
      <div style={{ padding: '4px 0' }}>
        {pages.map((page) => {
          const isActive = page.id === activePageId;
          const isRenaming = renamingId === page.id;
          const isMenuOpen = menuOpenId === page.id;

          return (
            <div
              key={page.id}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                height: 36,
                padding: '0 8px',
                margin: '0 4px',
                borderRadius: 8,
                background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
                cursor: 'pointer',
                gap: 6,
              }}
              onClick={() => {
                if (!isRenaming) switchPage(page.id);
              }}
              onDoubleClick={() => startRename(page.id, page.name)}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'var(--c-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
              }}
            >
              {/* Page icon */}
              <svg
                width="13"
                height="13"
                viewBox="0 0 13 13"
                fill="none"
                style={{ flexShrink: 0, color: isActive ? '#6366f1' : 'var(--c-text-lo)' }}
              >
                <rect
                  x="1.5"
                  y="1.5"
                  width="10"
                  height="10"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />
              </svg>

              {/* Name or rename input */}
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenamingId(null);
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'var(--c-panel)',
                    border: '1px solid #6366f1',
                    borderRadius: 4,
                    padding: '1px 4px',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12,
                    color: 'var(--c-text-hi)',
                    outline: 'none',
                  }}
                />
              ) : (
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#6366f1' : 'var(--c-text-hi)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {page.name}
                </span>
              )}

              {/* Kebab menu button */}
              {!isRenaming && (
                <div style={{ position: 'relative' }} data-kebab-menu>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId(isMenuOpen ? null : page.id);
                    }}
                    title="More options"
                    style={{
                      width: 20,
                      height: 20,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 4,
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: 'var(--c-text-lo)',
                      opacity: isMenuOpen ? 1 : 0.5,
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.opacity = '1';
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--c-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isMenuOpen) {
                        (e.currentTarget as HTMLButtonElement).style.opacity = '0.5';
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      }
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                      <circle cx="2" cy="6" r="1.2" />
                      <circle cx="6" cy="6" r="1.2" />
                      <circle cx="10" cy="6" r="1.2" />
                    </svg>
                  </button>

                  {isMenuOpen && (
                    <div
                      data-kebab-menu
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        top: 22,
                        right: 0,
                        width: 140,
                        borderRadius: 8,
                        border: '1px solid var(--c-border)',
                        background: 'var(--c-panel)',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.24)',
                        zIndex: 300,
                        padding: '4px 0',
                      }}
                    >
                      {[
                        {
                          label: 'Rename',
                          action: () => startRename(page.id, page.name),
                        },
                        {
                          label: 'Duplicate',
                          action: () => { duplicatePage(page.id); setMenuOpenId(null); },
                        },
                        {
                          label: 'Delete',
                          action: () => { deletePage(page.id); setMenuOpenId(null); },
                          disabled: pages.length <= 1,
                          danger: true,
                        },
                      ].map((item) => (
                        <button
                          key={item.label}
                          onClick={item.action}
                          disabled={item.disabled}
                          style={{
                            width: '100%',
                            padding: '6px 12px',
                            textAlign: 'left',
                            background: 'transparent',
                            border: 'none',
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 11,
                            cursor: item.disabled ? 'not-allowed' : 'pointer',
                            color: item.danger
                              ? item.disabled ? 'var(--c-text-lo)' : '#f87171'
                              : 'var(--c-text-hi)',
                            opacity: item.disabled ? 0.4 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (!item.disabled)
                              (e.currentTarget as HTMLButtonElement).style.background =
                                'var(--c-hover)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
