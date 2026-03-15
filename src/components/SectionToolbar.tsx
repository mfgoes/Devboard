import { useBoardStore } from '../store/boardStore';
import { SectionNode } from '../types';

const SECTION_COLORS = [
  'neutral',
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6',
];

export default function SectionToolbar({ nodeId }: { nodeId: string }) {
  const { nodes, updateNode, saveHistory, camera } = useBoardStore();
  const node = nodes.find((n) => n.id === nodeId) as SectionNode | undefined;
  if (!node) return null;

  const sx = node.x * camera.scale + camera.x;
  const sy = node.y * camera.scale + camera.y;
  const sw = node.width * camera.scale;

  return (
    <div
      style={{
        position: 'absolute',
        left: sx + sw / 2,
        top: sy - 52,
        transform: 'translateX(-50%)',
        zIndex: 200,
      }}
      className="flex items-center gap-1 px-2 py-1.5 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {SECTION_COLORS.map((color) => {
        const isNeutral = color === 'neutral';
        const bg = isNeutral ? 'var(--c-text-lo)' : color;
        const outlineColor = isNeutral ? 'var(--c-text-lo)' : color;
        const isActive = node.color === color;
        return (
          <button
            key={color}
            title={isNeutral ? 'Neutral' : color}
            onClick={() => {
              saveHistory();
              updateNode(nodeId, { color } as Parameters<typeof updateNode>[1]);
            }}
            style={{
              width: 20,
              height: 20,
              borderRadius: 6,
              background: bg,
              border: isActive ? '2px solid white' : '2px solid transparent',
              outline: isActive ? `2px solid ${outlineColor}` : 'none',
              cursor: 'pointer',
              transition: 'transform 0.1s',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.transform = 'scale(1.2)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.transform = 'scale(1)')}
          />
        );
      })}
    </div>
  );
}
