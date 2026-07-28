import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { CanvasNode, Document } from '../types';
import { resolveDocumentColorValue, getLinkHref, toggleInlineCode, restoreRangeSelection, dispatchEditableInput, rangeRoot } from './documentEditorCommands';
import { type DocumentCommandDefinition, type DocumentCommandGroup, type DocumentCommandId } from './documentCommands';
import { type NoteSavePresentation } from '../utils/saveStatus';
import { IconArrowRight, IconCode, IconCodeBlock, IconColumns, IconCopy, IconEye, IconHorizontalRule, IconLink, IconList, IconListOrdered, IconNodeLink, IconQuote, IconStar, IconTextWrap, IconUnlink, IconWikiLink } from './icons';
import './DocumentMode.css';

// Editor chrome for DocumentMode: the top FormattingBar (block/source controls)
// and the floating SelectionFormattingToolbar shown over a text selection.

const DOCUMENT_TEXT_COLORS = [
  { label: 'Default', value: 'auto', swatch: 'var(--c-text-hi)' },
  { label: 'Accent', value: '--c-line', swatch: 'var(--c-line)' },
  { label: 'Green', value: '--c-green', swatch: 'var(--c-green)' },
  { label: 'Orange', value: '--c-orange', swatch: 'var(--c-orange)' },
  { label: 'Red', value: '--c-red', swatch: 'var(--c-red)' },
  { label: 'Yellow', value: '--c-yellow', swatch: 'var(--c-yellow)' },
] as const;

interface FmtBarProps {
  viewMode: 'edit' | 'source' | 'split';
  compactMode?: boolean;
  onToggleSource: () => void;
  onToggleEdit: () => void;
  onExportMarkdown: () => void;
  onSourceInsert: (syntax: string) => void;
  sourceWrap: boolean;
  setSourceWrap: React.Dispatch<React.SetStateAction<boolean>>;
  onCopySource: () => void;
  saveStatus?: NoteSavePresentation;
  onOpenProperties: () => void;
  onFindReplace: () => void;
  onShowWordCount: () => void;
  wordCount: number;
  readingTime: string;
  insertCommands: DocumentCommandDefinition[];
  turnIntoCommands: DocumentCommandDefinition[];
  onInsertCommand: (command: DocumentCommandDefinition) => void;
  onTurnIntoCommand: (command: DocumentCommandDefinition) => void;
  onCaptureSelection: () => void;
  onOpenSlashCommands: () => void;
  onMenuOpenChange?: (open: boolean) => void;
}

export interface SelectionToolbarAnchor {
  left: number;
  top: number;
}


