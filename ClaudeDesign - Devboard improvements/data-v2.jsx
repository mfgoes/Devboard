// v2 data model: pages have a `layoutMode`. Documents belong to a page.
// Removes standalone "Documents" concept — they live in a page.

const PAGES_V2 = [
  { id: 'p-level',  title: 'Level / Mission Flow', layoutMode: 'freeform', unsaved: false },
  { id: 'p-inbox',  title: 'Design Inbox',         layoutMode: 'stack',    unsaved: false },
  { id: 'p-lore',   title: 'World Lore',           layoutMode: 'stack',    unsaved: true  },
  { id: 'p-moods',  title: 'Mood Board',           layoutMode: 'freeform', unsaved: false },
];

// Docs now tagged with pageId
const DOCS_V2 = [
  // Level / Mission Flow
  { id: 'd-test',  pageId: 'p-level', title: 'Test document', tags:['design'], updated:'2d ago',
    blocks:[
      { k:'h1', t:'Test document' },
      { k:'p', t:'This doc links into the canvas. The concept ties together [[Core loop]] and the opening beat @node:intro. Tag it as #design for now.' },
      { k:'h2', t:'Pillars' },
      { k:'ul', items:['Player acts in bursts of 30–90s — see [[Pacing notes]]','Every screen has one clear verb','Failure should feel informative, not punitive'] },
      { k:'p', t:'Related beat on canvas: @node:main.' },
    ] },
  { id: 'd-core',  pageId: 'p-inbox', title: 'Core loop', tags:['design','systems'], updated:'1h ago',
    blocks:[
      { k:'h1', t:'Core loop' },
      { k:'p', t:'The skeleton: Act → Gather → Craft → Spend. Each transition runs in ~15s. See [[Pacing notes]] and [[Test document]].' },
      { k:'h2', t:'Signals' },
      { k:'ul', items:['Act: screen shake + SFX','Gather: HUD tick','Craft: modal confirm','Spend: satisfying thunk'] },
      { k:'p', t:'Ties into Reward/Exit beat @node:reward. #systems' },
    ] },
  { id: 'd-pacing', pageId: 'p-inbox', title: 'Pacing notes', tags:['design'], updated:'5h ago',
    blocks:[
      { k:'h1', t:'Pacing notes' },
      { k:'p', t:'Session target 6–9 min. Beats: @node:intro, @node:main, @node:boss, @node:reward.' },
      { k:'ul', items:['Intro — 45 s','Main — 3–4 min','Boss — 90–120 s','Reward — 30 s'] },
      { k:'p', t:'Referenced by [[Core loop]] and [[Test document]].' },
    ] },
  { id: 'd-fail', pageId: 'p-inbox', title: 'Failure states', tags:['design','ux'], updated:'3h ago',
    blocks:[
      { k:'h1', t:'Failure states' },
      { k:'p', t:'Failure must teach. Never punish without a visible lesson. See [[Core loop]] for how this folds into the Craft step. #ux' },
    ] },
  { id: 'd-econ', pageId: 'p-inbox', title: 'Economy v0.2', tags:['systems'], updated:'yesterday',
    blocks:[
      { k:'h1', t:'Economy v0.2' },
      { k:'p', t:'Three resources: Grit, Spark, Ember. Grit is common, Spark is mid, Ember is rare. Tied to [[Core loop]] spend phase. #systems' },
    ] },

  // World Lore
  { id: 'd-world', pageId: 'p-lore', title: 'The Drowsy Moon', tags:['worldbuilding'], updated:'3d ago',
    blocks:[
      { k:'h1', t:'The Drowsy Moon' },
      { k:'p', t:'The moon is inhabited and the factories are drowsy. They wake once every 7 days. See [[Factory Hymns]]. #worldbuilding' },
    ] },
  { id: 'd-hymns', pageId: 'p-lore', title: 'Factory Hymns', tags:['worldbuilding','story'], updated:'4d ago',
    blocks:[
      { k:'h1', t:'Factory Hymns' },
      { k:'p', t:'Workers sing to keep the machines placid. Three stanzas form a full shift. Linked to [[The Drowsy Moon]].' },
    ] },
  { id: 'd-tide', pageId: 'p-lore', title: 'The Tide Clerks', tags:['worldbuilding','characters'], updated:'1w ago',
    blocks:[
      { k:'h1', t:'The Tide Clerks' },
      { k:'p', t:'Record-keepers who ride the lunar tides. Antagonists in Act II. #characters' },
    ] },
];

