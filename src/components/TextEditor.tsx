import { useEffect, useRef } from 'react';
import { useBoardStore } from '../store/boardStore';
import { StickyNoteNode, TextBlockNode, ShapeNode, SectionNode } from '../types';
import { useTheme } from '../theme';

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// Hidden div used for text measurement — created once, reused.
let _measureDiv: HTMLDivElement | null = null;

function measureStickyHeight(text: string, contentWidth: number): number {
  if (!_measureDiv) {
    _measureDiv = document.createElement('div');
    Object.assign(_measureDiv.style, {
      position: 'absolute',
      visibility: 'hidden',
      pointerEvents: 'none',
      top: '-9999px',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: '13px',
      lineHeight: '1.5',
      wordBreak: 'break-word',
      whiteSpace: 'pre-wrap',
      padding: '0',
    });
    document.body.appendChild(_measureDiv);
  }
  _measureDiv.style.width = `${Math.max(1, contentWidth)}px`;
  _measureDiv.textContent = text || '\u00a0';
  return Math.max(80, _measureDiv.scrollHeight + 20); // 10px top + 10px bottom padding
}

export default function TextEditor() {
  const t = useTheme();
  const { editingId, nodes, camera, updateNode, setEditingId, saveHistory } = useBoardStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const editingNode = nodes.find((n) => n.id === editingId) as
    | StickyNoteNode
    | TextBlockNode
    | ShapeNode
    | SectionNode
    | undefined;

  useEffect(() => {
    if (!editingId) return;
    if (editingNode?.type === 'section') {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
      if (editingNode?.type === 'textblock') {
        autoResize(textareaRef.current);
      }
    }
  }, [editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!editingId || !editingNode) return null;

  const sx = editingNode.x * camera.scale + camera.x;
  const sy = editingNode.y * camera.scale + camera.y;
  const sw = editingNode.width * camera.scale;

  // Small delay so iOS virtual keyboard animation doesn't cause a spurious blur
  const handleBlur = () => setTimeout(() => {
    if (document.activeElement !== textareaRef.current) setEditingId(null);
  }, 150);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditingId(null);
      return;
    }

    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const value = ta.value;

    // Auto-convert "- " at start of line to "• " for text blocks
    if (e.key === ' ' && editingNode?.type === 'textblock') {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      if (value.slice(lineStart, start) === '-') {
        e.preventDefault();
        const newValue = value.slice(0, lineStart) + '• ' + value.slice(start);
        updateNode(editingId!, { text: newValue });
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = lineStart + 2;
          autoResize(ta);
        });
        return;
      }
    }

    // Bullet list: auto-insert bullet on Enter
    const isStickyBullet = e.key === 'Enter' && editingNode?.type === 'sticky' && (editingNode as StickyNoteNode).bulletList;
    const isTextBullet   = e.key === 'Enter' && editingNode?.type === 'textblock' && (editingNode as TextBlockNode).bulletList;

    if (isStickyBullet) {
      e.preventDefault();
      const newValue = value.slice(0, start) + '\n• ' + value.slice(end);
      const newHeight = measureStickyHeight(newValue, (editingNode as StickyNoteNode).width - 20);
      updateNode(editingId!, { text: newValue, height: newHeight });
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 3;
      });
    }

    if (isTextBullet) {
      e.preventDefault();
      const newValue = value.slice(0, start) + '\n• ' + value.slice(end);
      updateNode(editingId!, { text: newValue });
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 3;
        autoResize(ta);
      });
    }
  };

  if (editingNode.type === 'section') {
    const sectionNode = editingNode as SectionNode;
    const labelText = sectionNode.name || 'Section';
    const pillW = Math.max(72, labelText.length * 8 + 24);
    const pillScreenX = (sectionNode.x + 12) * camera.scale + camera.x;
    const pillScreenY = (sectionNode.y - 13) * camera.scale + camera.y;
    const pillScreenW = pillW * camera.scale;
    const pillScreenH = 26 * camera.scale;
    const fs = Math.round(12 * camera.scale);
    return (
      <input
        ref={inputRef}
        value={sectionNode.name}
        onChange={(e) => updateNode(editingId, { name: e.target.value } as Parameters<typeof updateNode>[1])}
        onFocus={saveHistory}
        onBlur={() => setTimeout(() => {
          if (document.activeElement !== inputRef.current) setEditingId(null);
        }, 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();
            setEditingId(null);
          }
          e.stopPropagation();
        }}
        style={{
          position: 'absolute',
          left: pillScreenX + 10 * camera.scale,
          top: pillScreenY + (pillScreenH - fs * 1.3) / 2,
          width: pillScreenW - 20 * camera.scale,
          height: fs * 1.4,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: t.sectionLabelColor,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: fs,
          fontWeight: 'bold',
          zIndex: 200,
          padding: 0,
          caretColor: t.sectionLabelColor,
        }}
      />
    );
  }

  if (editingNode.type === 'shape') {
    const shapeNode = editingNode as ShapeNode;
    const shapeSH = shapeNode.height * camera.scale;
    const lum = (hex: string) => {
      if (hex === 'transparent' || !hex.startsWith('#')) return 200;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return (r * 299 + g * 587 + b * 114) / 1000;
    };
    const autoColor = lum(shapeNode.fill) < 128 ? '#e2e8f0' : '#1a1a2e';
    const textColor = shapeNode.fontColor ?? autoColor;
    const pad = 12 * camera.scale;
    const fs = Math.round((shapeNode.fontSize ?? 14) * camera.scale);
    return (
      <textarea
        ref={textareaRef}
        value={shapeNode.text ?? ''}
        onChange={(e) => updateNode(editingId, { text: e.target.value })}
        onFocus={saveHistory}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Label…"
        style={{
          position: 'absolute',
          left: sx + pad,
          top: sy + pad,
          width: sw - pad * 2,
          height: shapeSH - pad * 2,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          resize: 'none',
          fontSize: fs,
          lineHeight: 1.45,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontWeight: shapeNode.bold ? 'bold' : 'normal',
          fontStyle: shapeNode.italic ? 'italic' : 'normal',
          color: textColor,
          textAlign: shapeNode.textAlign ?? 'center',
          padding: 0,
          zIndex: 100,
          overflow: 'hidden',
          caretColor: textColor,
        }}
      />
    );
  }

  if (editingNode.type === 'textblock') {
    const tb = editingNode as TextBlockNode;
    const fs = Math.round(tb.fontSize * camera.scale);
    return (
      <textarea
        ref={textareaRef}
        value={tb.text}
        onChange={(e) => {
          updateNode(editingId, { text: e.target.value });
          autoResize(e.target);
        }}
        onFocus={saveHistory}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        style={{
          position: 'absolute',
          left: sx,
          top: sy,
          width: sw,
          minHeight: fs * 1.5,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          resize: 'none',
          fontSize: fs,
          lineHeight: 1.5,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontWeight: tb.bold ? 'bold' : 'normal',
          fontStyle: tb.italic ? 'italic' : 'normal',
          textDecoration: tb.underline ? 'underline' : 'none',
          color: tb.color,
          padding: 0,
          zIndex: 100,
          overflow: 'hidden',
          caretColor: tb.color,
        }}
      />
    );
  }

  // Sticky note
  const stickyNode = editingNode as StickyNoteNode;
  const sh = stickyNode.height * camera.scale;
  const fs = Math.round((stickyNode.fontSize ?? 13) * camera.scale);
  return (
    <textarea
      ref={textareaRef}
      value={editingNode.text}
      onChange={(e) => {
        const newText = e.target.value;
        const newHeight = measureStickyHeight(newText, stickyNode.width - 20);
        updateNode(editingId, { text: newText, height: newHeight });
      }}
      onFocus={saveHistory}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      style={{
        position: 'absolute',
        left: sx + 10,
        top: sy + 10,
        width: sw - 20,
        height: sh - 20,
        background: stickyNode.color,
        border: 'none',
        outline: 'none',
        resize: 'none',
        fontSize: fs,
        lineHeight: 1.5,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontWeight: stickyNode.bold ? 'bold' : 'normal',
        fontStyle: stickyNode.italic ? 'italic' : 'normal',
        color: '#1a1a2e',
        padding: 0,
        zIndex: 100,
        overflow: 'hidden',
        caretColor: '#1a1a2e',
      }}
    />
  );
}
