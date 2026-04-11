import { useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { ConnectorNode, LineStyle, StrokeStyle, ArrowHeadStyle } from '../types';

// ── Palette ───────────────────────────────────────────────────────────────────
const COLORS = [
  'var(--c-line)', '#e2e8f0', '#60a5fa', '#4ade80',
  '#f87171', '#fbbf24', '#fb923c', '#f472b6',
];

// ── Inline SVG icons ──────────────────────────────────────────────────────────
const icons = {
  curved: (
    <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
      <path d="M1 11C4 11 4 1 9 1S14 11 17 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    </svg>
  ),
  straight: (
    <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
      <line x1="2" y1="10" x2="16" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  orthogonal: (
    <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
      <path d="M2 10 L2 3 L16 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  solid: (
    <svg width="18" height="8" viewBox="0 0 18 8" fill="none">
      <line x1="1" y1="4" x2="17" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  dashed: (
    <svg width="18" height="8" viewBox="0 0 18 8" fill="none">
      <line x1="1" y1="4" x2="17" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 3"/>
    </svg>
  ),
  dotted: (
    <svg width="18" height="8" viewBox="0 0 18 8" fill="none">
      <line x1="1" y1="4" x2="17" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 4"/>
    </svg>
  ),
  arrowHead: (
    <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
      <line x1="1" y1="6" x2="13" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M11 2 L17 6 L11 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  flatHead: (
    <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
      <line x1="1" y1="6" x2="15" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="15" y1="1" x2="15" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  circleHead: (
    <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
      <line x1="1" y1="6" x2="12" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="15.5" cy="6" r="3" fill="currentColor"/>
    </svg>
  ),
  noneHead: (
    <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
      <line x1="1" y1="6" x2="19" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  // Mirrored versions for the start (tail) arrowhead
  arrowHeadRev: (
    <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
      <line x1="7" y1="6" x2="19" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M9 2 L3 6 L9 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  flatHeadRev: (
    <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
      <line x1="5" y1="6" x2="19" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="5" y1="1" x2="5" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  circleHeadRev: (
    <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
      <line x1="8" y1="6" x2="19" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="4.5" cy="6" r="3" fill="currentColor"/>
    </svg>
  ),
  noneHeadRev: (
    <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
      <line x1="1" y1="6" x2="19" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  chevron: (
    <svg width="7" height="5" viewBox="0 0 7 5" fill="currentColor">
      <path d="M0 0l3.5 5L7 0z"/>
    </svg>
  ),
};

// ── Dropdown wrapper ──────────────────────────────────────────────────────────
function DropBtn({
  label, icon, open, onToggle, children,
}: {
  label: string; icon: React.ReactNode;
  open: boolean; onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        title={label}
        onClick={onToggle}
        className={[
          'flex items-center gap-1 h-9 px-2.5 rounded-lg transition-colors',
          open
            ? 'bg-[var(--c-hover)] text-[var(--c-text-hi)]'
            : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
        ].join(' ')}
      >
        {icon}
        <span className="opacity-60">{icons.chevron}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50 p-1.5 flex flex-col gap-0.5 min-w-[130px]">
          {children}
        </div>
      )}
    </div>
  );
}

function DropItem({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-mono transition-colors w-full text-left',
        active ? 'bg-[var(--c-line)] text-white' : 'text-[var(--c-text-md)] hover:bg-[var(--c-hover)]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ConnectorToolbar({ nodeId }: { nodeId: string }) {
  const { nodes, updateNode, saveHistory } = useBoardStore();
  const node = nodes.find(n => n.id === nodeId) as ConnectorNode | undefined;

  const [open, setOpen] = useState<'color' | 'style' | 'headStart' | 'headEnd' | 'stroke' | null>(null);

  if (!node) return null;

  const update = (u: Partial<ConnectorNode>) => { saveHistory(); updateNode(nodeId, u as Parameters<typeof updateNode>[1]); };
  const toggle = (key: typeof open) => setOpen(v => (v === key ? null : key));
  const closeAndUpdate = (u: Partial<ConnectorNode>) => { update(u); setOpen(null); };

  const lineStyle:      LineStyle      = node.lineStyle      ?? 'curved';
  const strokeStyle:    StrokeStyle    = node.strokeStyle    ?? (node.dashed ? 'dashed' : 'solid');
  const legacyHead:     ArrowHeadStyle = node.arrowHead      ?? (node.hasArrow !== false ? 'arrow' : 'none');
  const arrowHeadEnd:   ArrowHeadStyle = node.arrowHeadEnd   ?? legacyHead;
  const arrowHeadStart: ArrowHeadStyle = node.arrowHeadStart ?? 'none';

  const lineIcon     = icons[lineStyle];
  const strokeIcon   = icons[strokeStyle];
  const headEndIcon  = arrowHeadEnd   === 'arrow'  ? icons.arrowHead
                     : arrowHeadEnd   === 'flat'   ? icons.flatHead
                     : arrowHeadEnd   === 'circle' ? icons.circleHead
                     :                               icons.noneHead;
  const headStartIcon = arrowHeadStart === 'arrow'  ? icons.arrowHeadRev
                      : arrowHeadStart === 'flat'   ? icons.flatHeadRev
                      : arrowHeadStart === 'circle' ? icons.circleHeadRev
                      :                               icons.noneHeadRev;

  return (
    <div
      className="absolute top-14 left-1/2 -translate-x-1/2 z-50 flex items-center rounded-xl border border-[var(--c-border)] bg-[var(--c-panel)] shadow-2xl px-1 py-1 gap-0.5"
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Color */}
      <div className="relative">
        <button
          title="Color"
          onClick={() => toggle('color')}
          className={[
            'flex items-center gap-1 h-9 px-2.5 rounded-lg transition-colors',
            open === 'color'
              ? 'bg-[var(--c-hover)] text-[var(--c-text-hi)]'
              : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
          ].join(' ')}
        >
          <span className="w-4 h-4 rounded-full border border-white/20 shrink-0" style={{ background: node.color }}/>
          <span className="opacity-60">{icons.chevron}</span>
        </button>
        {open === 'color' && (
          <div
            className="absolute top-full left-0 mt-1 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: 12 }}
          >
            {COLORS.map(hex => (
              <button
                key={hex}
                title={hex}
                onClick={() => closeAndUpdate({ color: hex })}
                style={{
                  width: 32, height: 32,
                  borderRadius: 8,
                  border: `2px solid ${node.color === hex ? 'var(--c-line)' : 'transparent'}`,
                  background: hex,
                  cursor: 'pointer',
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.15)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              />
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-[var(--c-border)] mx-0.5" />

      {/* Line style */}
      <DropBtn label="Line style" icon={lineIcon} open={open === 'style'} onToggle={() => toggle('style')}>
        <DropItem active={lineStyle === 'curved'}     onClick={() => closeAndUpdate({ lineStyle: 'curved' })}>     {icons.curved}     Curved     </DropItem>
        <DropItem active={lineStyle === 'straight'}   onClick={() => closeAndUpdate({ lineStyle: 'straight' })}>   {icons.straight}   Straight   </DropItem>
        <DropItem active={lineStyle === 'orthogonal'} onClick={() => closeAndUpdate({ lineStyle: 'orthogonal' })}> {icons.orthogonal} Orthogonal </DropItem>
      </DropBtn>

      {/* Arrow head — start (tail) */}
      <DropBtn label="Start cap" icon={headStartIcon} open={open === 'headStart'} onToggle={() => toggle('headStart')}>
        <DropItem active={arrowHeadStart === 'none'}   onClick={() => closeAndUpdate({ arrowHeadStart: 'none' })}>   {icons.noneHeadRev}    None   </DropItem>
        <DropItem active={arrowHeadStart === 'arrow'}  onClick={() => closeAndUpdate({ arrowHeadStart: 'arrow' })}>  {icons.arrowHeadRev}   Arrow  </DropItem>
        <DropItem active={arrowHeadStart === 'flat'}   onClick={() => closeAndUpdate({ arrowHeadStart: 'flat' })}>   {icons.flatHeadRev}    Flat   </DropItem>
        <DropItem active={arrowHeadStart === 'circle'} onClick={() => closeAndUpdate({ arrowHeadStart: 'circle' })}> {icons.circleHeadRev}  Circle </DropItem>
      </DropBtn>

      {/* Arrow head — end */}
      <DropBtn label="End cap" icon={headEndIcon} open={open === 'headEnd'} onToggle={() => toggle('headEnd')}>
        <DropItem active={arrowHeadEnd === 'arrow'}  onClick={() => closeAndUpdate({ arrowHeadEnd: 'arrow' })}>  {icons.arrowHead}   Arrow  </DropItem>
        <DropItem active={arrowHeadEnd === 'flat'}   onClick={() => closeAndUpdate({ arrowHeadEnd: 'flat' })}>   {icons.flatHead}    Flat   </DropItem>
        <DropItem active={arrowHeadEnd === 'circle'} onClick={() => closeAndUpdate({ arrowHeadEnd: 'circle' })}> {icons.circleHead}  Circle </DropItem>
        <DropItem active={arrowHeadEnd === 'none'}   onClick={() => closeAndUpdate({ arrowHeadEnd: 'none' })}>   {icons.noneHead}    None   </DropItem>
      </DropBtn>

      {/* Stroke style */}
      <DropBtn label="Stroke" icon={strokeIcon} open={open === 'stroke'} onToggle={() => toggle('stroke')}>
        <DropItem active={strokeStyle === 'solid'}  onClick={() => closeAndUpdate({ strokeStyle: 'solid' })}>  {icons.solid}  Solid  </DropItem>
        <DropItem active={strokeStyle === 'dashed'} onClick={() => closeAndUpdate({ strokeStyle: 'dashed' })}> {icons.dashed} Dashed </DropItem>
        <DropItem active={strokeStyle === 'dotted'} onClick={() => closeAndUpdate({ strokeStyle: 'dotted' })}> {icons.dotted} Dotted </DropItem>
      </DropBtn>

      <div className="w-px h-5 bg-[var(--c-border)] mx-0.5" />

      {/* Stroke width */}
      {[1, 2, 3].map(w => (
        <button
          key={w}
          title={`${w}px`}
          onClick={() => update({ strokeWidth: w })}
          className={[
            'w-8 h-9 flex items-center justify-center rounded-lg transition-colors',
            node.strokeWidth === w
              ? 'bg-[var(--c-line)] text-white'
              : 'text-[var(--c-text-lo)] hover:text-[var(--c-text-hi)] hover:bg-[var(--c-hover)]',
          ].join(' ')}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth={w * 1.5 + 0.5} strokeLinecap="round"/>
          </svg>
        </button>
      ))}
    </div>
  );
}
