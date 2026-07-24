import { useEffect, useRef } from 'react';
import { useBoardStore } from '../store/boardStore';
import { StickyNoteNode, TextBlockNode, ShapeNode, SectionNode } from '../types';
import { useTheme } from '../theme';
import { isRichText, sanitizeClipboardHtml, textToHtml } from '../utils/richText';
import { calculateDynamicFontSize } from '../utils/dynamicFontSize';

function getEffectiveFontSize(node: StickyNoteNode): number {
  if (node.fontSizeMode === 'dynamic') {
    return calculateDynamicFontSize(node.text, node.width, node.height);
  }
  return node.fontSize ?? 13;
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
  const stickyEditorRef = useRef<HTMLDivElement>(null);
  const textBlockEditorRef = useRef<HTMLDivElement>(null);
  const shapeEditorRef = useRef<HTMLDivElement>(null);
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
    } else if (editingNode?.type === 'textblock') {
      const div = textBlockEditorRef.current;
      if (!div) return;
      const tb = editingNode as TextBlockNode;
      div.innerHTML = isRichText(tb.text) ? tb.text : textToHtml(tb.text);
      div.focus();
      const range = document.createRange();
      range.selectNodeContents(div);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } else if (editingNode?.type === 'shape') {
      const div = shapeEditorRef.current;
      if (!div) return;
      const sn = editingNode as ShapeNode;
      const text = sn.text ?? '';
      div.innerHTML = isRichText(text) ? text : textToHtml(text);
      div.focus();
      const range = document.createRange();
      range.selectNodeContents(div);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!editingId || !editingNode) return null;

  const sx = editingNode.x * camera.scale + camera.x;
  const sy = editingNode.y * camera.scale + camera.y;
  const sw = editingNode.width * camera.scale;

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
    const fs = Math.round((shapeNode.fontSize ?? 14) * camera.scale);
    const vAlign = shapeNode.verticalAlign ?? 'middle';
    const justify = vAlign === 'top' ? 'flex-start' : vAlign === 'bottom' ? 'flex-end' : 'center';

    const syncShapeContent = () => {
      const div = shapeEditorRef.current;
      if (!div) return;
      updateNode(editingId, { text: div.innerHTML });
    };

    const handleShapeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setEditingId(null);
        return;
      }
      e.stopPropagation();
    };

    const handleShapePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
      const text = e.clipboardData.getData('text/plain');
      const html = e.clipboardData.getData('text/html');
      if (!html && !text) return;
      e.preventDefault();
      document.execCommand('insertHTML', false, sanitizeClipboardHtml(html, text));
      syncShapeContent();
    };

    return (
      <div
        style={{
          position: 'absolute',
          left: sx,
          top: sy,
          width: sw,
          height: shapeSH,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: justify,
          boxSizing: 'border-box',
          padding: pad,
          zIndex: 100,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        <div
          ref={shapeEditorRef}
          contentEditable
          suppressContentEditableWarning
          data-shape-editor="true"
          onInput={syncShapeContent}
          onFocus={saveHistory}
          onBlur={() => setTimeout(() => {
            if (document.activeElement !== shapeEditorRef.current) setEditingId(null);
          }, 150)}
          onKeyDown={handleShapeKeyDown}
          onPaste={handleShapePaste}
          style={{
            pointerEvents: 'auto',
            width: '100%',
            maxHeight: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: fs,
            lineHeight: 1.45,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: shapeNode.bold ? 'bold' : 'normal',
            fontStyle: shapeNode.italic ? 'italic' : 'normal',
            color: textColor,
            textAlign: shapeNode.textAlign ?? 'center',
            padding: 0,
            overflow: 'hidden',
            whiteSpace: 'normal',
            wordWrap: 'break-word',
            caretColor: textColor,
          }}
        />
      </div>
    );
  }

  if (editingNode.type === 'textblock') {
    const tb = editingNode as TextBlockNode;
    const fs = Math.round(tb.fontSize * camera.scale);
    const tbColor = tb.link ? '#60a5fa' : (tb.color === 'auto' ? t.textHi : tb.color);

    const syncTextBlockContent = () => {
      const div = textBlockEditorRef.current;
      if (!div) return;
      updateNode(editingId, { text: div.innerHTML });
    };

    const handleTextBlockKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setEditingId(null);
        return;
      }
      e.stopPropagation();
      if (e.key === 'Enter' && (editingNode as TextBlockNode).bulletList) {
        e.preventDefault();
        document.execCommand('insertHTML', false, '<br>• ');
        syncTextBlockContent();
      }
    };

    const handleTextBlockPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
      const text = e.clipboardData.getData('text/plain');
      const trimmedText = text.trim();
      if (trimmedText && /^https?:\/\/\S+$/i.test(trimmedText)) {
        e.preventDefault();
        const escaped = trimmedText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        document.execCommand(
          'insertHTML', false,
          `<a href="${escaped}" style="color:#60a5fa;text-decoration:underline;word-break:break-all">${escaped}</a>`,
        );
        syncTextBlockContent();
        return;
      }

      const html = e.clipboardData.getData('text/html');
      if (!html && !text) return;
      e.preventDefault();
      document.execCommand('insertHTML', false, sanitizeClipboardHtml(html, text));
      syncTextBlockContent();
    };

    return (
      <div
        ref={textBlockEditorRef}
        contentEditable
        suppressContentEditableWarning
        data-textblock-editor="true"
        onInput={syncTextBlockContent}
        onFocus={saveHistory}
        onBlur={() => setTimeout(() => {
          if (document.activeElement !== textBlockEditorRef.current) setEditingId(null);
        }, 150)}
        onKeyDown={handleTextBlockKeyDown}
        onPaste={handleTextBlockPaste}
        style={{
          position: 'absolute',
          left: sx,
          top: sy,
          width: sw,
          minHeight: fs * 1.5,
          background: 'transparent',
          border: 'none',
          outline: 'none',
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
          overflow: 'visible',
          caretColor: tbColor,
          whiteSpace: 'normal',
          wordWrap: 'break-word',
        }}
      />
    );
  }

  // Sticky note — contenteditable for inline rich text support
  const stickyNode = editingNode as StickyNoteNode;

  // Always use current text from node for font size calculation
  // (syncStickyContent updates it in real-time)
  // Use world-space font size directly (Konva applies camera scaling automatically)
  const worldFontSize = getEffectiveFontSize(stickyNode);
  const fs = worldFontSize * camera.scale;

  const syncStickyContent = () => {
    const div = stickyEditorRef.current;
    if (!div) return;
    const html = div.innerHTML;

    // For both modes, auto-expand height if content overflows.
    // Dynamic mode: font shrinks as text grows; height expands only if font hits its floor.
    const effectiveSize = stickyNode.fontSizeMode === 'dynamic'
      ? calculateDynamicFontSize(html.replace(/<[^>]*>/g, '').trim(), stickyNode.width, stickyNode.height)
      : (stickyNode.fontSize ?? 13);
    const neededHeight = measureStickyHeight(html, stickyNode.width - 20, effectiveSize, true);
    const newHeight = Math.max(stickyNode.height, neededHeight);
    updateNode(editingId, { text: html, height: newHeight });
  };

  const handleStickyPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData.getData('text/plain');
    const trimmedText = text.trim();
    if (trimmedText && /^https?:\/\/\S+$/i.test(trimmedText)) {
      e.preventDefault();
      const escaped = trimmedText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      document.execCommand(
        'insertHTML',
        false,
        `<a href="${escaped}" style="color:#60a5fa;text-decoration:underline;word-break:break-all">${escaped}</a>`,
      );
      syncStickyContent();
      return;
    }

    const html = e.clipboardData.getData('text/html');
    if (!html && !text) return;
    e.preventDefault();
    document.execCommand('insertHTML', false, sanitizeClipboardHtml(html, text));
    syncStickyContent();
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
        // No maxHeight — sticky auto-expands to fit content via syncStickyContent
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
        whiteSpace: 'normal',
        wordWrap: 'break-word',
        textRendering: 'geometricPrecision' as const,
      }}
    />
  );
}
