// Canvas view: nodes, connectors, zoom, floating bottom toolbar.
// Handles rendering nodes, rendering the shared-element source for zoom-morph,
// and clicking into doc nodes (emits onOpenDoc with source rect).

function Canvas({
  nodes, edges, pageTitle,
  docInCanvasMode, // 'preview' | 'full'
  selectedId, onSelect,
  onOpenDoc, // (docId, sourceRectClient) -> void
  onFocusNodeById, // for external jump-to-node
  highlightNodeId, // pulse a node briefly
  scale, setScale,
  pan, setPan,
  stageRef, // ref to stage element (for coord conversion)
}) {
  const nodesById = React.useMemo(() => {
    const m = {}; for (const n of nodes) m[n.id] = n; return m;
  }, [nodes]);

  // Handle pan via middle-button / space+drag (simplified: drag empty canvas)
  const [panning, setPanning] = React.useState(false);
  const panStart = React.useRef(null);

  const onStageMouseDown = (e) => {
    if (e.target !== e.currentTarget && !e.target.classList?.contains('canvas-bg')) return;
    onSelect(null);
    if (e.button === 1 || e.altKey) {
      setPanning(true);
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      e.preventDefault();
    }
  };
  const onStageMouseMove = (e) => {
    if (!panning) return;
    setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
  };
  const onStageMouseUp = () => setPanning(false);

  const onWheel = (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setScale(s => Math.max(0.3, Math.min(2, s * (1 + delta))));
  };

  // Connector paths
  const edgePaths = edges.map(e => {
    const a = nodesById[e.from], b = nodesById[e.to];
    if (!a || !b) return null;
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
    const bx = b.x + b.w / 2, by = b.y + b.h / 2;
    // orthogonal-ish path
    const midY = (ay + by) / 2;
    const d = e.kind === 'soft'
      ? `M ${ax} ${ay} C ${ax} ${midY} ${bx} ${midY} ${bx} ${by}`
      : `M ${a.x + a.w/2} ${a.y + a.h} L ${a.x + a.w/2} ${midY} L ${b.x + b.w/2} ${midY} L ${b.x + b.w/2} ${b.y}`;
    return { ...e, d, bx, by };
  }).filter(Boolean);

  return (
    <div
      className="canvas-wrap canvas-bg"
      ref={stageRef}
      onMouseDown={onStageMouseDown}
      onMouseMove={onStageMouseMove}
      onMouseUp={onStageMouseUp}
      onMouseLeave={onStageMouseUp}
      onWheel={onWheel}
    >
      <div
        className="canvas"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
      >
        <svg className="connectors" style={{ width: 3000, height: 2000 }}>
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--c-text-md)" />
            </marker>
            <marker id="arrSoft" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--c-green)" />
            </marker>
          </defs>
          {edgePaths.map(e => (
            <path
              key={e.id}
              d={e.d}
              fill="none"
              stroke={e.kind === 'soft' ? 'var(--c-green)' : 'var(--c-text-md)'}
              strokeWidth={e.kind === 'soft' ? 1.25 : 1.5}
              strokeDasharray={e.kind === 'soft' ? '4 4' : ''}
              opacity={e.kind === 'soft' ? 0.55 : 0.75}
              markerEnd={e.kind === 'soft' ? 'url(#arrSoft)' : 'url(#arr)'}
            />
          ))}
        </svg>

        {nodes.map(n => (
          <NodeView
            key={n.id}
            node={n}
            selected={selectedId === n.id}
            pulse={highlightNodeId === n.id}
            docInCanvasMode={docInCanvasMode}
            onSelect={() => onSelect(n.id)}
            onOpenDoc={onOpenDoc}
            onFocusNodeById={onFocusNodeById}
          />
        ))}
      </div>
    </div>
  );
}

