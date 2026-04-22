// Top bar v2: page title, layout-mode switcher, Cmd+K search pill.

function TopBarV2({
  onToggleSidebar,
  activePage,
  onToggleLayout, // (mode) => void — switch this page's mode
  onOpenSwitcher,
}) {
  return (
    <div className="topbar">
      <button className="tb-logo" onClick={onToggleSidebar} title="Toggle sidebar">
        <I.sidebarToggle />
        <span>DEVBOARD</span>
        <I.chevron size={10} />
      </button>
      <div className="tb-page">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="1.5"/><line x1="8" y1="8" x2="16" y2="8"/></svg>
        Page
      </div>
      <div className="tb-crumb">
        <span className="sep">/</span>
        <span>{activePage.title}</span>
      </div>

      {/* Layout-mode switcher — context-sensitive per page */}
      <div className="tb-layout" style={{ marginLeft: 10 }}>
        <button
          className={activePage.layoutMode === 'freeform' ? 'on' : ''}
          onClick={() => onToggleLayout('freeform')}
          title="Freeform canvas"
        >
          <FreeformGlyph /> Freeform
        </button>
        <button
          className={activePage.layoutMode === 'stack' ? 'on' : ''}
          onClick={() => onToggleLayout('stack')}
          title="Stack (writing list)"
        >
          <StackGlyph /> Stack
        </button>
      </div>

      <div className="tb-spacer" />

      <button className="tb-search-pill" onClick={onOpenSwitcher}>
        <I.search />
        <span>Quick jump…</span>
        <span className="kbd"><kbd>⌘</kbd><kbd>K</kbd></span>
      </button>
      <button className="tb-btn primary">
        <I.save size={12} /> Save
        <I.chevron size={10} />
      </button>
      <button className="tb-btn" title="Fullscreen" style={{ width: 32, padding: 0, justifyContent: 'center' }}>
        <I.fullscreen />
      </button>
    </div>
  );
}

window.TopBarV2 = TopBarV2;
