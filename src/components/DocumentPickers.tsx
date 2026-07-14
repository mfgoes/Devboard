import { useState, useRef, useEffect, useMemo } from 'react';
import { CanvasNode, Document } from '../types';
import { stripHtml, getNodeLabel } from './documentModeUtils';
import { type DocumentCommandDefinition } from './documentCommands';
import { IconCodeBlock, IconHorizontalRule, IconLink, IconList, IconListOrdered, IconNodeLink, IconQuote, IconWikiLink } from './icons';
import './DocumentMode.css';

// Popover/picker components used by DocumentMode: wiki-link search, canvas-node
// search, the note emoji picker, and the slash-command palette. Extracted to keep
// DocumentMode focused on the editor itself.


export const PICKER_WIDTH = 280;

interface WikilinkPickerProps {
  pos: { x: number; y: number };
  documents: Document[];
  activeDocId: string | null;
  initialQuery?: string;
  onSelect: (title: string) => void;
  onCreate: (title: string) => void;
  onClose: () => void;
}

export function WikilinkPicker({ pos, documents, activeDocId, initialQuery = '', onSelect, onCreate, onClose }: WikilinkPickerProps) {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    if (initialQuery) inputRef.current?.select();
  }, [initialQuery]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return documents
      .filter((d) => d.id !== activeDocId && (!q || d.title.toLowerCase().includes(q) || stripHtml(d.content).toLowerCase().includes(q)))
      .slice(0, 8);
  }, [query, documents, activeDocId]);

  const exactMatch = documents.some((d) => d.title.toLowerCase() === query.toLowerCase().trim() && d.id !== activeDocId);
  const width = Math.min(PICKER_WIDTH, Math.max(180, window.innerWidth - 24));
  const left = Math.max(12, Math.min(pos.x, window.innerWidth - width - 12));
  const top = Math.max(12, Math.min(pos.y, window.innerHeight - 280));

  return (
    <>
      <div className="document-mode-overlay" onMouseDown={onClose} />
      <div className="document-picker" style={{ left, top, width }}>
        <div className="document-picker__header">
          <svg className="document-picker__header-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="1" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M3 4.5h6M3 6.5h6M3 8.5h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); onClose(); }
              if (e.key === 'Enter') {
                e.preventDefault();
                if (filtered.length > 0) onSelect(filtered[0].title);
                else if (query.trim()) onCreate(query.trim());
              }
            }}
            placeholder="Search notes…"
            className="document-picker__input"
          />
        </div>
        <div className="document-picker__list">
          {filtered.map((d) => (
            <div
              key={d.id}
              onMouseDown={(e) => { e.preventDefault(); onSelect(d.title); }}
              className="document-picker__row"
            >
              <div className="document-picker__title">
                {d.title || 'Untitled'}
              </div>
              <div className="document-picker__subtitle">
                {stripHtml(d.content).slice(0, 80) || 'Empty'}
              </div>
            </div>
          ))}
          {query.trim() && !exactMatch && (
            <div
              onMouseDown={(e) => { e.preventDefault(); onCreate(query.trim()); }}
              className="document-picker__row document-picker__row--create"
              data-has-results={filtered.length > 0}
            >
              <span className="document-picker__create-icon">+</span>
              <span className="document-picker__create-label">New note: <b className="document-picker__create-title">"{query.trim()}"</b></span>
            </div>
          )}
          {filtered.length === 0 && query.trim() && (
            <div className="document-picker__hint">
              No matching notes. Clear the search to browse existing notes.
            </div>
          )}
          {filtered.length === 0 && !query.trim() && (
            <div className="document-picker__empty">No other notes yet</div>
          )}
        </div>
      </div>
    </>
  );
}

interface NodePickerProps {
  pos: { x: number; y: number };
  nodes: CanvasNode[];
  documents: Document[];
  onSelect: (nodeId: string, label: string) => void;
  onClose: () => void;
}