export function FormattingBar({
  viewMode,
  compactMode = false,
  onSourceInsert,
  sourceWrap,
  setSourceWrap,
  onCopySource,
  insertCommands,
  turnIntoCommands,
  onInsertCommand,
  onTurnIntoCommand,
  onCaptureSelection,
  onOpenSlashCommands,
  onMenuOpenChange,
}: FmtBarProps) {
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [hoveredControl, setHoveredControl] = useState<string | null>(null);
  const [toolbarWidth, setToolbarWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1440));
  const isMobileNarrow = toolbarWidth < 520;
  const useCompactToolbar = compactMode || toolbarWidth < 760;
  const useUltraCompactToolbar = toolbarWidth < 620;
  const savedRangeRef = useRef<Range | null>(null);
  const [, tick] = useState(0);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const toolsBtnRef = useRef<HTMLButtonElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    onCaptureSelection();
  };

  const restoreSelection = () => {
    restoreRangeSelection(savedRangeRef.current);
  };

  const fmt = (cmd: string, val?: string) => {
    restoreSelection();
    document.execCommand(cmd, false, val);
    dispatchEditableInput(savedRangeRef.current);
    tick((n) => n + 1);
  };

  const btnStyle = (active: boolean, hovered = false): React.CSSProperties => ({
    height: isMobileNarrow ? 30 : 26,
    minWidth: isMobileNarrow ? 30 : 26,
    padding: '0 8px',
    background: active
      ? (hovered ? 'rgba(184,119,80,0.33)' : 'rgba(184,119,80,0.22)')
      : (hovered ? 'var(--c-hover)' : 'transparent'),
    border: active
      ? `1px solid ${hovered ? 'rgba(184,119,80,0.72)' : 'rgba(184,119,80,0.46)'}`
      : `1px solid ${hovered ? 'var(--c-border)' : 'transparent'}`,
    borderRadius: 6,
    color: active ? 'var(--c-line)' : (hovered ? 'var(--c-text-hi)' : 'var(--c-text-lo)'),
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: 'inherit',
    fontWeight: active ? 600 : 500,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    boxShadow: hovered && !active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
    transition: 'background 0.12s, border-color 0.12s, color 0.12s, box-shadow 0.12s',
  });

  const primaryMenuButtonStyle = (active: boolean, hovered = false): React.CSSProperties => ({
    ...btnStyle(active, hovered),
    minWidth: useCompactToolbar ? 96 : 116,
    height: isMobileNarrow ? 34 : 32,
    padding: '0 12px',
    justifyContent: 'space-between',
    border: `1px solid ${active ? 'rgba(184,119,80,0.52)' : 'rgba(184,119,80,0.32)'}`,
    background: active ? 'rgba(184,119,80,0.14)' : 'rgba(255,255,255,0.03)',
    color: active ? 'var(--c-line)' : 'var(--c-text-hi)',
    fontSize: useCompactToolbar ? 12 : 13,
    fontWeight: 700,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  });

  const compactIconButtonStyle = (active: boolean, hovered = false): React.CSSProperties => ({
    ...btnStyle(active, hovered),
    height: isMobileNarrow ? 34 : 32,
    minWidth: isMobileNarrow ? 34 : 32,
    padding: '0 8px',
    fontSize: 13,
    fontWeight: active ? 800 : 700,
    color: active ? 'var(--c-line)' : (hovered ? 'var(--c-text-hi)' : 'var(--c-text-md)'),
  });

  const toolbarDividerStyle: React.CSSProperties = {
    width: 1,
    height: 24,
    background: 'var(--c-border)',
    margin: '0 6px',
    flexShrink: 0,
  };

  const todoGlyph = (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 8.15 7.05 10.1 11.1 5.8" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const hoverHandlers = (id: string) => ({
    onMouseEnter: () => setHoveredControl(id),
    onMouseLeave: () => setHoveredControl((current) => (current === id ? null : current)),
  });

  const sourceShortcutStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 26,
    padding: '0 8px',
    borderRadius: 6,
    border: '1px solid var(--c-border)',
    background: 'rgba(255,255,255,0.025)',
    color: 'var(--c-text-lo)',
    fontSize: 11,
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  };

  const sourceActionButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: useCompactToolbar ? 0 : 6,
    minHeight: 26,
    padding: useCompactToolbar ? '0 8px' : '0 10px',
    borderRadius: 6,
    border: '1px solid var(--c-border)',
    background: 'rgba(255,255,255,0.025)',
    color: 'var(--c-text-lo)',
    fontSize: 11,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'background 0.12s, border-color 0.12s, color 0.12s',
  };

  const menuButtonStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 10px',
    border: 'none',
    background: 'transparent',
    color: 'var(--c-text-md)',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
    textAlign: 'left',
    borderRadius: 8,
    transition: 'background 0.12s, color 0.12s',
  };

  const sourceShortcuts = [
    ['### ', 'Heading'],
    ['*text*', 'Italic'],
    ['**bold**', 'Bold'],
    ['- ', 'List'],
    ['1. ', 'Ordered'],
    ['> ', 'Quote'],
    ['> [!callout] 💡 ', 'Callout'],
    ['`code`', 'Inline code'],
    ['```\ncode\n```', 'Code block'],
    ['[](url)', 'Link'],
    ['![](url)', 'Image'],
    ['---', 'Rule'],
    ['~~text~~', 'Strike'],
    ['[[Note]]', 'Wiki link'],
    ['@node:', 'Node'],
  ];
  const visibleSourceShortcuts = useUltraCompactToolbar ? sourceShortcuts.slice(0, 6) : sourceShortcuts;

  const toolsMenuRect = showToolsMenu && toolsBtnRef.current ? toolsBtnRef.current.getBoundingClientRect() : null;
  const groupedInsertCommands = insertCommands.reduce<Record<DocumentCommandGroup, DocumentCommandDefinition[]>>((acc, command) => {
    (acc[command.group] ||= []).push(command);
    return acc;
  }, {} as Record<DocumentCommandGroup, DocumentCommandDefinition[]>);
  const groupedTurnIntoCommands = turnIntoCommands.reduce<Record<DocumentCommandGroup, DocumentCommandDefinition[]>>((acc, command) => {
    (acc[command.group] ||= []).push(command);
    return acc;
  }, {} as Record<DocumentCommandGroup, DocumentCommandDefinition[]>);

  const closeMenus = () => {
    setShowToolsMenu(false);
  };

  const runTurnIntoCommand = (id: DocumentCommandId) => {
    const command = turnIntoCommands.find((candidate) => candidate.id === id);
    if (!command) return;
    restoreSelection();
    onCaptureSelection();
    closeMenus();
    onTurnIntoCommand(command);
    tick((n) => n + 1);
  };

  const runToolbarCommand = (id: DocumentCommandId) => {
    const command = insertCommands.find((candidate) => candidate.id === id);
    if (!command) return;
    restoreSelection();
    onCaptureSelection();
    closeMenus();
    onInsertCommand(command);
  };

  const openSlashCommands = () => {
    restoreSelection();
    onCaptureSelection();
    closeMenus();
    onOpenSlashCommands();
  };

  useEffect(() => {
    onMenuOpenChange?.(showToolsMenu);
    return () => onMenuOpenChange?.(false);
  }, [onMenuOpenChange, showToolsMenu]);

  useEffect(() => {
    if (!showToolsMenu) return;
    const handleWindowPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (
        toolbarRef.current?.contains(target) ||
        toolsMenuRef.current?.contains(target)
      ) {
        return;
      }
      closeMenus();
    };
    window.addEventListener('mousedown', handleWindowPointer);
    window.addEventListener('touchstart', handleWindowPointer);
    return () => {
      window.removeEventListener('mousedown', handleWindowPointer);
      window.removeEventListener('touchstart', handleWindowPointer);
    };
  }, [showToolsMenu]);

  useEffect(() => {
    const el = toolbarRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => setToolbarWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const menuShell = (rect: DOMRect | null, width = 190): React.CSSProperties => ({
    position: 'fixed',
    top: Math.min((rect?.bottom ?? 0) + 6, window.innerHeight - 240),
    left: Math.min(rect?.left ?? 0, window.innerWidth - width - 12),
    zIndex: 520,
    minWidth: width,
    padding: 6,
    background: 'var(--c-panel)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
  });

  const menuHover = {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = 'var(--c-hover)';
      e.currentTarget.style.color = 'var(--c-text-hi)';
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.color = 'var(--c-text-md)';
    },
  };

  return (
    <div
      ref={toolbarRef}
      style={{
        position: 'relative',
        padding: compactMode ? '8px 14px' : '9px 28px',
        borderBottom: '1px solid var(--c-border)',
        background: 'var(--c-panel)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
        boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          overflowX: 'auto',
          overflowY: 'visible',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          paddingBottom: 2,
          whiteSpace: 'nowrap',
        }}
      >
        {viewMode === 'edit' && (
          <>
            <button
              ref={toolsBtnRef}
              type="button"
              style={primaryMenuButtonStyle(showToolsMenu, hoveredControl === 'tools')}
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => {
                setShowToolsMenu((v) => !v);
              }}
              {...hoverHandlers('tools')}
              title="Insert block or link"
            >
              <span style={{ fontSize: 18, fontWeight: 500, lineHeight: 1 }}>+</span>
              <span style={{ marginRight: 2 }}>Insert</span>
              <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
            </button>
            <div style={toolbarDividerStyle} />
            <button
              type="button"
              style={compactIconButtonStyle(false, hoveredControl === 'h1')}
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => runTurnIntoCommand('heading-1')}
              {...hoverHandlers('h1')}
              title="Heading 1"
            >
              H1
            </button>
            <button
              type="button"
              style={compactIconButtonStyle(false, hoveredControl === 'h2')}
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => runTurnIntoCommand('heading-2')}
              {...hoverHandlers('h2')}
              title="Heading 2"
            >
              H2
            </button>
            <button
              type="button"
              style={compactIconButtonStyle(false, hoveredControl === 'bullet-list')}
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => runTurnIntoCommand('bullet-list')}
              {...hoverHandlers('bullet-list')}
              title="Bullet list"
            >
              <IconList />
            </button>
            <button
              type="button"
              style={compactIconButtonStyle(false, hoveredControl === 'todo-list')}
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => runTurnIntoCommand('todo-list')}
              {...hoverHandlers('todo-list')}
              title="Todo list"
            >
              {todoGlyph}
            </button>
            <button
              type="button"
              style={compactIconButtonStyle(false, hoveredControl === 'quote')}
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => runTurnIntoCommand('quote')}
              {...hoverHandlers('quote')}
              title="Quote"
            >
              <IconQuote />
            </button>
            <div style={toolbarDividerStyle} />
            <button
              type="button"
              style={{
                ...btnStyle(false, hoveredControl === 'slash-commands'),
                height: isMobileNarrow ? 34 : 32,
                minWidth: useCompactToolbar ? 42 : 154,
                padding: useCompactToolbar ? '0 9px' : '0 12px',
                borderRadius: 999,
                border: '1px dashed var(--c-border)',
                color: hoveredControl === 'slash-commands' ? 'var(--c-text-hi)' : 'var(--c-text-md)',
                fontSize: 13,
                fontWeight: 600,
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={openSlashCommands}
              {...hoverHandlers('slash-commands')}
              title="Slash commands"
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 7,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'var(--c-text-hi)',
                  fontSize: 15,
                  lineHeight: 1,
                }}
              >
                /
              </span>
              {!useCompactToolbar && <span>slash commands</span>}
            </button>
          </>
        )}

        {(viewMode === 'source' || viewMode === 'split') && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minHeight: 30,
              flexShrink: 0,
            }}
          >
            {!useCompactToolbar && (
              <span style={{ fontSize: 11, color: 'var(--c-text-off)', marginRight: 2, whiteSpace: 'nowrap' }}>
              Markdown
              </span>
            )}
            {visibleSourceShortcuts.map(([syntax, label]) => (
              <button
                key={syntax}
                type="button"
                title={`Insert ${label.toLowerCase()} syntax`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSourceInsert(syntax);
                }}
                style={{
                  ...sourceShortcutStyle,
                  cursor: 'pointer',
                  transition: 'background 0.12s, border-color 0.12s, color 0.12s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--c-hover)';
                  e.currentTarget.style.borderColor = 'rgba(184,119,80,0.28)';
                  e.currentTarget.style.color = 'var(--c-text-hi)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.025)';
                  e.currentTarget.style.borderColor = 'var(--c-border)';
                  e.currentTarget.style.color = 'var(--c-text-lo)';
                }}
              >
                <code
                  style={{
                    color: 'var(--c-text-hi)',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 11,
                    background: 'rgba(0,0,0,0.08)',
                    borderRadius: 4,
                    padding: '1px 5px',
                  }}
                >
                  {syntax}
                </code>
                {!useCompactToolbar && <span>{label}</span>}
              </button>
            ))}
            <button
              type="button"
              title={sourceWrap ? 'Disable line wrap' : 'Enable line wrap'}
              onMouseDown={(e) => {
                e.preventDefault();
                setSourceWrap((v) => !v);
              }}
              style={{
                ...sourceActionButtonStyle,
                background: sourceWrap ? 'rgba(184,119,80,0.12)' : 'rgba(255,255,255,0.025)',
                borderColor: sourceWrap ? 'rgba(184,119,80,0.28)' : 'var(--c-border)',
                color: sourceWrap ? 'var(--c-text-hi)' : 'var(--c-text-lo)',
              }}
              onMouseEnter={(e) => {
                if (sourceWrap) {
                  e.currentTarget.style.background = 'rgba(184,119,80,0.16)';
                  e.currentTarget.style.borderColor = 'rgba(184,119,80,0.36)';
                } else {
                  e.currentTarget.style.background = 'var(--c-hover)';
                  e.currentTarget.style.borderColor = 'rgba(184,119,80,0.28)';
                  e.currentTarget.style.color = 'var(--c-text-hi)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = sourceWrap ? 'rgba(184,119,80,0.12)' : 'rgba(255,255,255,0.025)';
                e.currentTarget.style.borderColor = sourceWrap ? 'rgba(184,119,80,0.28)' : 'var(--c-border)';
                e.currentTarget.style.color = sourceWrap ? 'var(--c-text-hi)' : 'var(--c-text-lo)';
              }}
            >
              <IconTextWrap />
              {!useCompactToolbar && 'Wrap'}
            </button>
            <button
              type="button"
              title="Copy raw markdown"
              onMouseDown={(e) => {
                e.preventDefault();
                onCopySource();
              }}
              style={sourceActionButtonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--c-hover)';
                e.currentTarget.style.borderColor = 'rgba(184,119,80,0.28)';
                e.currentTarget.style.color = 'var(--c-text-hi)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.025)';
                e.currentTarget.style.borderColor = 'var(--c-border)';
                e.currentTarget.style.color = 'var(--c-text-lo)';
              }}
            >
              <IconCopy />
              {!useCompactToolbar && 'Copy'}
            </button>
          </div>
        )}
      </div>

      {toolsMenuRect && (
        <div
          ref={toolsMenuRef}
          style={{ ...menuShell(toolsMenuRect, 260), maxHeight: 'min(72vh, 620px)', overflowY: 'auto' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {(Object.keys(groupedTurnIntoCommands) as DocumentCommandGroup[]).map((group) => (
            <div key={`turn-${group}`}>
              <div style={{ padding: '7px 10px 4px', color: 'var(--c-text-off)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0 }}>
                Turn into
              </div>
              {groupedTurnIntoCommands[group].map((command) => (
                <button
                  key={command.id}
                  style={menuButtonStyle}
                  title={`Turn current line into ${command.label.toLowerCase()}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    restoreSelection();
                    onCaptureSelection();
                    closeMenus();
                    onTurnIntoCommand(command);
                  }}
                  {...menuHover}
                >
                  <span
                    style={{
                      width: 24,
                      height: 22,
                      borderRadius: 6,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      background: 'rgba(184,119,80,0.12)',
                      color: 'var(--c-line)',
                      fontSize: 11,
                      fontWeight: 800,
                      fontFamily: command.id === 'code-block' ? 'JetBrains Mono, monospace' : 'inherit',
                    }}
                  >
                    {command.glyph}
                  </span>
                  <span>{command.label}</span>
                </button>
              ))}
              <div style={{ height: 1, background: 'var(--c-border)', margin: '6px 4px' }} />
            </div>
          ))}
          {(Object.keys(groupedInsertCommands) as DocumentCommandGroup[]).map((group) => (
            <div key={group}>
              <div style={{ padding: '7px 10px 4px', color: 'var(--c-text-off)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0 }}>
                {group}
              </div>
              {groupedInsertCommands[group].map((command) => (
                <button
                  key={command.id}
                  style={menuButtonStyle}
                  title={command.description}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    restoreSelection();
                    onCaptureSelection();
                    closeMenus();
                    onInsertCommand(command);
                  }}
                  {...menuHover}
                >
                  <span
                    style={{
                      width: 24,
                      height: 22,
                      borderRadius: 6,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      background: 'rgba(184,119,80,0.12)',
                      color: 'var(--c-line)',
                      fontSize: 11,
                      fontWeight: 800,
                      fontFamily: command.id === 'code-block' ? 'JetBrains Mono, monospace' : 'inherit',
                    }}
                  >
                    {command.glyph}
                  </span>
                  <span>{command.label}</span>
                  {command.hint && (
                    <span style={{ marginLeft: 'auto', color: 'var(--c-text-lo)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>
                      {command.hint}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

interface SelectionFormattingToolbarProps {
  anchor: SelectionToolbarAnchor | null;
  isWikiLinkActive: boolean;
  onWikilinkClick: (rect: DOMRect) => void;
  onInteractionStart: () => void;
}

export function SelectionFormattingToolbar({ anchor, isWikiLinkActive, onWikilinkClick, onInteractionStart }: SelectionFormattingToolbarProps) {
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showLinkMenu, setShowLinkMenu] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [hoveredControl, setHoveredControl] = useState<string | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [, tick] = useState(0);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const linkBtnRef = useRef<HTMLButtonElement>(null);
  const floatingToolbarRef = useRef<HTMLDivElement>(null);
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const linkMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchor) {
      setShowColorMenu(false);
      setShowLinkMenu(false);
    }
  }, [anchor]);

  useEffect(() => {
    if (!showColorMenu && !showLinkMenu) return;
    const handleWindowPointer = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (
        floatingToolbarRef.current?.contains(target) ||
        colorMenuRef.current?.contains(target) ||
        linkMenuRef.current?.contains(target)
      ) {
        return;
      }
      setShowColorMenu(false);
      setShowLinkMenu(false);
    };
    window.addEventListener('mousedown', handleWindowPointer);
    return () => window.removeEventListener('mousedown', handleWindowPointer);
  }, [showColorMenu, showLinkMenu]);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
  };

  const restoreSelection = () => {
    const r = savedRangeRef.current ?? (window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0).cloneRange() : null);
    if (!r) return;
    const sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(r); }
  };

  const execAndTick = (action: () => void) => {
    restoreSelection();
    action();
    dispatchEditableInput(savedRangeRef.current);
    tick((n) => n + 1);
  };

  const dispatchEditorInput = () => {
    const root = savedRangeRef.current ? rangeRoot(savedRangeRef.current) : null;
    root?.dispatchEvent(new Event('input', { bubbles: true }));
    tick((n) => n + 1);
  };

  const hoverHandlers = (id: string) => ({
    onMouseEnter: () => setHoveredControl(id),
    onMouseLeave: () => setHoveredControl((current) => (current === id ? null : current)),
  });

  const colorMenuRect = showColorMenu && colorBtnRef.current ? colorBtnRef.current.getBoundingClientRect() : null;
  const linkMenuRect = showLinkMenu && linkBtnRef.current ? linkBtnRef.current.getBoundingClientRect() : null;
  const activeLinkHref = getLinkHref(savedRangeRef.current);

  const toolbarButtonStyle = (active: boolean, hovered = false): React.CSSProperties => ({
    width: 32,
    height: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    border: active ? '1px solid rgba(184,119,80,0.46)' : '1px solid transparent',
    background: active
      ? (hovered ? 'rgba(184,119,80,0.3)' : 'rgba(184,119,80,0.2)')
      : (hovered ? 'var(--c-hover)' : 'transparent'),
    color: active ? 'var(--c-line)' : (hovered ? 'var(--c-text-hi)' : 'var(--c-text-lo)'),
    cursor: 'pointer',
    transition: 'background 0.12s, border-color 0.12s, color 0.12s',
    flexShrink: 0,
  });
  const toolbarInsertButtonStyle = (active: boolean, hovered = false): React.CSSProperties => ({
    ...toolbarButtonStyle(active, hovered),
    width: 'auto',
    minWidth: 116,
    justifyContent: 'flex-start',
    gap: 8,
    padding: '0 10px',
    fontSize: 12,
    fontWeight: 700,
  });

  const menuShell = (rect: DOMRect | null, width = 176): React.CSSProperties => ({
    position: 'fixed',
    top: Math.min((rect?.bottom ?? 0) + 6, window.innerHeight - 220),
    left: Math.min((rect?.left ?? 0), window.innerWidth - width - 12),
    zIndex: 560,
    minWidth: width,
    padding: 6,
    background: 'var(--c-panel)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
  });
  const menuButtonStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 10px',
    border: 'none',
    background: 'transparent',
    color: 'var(--c-text-md)',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
    textAlign: 'left',
    borderRadius: 8,
    transition: 'background 0.12s, color 0.12s',
  };
  const menuHover = {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = 'var(--c-hover)';
      e.currentTarget.style.color = 'var(--c-text-hi)';
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.color = 'var(--c-text-md)';
    },
  };

  if (!anchor) return null;

  return (
    <>
      <div
        ref={floatingToolbarRef}
        data-selection-toolbar="true"
        style={{
          position: 'fixed',
          left: anchor.left,
          top: anchor.top,
          transform: 'translateX(-50%)',
          zIndex: 555,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          padding: 6,
          borderRadius: 16,
          background: 'var(--c-panel)',
          border: '1px solid var(--c-border)',
          boxShadow: '0 16px 38px rgba(0,0,0,0.34)',
          maxWidth: 'min(92vw, 340px)',
          overflow: 'visible',
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseDownCapture={onInteractionStart}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <button style={toolbarButtonStyle(document.queryCommandState('bold'), hoveredControl === 'bold')} onMouseDown={(e) => { e.preventDefault(); saveSelection(); execAndTick(() => document.execCommand('bold')); }} {...hoverHandlers('bold')} title="Bold"><b>B</b></button>
          <button style={{ ...toolbarButtonStyle(document.queryCommandState('italic'), hoveredControl === 'italic'), fontStyle: 'italic' }} onMouseDown={(e) => { e.preventDefault(); saveSelection(); execAndTick(() => document.execCommand('italic')); }} {...hoverHandlers('italic')} title="Italic"><i>I</i></button>
          <button style={{ ...toolbarButtonStyle(document.queryCommandState('underline'), hoveredControl === 'underline'), textDecoration: 'underline' }} onMouseDown={(e) => { e.preventDefault(); saveSelection(); execAndTick(() => document.execCommand('underline')); }} {...hoverHandlers('underline')} title="Underline">U</button>
          <button style={{ ...toolbarButtonStyle(document.queryCommandState('strikeThrough'), hoveredControl === 'strike'), textDecoration: 'line-through' }} onMouseDown={(e) => { e.preventDefault(); saveSelection(); execAndTick(() => document.execCommand('strikeThrough')); }} {...hoverHandlers('strike')} title="Strikethrough">S</button>
          <button
            ref={colorBtnRef}
            style={toolbarButtonStyle(showColorMenu, hoveredControl === 'color')}
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
              setShowColorMenu((v) => !v);
              setShowLinkMenu(false);
            }}
            {...hoverHandlers('color')}
            title="Text color and highlight"
          >
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span style={{ fontFamily: 'serif', fontSize: 12, fontWeight: 700, lineHeight: 1 }}>A</span>
              <span style={{ width: 12, height: 2.5, borderRadius: 999, background: 'currentColor', display: 'block' }} />
            </span>
          </button>
        </div>

        <div style={{ width: '100%', height: 1, background: 'var(--c-border)', opacity: 0.72 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <button
            style={toolbarInsertButtonStyle(isWikiLinkActive, hoveredControl === 'wiki-link')}
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
              restoreSelection();
              onWikilinkClick((e.currentTarget as HTMLButtonElement).getBoundingClientRect());
            }}
            {...hoverHandlers('wiki-link')}
            title={isWikiLinkActive ? 'Edit note link' : 'Link note'}
          >
            <IconWikiLink />
            <span>Link note</span>
          </button>
          <div style={{ width: 1, height: 24, background: 'var(--c-border)', opacity: 0.72, margin: '0 4px' }} />
          <button
            ref={linkBtnRef}
            style={toolbarButtonStyle(!!activeLinkHref || showLinkMenu, hoveredControl === 'link')}
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
              setLinkValue(getLinkHref(savedRangeRef.current));
              setShowLinkMenu((v) => !v);
              setShowColorMenu(false);
            }}
            {...hoverHandlers('link')}
            title="External link"
          >
            <IconLink />
          </button>
          <button style={toolbarButtonStyle(false, hoveredControl === 'inline-code')} onMouseDown={(e) => { e.preventDefault(); saveSelection(); restoreSelection(); toggleInlineCode(savedRangeRef.current); tick((n) => n + 1); }} {...hoverHandlers('inline-code')} title="Inline code"><IconCode /></button>
        </div>
      </div>

      {colorMenuRect && (
        <div ref={colorMenuRef} data-selection-toolbar="true" style={{ ...menuShell(colorMenuRect, 220), padding: 8 }} onMouseDown={(e) => e.stopPropagation()} onMouseDownCapture={onInteractionStart}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text-lo)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '2px 2px 8px' }}>
            Text color
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
            {DOCUMENT_TEXT_COLORS.map((colorOption) => (
              <button
                key={colorOption.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 34,
                  padding: '0 8px',
                  borderRadius: 8,
                  border: '1px solid transparent',
                  background: 'transparent',
                  color: 'var(--c-text-md)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: 'inherit',
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  restoreSelection();
                  if (colorOption.value === 'auto') document.execCommand('removeFormat', false);
                  else document.execCommand('foreColor', false, resolveDocumentColorValue(colorOption.value));
                  dispatchEditorInput();
                  setShowColorMenu(false);
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--c-hover)';
                  e.currentTarget.style.borderColor = 'var(--c-border)';
                  e.currentTarget.style.color = 'var(--c-text-hi)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.color = 'var(--c-text-md)';
                }}
                title={colorOption.label}
              >
                <span style={{ width: 12, height: 12, borderRadius: 999, background: colorOption.swatch, border: '1px solid rgba(255,255,255,0.18)', flexShrink: 0 }} />
                <span style={{ whiteSpace: 'nowrap' }}>{colorOption.label}</span>
              </button>
            ))}
          </div>
          <div style={{ height: 1, background: 'var(--c-border)', margin: '10px 2px 8px' }} />
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text-lo)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 2px 8px' }}>
            Highlight
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
            {[
              { label: 'Clear', value: 'transparent', swatch: 'transparent', border: '1px dashed var(--c-border)' },
              { label: 'Yellow', value: '#facc15', swatch: '#facc15' },
              { label: 'Green', value: '#86efac', swatch: '#86efac' },
              { label: 'Blue', value: '#93c5fd', swatch: '#93c5fd' },
            ].map((option) => (
              <button
                key={option.label}
                title={option.label}
                onMouseDown={(e) => {
                  e.preventDefault();
                  restoreSelection();
                  document.execCommand('styleWithCSS', false, 'true');
                  document.execCommand('hiliteColor', false, option.value);
                  dispatchEditorInput();
                  setShowColorMenu(false);
                }}
                style={{
                  minHeight: 30,
                  borderRadius: 8,
                  border: option.border ?? '1px solid rgba(255,255,255,0.12)',
                  background: option.swatch,
                  color: option.label === 'Clear' ? 'var(--c-text-lo)' : '#111827',
                  cursor: 'pointer',
                  fontSize: 10.5,
                  fontFamily: 'inherit',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {linkMenuRect && (
        <div ref={linkMenuRef} data-selection-toolbar="true" style={{ ...menuShell(linkMenuRect, 260), padding: 8 }} onMouseDown={(e) => e.stopPropagation()} onMouseDownCapture={onInteractionStart}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              value={linkValue}
              placeholder="https://example.com"
              onChange={(e) => setLinkValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  restoreSelection();
                  const href = linkValue.trim();
                  if (href) document.execCommand('createLink', false, href);
                  else document.execCommand('unlink', false);
                  dispatchEditorInput();
                  setShowLinkMenu(false);
                }
              }}
              style={{
                width: '100%',
                height: 34,
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid var(--c-border)',
                background: 'rgba(255,255,255,0.03)',
                color: 'var(--c-text-hi)',
                fontSize: 12,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                style={{
                  ...menuButtonStyle,
                  width: 'auto',
                  justifyContent: 'center',
                  padding: '7px 12px',
                  background: 'rgba(184,119,80,0.16)',
                  color: 'var(--c-line)',
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  restoreSelection();
                  const href = linkValue.trim();
                  if (href) document.execCommand('createLink', false, href);
                  else document.execCommand('unlink', false);
                  dispatchEditorInput();
                  setShowLinkMenu(false);
                }}
              >
                Apply link
              </button>
              {activeLinkHref && (
                <button
                  style={{ ...menuButtonStyle, width: 'auto', justifyContent: 'center', padding: '7px 12px' }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    restoreSelection();
                    document.execCommand('unlink', false);
                    dispatchEditorInput();
                    setLinkValue('');
                    setShowLinkMenu(false);
                  }}
                  {...menuHover}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
