import { useRef, useEffect, useState } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { CodeBlockNode } from '../../types';
import { tokenizeLine, TOKEN_COLORS, CodeLanguage } from '../../utils/syntaxHighlight';

const FONT_FAMILY = "'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace";
const FONT_SIZE = 13;
const LINE_HEIGHT = 1.65;
const CODE_PADDING = '10px 14px';
const MIN_WIDTH = 320;
// 3 lines × (fontSize × lineHeight) + top/bottom padding
const MIN_HEIGHT = Math.ceil(3 * FONT_SIZE * LINE_HEIGHT) + 20;

const LANGUAGES: { value: CodeLanguage; label: string }[] = [
  { value: 'sql',        label: 'SQL' },
  { value: 'python',     label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'json',       label: 'JSON' },
  { value: 'bash',       label: 'Bash' },
  { value: 'text',       label: 'Plain' },
];

// ── Syntax-highlighted code renderer ────────────────────────────────────────

function HighlightedCode({
  code,
  language,
  showLineNumbers,
}: {
  code: string;
  language: CodeLanguage;
  showLineNumbers: boolean;
}) {
  const lines = code.split('\n');

  return (
    <div style={{ display: 'flex', minWidth: 0, flex: 1 }}>
      {showLineNumbers && (
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: FONT_SIZE,
            lineHeight: LINE_HEIGHT,
            color: '#3d3d5a',
            textAlign: 'right',
            userSelect: 'none',
            padding: CODE_PADDING,
            paddingRight: 10,
            paddingLeft: 14,
            borderRight: '1px solid rgba(255,255,255,0.05)',
            minWidth: 36,
            flexShrink: 0,
          }}
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
      )}
      <pre
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: FONT_SIZE,
          lineHeight: LINE_HEIGHT,
          margin: 0,
          padding: CODE_PADDING,
          paddingLeft: showLineNumbers ? 10 : 14,
          whiteSpace: 'pre',
          overflowX: 'hidden',
          flex: 1,
          color: '#c9d1d9',
        }}
      >
        {lines.map((line, idx) => (
          <div key={idx}>
            {tokenizeLine(line, language).map((tok, ti) => (
              <span key={ti} style={{ color: TOKEN_COLORS[tok.type] }}>
                {tok.text}
              </span>
            ))}
            {idx < lines.length - 1 && '\n'}
          </div>
        ))}
      </pre>
    </div>
  );
}

// ── Icon buttons ─────────────────────────────────────────────────────────────

function IconCopy() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <rect x="4" y="4" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 10V2h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconHash() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <line x1="4" y1="2" x2="3" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="10" y1="2" x2="9" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="1.5" y1="5.5" x2="12.5" y2="5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="1" y1="9" x2="12" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M2 4h10M5 4V2h4v2M6 6.5v4M8 6.5v4M3 4l1 8h6l1-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconGrip() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="4.5" cy="4.5" r="1" fill="currentColor" />
      <circle cx="7.5" cy="4.5" r="1" fill="currentColor" />
      <circle cx="4.5" cy="7.5" r="1" fill="currentColor" />
      <circle cx="7.5" cy="7.5" r="1" fill="currentColor" />
    </svg>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface Props {
  node: CodeBlockNode;
  isSelected: boolean;
}

