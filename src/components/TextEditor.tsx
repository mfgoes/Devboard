import { useEffect, useRef } from 'react';
import { useBoardStore } from '../store/boardStore';
import { StickyNoteNode, TextBlockNode, ShapeNode, SectionNode } from '../types';
import { useTheme } from '../theme';
import { isRichText, textToHtml } from '../utils/richText';

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// Hidden div used for text measurement — created once, reused.
let _measureDiv: HTMLDivElement | null = null;

function measureStickyHeight(content: string, contentWidth: number, fontSize = 13, html = false): number {
  if (!_measureDiv) {
    _measureDiv = document.createElement('div');
    Object.assign(_measureDiv.style, {
      position: 'absolute',
      visibility: 'hidden',
      pointerEvents: 'none',
      top: '-9999px',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      lineHeight: '1.5',
      padding: '0',
    });
    document.body.appendChild(_measureDiv);
  }
  _measureDiv.style.width = `${Math.max(1, contentWidth)}px`;
  _measureDiv.style.fontSize = `${fontSize}px`;
  if (html) {
    _measureDiv.style.whiteSpace = 'normal';
    _measureDiv.style.wordBreak = 'break-word';
    _measureDiv.innerHTML = content || '&nbsp;';
  } else {
    _measureDiv.style.whiteSpace = 'pre-wrap';
    _measureDiv.style.wordBreak = 'break-word';
    _measureDiv.textContent = content || '\u00a0';
  }
  return Math.max(80, _measureDiv.scrollHeight + 20); // 10px top + 10px bottom padding
}

export default function TextEditor() {
  const t = useTheme();
  const { editingId, nodes, camera, updateNode, setEditingId, saveHistory } = useBoardStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickyEditorRef = useRef<HTMLDivElement>(null);
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
    } else if (editingNode?.type === 'sticky') {
      const div = stickyEditorRef.current;
      if (!div) return;
      const sn = editingNode as StickyNoteNode;
      // Set initial HTML (convert plain text to HTML for contenteditable)
      div.innerHTML = isRichText(sn.text) ? sn.text : textToHtml(sn.text);
      div.focus();
      // Place cursor at end
      const range = document.createRange();
      range.selectNodeContents(div);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
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

    // Bullet list: auto-insert bullet on Enter (textblock only — sticky uses its own handler)
    const isTextBullet = e.key === 'Enter' && editingNode?.type === 'textblock' && (editingNode as TextBlockNode).bulletList;

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
          fontFamily: "'Plus Jakarta Sans', sans-serif",
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
    // Match Konva Text's x={8} y={8} padding exactly
    const pad = 8 * camera.scale;
    const innerH = shapeSH - pad * 2;
    const fs = Math.round((shapeNode.fontSize ?? 14) * camera.scale);
    // Approximate Konva's verticalAlign="middle": offset textarea down by half the empty space
    const lineH = fs * 1.45;
    const lineCount = Math.max(1, (shapeNode.text ?? '').split('\n').length);
    const textH = lineH * lineCount;
    const vOffset = Math.max(0, (innerH - textH) / 2);
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
          top: sy + pad + vOffset,
          width: sw - pad * 2,
          height: innerH - vOffset,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          resize: 'none',
          fontSize: fs,
          lineHeight: 1.45,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
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
    const tbColor = tb.link ? '#60a5fa' : (tb.color === 'auto' ? t.textHi : tb.color);
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
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: tb.bold ? 'bold' : 'normal',
          fontStyle: tb.italic ? 'italic' : 'normal',
          textDecoration: (tb.underline || tb.link) ? 'underline' : 'none',
          textAlign: tb.textAlign ?? 'left',
          color: tbColor,
          padding: 0,
          zIndex: 100,
          overflow: 'hidden',
          caretColor: tbColor,
        }}
      />
    );
  }

  // Sticky note — contenteditable for inline rich text support
  const stickyNode = editingNode as StickyNoteNode;
  const fs = Math.round((stickyNode.fontSize ?? 13) * camera.scale);

  const syncStickyContent = () => {
    const div = stickyEditorRef.current;
    if (!div) return;
    const html = div.innerHTML;
    const newHeight = Math.max(
      stickyNode.height,
      measureStickyHeight(html, stickyNode.width - 20, stickyNode.fontSize ?? 13, true),
    );
    updateNode(editingId, { text: html, height: newHeight });
  };

  const handleStickyPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData.getData('text/plain').trim();
    if (text && /^https?:\/\/\S+$/i.test(text)) {
      e.preventDefault();
      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      document.execCommand(
        'insertHTML',
        false,
        `<a href="${escaped}" style="color:#60a5fa;text-decoration:underline;word-break:break-all">${escaped}</a>`,
      );
      syncStickyContent();
    }
  };

  const handleStickyKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditingId(null);
      return;
    }
    e.stopPropagation();

    if (e.key === 'Enter' && stickyNode.bulletList) {
      e.preventDefault();
      document.execCommand('insertHTML', false, '<br>• ');
      syncStickyContent();
    }
  };

  return (
    <div
      ref={stickyEditorRef}
      contentEditable
      suppressContentEditableWarning
      data-sticky-editor="true"
      onInput={syncStickyContent}
      onFocus={saveHistory}
      onBlur={() => setTimeout(() => {
        if (document.activeElement !== stickyEditorRef.current) setEditingId(null);
      }, 150)}
      onPaste={handleStickyPaste}
      onKeyDown={handleStickyKeyDown}
      style={{
        position: 'absolute',
        // Sit exactly over the Konva text area (10 world-units of padding, scaled)
        left: sx + 10 * camera.scale,
        top: sy + 10 * camera.scale,
        width: sw - 20 * camera.scale,
        minHeight: (stickyNode.height - 20) * camera.scale,
        // Transparent so the Konva card (background, shadow, corner fold) shows through
        background: 'transparent',
        border: 'none',
        outline: 'none',
        fontSize: fs,
        lineHeight: 1.5,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontWeight: stickyNode.bold ? 'bold' : 'normal',
        fontStyle: stickyNode.italic ? 'italic' : 'normal',
        textDecoration: stickyNode.underline ? 'underline' : 'none',
        color: '#1a1a2e',
        caretColor: '#1a1a2e',
        padding: 0,
        zIndex: 100,
        overflow: 'hidden',
        wordBreak: 'break-word',
      }}
    />
  );
}
