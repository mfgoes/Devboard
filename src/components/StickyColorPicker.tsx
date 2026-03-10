import { useBoardStore } from '../store/boardStore';
import { StickyNoteNode } from '../types';

const STICKY_COLORS = [
  { hex: '#fde68a', label: 'Yellow' },
  { hex: '#bbf7d0', label: 'Green' },
  { hex: '#bae6fd', label: 'Blue' },
  { hex: '#fbcfe8', label: 'Pink' },
  { hex: '#ddd6fe', label: 'Purple' },
  { hex: '#fecaca', label: 'Red' },
  { hex: '#fed7aa', label: 'Orange' },
  { hex: '#e2e8f0', label: 'White' },
];

export { STICKY_COLORS };

interface Props {
  nodeId: string;
}

export default function StickyColorPicker({ nodeId }: Props) {
  const { nodes, updateNode, camera } = useBoardStore();
  const node = nodes.find((n) => n.id === nodeId) as StickyNoteNode | undefined;
  if (!node) return null;

  const sx = node.x * camera.scale + camera.x;
  const sy = node.y * camera.scale + camera.y;

  return (
    <div
      style={{
        position: 'absolute',
        left: sx,
        top: sy - 40,
        zIndex: 200,
      }}
      className="flex items-center gap-1 bg-[#1a1a2a] border border-[#2e2e46] rounded-md px-2 py-1.5 shadow-lg"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {STICKY_COLORS.map((c) => (
        <button
          key={c.hex}
          title={c.label}
          onClick={() => updateNode(nodeId, { color: c.hex })}
          className="w-5 h-5 rounded-sm border-2 transition-transform hover:scale-110"
          style={{
            background: c.hex,
            borderColor: node.color === c.hex ? '#6366f1' : 'transparent',
          }}
        />
      ))}
    </div>
  );
}
