// Doc editor: renders a doc with wikilinks, node-links, hashtags, plus
// hover previews, linked mentions (backlinks), title bar, and formatting toolbar.

function DocEditor({
  docId, allDocs, variant, // 'split' | 'zoom' | 'embed'
  onClose, onOpenDoc, onFocusNode,
  onTitleChange,
}) {
  const doc = allDocs.find(d => d.id === docId);
  const [viewMode, setViewMode] = React.useState('preview'); // preview | source
  const [hoverPreview, setHoverPreview] = React.useState(null); // {x,y,doc}

  if (!doc) {
    return (
      <div className="doc-editor">
        <div className="doc-empty">
          <I.fileDoc size={28} />
          <div>No document selected</div>
          <div style={{ fontSize: 11, color: 'var(--c-text-lo)' }}>Pick one from the sidebar or click any doc card on the canvas.</div>
        </div>
      </div>
    );
  }

  const backlinks = backlinksToDoc(doc.id);
  const mentionedNodes = nodeMentionsInDoc(doc.id);

  const showPreview = (e, d) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHoverPreview({ x: r.left, y: r.bottom + 6, doc: d });
  };
  const hidePreview = () => setHoverPreview(null);

  return (
    <div className="doc-editor">
      {/* Title bar (only for split / zoom — embed has its own chrome) */}
      {variant !== 'embed' && (
        <div className="doc-titlebar">
          <button className="back" onClick={onClose} title="Back to canvas (Esc)">
            <I.back /> <span>{variant === 'zoom' ? 'Zoom out' : 'Back to Canvas'}</span>
          </button>
          <div className="crumb">
            <span className="sep">/</span>
            <span>Level / Mission Flow</span>
            <span className="sep">›</span>
            <span className="cur">{doc.title}</span>
          </div>
          {variant === 'split' && (
            <button className="close" onClick={onClose} title="Close panel"><I.x /></button>
          )}
        </div>
      )}

      {/* Formatting toolbar */}
      <div className="doc-tb">
        <button className="fmt"><span>Paragraph</span><I.chevron size={10} /></button>
        <span className="sep" />
        <button className="fmt" title="Bold"><b>B</b></button>
        <button className="fmt" title="Italic"><i>I</i></button>
        <button className="fmt" title="Underline"><u>U</u></button>
        <button className="fmt" title="Strikethrough"><s>S</s></button>
        <span className="sep" />
        <button className="fmt">• List</button>
        <button className="fmt">1. List</button>
        <button className="fmt" title="Image"><I.image size={13} /></button>
        <span className="sep" />
        <button className="fmt" title="Link">[[ ]]</button>
        <button className="fmt" title="Link to canvas node" style={{ color:'var(--c-green)' }}><I.link size={12}/> node</button>
        <button className="fmt" title="Tag">#</button>
        <div className="spacer" />
        <div className="seg">
          <button className={viewMode==='preview'?'on':''} onClick={()=>setViewMode('preview')}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
            Preview
          </button>
          <button className={viewMode==='source'?'on':''} onClick={()=>setViewMode('source')}>
            &lt;/&gt; Source
          </button>
        </div>
      </div>

      <div className="doc-body">
        <div className="doc-inner">
          {viewMode === 'source' ? (
            <pre style={{ fontFamily:'var(--f-mono)', fontSize:12, color:'var(--c-text-md)', whiteSpace:'pre-wrap', lineHeight:1.6 }}>
              {doc.blocks.map(b => {
                if (b.k==='h1') return `# ${b.t}\n\n`;
                if (b.k==='h2') return `## ${b.t}\n\n`;
                if (b.k==='ul') return b.items.map(i => `- ${i}`).join('\n') + '\n\n';
                return `${b.t}\n\n`;
              }).join('')}
            </pre>
          ) : (
            <>
              {doc.blocks.map((b, i) => renderBlock(b, i, {
                onOpenDoc, onFocusNode,
                showPreview, hidePreview,
              }))}

              {/* Linked mentions on canvas */}
              {mentionedNodes.length > 0 && (
                <div style={{ marginTop: 30, padding: '14px 16px', background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--c-text-lo)', marginBottom: 8 }}>
                    Mentioned on canvas
                  </div>
                  <div className="pill-row">
                    {mentionedNodes.map(n => (
                      <button key={n.id} className="nodelink" onClick={() => onFocusNode(n.id)}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="12" rx="1.5"/></svg>
                        {n.text}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Backlinks */}
              {backlinks.length > 0 && (
                <div className="doc-backlinks">
                  <h3>Linked mentions ({backlinks.length})</h3>
                  {backlinks.map((bl, i) => (
                    <div key={i} className="bl-item" onClick={() => onOpenDoc(bl.from.id)}>
                      <div className="bl-src"><I.fileDoc size={11}/> {bl.from.title}</div>
                      <div className="bl-ctx">{renderInline(bl.context, { onOpenDoc, onFocusNode, showPreview, hidePreview })}</div>
                    </div>
                  ))}
                </div>
              )}

              {backlinks.length === 0 && (
                <div className="doc-backlinks">
                  <h3>Linked mentions (0)</h3>
                  <div style={{ fontSize: 12, color: 'var(--c-text-lo)' }}>No other docs reference this one yet.</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {hoverPreview && (
        <div
          className="link-preview"
          style={{ left: hoverPreview.x, top: hoverPreview.y }}
        >
          <div className="lp-ttl"><I.fileDoc size={11} /> {hoverPreview.doc.title}</div>
          <div className="lp-body">{summarizeDoc(hoverPreview.doc)}</div>
          <div className="lp-meta">{hoverPreview.doc.updated} · {hoverPreview.doc.tags?.map(t => '#'+t).join(' ')}</div>
        </div>
      )}
    </div>
  );
}

function summarizeDoc(d) {
  const p = d.blocks.find(b => b.k === 'p');
  return (p?.t || '').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/@node:[a-z0-9-]+/gi, '').slice(0, 140);
}

function renderBlock(b, i, ctx) {
  if (b.k === 'h1') return <h1 key={i} className="left">{b.t}</h1>;
  if (b.k === 'h2') return <h2 key={i}>{b.t}</h2>;
  if (b.k === 'ul') return (
    <ul key={i}>
      {b.items.map((it, j) => <li key={j}>{renderInline(it, ctx)}</li>)}
    </ul>
  );
  return <p key={i}>{renderInline(b.t, ctx)}</p>;
}

// Parse [[wikilink]] · @node:id · #tag
function renderInline(text, ctx) {
  if (!text) return null;
  const out = [];
  const re = /(\[\[[^\]]+\]\]|@node:[a-z0-9-]+|#[a-z0-9-]+)/gi;
  let last = 0, m, key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<span key={key++}>{text.slice(last, m.index)}</span>);
    const tok = m[0];
    if (tok.startsWith('[[')) {
      const title = tok.slice(2, -2);
      const d = resolveWikilink(title);
      out.push(
        <span
          key={key++}
          className={'wikilink' + (d ? '' : ' missing')}
          onClick={() => d && ctx.onOpenDoc(d.id)}
          onMouseEnter={(e) => d && ctx.showPreview(e, d)}
          onMouseLeave={ctx.hidePreview}
        >
          {title}
          {d && <span className="chev">›</span>}
        </span>
      );
    } else if (tok.startsWith('@node:')) {
      const id = tok.slice(6);
      const n = nodeById(id);
      if (n) {
        out.push(
          <span key={key++} className="nodelink" onClick={() => ctx.onFocusNode(id)}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="12" rx="1.5"/></svg>
            {n.text}
          </span>
        );
      } else {
        out.push(<span key={key++} style={{ color:'var(--c-text-lo)' }}>{tok}</span>);
      }
    } else if (tok.startsWith('#')) {
      out.push(<span key={key++} className="hashtag">{tok}</span>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(<span key={key++}>{text.slice(last)}</span>);
  return out;
}

window.DocEditor = DocEditor;
