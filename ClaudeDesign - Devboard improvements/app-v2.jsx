// App v2: canvas-first. Pages have a layoutMode (freeform | stack).
// Zoom-morph is the only transition. Cmd+K for quick jump across everything.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "transitionMs": 380,
  "transitionEase": "smooth",
  "docInCanvasMode": "preview",
  "sidebarCollapsed": false,
  "defaultPage": "p-level"
}/*EDITMODE-END*/;

const EASE_MAP = {
  smooth: 'cubic-bezier(.22,.61,.36,1)',
  snappy: 'cubic-bezier(.32,.72,.0,1)',
  gentle: 'cubic-bezier(.4,0,.2,1)',
  spring: 'cubic-bezier(.34,1.56,.64,1)',
};

function AppV2() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  React.useEffect(() => {
    document.documentElement.style.setProperty('--t-dur', t.transitionMs + 'ms');
    document.documentElement.style.setProperty('--t-ease', EASE_MAP[t.transitionEase] || EASE_MAP.smooth);
  }, [t.transitionMs, t.transitionEase]);

  // Sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(t.sidebarCollapsed);
  React.useEffect(() => { setSidebarCollapsed(t.sidebarCollapsed); }, [t.sidebarCollapsed]);

  // Pages — treat as mutable (for layoutMode toggling)
  const [pages, setPages] = React.useState(() => PAGES.map(p => ({ ...p })));
  React.useEffect(() => { window.PAGES = pages; }, [pages]);
  const [activePageId, setActivePageId] = React.useState(t.defaultPage || pages[0].id);
  const activePage = pages.find(p => p.id === activePageId) || pages[0];

  // Doc open state + zoom-morph machinery
  const [openDocId, setOpenDocId] = React.useState(null);
  const [morphRect, setMorphRect] = React.useState(null);
  const [morphPhase, setMorphPhase] = React.useState('idle'); // idle | opening | open | closing

  // Canvas state (only relevant in freeform)
  const [selectedNodeId, setSelectedNodeId] = React.useState(null);
  const [highlightNodeId, setHighlightNodeId] = React.useState(null);
  const [tool, setTool] = React.useState('sel');
  const [scale, setScale] = React.useState(0.82);
  const [pan, setPan] = React.useState({ x: 80, y: 20 });
  const stageRef = React.useRef(null);

  // Cmd+K
  const [qsOpen, setQsOpen] = React.useState(false);

  // Hints toast
  const [hint, setHint] = React.useState(null);
  const showHint = (msg) => setHint({ msg, id: Date.now() });

  const hasOpenDoc = !!openDocId;

  // ── Open doc via zoom-morph ──
  const openDoc = (docId, sourceRect) => {
    if (!docById(docId)) return;
    // If doc lives on a different page, switch page first
    const doc = docById(docId);
    if (doc.pageId !== activePageId) {
      setActivePageId(doc.pageId);
      // wait a tick for page to render, then find the node/card rect
      setTimeout(() => {
        const el = document.querySelector(`[data-doc-node-id="${docId}"]`);
        const rect = el?.getBoundingClientRect();
        startMorph(docId, rect);
      }, 60);
    } else {
      startMorph(docId, sourceRect);
    }
  };

  const startMorph = (docId, rect) => {
    setOpenDocId(docId);
    if (rect) {
      setMorphRect(rect);
      setMorphPhase('opening');
      requestAnimationFrame(() => requestAnimationFrame(() => setMorphPhase('open')));
    } else {
      // No source rect — center-origin morph
      const stageR = stageRef.current?.getBoundingClientRect();
      if (stageR) {
        setMorphRect({
          left: stageR.left + stageR.width / 2 - 150,
          top:  stageR.top + stageR.height / 2 - 100,
          width: 300, height: 200,
        });
        setMorphPhase('opening');
        requestAnimationFrame(() => requestAnimationFrame(() => setMorphPhase('open')));
      }
    }
  };

  const closeDoc = () => {
    setMorphPhase('closing');
    setTimeout(() => {
      setOpenDocId(null);
      setMorphPhase('idle');
      setMorphRect(null);
    }, t.transitionMs);
  };

  // Esc closes doc OR closes quick switcher (QS handles its own esc)
  React.useEffect(() => {
    const onKey = (e) => {
      // Cmd/Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQsOpen(v => !v);
        return;
      }
      // Cmd/Ctrl+N — new note in current page
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        showHint(`New note in “${activePage.title}” (prototype)`);
        return;
      }
      if (e.key === 'Escape' && openDocId && !qsOpen) closeDoc();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openDocId, qsOpen, activePage.title, t.transitionMs]);

  // Jump to canvas node from doc link
  const focusNode = (nodeId) => {
    const n = nodeById(nodeId);
    if (!n) return;
    if (openDocId) closeDoc();
    // Switch page if the node is on a different one
    if (n.pageId !== activePageId) setActivePageId(n.pageId);
    setTimeout(() => {
      const viewport = stageRef.current?.getBoundingClientRect();
      if (viewport) {
        const targetX = viewport.width / 2 - (n.x + n.w / 2) * scale;
        const targetY = viewport.height / 2 - (n.y + n.h / 2) * scale;
        setPan({ x: targetX, y: targetY });
      }
      setHighlightNodeId(nodeId);
      setSelectedNodeId(nodeId);
      setTimeout(() => setHighlightNodeId(null), 1100);
    }, 100);
  };

  const toggleLayout = (mode) => {
    if (activePage.layoutMode === mode) return;
    setPages(ps => ps.map(p => p.id === activePageId ? { ...p, layoutMode: mode } : p));
    showHint(mode === 'stack' ? 'Switched to Stack — writing-first list' : 'Switched to Freeform — infinite canvas');
  };

  // Morph frame style
  const getStageRect = () => stageRef.current?.getBoundingClientRect();
  let morphStyle = null;
  if (openDocId && morphRect) {
    const stageR = getStageRect();
    if (stageR) {
      if (morphPhase === 'opening' || morphPhase === 'closing') {
        morphStyle = {
          left: morphRect.left - stageR.left,
          top:  morphRect.top  - stageR.top,
          width:  morphRect.width,
          height: morphRect.height,
        };
      } else if (morphPhase === 'open') {
        morphStyle = { left: 0, top: 0, width: '100%', height: '100%' };
      }
    }
  }

  // Current page's canvas data
  const pageNodes = nodesForPage(activePage.id);
  const pageEdges = edgesForPage(activePage.id);

  return (
    <div className="app">
      <TopBarV2
        onToggleSidebar={() => { const v = !sidebarCollapsed; setSidebarCollapsed(v); setTweak('sidebarCollapsed', v); }}
        activePage={activePage}
        onToggleLayout={toggleLayout}
        onOpenSwitcher={() => setQsOpen(true)}
      />

      <div className="shell">
        <SidebarV2
          collapsed={sidebarCollapsed}
          onToggle={() => { setSidebarCollapsed(true); setTweak('sidebarCollapsed', true); }}
          activePageId={activePageId}
          onSelectPage={(id) => {
            if (openDocId) closeDoc();
            setActivePageId(id);
          }}
          onNewPage={() => showHint('New page (prototype)')}
        />

        <div style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex' }}>
          {activePage.layoutMode === 'freeform' ? (
            <Canvas
              nodes={pageNodes}
              edges={pageEdges}
              pageTitle={activePage.title}
              docInCanvasMode={t.docInCanvasMode}
              selectedId={selectedNodeId}
              onSelect={setSelectedNodeId}
              onOpenDoc={(id, rect) => openDoc(id, rect)}
              onFocusNodeById={focusNode}
              highlightNodeId={highlightNodeId}
              scale={scale} setScale={setScale}
              pan={pan} setPan={setPan}
              stageRef={stageRef}
            />
          ) : (
            <div style={{ position:'relative', flex:1 }} ref={stageRef}>
              <StackView
                page={activePage}
                onOpenDoc={(id, rect) => openDoc(id, rect)}
                onNewDoc={() => showHint('New note (prototype) · ⌘N')}
                onFocusNode={focusNode}
              />
            </div>
          )}

          {/* Mode badge */}
          <div className="mode-badge">
            <span className="dot" />
            {activePage.layoutMode === 'freeform' ? 'Freeform canvas' : 'Stack · writing list'}
          </div>

          {/* Floating toolbar — freeform only */}
          {activePage.layoutMode === 'freeform' && (
            <>
              <FloatingToolbar tool={tool} onTool={setTool} hidden={hasOpenDoc} />
              <ZoomWidget scale={scale} setScale={setScale} />
            </>
          )}

          {/* Zoom-morph overlay */}
          {openDocId && morphStyle && (
            <div className="morph-overlay">
              <div className={'morph-dim' + (morphPhase === 'open' ? ' in' : '')} />
              <div className={'morph-frame' + (morphPhase === 'open' ? ' full' : '')} style={morphStyle}>
                <DocEditor
                  docId={openDocId}
                  allDocs={DOCS}
                  variant="zoom"
                  onClose={closeDoc}
                  onOpenDoc={(id) => openDoc(id)}
                  onFocusNode={focusNode}
                />
              </div>
            </div>
          )}

          {hint && <div key={hint.id} className="hint">{hint.msg}</div>}
        </div>
      </div>

      <QuickSwitcher
        open={qsOpen}
        onClose={() => setQsOpen(false)}
        onPickPage={(id) => { if (openDocId) closeDoc(); setActivePageId(id); }}
        onPickDoc={(id) => openDoc(id)}
        onPickNode={(id) => focusNode(id)}
      />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Transitions" />
        <TweakSlider label="Duration" value={t.transitionMs} min={120} max={900} step={20} unit="ms" onChange={(v) => setTweak('transitionMs', v)} />
        <TweakSelect label="Easing" value={t.transitionEase} options={['smooth','snappy','gentle','spring']} onChange={(v) => setTweak('transitionEase', v)} />

        <TweakSection label="Canvas" />
        <TweakRadio label="Doc node display" value={t.docInCanvasMode} options={['preview','full']} onChange={(v) => setTweak('docInCanvasMode', v)} />
        <TweakToggle label="Sidebar collapsed" value={sidebarCollapsed} onChange={(v) => { setSidebarCollapsed(v); setTweak('sidebarCollapsed', v); }} />

        <TweakSection label="Try" />
        <div style={{ fontSize: 11, color: 'var(--c-text-md)', lineHeight: 1.55 }}>
          <b>Pages have layout modes.</b> Switch any page between Freeform and Stack in the top bar.<br/><br/>
          <b>⌘K</b> — jump to any page, note, or canvas node.<br/>
          <b>⌘N</b> — new note in current page.<br/>
          <b>Esc</b> — close a note.<br/><br/>
          Try: open <b>Design Inbox</b> (Stack), click <b>Core loop</b>, then click the <span className="wikilink" style={{ padding:'0 3px' }}>[[Pacing notes]]</span> wikilink. Or click a <span className="nodelink" style={{ fontSize:10, padding:'0 6px' }}>node pill</span> to jump to the canvas.
        </div>
      </TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<AppV2 />);
