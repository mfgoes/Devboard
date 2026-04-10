import { useRef, useState, useCallback, useEffect } from 'react';
import { TaskCardNode as TaskCardNodeType, TaskItem, Camera, AnchorSide } from '../../types';
import { useBoardStore } from '../../store/boardStore';

function generateId() { return Math.random().toString(36).slice(2, 11); }

interface Props {
  node: TaskCardNodeType;
  camera: Camera;
  isSelected: boolean;
  isDrawingLine?: boolean;
  snapAnchor?: AnchorSide | null;
  onAnchorDown?: (nodeId: string, side: AnchorSide, worldX: number, worldY: number) => void;
  onAnchorEnter?: (nodeId: string, side: AnchorSide) => void;
  onAnchorLeave?: () => void;
}

const ACCENT_COLORS = [
  '#ec4899', // pink
  '#6366f1', // indigo
  '#22c55e', // green
  '#f59e0b', // amber
  '#38bdf8', // sky
  '#f87171', // red
];

export default function TaskCardNode({ node, camera, isSelected, isDrawingLine, snapAnchor, onAnchorDown, onAnchorEnter, onAnchorLeave }: Props) {
  const { updateNode, selectIds, setActiveTool, saveHistory, deleteSelected, selectedIds, activeTool } = useBoardStore();

  const [addingText, setAddingText] = useState('');
  const [hoveredAnchor, setHoveredAnchor] = useState<AnchorSide | null>(null);
  const [cardScreenH, setCardScreenH] = useState(0);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskText, setEditingTaskText] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleText, setTitleText] = useState(node.title);
  const [hovered, setHovered] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Drag state
  const dragState = useRef<{
    startMouseX: number;
    startMouseY: number;
    startNodeX: number;
    startNodeY: number;
  } | null>(null);

  // Convert world coords to screen
  const screenX = node.x * camera.scale + camera.x;
  const screenY = node.y * camera.scale + camera.y;
  const screenW = node.width * camera.scale;

  const completedCount = node.tasks.filter((t) => t.done).length;
  const totalCount = node.tasks.length;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('input, button, [data-interactive]')) return;
    e.preventDefault();
    e.stopPropagation();
    (e.nativeEvent as Event).stopImmediatePropagation();
    selectIds([node.id]);
    setActiveTool('select');

    dragState.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startNodeX: node.x,
      startNodeY: node.y,
    };

    const onMouseMove = (me: MouseEvent) => {
      if (!dragState.current) return;
      const dx = (me.clientX - dragState.current.startMouseX) / camera.scale;
      const dy = (me.clientY - dragState.current.startMouseY) / camera.scale;
      updateNode(node.id, {
        x: dragState.current.startNodeX + dx,
        y: dragState.current.startNodeY + dy,
      });
    };

    const onMouseUp = () => {
      if (dragState.current) {
        saveHistory();
        dragState.current = null;
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [node, camera.scale, selectIds, setActiveTool, updateNode, saveHistory]);

  const toggleTask = useCallback((taskId: string) => {
    const updated = node.tasks.map((t) =>
      t.id === taskId ? { ...t, done: !t.done } : t
    );
    updateNode(node.id, { tasks: updated });
  }, [node, updateNode]);

  const addTask = useCallback(() => {
    const text = addingText.trim();
    if (!text) return;
    const newTask: TaskItem = { id: generateId(), text, done: false };
    updateNode(node.id, { tasks: [...node.tasks, newTask] });
    setAddingText('');
    addInputRef.current?.focus();
  }, [addingText, node, updateNode]);

  const deleteTask = useCallback((taskId: string) => {
    updateNode(node.id, { tasks: node.tasks.filter((t) => t.id !== taskId) });
  }, [node, updateNode]);

  const saveTaskEdit = useCallback(() => {
    if (!editingTaskId) return;
    const text = editingTaskText.trim();
    if (text) {
      updateNode(node.id, {
        tasks: node.tasks.map((t) => t.id === editingTaskId ? { ...t, text } : t),
      });
    }
    setEditingTaskId(null);
    setEditingTaskText('');
  }, [editingTaskId, editingTaskText, node, updateNode]);

  const commitTitle = useCallback(() => {
    const text = titleText.trim() || 'Untitled';
    updateNode(node.id, { title: text });
    setEditingTitle(false);
  }, [titleText, node.id, updateNode]);

  // Cycle accent color on dot click
  const cycleColor = useCallback(() => {
    const cur = node.color ?? ACCENT_COLORS[0];
    const idx = ACCENT_COLORS.indexOf(cur);
    const next = ACCENT_COLORS[(idx + 1) % ACCENT_COLORS.length];
    updateNode(node.id, { color: next });
  }, [node, updateNode]);

  // Keep title state in sync when node changes externally
  useEffect(() => {
    if (!editingTitle) setTitleText(node.title);
  }, [node.title, editingTitle]);

  // Track rendered height — local state drives dot positioning immediately;
  // world-space value is also persisted to the store for snap-detection.
  useEffect(() => {
    if (!cardRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0].contentRect.height;
      setCardScreenH(h);                              // instant local update
      const worldH = Math.round(h / camera.scale);
      if (Math.abs(worldH - (node.height ?? 0)) > 1) {
        updateNode(node.id, { height: worldH });      // persist for connectors
      }
    });
    ro.observe(cardRef.current);
    return () => ro.disconnect();
  }, [node.id, node.height, camera.scale, updateNode]);

  const accentColor = node.color ?? ACCENT_COLORS[0];
  const theme = document.documentElement.getAttribute('data-theme') === 'dark' || false;

  return (
    <div
      style={{
        position: 'absolute',
        left: screenX,
        top: screenY,
        width: screenW,
        transformOrigin: 'top left',
        zIndex: isSelected ? 200 : 100,
        pointerEvents: isDrawingLine ? 'none' : 'all',
        userSelect: 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('input, button, [data-interactive]')) {
          e.stopPropagation();
          (e.nativeEvent as Event).stopImmediatePropagation();
          selectIds([node.id]);
          setActiveTool('select');
        }
      }}
    >
      <div
        ref={cardRef}
        onMouseDown={handleMouseDown}
        style={{
          background: 'var(--c-panel)',
          border: isSelected
            ? '2px solid #6366f1'
            : hovered
            ? '2px solid var(--c-border)'
            : '2px solid var(--c-border)',
          borderRadius: 12,
          boxShadow: isSelected
            ? '0 0 0 3px rgba(99,102,241,0.18), 0 8px 32px rgba(0,0,0,0.22)'
            : '0 4px 20px rgba(0,0,0,0.18)',
          overflow: 'hidden',
          cursor: 'grab',
          minWidth: Math.max(40, 200 * camera.scale),
          fontSize: `${13 * camera.scale}px`,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: `${8 * camera.scale}px`,
            padding: `${10 * camera.scale}px ${12 * camera.scale}px`,
            borderBottom: '1px solid var(--c-border)',
            cursor: 'grab',
          }}
        >
          {/* Accent dot — click to cycle color */}
          <button
            data-interactive
            onClick={(e) => { e.stopPropagation(); cycleColor(); }}
            style={{
              width: `${10 * camera.scale}px`,
              height: `${10 * camera.scale}px`,
              borderRadius: '50%',
              background: accentColor,
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0,
              padding: 0,
            }}
            title="Change color"
          />

          {/* Title */}
          {editingTitle ? (
            <input
              ref={titleInputRef}
              data-interactive
              value={titleText}
              onChange={(e) => setTitleText(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle();
                if (e.key === 'Escape') { setEditingTitle(false); setTitleText(node.title); }
                e.stopPropagation();
              }}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--c-text-hi)',
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                fontSize: `${13 * camera.scale}px`,
                padding: 0,
              }}
              autoFocus
            />
          ) : (
            <span
              onDoubleClick={(e) => { e.stopPropagation(); setEditingTitle(true); }}
              style={{
                flex: 1,
                color: 'var(--c-text-hi)',
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                fontSize: `${13 * camera.scale}px`,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                cursor: 'grab',
              }}
              title="Double-click to rename"
            >
              {node.title || 'Untitled'}
            </span>
          )}

          {/* Task count badge */}
          {totalCount > 0 && (
            <span
              style={{
                background: 'var(--c-hover)',
                color: 'var(--c-text-lo)',
                borderRadius: 99,
                padding: `${2 * camera.scale}px ${6 * camera.scale}px`,
                fontSize: `${10 * camera.scale}px`,
                fontFamily: "'JetBrains Mono', monospace",
                flexShrink: 0,
              }}
            >
              {completedCount}/{totalCount}
            </span>
          )}
        </div>

        {/* Task list */}
        <div style={{ padding: `${6 * camera.scale}px ${8 * camera.scale}px` }}>
          {node.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              isEditing={editingTaskId === task.id}
              editText={editingTaskId === task.id ? editingTaskText : task.text}
              scale={camera.scale}
              hovered={hovered}
              onToggle={() => toggleTask(task.id)}
              onStartEdit={() => { setEditingTaskId(task.id); setEditingTaskText(task.text); }}
              onEditChange={setEditingTaskText}
              onSaveEdit={saveTaskEdit}
              onCancelEdit={() => { setEditingTaskId(null); setEditingTaskText(''); }}
              onDelete={() => deleteTask(task.id)}
            />
          ))}

          {/* Add task input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: `${6 * camera.scale}px`,
              padding: `${4 * camera.scale}px ${4 * camera.scale}px`,
              opacity: hovered || addingText ? 1 : 0.5,
              transition: 'opacity 0.15s',
            }}
          >
            <span style={{
              color: 'var(--c-text-lo)',
              fontSize: `${12 * camera.scale}px`,
              fontFamily: "'JetBrains Mono', monospace",
            }}>+</span>
            <input
              ref={addInputRef}
              data-interactive
              placeholder="Add task…"
              value={addingText}
              onChange={(e) => setAddingText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addTask();
                if (e.key === 'Escape') setAddingText('');
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--c-text-hi)',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: `${12 * camera.scale}px`,
                padding: 0,
              }}
            />
            {addingText && (
              <span style={{
                color: 'var(--c-text-off)',
                fontSize: `${10 * camera.scale}px`,
                fontFamily: "'JetBrains Mono', monospace",
              }}>Enter ↵</span>
            )}
          </div>
        </div>
      </div>

      {/* Connector anchor dots — left + right, visible when selected or in line mode */}
      {(isSelected || activeTool === 'line' || isDrawingLine) && cardScreenH > 0 && (() => {
        const screenH = cardScreenH;
        const hh = screenH / camera.scale / 2;
        const worldPos = {
          left:  { x: node.x,              y: node.y + hh },
          right: { x: node.x + node.width,  y: node.y + hh },
        } as Record<AnchorSide, { x: number; y: number }>;

        return (['left', 'right'] as AnchorSide[]).map((side) => {
          const isSnap    = snapAnchor === side;
          const isHovered = hoveredAnchor === side;
          const active    = isSnap || isHovered;
          const DOT       = active ? 10 : 7;
          const topPos    = screenH / 2 - DOT / 2;
          const leftPos   = side === 'left' ? -DOT / 2 : screenW - DOT / 2;
          const GHOST_LEN = 72 * camera.scale;

          return (
            <div key={side} style={{ position: 'absolute', left: leftPos, top: topPos, zIndex: 300, pointerEvents: 'all' }}>
              {/* Dashed ghost ray on hover */}
              {isHovered && (
                <div style={{
                  position: 'absolute',
                  top: DOT / 2,
                  left: side === 'left' ? -(GHOST_LEN + DOT / 2) : DOT / 2,
                  width: GHOST_LEN,
                  height: 0,
                  borderTop: '2px dashed #6366f1',
                  opacity: 0.35,
                  pointerEvents: 'none',
                }} />
              )}
              {/* Dot */}
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onAnchorDown?.(node.id, side, worldPos[side].x, worldPos[side].y);
                }}
                onMouseEnter={() => { setHoveredAnchor(side); onAnchorEnter?.(node.id, side); }}
                onMouseLeave={() => { setHoveredAnchor(null); onAnchorLeave?.(); }}
                style={{
                  width: DOT,
                  height: DOT,
                  borderRadius: '50%',
                  background: active ? '#6366f1' : 'var(--c-panel)',
                  border: '2px solid #6366f1',
                  cursor: 'crosshair',
                  boxShadow: active ? '0 0 0 3px rgba(99,102,241,0.25)' : 'none',
                  transition: 'width 0.1s, height 0.1s, background 0.1s, box-shadow 0.1s',
                }}
              />
            </div>
          );
        });
      })()}
    </div>
  );
}

