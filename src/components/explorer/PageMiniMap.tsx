import type { CanvasNode } from '../../types';

function nodeBounds(node: CanvasNode): { x: number; y: number; w: number; h: number } | null {
  if (node.type === 'connector') {
    const x = Math.min(node.fromX, node.toX);
    const y = Math.min(node.fromY, node.toY);
    return { x, y, w: Math.max(8, Math.abs(node.toX - node.fromX)), h: Math.max(8, Math.abs(node.toY - node.fromY)) };
  }
  if (node.type === 'sticker') return { x: node.x - node.width / 2, y: node.y - node.height / 2, w: node.width, h: node.height };
  if (node.type === 'textblock') return { x: node.x, y: node.y, w: node.width, h: Math.max(40, node.fontSize * 3.2) };
  if (node.type === 'table') return { x: node.x, y: node.y, w: node.colWidths.reduce((a, b) => a + b, 0), h: node.rowHeights.reduce((a, b) => a + b, 0) };
  if (node.type === 'taskcard') return { x: node.x, y: node.y, w: node.width, h: node.height ?? 160 };
  if (node.type === 'sticky' || node.type === 'shape' || node.type === 'section' || node.type === 'codeblock' || node.type === 'image' || node.type === 'link' || node.type === 'document') {
    return { x: node.x, y: node.y, w: node.width, h: node.height };
  }
  return null;
}

export default function PageMiniMap({ nodes }: { nodes: CanvasNode[] }) {
  const drawableNodes = nodes.slice(0, 28);
  const bounds = drawableNodes
    .map(nodeBounds)
    .filter(Boolean) as Array<{ x: number; y: number; w: number; h: number }>;
  const minX = bounds.length ? Math.min(...bounds.map((b) => b.x)) : 0;
  const minY = bounds.length ? Math.min(...bounds.map((b) => b.y)) : 0;
  const maxX = bounds.length ? Math.max(...bounds.map((b) => b.x + b.w)) : 320;
  const maxY = bounds.length ? Math.max(...bounds.map((b) => b.y + b.h)) : 220;
  const pad = 32;
  const width = Math.max(220, maxX - minX + pad * 2);
  const height = Math.max(150, maxY - minY + pad * 2);
  const viewBox = `${minX - pad} ${minY - pad} ${width} ${height}`;

  return (
    <svg viewBox={viewBox} width="100%" height="150" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect x={minX - pad} y={minY - pad} width={width} height={height} rx="20" fill="rgba(212,131,90,0.05)" />
      {drawableNodes.map((node) => {
        if (node.type === 'connector') {
          return (
            <line
              key={node.id}
              x1={node.fromX}
              y1={node.fromY}
              x2={node.toX}
              y2={node.toY}
              stroke={node.color || '#b87750'}
              strokeWidth={Math.max(1.5, Math.min(4, node.strokeWidth))}
              strokeLinecap="round"
              opacity="0.75"
            />
          );
        }
        const box = nodeBounds(node);
        if (!box) return null;
        const common = {
          key: node.id,
          x: box.x,
          y: box.y,
          width: box.w,
          height: box.h,
          rx: 14,
          opacity: 0.9,
        };
        if (node.type === 'sticky') return <rect {...common} fill={node.color || '#f5e2b8'} stroke="rgba(74,53,37,0.14)" strokeWidth="2" />;
        if (node.type === 'shape') return <rect {...common} fill={node.fill || 'rgba(212,131,90,0.18)'} stroke={node.stroke || 'rgba(138,117,95,0.45)'} strokeWidth={Math.max(1, node.strokeWidth ?? 1)} />;
        if (node.type === 'section') return <rect {...common} fill="transparent" stroke={node.color || '#d4835a'} strokeWidth="3" strokeDasharray="8 6" />;
        if (node.type === 'image' || node.type === 'sticker') return <rect {...common} fill="rgba(212,131,90,0.14)" stroke="rgba(212,131,90,0.3)" strokeWidth="2" />;
        if (node.type === 'codeblock') return <rect {...common} fill="rgba(44,36,31,0.8)" stroke="rgba(138,117,95,0.35)" strokeWidth="2" />;
        if (node.type === 'document' || node.type === 'textblock') return <rect {...common} fill="rgba(255,255,255,0.82)" stroke="rgba(138,117,95,0.22)" strokeWidth="2" />;
        if (node.type === 'link') return <rect {...common} fill="rgba(133,186,156,0.16)" stroke="rgba(133,186,156,0.38)" strokeWidth="2" />;
        if (node.type === 'table') return <rect {...common} fill="rgba(212,131,90,0.08)" stroke="rgba(138,117,95,0.3)" strokeWidth="2" />;
        if (node.type === 'taskcard') return <rect {...common} fill="rgba(255,247,237,0.95)" stroke="rgba(212,131,90,0.32)" strokeWidth="2" />;
        return <rect {...common} fill="rgba(212,131,90,0.12)" stroke="rgba(138,117,95,0.28)" strokeWidth="2" />;
      })}
    </svg>
  );
}