export default function CodeBlock({ node, isSelected }: Props) {
  const { camera, updateNode, selectIds, deleteSelected, selectedIds } = useBoardStore();

  const dragRef = useRef<{ startMX: number; startMY: number; startNX: number; startNY: number } | null>(null);
  const resizeRef = useRef<{ startMX: number; startMY: number; startW: number; startH: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);

  // Global mouse handlers for drag/resize
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const dx = (e.clientX - dragRef.current.startMX) / camera.scale;
        const dy = (e.clientY - dragRef.current.startMY) / camera.scale;
        updateNode(node.id, {
          x: dragRef.current.startNX + dx,
          y: dragRef.current.startNY + dy,
        } as Partial<CodeBlockNode>);
      }
      if (resizeRef.current) {
        const dx = (e.clientX - resizeRef.current.startMX) / camera.scale;
        const dy = (e.clientY - resizeRef.current.startMY) / camera.scale;
        updateNode(node.id, {
          width: Math.max(MIN_WIDTH, resizeRef.current.startW + dx),
          height: Math.max(MIN_HEIGHT, resizeRef.current.startH + dy),
        } as Partial<CodeBlockNode>);
      }
    };
    const onUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [camera.scale, node.id, updateNode]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(node.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback: select all
    }
  };

  const handleDelete = () => {
    selectIds([node.id]);
    deleteSelected();
  };

  const handleCardMouseDown = (e: React.MouseEvent) => {
    // Don't interfere with interactive elements
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'INPUT' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('select') ||
      target.closest('input')
    ) return;
    e.stopPropagation();
    selectIds([node.id]);
  };

  const handleHeaderDragStart = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'SELECT' ||
      target.tagName === 'INPUT' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('select') ||
      target.closest('input')
    ) return;
    e.stopPropagation();
    selectIds([node.id]);
    dragRef.current = {
      startMX: e.clientX,
      startMY: e.clientY,
      startNX: node.x,
      startNY: node.y,
    };
  };

  const screenX = camera.x + node.x * camera.scale;
  const screenY = camera.y + node.y * camera.scale;

  return (
    <div
      onMouseDown={handleCardMouseDown}
      style={{
        position: 'absolute',
        left: screenX,
        top: screenY,
        width: node.width,
        transformOrigin: 'top left',
        transform: `scale(${camera.scale})`,
        borderRadius: 10,
        border: `1.5px solid ${isSelected ? '#6366f1' : 'rgba(255,255,255,0.09)'}`,
        boxShadow: isSelected
          ? '0 0 0 3px rgba(99,102,241,0.18), 0 8px 32px rgba(0,0,0,0.55)'
          : '0 4px 24px rgba(0,0,0,0.5)',
        background: '#13131e',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minWidth: MIN_WIDTH,
        userSelect: 'none',
        zIndex: isSelected ? 10 : 5,
      }}
    >
      {/* ── Header bar ──────────────────────────────────────────────────────── */}
      <div
        onMouseDown={handleHeaderDragStart}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 10px',
          background: '#0d0d18',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          cursor: 'grab',
          flexShrink: 0,
        }}
      >
        {/* Grip dots */}
        <span style={{ color: '#3a3a5a', flexShrink: 0, marginRight: 2 }}>
          <IconGrip />
        </span>

        {/* Language dropdown */}
        <select
          value={node.language}
          onChange={(e) => updateNode(node.id, { language: e.target.value as CodeLanguage } as Partial<CodeBlockNode>)}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 11,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 5,
            color: '#79b8ff',
            padding: '2px 6px',
            cursor: 'pointer',
            flexShrink: 0,
            outline: 'none',
            appearance: 'none',
            paddingRight: 20,
            backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%2379b8ff\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\'/%3E%3C/svg%3E")',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 6px center',
          }}
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>

        {/* Title */}
        {editingTitle ? (
          <input
            autoFocus
            value={node.title}
            onChange={(e) => updateNode(node.id, { title: e.target.value } as Partial<CodeBlockNode>)}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingTitle(false); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              fontFamily: FONT_FAMILY,
              fontSize: 12,
              fontWeight: 500,
              color: '#c9d1d9',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(99,102,241,0.5)',
              borderRadius: 4,
              padding: '2px 6px',
              outline: 'none',
              minWidth: 0,
            }}
          />
        ) : (
          <span
            onDoubleClick={() => { selectIds([node.id]); setEditingTitle(true); }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Double-click to rename"
            style={{
              flex: 1,
              fontFamily: FONT_FAMILY,
              fontSize: 12,
              fontWeight: 500,
              color: '#8888aa',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              cursor: 'text',
            }}
          >
            {node.title || 'Untitled'}
          </span>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0 }}>
          {/* Copy */}
          <button
            title={copied ? 'Copied!' : 'Copy code'}
            onClick={handleCopy}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              background: copied ? 'rgba(99,102,241,0.2)' : 'transparent',
              border: 'none',
              borderRadius: 5,
              width: 26,
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: copied ? '#6366f1' : '#5a5a7a',
              cursor: 'pointer',
              transition: 'color 0.15s, background 0.15s',
            }}
          >
            <IconCopy />
          </button>

          {/* Line numbers toggle */}
          <button
            title={node.showLineNumbers ? 'Hide line numbers' : 'Show line numbers'}
            onClick={() => updateNode(node.id, { showLineNumbers: !node.showLineNumbers } as Partial<CodeBlockNode>)}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              background: node.showLineNumbers ? 'rgba(99,102,241,0.2)' : 'transparent',
              border: 'none',
              borderRadius: 5,
              width: 26,
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: node.showLineNumbers ? '#6366f1' : '#5a5a7a',
              cursor: 'pointer',
              transition: 'color 0.15s, background 0.15s',
            }}
          >
            <IconHash />
          </button>

          {/* Trash */}
          <button
            title="Delete"
            onClick={handleDelete}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: 5,
              width: 26,
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#5a5a7a',
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#f97583'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#5a5a7a'; }}
          >
            <IconTrash />
          </button>
        </div>
      </div>

      {/* ── Code area ───────────────────────────────────────────────────────── */}
      <div
        style={{
          background: '#0c0c17',
          display: 'flex',
          height: node.height ?? 220,
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        {/* Scrollable inner — line numbers + code scroll together */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            overflowY: 'auto',
            overflowX: 'auto',
          }}
        >
          {node.showLineNumbers && (
            <div
              aria-hidden
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: FONT_SIZE,
                lineHeight: LINE_HEIGHT,
                color: '#3a3a58',
                textAlign: 'right',
                userSelect: 'none',
                padding: CODE_PADDING,
                paddingRight: 10,
                borderRight: '1px solid rgba(255,255,255,0.05)',
                minWidth: 36,
                flexShrink: 0,
                pointerEvents: 'none',
              }}
            >
              {node.code.split('\n').map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
          )}

          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            {/* Highlighted code — sits behind textarea */}
            <pre
              aria-hidden
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: FONT_SIZE,
                lineHeight: LINE_HEIGHT,
                margin: 0,
                padding: CODE_PADDING,
                whiteSpace: 'pre',
                color: '#c9d1d9',
                pointerEvents: 'none',
              }}
            >
              {node.code.split('\n').map((line, idx, arr) => (
                <div key={idx}>
                  {tokenizeLine(line, node.language).map((tok, ti) => (
                    <span key={ti} style={{ color: TOKEN_COLORS[tok.type] }}>{tok.text}</span>
                  ))}
                  {idx < arr.length - 1 && '\n'}
                </div>
              ))}
            </pre>

            {/* Textarea overlay — captures input, transparent text */}
            <textarea
              ref={textareaRef}
              value={node.code}
              onChange={(e) => {
                updateNode(node.id, { code: e.target.value } as Partial<CodeBlockNode>);
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                selectIds([node.id]);
              }}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                fontFamily: FONT_FAMILY,
                fontSize: FONT_SIZE,
                lineHeight: LINE_HEIGHT,
                padding: CODE_PADDING,
                margin: 0,
                background: 'transparent',
                color: 'transparent',
                caretColor: '#c9d1d9',
                border: 'none',
                outline: 'none',
                resize: 'none',
                overflow: 'hidden',
                whiteSpace: 'pre',
                tabSize: 2,
                zIndex: 2,
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      {(node.result || node.description) && (
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'baseline',
            gap: 12,
            background: '#0f0f1a',
            flexWrap: 'wrap',
          }}
        >
          {node.result && (
            <span
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: 11,
                color: '#5a9e6f',
                fontStyle: 'italic',
                flexShrink: 0,
              }}
            >
              ▶ {node.result}
            </span>
          )}
          {node.description && (
            <span
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: 11,
                color: '#5a5a7a',
              }}
            >
              <span style={{ color: '#3a3a5a', marginRight: 4 }}>What it does:</span>
              {node.description}
            </span>
          )}
        </div>
      )}

      {/* ── Resize handle (bottom-right) ────────────────────────────────────── */}
      <div
        title="Drag to resize"
        onMouseDown={(e) => {
          e.stopPropagation();
          resizeRef.current = {
            startMX: e.clientX,
            startMY: e.clientY,
            startW: node.width,
            startH: node.height,
          };
        }}
        style={{
          position: 'absolute',
          bottom: 4,
          right: 4,
          width: 16,
          height: 16,
          zIndex: 20,
          cursor: 'nwse-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isSelected ? '#6366f1' : '#3a3a5a',
          opacity: 0.8,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M9 1L1 9M9 5L5 9M9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