function NodeView({ node, selected, pulse, docInCanvasMode, onSelect, onOpenDoc, onFocusNodeById }) {
  const ref = React.useRef(null);
  const style = { left: node.x, top: node.y, width: node.w, height: node.type==='image' ? undefined : node.h };

  React.useEffect(() => {
    if (!pulse || !ref.current) return;
    ref.current.animate([
      { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(160,96,56,0)' },
      { transform: 'scale(1.04)', boxShadow: '0 0 0 8px rgba(160,96,56,.18)' },
      { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(160,96,56,0)' },
    ], { duration: 900, easing: 'cubic-bezier(.22,.61,.36,1)' });
  }, [pulse]);

  const sticky = (
    <div
      className={'node node-sticky' + (selected ? ' selected' : '')}
      style={{ ...style, '--sticky': node.color }}
      ref={ref}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      <div className="node-body" style={{ background: node.color }}>{node.text}</div>
    </div>
  );

  const image = (
    <div
      className={'node node-image' + (selected ? ' selected' : '')}
      style={style}
      ref={ref}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      <div className="node-body">
        <div className="ph" style={{ width: node.w, height: node.w }}>
          <span>shocklogic.png</span>
        </div>
      </div>
    </div>
  );

  const doc = () => {
    const d = node.docId ? docById(node.docId) : null;
    const title = d ? d.title : (node.inlineTitle || 'Untitled');
    const isFull = docInCanvasMode === 'full' && d;

    const onEdit = (e) => {
      e.stopPropagation();
      const rect = ref.current?.getBoundingClientRect();
      if (d) onOpenDoc(d.id, rect);
    };

    return (
      <div
        className={'node node-doc' + (selected ? ' selected' : '') + (isFull ? ' full' : '')}
        style={style}
        ref={ref}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        onDoubleClick={(e) => { if (d) { e.stopPropagation(); const rect = ref.current?.getBoundingClientRect(); onOpenDoc(d.id, rect); } }}
        data-doc-node-id={d?.id || ''}
      >
        <div className="node-body">
          <div className="dh">
            <I.fileDoc size={12} />
            <span className="t">{title}</span>
            {d && (
              <button className="edit-btn" onClick={onEdit} title="Open (double-click)">
                <I.expand size={10} /> Edit
              </button>
            )}
          </div>

          {isFull && d ? (
            <div className="db">
              {d.blocks.slice(1, 4).map((b, i) => renderBlockPlain(b, i, onFocusNodeById))}
            </div>
          ) : (
            <div className="db">
              {d ? summarize(d) : (node.inlineBody || '')}
            </div>
          )}

          {d && (
            <div className="dfoot">
              <span>.md</span>
              <span style={{ flex: 1 }} />
              {d.tags?.map(t => <span key={t} className="tag">#{t}</span>)}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (node.type === 'sticky') return sticky;
  if (node.type === 'image')  return image;
  if (node.type === 'doc')    return doc();
  return null;
}

// Plain rendering for in-canvas full-editor preview (simplified, no wiki links)
function renderBlockPlain(b, i, onFocusNodeById) {
  if (b.k === 'h2') return <h2 key={i}>{b.t}</h2>;
  if (b.k === 'ul') return <ul key={i}>{b.items.map((it, j) => <li key={j}>{stripMarkers(it)}</li>)}</ul>;
  return <p key={i}>{stripMarkers(b.t)}</p>;
}
function stripMarkers(s) {
  return (s||'')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/@node:([a-z0-9-]+)/gi, '')
    .replace(/#([a-z0-9-]+)/gi, '#$1');
}
function summarize(d) {
  const para = d.blocks.find(b => b.k === 'p');
  return stripMarkers(para?.t || '').slice(0, 120);
}

// ─── Bottom floating toolbar ───
function FloatingToolbar({ tool, onTool, hidden }) {
  const tools = [
    { id: 'sel',  icon: <I.tSelect  />,  label: 'Sel' },
    { id: 'pan',  icon: <I.tPan     />,  label: 'Pan' },
    { id: 'sti',  icon: <I.tSticky  />,  label: 'Sti' },
    { id: 'sha',  icon: <I.tShape   />,  label: 'Sha' },
    { id: 'tex',  icon: <I.tText    />,  label: 'Tex' },
    { id: 'doc',  icon: <I.tDoc     />,  label: 'Doc' },
    { id: 'sec',  icon: <I.tSection />,  label: 'Sec' },
    { id: 'ima',  icon: <I.tImage   />,  label: 'Ima' },
    { id: 'tab',  icon: <I.tTable   />,  label: 'Tab' },
    { id: 'lin',  icon: <I.tLink    />,  label: 'Lin' },
  ];
  return (
    <div className={'floating-toolbar' + (hidden ? ' hidden' : '')}>
      {tools.map((t, i) => (
        <React.Fragment key={t.id}>
          <button
            className={'ft-btn' + (tool === t.id ? ' active' : '')}
            onClick={() => onTool(t.id)}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
          {i === 0 && <span className="ft-sep" />}
        </React.Fragment>
      ))}
      <span className="ft-sep" />
      <button className="ft-btn" title="Add">
        <span><I.tAdd /></span>
        <span>Add</span>
      </button>
    </div>
  );
}

function ZoomWidget({ scale, setScale }) {
  return (
    <div className="zoom-widget">
      <button onClick={() => setScale(s => Math.max(0.3, s - 0.1))}>−</button>
      <span className="zv">{Math.round(scale * 100)}%</span>
      <button onClick={() => setScale(s => Math.min(2, s + 0.1))}>+</button>
    </div>
  );
}

window.Canvas = Canvas;
window.FloatingToolbar = FloatingToolbar;
window.ZoomWidget = ZoomWidget;
