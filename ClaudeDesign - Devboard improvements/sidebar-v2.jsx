// v2 sidebar: just Pages (with layout-mode icon) + Assets. No separate Documents.
// Pages in Stack mode are the "docs library" disposition.

function SidebarV2({
  collapsed, onToggle,
  activePageId, onSelectPage, onNewPage,
}) {
  const [openGroups, setOpenGroups] = React.useState({ pages: true, assets: true });
  const [query, setQuery] = React.useState('');
  const toggleGroup = (k) => setOpenGroups(s => ({...s, [k]: !s[k] }));

  const q = query.trim().toLowerCase();
  const matchPage = (p) => !q || p.title.toLowerCase().includes(q);
  const matchAsset = (a) => !q || a.name.toLowerCase().includes(q);

  const Group = ({ open, onToggle, label, count, children }) => (
    <div className="sb-group">
      <button className={'sb-group-hd' + (open ? ' open' : '')} onClick={onToggle}>
        <span className="chev"><I.chevron /></span>
        <span>{label}</span>
        <span className="count">{count}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );

  return (
    <aside className={'sidebar' + (collapsed ? ' collapsed' : '')}>
      <div className="sb-header">
        <div className="ttl">
          <I.sidebarToggle /> Explorer
        </div>
        <div className="actions">
          <button className="sb-icon-btn" title="Collapse" onClick={onToggle}><I.x /></button>
        </div>
      </div>

      <div className="sb-project">
        <I.folderOpen /> DEVBOARD
      </div>

      <input
        className="sb-search"
        placeholder="Search pages, assets…"
        value={query}
        onChange={(e)=>setQuery(e.target.value)}
      />

      <div className="sb-body">
        <Group
          k="pages" open={openGroups.pages} onToggle={()=>toggleGroup('pages')}
          label="Pages" count={PAGES.filter(matchPage).length}
        >
          {PAGES.filter(matchPage).map(p => (
            <div
              key={p.id}
              className={'sb-item' + (activePageId === p.id ? ' active' : '')}
              onClick={()=>onSelectPage(p.id)}
              style={{ paddingLeft: 10 }}
            >
              <span className="page-kind" title={p.layoutMode === 'stack' ? 'Stack page — doc list' : 'Freeform page — canvas'}>
                {p.layoutMode === 'stack' ? <StackGlyph /> : <FreeformGlyph />}
              </span>
              <span className="lbl">{p.title}</span>
              {p.unsaved && <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--c-accent)' }} />}
              <span className="meta">
                {p.layoutMode === 'stack'
                  ? `${docsForPage(p.id).length}`
                  : `${nodesForPage(p.id).length}`}
              </span>
            </div>
          ))}
          <div className="sb-newpage" onClick={()=>onNewPage?.()}>
            <I.plus size={11} /> New page…
          </div>
          <div className="sb-pagehint">
            <b style={{ color:'var(--c-text-md)' }}>Freeform</b> — infinite canvas · <b style={{ color:'var(--c-text-md)' }}>Stack</b> — writing-first list
          </div>
        </Group>

        <Group
          k="assets" open={openGroups.assets} onToggle={()=>toggleGroup('assets')}
          label="Assets" count={ASSETS.filter(matchAsset).length}
        >
          <div className="sb-item folder">
            <span className="ico"><I.folderOpen /></span>
            <span className="lbl">assets</span>
          </div>
          {ASSETS.filter(matchAsset).map(a => (
            <div key={a.name} className="sb-item nested">
              <span className="ico"><I.image /></span>
              <span className="lbl">{a.name}</span>
              {a.marked && <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--c-accent)' }} />}
            </div>
          ))}
        </Group>
      </div>

      <div className="sb-save">
        <I.save size={12} />
        <span className="sb-save-path">Save images to: assets/</span>
      </div>
      <div className="sb-footer">
        Press <span style={{ fontFamily:'var(--f-mono)' }}>⌘K</span> to jump to any page or note
      </div>
    </aside>
  );
}

// Small glyphs for page-type
function FreeformGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="7" height="5" rx="1" />
      <rect x="13" y="6" width="8" height="7" rx="1" />
      <rect x="5" y="14" width="9" height="6" rx="1" />
    </svg>
  );
}
function StackGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="7" x2="19" y2="7" />
      <line x1="5" y1="12" x2="19" y2="12" />
      <line x1="5" y1="17" x2="15" y2="17" />
    </svg>
  );
}

window.SidebarV2 = SidebarV2;
