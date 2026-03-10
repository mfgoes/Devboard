import { useBoardStore } from '../store/boardStore';
import { Tool } from '../types';

interface ToolDef {
  id: Tool;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
}

// Minimal SVG icons — dev-tool aesthetic
function IconSelect() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 2L3 12L6.5 9L8.5 13.5L10 12.8L8 8.5L12 8L3 2Z" fill="currentColor" />
    </svg>
  );
}
function IconPan() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1v2M8 13v2M1 8h2M13 8h2M4.2 4.2l1.4 1.4M10.4 10.4l1.4 1.4M4.2 11.8l1.4-1.4M10.4 5.6l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function IconSticky() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 2v4l2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5" y1="10.5" x2="9" y2="10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function IconShape() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="2.5" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="11" cy="11" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function IconText() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 4h10M8 4v9M5 13h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
function IconLine() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11 3h2v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconPen() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M9.5 4.5l2 2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function IconSection() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect
        x="1.5"
        y="1.5"
        width="13"
        height="13"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <line x1="1.5" y1="5.5" x2="14.5" y2="5.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: <IconSelect /> },
  { id: 'pan', label: 'Pan', shortcut: 'H', icon: <IconPan /> },
  { id: 'sticky', label: 'Sticky', shortcut: 'S', icon: <IconSticky /> },
  { id: 'shape', label: 'Shape', shortcut: '', icon: <IconShape /> },
  { id: 'text', label: 'Text', shortcut: '', icon: <IconText /> },
  { id: 'line', label: 'Line', shortcut: 'L', icon: <IconLine /> },
  { id: 'pen', label: 'Pen', shortcut: '', icon: <IconPen /> },
  { id: 'section', label: 'Section', shortcut: '', icon: <IconSection /> },
];

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2];

export default function Toolbar() {
  const { activeTool, setActiveTool, camera, setCamera } = useBoardStore();

  const zoomIn = () => {
    const next = ZOOM_PRESETS.find((z) => z > camera.scale) ?? 8;
    setCamera({ scale: Math.min(next, 8) });
  };
  const zoomOut = () => {
    const prev = [...ZOOM_PRESETS].reverse().find((z) => z < camera.scale) ?? 0.08;
    setCamera({ scale: Math.max(prev, 0.08) });
  };
  const zoomReset = () => setCamera({ scale: 1, x: 0, y: 0 });

  const zoomPct = Math.round(camera.scale * 100);

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-0 rounded-xl border border-[#2e2e46] bg-[#1a1a2a] shadow-2xl overflow-hidden">
      {/* Tool buttons */}
      <div className="flex items-center px-1 py-1 gap-0.5">
        {TOOLS.map((tool, i) => {
          const isActive = activeTool === tool.id;
          const isComingSoon = ['shape', 'text', 'pen', 'section'].includes(tool.id);
          return (
            <button
              key={tool.id}
              title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}${isComingSoon ? ' — coming soon' : ''}`}
              onClick={() => setActiveTool(tool.id)}
              className={[
                'relative flex flex-col items-center justify-center w-10 h-10 rounded-lg transition-all duration-100 font-mono text-[10px] gap-0.5',
                isActive
                  ? 'bg-[#6366f1] text-white shadow-sm'
                  : isComingSoon
                  ? 'text-[#4a4a6a] hover:text-[#6a6a8a] hover:bg-[#22223a] cursor-not-allowed'
                  : 'text-[#8888aa] hover:text-[#e2e8f0] hover:bg-[#22223a]',
              ].join(' ')}
              disabled={isComingSoon}
            >
              {tool.icon}
              <span className="leading-none">{tool.label.slice(0, 3)}</span>
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="w-px h-8 bg-[#2e2e46] mx-1" />

      {/* Zoom controls */}
      <div className="flex items-center gap-0.5 px-1 py-1">
        <button
          title="Zoom out"
          onClick={zoomOut}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#8888aa] hover:text-[#e2e8f0] hover:bg-[#22223a] transition-colors font-mono text-lg leading-none"
        >
          −
        </button>
        <button
          title="Reset zoom (100%)"
          onClick={zoomReset}
          className="min-w-[52px] h-8 flex items-center justify-center rounded-lg text-[#8888aa] hover:text-[#e2e8f0] hover:bg-[#22223a] transition-colors font-mono text-[11px] tabular-nums"
        >
          {zoomPct}%
        </button>
        <button
          title="Zoom in"
          onClick={zoomIn}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#8888aa] hover:text-[#e2e8f0] hover:bg-[#22223a] transition-colors font-mono text-lg leading-none"
        >
          +
        </button>
      </div>
    </div>
  );
}
