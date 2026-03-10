import { useEffect, useRef } from 'react';
import { useBoardStore } from '../store/boardStore';
import { StickyNoteNode } from '../types';

export default function TextEditor() {
  const { editingId, nodes, camera, updateNode, setEditingId } = useBoardStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const editingNode = nodes.find((n) => n.id === editingId) as StickyNoteNode | undefined;

  useEffect(() => {
    if (editingId && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [editingId]);

  if (!editingId || !editingNode) return null;

  const sx = editingNode.x * camera.scale + camera.x;
  const sy = editingNode.y * camera.scale + camera.y;
  const sw = editingNode.width * camera.scale;
  const sh = editingNode.height * camera.scale;
  const fs = Math.round(13 * camera.scale);

  const handleBlur = () => setEditingId(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditingId(null);
    }
  };

  return (
    <textarea
      ref={textareaRef}
      value={editingNode.text}
      onChange={(e) => updateNode(editingId, { text: e.target.value })}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      style={{
        position: 'absolute',
        left: sx + 10,
        top: sy + 10,
        width: sw - 20,
        height: sh - 20,
        background: editingNode.color,
        border: 'none',
        outline: 'none',
        resize: 'none',
        fontSize: fs,
        lineHeight: 1.5,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        color: '#1a1a2e',
        padding: 0,
        zIndex: 100,
        overflow: 'hidden',
        caretColor: '#1a1a2e',
      }}
    />
  );
}
