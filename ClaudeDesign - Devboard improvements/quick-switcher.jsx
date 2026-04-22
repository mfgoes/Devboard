// Cmd+K quick switcher: jumps to any page, doc, or canvas node across the workspace.

function QuickSwitcher({ open, onClose, onPickPage, onPickDoc, onPickNode }) {
  const [q, setQ] = React.useState('');
  const [idx, setIdx] = React.useState(0);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (open) { setQ(''); setIdx(0); setTimeout(()=>inputRef.current?.focus(), 10); }
  }, [open]);

  const results = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    const pages = PAGES.map(p => ({ kind:'page', item:p, label:p.title, sub:p.layoutMode }));
    const docs  = DOCS.map(d => ({ kind:'doc',  item:d, label:d.title, sub:pageById(d.pageId)?.title || '' }));
    const nodes = NODES.filter(n => n.type==='sticky' && n.text)
                       .map(n => ({ kind:'node', item:n, label:n.text, sub:pageById(n.pageId)?.title || '' }));
    const all = [...pages, ...docs, ...nodes];
    if (!s) return all.slice(0, 30);
    return all.filter(x => x.label.toLowerCase().includes(s) || x.sub.toLowerCase().includes(s)).slice(0, 30);
  }, [q]);

  React.useEffect(() => { setIdx(0); }, [q]);

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(results.length-1, i+1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(0, i-1)); }
    else if (e.key === 'Enter')     { e.preventDefault(); pick(results[idx]); }
  };

  const pick = (r) => {
    if (!r) return;
    if (r.kind === 'page') onPickPage(r.item.id);
    else if (r.kind === 'doc') onPickDoc(r.item.id);
    else if (r.kind === 'node') onPickNode(r.item.id);
    onClose();
  };

  if (!open) return null;

  // Group results
  const groups = { page: [], doc: [], node: [] };
  results.forEach((r, i) => groups[r.kind].push({ ...r, i }));

  return (
    <div className="qs-backdrop" onClick={onClose}>
      <div className="qs" onClick={(e)=>e.stopPropagation()}>
        <input
          ref={inputRef}
          placeholder="Jump to page, note, or canvas node…"
          value={q}
          onChange={(e)=>setQ(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="qs-list">
          {results.length === 0 && (
            <div style={{ padding: 24, textAlign:'center', color:'var(--c-text-lo)', fontSize: 12 }}>
              No matches
            </div>
          )}
          {groups.page.length > 0 && <div className="qs-sect">Pages</div>}
          {groups.page.map(r => (
            <QSItem key={'p'+r.item.id} active={r.i===idx} icon={r.item.layoutMode==='stack' ? <StackGlyph/> : <FreeformGlyph/>} label={r.label} sub={r.sub} onClick={()=>pick(r)} onEnter={()=>setIdx(r.i)} />
          ))}
          {groups.doc.length > 0 && <div className="qs-sect">Notes</div>}
          {groups.doc.map(r => (
            <QSItem key={'d'+r.item.id} active={r.i===idx} icon={<I.fileDoc size={13}/>} label={r.label} sub={r.sub} onClick={()=>pick(r)} onEnter={()=>setIdx(r.i)} />
          ))}
          {groups.node.length > 0 && <div className="qs-sect">Canvas Nodes</div>}
          {groups.node.map(r => (
            <QSItem key={'n'+r.item.id} active={r.i===idx} icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="12" rx="1.5"/></svg>
            } label={r.label} sub={r.sub} onClick={()=>pick(r)} onEnter={()=>setIdx(r.i)} />
          ))}
        </div>
        <div className="qs-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

function QSItem({ active, icon, label, sub, onClick, onEnter }) {
  return (
    <div
      className={'qs-item' + (active ? ' on' : '')}
      onMouseEnter={onEnter}
      onClick={onClick}
    >
      <span className="ico">{icon}</span>
      <span className="t">{label}</span>
      <span className="sub">{sub}</span>
    </div>
  );
}

window.QuickSwitcher = QuickSwitcher;