export function NodePicker({ pos, nodes, documents, onSelect, onClose }: NodePickerProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const SKIP_TYPES = new Set(['connector']);
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return nodes
      .filter((n) => !SKIP_TYPES.has(n.type))
      .map((n) => ({ node: n, label: getNodeLabel(n, documents) }))
      .filter(({ label }) => !q || label.toLowerCase().includes(q))
      .slice(0, 10);
  }, [query, nodes, documents]);

  const width = Math.min(PICKER_WIDTH, Math.max(180, window.innerWidth - 24));
  const pickerLeft = Math.max(12, Math.min(pos.x, window.innerWidth - width - 12));
  const pickerTop = Math.max(12, Math.min(pos.y, window.innerHeight - 280));

  const typeIcon = (type: string) => {
    if (type === 'sticky') return '📌';
    if (type === 'document') return '📄';
    if (type === 'shape') return '◻';
    if (type === 'section') return '□';
    if (type === 'taskcard') return '☑';
    if (type === 'codeblock') return '{}';
    if (type === 'textblock') return 'T';
    return '·';
  };

  return (
    <>
      <div className="document-mode-overlay" onMouseDown={onClose} />
      <div className="document-picker" style={{ left: pickerLeft, top: pickerTop, width }}>
        <div className="document-picker__header">
          <svg className="document-picker__header-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="2" width="10" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); onClose(); }
              if (e.key === 'Enter' && filtered.length > 0) {
                e.preventDefault();
                onSelect(filtered[0].node.id, filtered[0].label);
              }
            }}
            placeholder="Search canvas nodes…"
            className="document-picker__input"
          />
        </div>
        <div className="document-picker__list">
          {filtered.map(({ node, label }) => (
            <div
              key={node.id}
              onMouseDown={(e) => { e.preventDefault(); onSelect(node.id, label); }}
              className="document-picker__row document-picker__row--node"
            >
              <span className="document-picker__node-type-icon">{typeIcon(node.type)}</span>
              <span className="document-picker__node-label">{label}</span>
              <span className="document-picker__node-type">{node.type}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="document-picker__empty">No canvas nodes found</div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Doc emoji picker ─────────────────────────────────────────────────────────

const DOC_EMOJIS = [
  '📝','📋','📌','📍','📎','📁','🗂️','🗒️','🗓️','📅',
  '💡','🔦','🕯️','🔍','🔎','🔑','🔒','🔓','⚙️','🛠️',
  '🚀','🛸','🌍','🌙','☀️','⭐','🌟','✨','💫','🌈',
  '🔥','⚡','❄️','💧','🌊','🍀','🌸','🌺','🌻','🍁',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💎','🏆',
  '🎯','🎨','🎮','🎵','🎸','🎲','🧩','⚽','🎉','🎊',
  '😀','😊','🤔','😎','🥳','🫡','👀','🦁','🐯','🦄',
  '✅','❌','⚠️','💬','📈','📉','💻','📡','🧪','🔭',
];

interface DocEmojiPickerProps {
  pos: { x: number; y: number };
  current?: string;
  onSelect: (emoji: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function DocEmojiPicker({ pos, current, onSelect, onRemove, onClose }: DocEmojiPickerProps) {
  const COLS = 10;
  const left = Math.min(pos.x, window.innerWidth - COLS * 34 - 24);
  const top = Math.min(pos.y, window.innerHeight - 260 - 12);
  return (
    <>
      <div className="document-mode-overlay" onMouseDown={onClose} />
      <div className="doc-emoji-picker" style={{ left, top }}>
        <div className="doc-emoji-picker__grid" style={{ width: COLS * 34 }}>
          {DOC_EMOJIS.map((e) => (
            <button
              key={e}
              onMouseDown={(ev) => { ev.preventDefault(); onSelect(e); }}
              className="doc-emoji-picker__button"
              data-current={e === current}
            >{e}</button>
          ))}
        </div>
        {current && (
          <div className="doc-emoji-picker__remove-wrap">
            <button
              onMouseDown={(e) => { e.preventDefault(); onRemove(); }}
              className="doc-emoji-picker__remove"
            >Remove icon</button>
          </div>
        )}
      </div>
    </>
  );
}

type SlashCommand = DocumentCommandDefinition;

interface SlashCommandPaletteProps {
  pos: { x: number; y: number; bounds?: { left: number; right: number; top: number; bottom: number } };
  commands: SlashCommand[];
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

export function SlashCommandPalette({ pos, commands, onSelect, onClose }: SlashCommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((command) => command.search.includes(q));
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (activeIndex < filtered.length) return;
    setActiveIndex(filtered.length > 0 ? filtered.length - 1 : 0);
  }, [activeIndex, filtered.length]);

  const grouped = useMemo(() => {
    return filtered.reduce<Record<string, SlashCommand[]>>((acc, command) => {
      if (!acc[command.group]) acc[command.group] = [];
      acc[command.group].push(command);
      return acc;
    }, {});
  }, [filtered]);

  const activeCommand = filtered[activeIndex] ?? null;
  const paletteWidth = 318;
  const paletteHeight = 360;
  const previewWidth = 196;
  const bounds = pos.bounds;
  const minLeft = bounds ? bounds.left + 8 : 12;
  const maxLeft = bounds ? bounds.right - paletteWidth - 8 : window.innerWidth - paletteWidth - 12;
  const left = Math.max(minLeft, Math.min(pos.x - 18, maxLeft));
  const top = Math.max(bounds ? bounds.top + 8 : 16, Math.min(pos.y - 16, window.innerHeight - paletteHeight - 12));
  const previewLeftCandidate = left + paletteWidth + 12;
  const previewMaxRight = bounds ? bounds.right - 8 : window.innerWidth - 12;
  const previewFitsRight = previewLeftCandidate + previewWidth <= previewMaxRight;
  const previewLeft = previewFitsRight ? previewLeftCandidate : null;
  let absoluteIndex = -1;

  const renderSlashIcon = (command: SlashCommand) => {
    switch (command.id) {
      case 'text': return <span className="doc-slash-icon-text doc-slash-icon-text--body">T</span>;
      case 'heading-1': return <span className="doc-slash-icon-text doc-slash-icon-text--heading">H1</span>;
      case 'heading-2': return <span className="doc-slash-icon-text doc-slash-icon-text--heading">H2</span>;
      case 'bullet-list': return <IconList />;
      case 'numbered-list': return <IconListOrdered />;
      case 'todo-list': return <span className="doc-slash-icon-text doc-slash-icon-text--todo">☐</span>;
      case 'quote': return <IconQuote />;
      case 'callout': return <IconQuote />;
      case 'code-block': return <IconCodeBlock />;
      case 'divider': return <IconHorizontalRule />;
      case 'external-link': return <IconLink />;
      case 'wiki-link': return <IconWikiLink />;
      case 'node-link': return <IconNodeLink />;
      case 'tag': return <span className="doc-slash-icon-text doc-slash-icon-text--tag">#</span>;
      case 'image-upload':
        return (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <rect x="1.2" y="1.8" width="10.6" height="8.4" rx="1.6" stroke="currentColor" strokeWidth="1.1" />
            <path d="M2.5 8.5 5.1 6l1.8 1.8 1.7-1.5 1.9 2.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="4.1" cy="4.5" r="0.8" fill="currentColor" />
          </svg>
        );
      default: return <span className="doc-slash-icon-text doc-slash-icon-text--default">{command.glyph}</span>;
    }
  };

  const renderPreview = (command: SlashCommand | null) => {
    if (!command) return null;
    if (command.id === 'heading-2') {
      return <div className="doc-slash-preview-heading">Heading 2</div>;
    }
    if (command.id === 'bullet-list') {
      return <div className="doc-slash-preview-list">• First item<br />• Second item</div>;
    }
    if (command.id === 'numbered-list') {
      return <div className="doc-slash-preview-list">1. First step<br />2. Second step</div>;
    }
    if (command.id === 'todo-list') {
      return <div className="doc-slash-preview-list">☐ First task<br />☐ Second task</div>;
    }
    if (command.id === 'quote') {
      return <div className="doc-slash-preview-quote">Quoted idea or passage</div>;
    }
    if (command.id === 'callout') {
      return <div className="doc-slash-preview-callout">Callout block</div>;
    }
    if (command.id === 'code-block') {
      return <div className="doc-slash-preview-code">const note = "code";</div>;
    }
    if (command.id === 'divider') {
      return <div className="doc-slash-preview-rule" />;
    }
    if (command.id === 'external-link') {
      return <div className="doc-slash-preview-link">https://example.com</div>;
    }
    if (command.id === 'tag') {
      return <div className="doc-slash-preview-tag">#tag</div>;
    }
    if (command.id === 'image-upload') {
      return <div className="doc-slash-preview-image">Paste, drop, or pick an image</div>;
    }
    return <div className="doc-slash-preview-default">{command.label}</div>;
  };

  return (
    <>
      <div className="document-mode-overlay" onMouseDown={onClose} />
      <div
        className="doc-slash-palette"
        style={{ left, top }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="doc-slash-palette__header">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
                return;
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((current) => (filtered.length === 0 ? 0 : Math.min(current + 1, filtered.length - 1)));
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((current) => (filtered.length === 0 ? 0 : Math.max(current - 1, 0)));
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                const active = filtered[activeIndex];
                if (active) onSelect(active);
              }
            }}
            placeholder="Type to search"
            className="doc-slash-palette__input"
          />
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              onClose();
            }}
            className="doc-slash-palette__close"
            title="Close menu"
          >
            ×
          </button>
        </div>
        <div className="doc-slash-palette__list">
          {(['Basic', 'Link', 'Media', 'Meta'] as const).map((group) => {
            const groupCommands = grouped[group] ?? [];
            if (groupCommands.length === 0) return null;
            return (
              <div key={group} className="doc-slash-palette__group">
                <div className="doc-slash-palette__group-label">
                  {group}
                </div>
                {groupCommands.map((command) => {
                  absoluteIndex += 1;
                  const commandIndex = absoluteIndex;
                  const active = commandIndex === activeIndex;
                  return (
                    <button
                      key={command.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onSelect(command);
                      }}
                      onMouseEnter={() => setActiveIndex(commandIndex)}
                      className="doc-slash-palette__command"
                      data-active={active}
                    >
                      <span className="doc-slash-palette__command-icon">
                        {renderSlashIcon(command)}
                      </span>
                      <span className="doc-slash-palette__command-label">
                        {command.label}
                      </span>
                      {command.hint && (
                        <span className="doc-slash-palette__command-hint">
                          {command.hint}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="doc-slash-palette__empty">
              No matching blocks
            </div>
          )}
        </div>
        <div className="doc-slash-palette__footer">
          <span>Enter to insert</span>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              onClose();
            }}
            className="doc-slash-palette__footer-close"
          >
            Close menu · Esc
          </button>
        </div>
      </div>
      {previewLeft !== null && activeCommand && (
        <div
          className="doc-slash-preview-card"
          style={{ left: previewLeft, top: Math.min(top + 88, (bounds ? bounds.bottom : window.innerHeight) - 188) }}
        >
          <div className="doc-slash-preview-card__eyebrow">
            Preview
          </div>
          <div className="doc-slash-preview-card__title">{activeCommand.label}</div>
          <div className="doc-slash-preview-card__description">{activeCommand.description}</div>
          <div className="doc-slash-preview-card__sample">{renderPreview(activeCommand)}</div>
        </div>
      )}
    </>
  );
}