// Canvas nodes per page (only freeform pages really use these spatially).
const NODES_V2 = [
  // p-level
  { id:'intro',  pageId:'p-level', type:'sticky', x:120, y:120, w:150, h:80,  color:'var(--s-cream)',   text:'Intro / Tutorial Beat' },
  { id:'main',   pageId:'p-level', type:'sticky', x:120, y:250, w:150, h:80,  color:'var(--s-apricot)', text:'Main Challenge' },
  { id:'boss',   pageId:'p-level', type:'sticky', x:120, y:380, w:150, h:80,  color:'var(--s-rose)',    text:'Boss / Climax' },
  { id:'reward', pageId:'p-level', type:'sticky', x:120, y:510, w:150, h:80,  color:'var(--s-blue)',    text:'Reward / Exit 👍' },
  { id:'img1',   pageId:'p-level', type:'image',  x:380, y:30,  w:200, h:200, src:'shocklogic' },
  { id:'test3',  pageId:'p-level', type:'doc',    x:440, y:260, w:240, h:140, docId:null, inlineTitle:'test 3', inlineBody:'test 3' },
  { id:'dTest',  pageId:'p-level', type:'doc',    x:540, y:470, w:260, h:180, docId:'d-test' },
];

const EDGES_V2 = [
  { id:'e1', from:'intro',  to:'main',   kind:'arrow' },
  { id:'e2', from:'main',   to:'boss',   kind:'arrow' },
  { id:'e3', from:'boss',   to:'reward', kind:'arrow' },
  { id:'e4', from:'dTest',  to:'reward', kind:'soft'  },
];

const ASSETS_V2 = [
  { k:'img', name:'0lwxsónrm.png' },
  { k:'img', name:'5a1q8av3t.jpg' },
  { k:'img', name:'8gcn55Ih4.jpg', marked:true },
  { k:'img', name:'898scu9kp.png' },
  { k:'img', name:'b7yf5hs57.png' },
  { k:'img', name:'llama-head-icon-in-line-style.jpg' },
  { k:'psd', name:'main_board.psd' },
];

// Helpers
const docByIdV2 = (id) => DOCS_V2.find(d => d.id === id);
const nodeByIdV2 = (id) => NODES_V2.find(n => n.id === id);
const pageByIdV2 = (id) => PAGES_V2.find(p => p.id === id);
const docsForPage = (pageId) => DOCS_V2.filter(d => d.pageId === pageId);
const nodesForPage = (pageId) => NODES_V2.filter(n => n.pageId === pageId);
const edgesForPage = (pageId) => {
  const ids = new Set(nodesForPage(pageId).map(n => n.id));
  return EDGES_V2.filter(e => ids.has(e.from) && ids.has(e.to));
};
const resolveWikilinkV2 = (title) => {
  const t = title.trim().toLowerCase();
  return DOCS_V2.find(d => d.title.toLowerCase() === t) || null;
};
const backlinksToDocV2 = (docId) => {
  const me = docByIdV2(docId);
  if (!me) return [];
  const re = new RegExp(`\\[\\[${me.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\]\\]`, 'i');
  const out = [];
  for (const d of DOCS_V2) {
    if (d.id === docId) continue;
    for (const b of d.blocks || []) {
      const text = b.items ? b.items.join(' • ') : (b.t || '');
      if (re.test(text)) { out.push({ from: d, context: text }); break; }
    }
  }
  return out;
};
const nodeMentionsInDocV2 = (docId) => {
  const d = docByIdV2(docId);
  if (!d) return [];
  const re = /@node:([a-z0-9-]+)/gi;
  const hits = new Set();
  for (const b of d.blocks || []) {
    const text = b.items ? b.items.join(' ') : (b.t || '');
    let m; while ((m = re.exec(text))) hits.add(m[1]);
  }
  return [...hits].map(nodeByIdV2).filter(Boolean);
};

// Override globals that existing components use (canvas.jsx, doc-editor.jsx)
Object.assign(window, {
  PAGES: PAGES_V2, DOCS: DOCS_V2, NODES: NODES_V2, EDGES: EDGES_V2, ASSETS: ASSETS_V2,
  docById: docByIdV2, nodeById: nodeByIdV2, pageById: pageByIdV2,
  docsForPage, nodesForPage, edgesForPage,
  resolveWikilink: resolveWikilinkV2,
  backlinksToDoc: backlinksToDocV2,
  nodeMentionsInDoc: nodeMentionsInDocV2,
});
