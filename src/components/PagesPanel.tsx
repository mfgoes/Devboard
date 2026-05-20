import { useRef, useState, useEffect } from 'react';
import { useBoardStore } from '../store/boardStore';
import { IconFreeformPage, IconStackPage } from './icons';

interface Props {
  onClose: () => void;
}

export default function PagesPanel({ onClose }: Props) {
  const { pages, activePageId, addPage, deletePage, renamePage, switchPage, duplicatePage, setPageLayoutMode } =
    useBoardStore();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  ));
  const panelRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const activePage = pages.find((page) => page.id === activePageId);

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

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
    <>
    {isMobile && (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 680,
          background: 'rgba(22,14,10,0.22)',
        }}
        onMouseDown={onClose}
      />
    )}
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: isMobile ? 'auto' : 52,
        left: isMobile ? 0 : 8,
        right: isMobile ? 0 : 'auto',
        bottom: isMobile ? 0 : 'auto',
        width: isMobile ? '100vw' : 'min(320px, calc(100vw - 16px))',
        maxHeight: isMobile ? 'min(72vh, calc(100vh - 56px))' : 'min(70vh, calc(100vh - 64px))',
        overflowY: 'auto',
        zIndex: isMobile ? 690 : 185,
        borderRadius: isMobile ? '18px 18px 0 0' : 12,
        border: '1px solid var(--c-border)',
        borderBottom: isMobile ? 'none' : '1px solid var(--c-border)',
        background: 'var(--c-panel)',
        boxShadow: isMobile ? '0 -18px 54px rgba(22,14,10,0.28)' : '0 8px 32px rgba(0,0,0,0.28)',
        paddingBottom: isMobile ? 'max(12px, env(safe-area-inset-bottom))' : 0,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {isMobile && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
          <div style={{ width: 38, height: 4, borderRadius: 999, background: 'var(--c-border)' }} />
        </div>
      )}
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '12px 16px 10px' : '10px 12px 8px',
          borderBottom: '1px solid var(--c-border)',
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: isMobile ? 13 : 12,
            fontWeight: 600,
            color: 'var(--c-text-hi)',
            letterSpacing: '0.04em',
          }}
        >
          Folders
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => addPage()}
            title="Add folder"
            style={{
              width: isMobile ? 36 : 22,
              height: isMobile ? 36 : 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: isMobile ? 10 : 6,
              border: 'none',
              background: isMobile ? 'var(--c-hover)' : 'transparent',
              cursor: 'pointer',
              color: isMobile ? 'var(--c-text-hi)' : 'var(--c-text-lo)',
              fontSize: isMobile ? 22 : 18,
              lineHeight: 1,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = isMobile ? 'var(--c-hover)' : 'transparent')}
          >
            +
          </button>
          {isMobile && (
            <button
              onClick={onClose}
              title="Close folders"
              style={{
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 10,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--c-text-lo)',
                fontSize: 20,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {isMobile && activePage && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--c-border)' }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--c-text-lo)', marginBottom: 8 }}>
            Folder view
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {([
              { mode: 'stack' as const, label: 'Notes', icon: <IconStackPage /> },
              { mode: 'freeform' as const, label: 'Canvas', icon: <IconFreeformPage /> },
            ]).map(({ mode, label, icon }) => {
              const active = (activePage.layoutMode ?? 'freeform') === mode;
              return (
                <button
                  key={mode}
                  onClick={() => setPageLayoutMode(activePageId, mode)}
                  title={label}
                  style={{
                    minHeight: 42,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    borderRadius: 12,
                    border: `1px solid ${active ? 'var(--c-line)' : 'var(--c-border)'}`,
                    background: active ? 'rgba(var(--c-line-pre-rgb),0.16)' : 'var(--c-canvas)',
                    color: active ? 'var(--c-text-hi)' : 'var(--c-text-md)',
                    fontFamily: 'var(--font-ui)',
                    fontSize: 13,
                    fontWeight: 650,
                    cursor: 'pointer',
                  }}
                >
                  {icon}
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Folder list */}
      <div style={{ padding: isMobile ? '8px 10px' : '4px 0' }}>
        {pages.map((page) => {
          const isActive = page.id === activePageId;
          const isRenaming = renamingId === page.id;
          const isMenuOpen = menuOpenId === page.id;
          const isStack = page.layoutMode === 'stack';
          return (
            <div
              key={page.id}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                minHeight: isMobile ? 48 : 36,
                padding: isMobile ? '0 6px 0 12px' : '0 8px',
                margin: isMobile ? '0 0 4px' : '0 4px',
                borderRadius: isMobile ? 12 : 8,
                background: isActive ? 'rgba(var(--c-line-pre-rgb),0.14)' : 'transparent',
                cursor: 'pointer',
                gap: isMobile ? 10 : 6,
              }}
              onClick={() => {
                if (!isRenaming) {
                  switchPage(page.id);
                  if (isMobile) onClose();
                }
              }}
              onDoubleClick={() => startRename(page.id, page.name)}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'var(--c-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
              }}
            >
              <span style={{ flexShrink: 0, color: isActive ? 'var(--c-line)' : 'var(--c-text-lo)', display: 'inline-flex' }}>
                {isStack ? <IconStackPage /> : <IconFreeformPage />}
              </span>

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
                    border: '1px solid var(--c-line)',
                    borderRadius: isMobile ? 8 : 4,
                    padding: isMobile ? '6px 8px' : '1px 4px',
                    fontFamily: isMobile ? 'var(--font-ui)' : "'JetBrains Mono', monospace",
                    fontSize: isMobile ? 14 : 12,
                    color: 'var(--c-text-hi)',
                    outline: 'none',
                  }}
                />
              ) : (
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: isMobile ? 'var(--font-ui)' : "'JetBrains Mono', monospace",
                    fontSize: isMobile ? 14 : 12,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--c-line)' : 'var(--c-text-hi)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {page.name}
                </span>
              )}

              {!isRenaming && isMobile && (
                <span
                  style={{
                    flexShrink: 0,
                    borderRadius: 999,
                    padding: '3px 7px',
                    border: '1px solid var(--c-border)',
                    color: 'var(--c-text-lo)',
                    fontFamily: 'var(--font-ui)',
                    fontSize: 10,
                  }}
                >
                  {isStack ? 'Notes' : 'Canvas'}
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
                      width: isMobile ? 40 : 20,
                      height: isMobile ? 40 : 20,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: isMobile ? 10 : 4,
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: 'var(--c-text-lo)',
                      opacity: isMobile || isMenuOpen ? 1 : 0.5,
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.opacity = '1';
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--c-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isMenuOpen) {
                        (e.currentTarget as HTMLButtonElement).style.opacity = isMobile ? '1' : '0.5';
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
                        top: isMobile ? 42 : 22,
                        right: 0,
                        width: isMobile ? 164 : 140,
                        borderRadius: isMobile ? 12 : 8,
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
                            padding: isMobile ? '11px 14px' : '6px 12px',
                            textAlign: 'left',
                            background: 'transparent',
                            border: 'none',
                            fontFamily: isMobile ? 'var(--font-ui)' : "'JetBrains Mono', monospace",
                            fontSize: isMobile ? 13 : 11,
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
    </>
  );
}
