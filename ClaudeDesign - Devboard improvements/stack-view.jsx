// Stack view: compact, scannable list of docs for a page in Stack mode.
// Writing-first — no coordinates, no dragging. Click a card → zoom into editor.

function StackView({
  page,
  onOpenDoc,   // (docId, sourceRect)
  onNewDoc,
  onFocusNode,
}) {
  const docs = docsForPage(page.id);
  const [sort, setSort] = React.useState('recent'); // recent | az | tag

  const sorted = React.useMemo(() => {
    const arr = [...docs];
    if (sort === 'az') arr.sort((a,b) => a.title.localeCompare(b.title));
    if (sort === 'tag') arr.sort((a,b) => ((a.tags?.[0]||'z').localeCompare(b.tags?.[0]||'z')));
    return arr;
  }, [docs, sort]);

  return (
    <div className="stack-wrap">
      <div className="stack-inner">
        <div className="stack-head">
          <h1>{page.title}</h1>
          <span className="meta">{docs.length} {docs.length === 1 ? 'note' : 'notes'}</span>
        </div>

        <div className="stack-toolbar">
          <span>Sort</span>
          <div className="group">
            <button className={sort==='recent'?'on':''} onClick={()=>setSort('recent')}>Recent</button>
            <button className={sort==='az'?'on':''}     onClick={()=>setSort('az')}>A–Z</button>
            <button className={sort==='tag'?'on':''}    onClick={()=>setSort('tag')}>Tag</button>
          </div>
          <span style={{ flex:1 }} />
          <span style={{ color:'var(--c-text-lo)' }}>Compact, writing-first layout. Drag to reorder · auto-linked across pages.</span>
        </div>

        <div className="stack-new" onClick={onNewDoc}>
          <I.plus size={13} />
          <span>New note…</span>
          <span className="k"><kbd>⌘</kbd><kbd>N</kbd></span>
        </div>

        {sorted.map(d => {
          const bl = backlinksToDoc(d.id);
          return (
            <StackCard
              key={d.id}
              doc={d}
              backlinkCount={bl.length}
              onClick={(rect) => onOpenDoc(d.id, rect)}
            />
          );
        })}

        {sorted.length === 0 && (
          <div className="stack-empty">
            Nothing here yet. Press <b>⌘N</b> to start a note.
          </div>
        )}
      </div>
    </div>
  );
}

function StackCard({ doc, backlinkCount, onClick }) {
  const ref = React.useRef(null);
  const summary = React.useMemo(() => {
    const p = doc.blocks.find(b => b.k === 'p');
    return (p?.t || '').replace(/\[\[([^\]]+)\]\]/g,'$1').replace(/@node:[a-z0-9-]+/gi,'').replace(/#[a-z0-9-]+/gi,'').trim();
  }, [doc]);
  return (
    <div
      ref={ref}
      className="stack-card"
      data-doc-node-id={doc.id}
      onClick={() => onClick(ref.current?.getBoundingClientRect())}
    >
      <div className="row">
        <I.fileDoc size={13} />
        <span className="t">{doc.title}</span>
      </div>
      {summary && <div className="preview">{summary}</div>}
      <div className="foot">
        <span>{doc.updated}</span>
        {doc.tags?.map(t => <span key={t} className="tag">#{t}</span>)}
        {backlinkCount > 0 && (
          <span className="bl">{backlinkCount} linked</span>
        )}
      </div>
    </div>
  );
}

window.StackView = StackView;