interface TaskRowProps {
  task: TaskItem;
  isEditing: boolean;
  editText: string;
  scale: number;
  hovered: boolean;
  onToggle: () => void;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}

function TaskRow({ task, isEditing, editText, scale, hovered, onToggle, onStartEdit, onEditChange, onSaveEdit, onCancelEdit, onDelete }: TaskRowProps) {
  const [rowHover, setRowHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setRowHover(true)}
      onMouseLeave={() => setRowHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: `${6 * scale}px`,
        padding: `${3 * scale}px ${4 * scale}px`,
        borderRadius: 6 * scale,
        background: rowHover ? 'var(--c-hover)' : 'transparent',
        transition: 'background 0.1s',
        minHeight: `${24 * scale}px`,
      }}
    >
      {/* Checkbox */}
      <button
        data-interactive
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        style={{
          width: `${16 * scale}px`,
          height: `${16 * scale}px`,
          borderRadius: '50%',
          border: task.done ? 'none' : `2px solid var(--c-border)`,
          background: task.done ? '#22c55e' : 'transparent',
          cursor: 'pointer',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          transition: 'all 0.15s',
          opacity: rowHover || task.done ? 1 : 0,
        }}
        title={task.done ? 'Mark incomplete' : 'Mark complete'}
      >
        {task.done && (
          <svg width={10 * scale} height={10 * scale} viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Task text / edit input */}
      {isEditing ? (
        <input
          data-interactive
          value={editText}
          autoFocus
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onSaveEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSaveEdit();
            if (e.key === 'Escape') onCancelEdit();
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--c-text-hi)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: `${12 * scale}px`,
            padding: 0,
          }}
        />
      ) : (
        <span
          data-interactive
          onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(); }}
          style={{
            flex: 1,
            color: task.done ? 'var(--c-text-off)' : 'var(--c-text-hi)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: `${12 * scale}px`,
            textDecoration: task.done ? 'line-through' : 'none',
            cursor: 'default',
            transition: 'color 0.15s',
          }}
        >
          {task.text}
        </span>
      )}

      {/* Delete button — shown on row hover */}
      {rowHover && !isEditing && (
        <button
          data-interactive
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--c-text-off)',
            padding: `0 ${2 * scale}px`,
            fontSize: `${11 * scale}px`,
            lineHeight: 1,
            flexShrink: 0,
          }}
          title="Remove task"
        >
          ×
        </button>
      )}
    </div>
  );
}
