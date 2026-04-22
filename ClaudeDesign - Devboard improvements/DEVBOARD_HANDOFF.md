# Devboard — UX Improvements: Handoff Notes

## Summary

This document outlines the UX changes prototyped for Devboard's canvas ↔ note-taking integration. Use it as a brief for Claude Code when refactoring the real codebase.

---

## 1. Page Layout Modes

### What changed
Each page now has a `layoutMode` field: `'freeform'` (default, today's infinite canvas) or `'stack'` (writing-first list).

### Data model change
```js
// Before
{ id: 'p-level', title: 'Level / Mission Flow' }

// After
{ id: 'p-level', title: 'Level / Mission Flow', layoutMode: 'freeform' }
{ id: 'p-inbox', title: 'Design Inbox',         layoutMode: 'stack'    }
```

### Behaviour
- **Freeform** — renders the existing canvas. No change.
- **Stack** — renders a compact, scrollable list of doc nodes belonging to that page. No coordinates involved. Cards show: title, 2-line preview, tags, updated timestamp, backlink count.
- Layout mode is **switchable per page** from the top bar (segmented control). Reversible at any time.
- `Cmd+N` on a Stack page creates a new doc and appends it to the list. On a Freeform page, drops it at the cursor as before.

### Files
- `stack-view.jsx` — `<StackView page onOpenDoc onNewDoc />` component
- `styles-v2.css` — `.stack-wrap`, `.stack-card`, `.stack-new`, `.stack-toolbar` styles

---

## 2. Sidebar — Pages Only (no separate Documents section)

### What changed
Removed the "Documents" section from the sidebar. Notes/docs are discovered via the page they belong to, not a global flat list.

### Why
The Pages/Documents split was conceptually confusing. Now: **Pages are the only top-level concept.** A Stack page _is_ a documents library. A Freeform page _is_ a canvas. One mental model.

### Sidebar now shows
1. **Pages** — with a small glyph indicating layout mode (≡ Stack, ◼ Freeform) and a count of items
2. **Assets** — unchanged (images, PSD, etc.)

### Data helper needed
```js
// Returns all docs belonging to a page
const docsForPage  = (pageId) => DOCS.filter(d => d.pageId === pageId);
const nodesForPage = (pageId) => NODES.filter(n => n.pageId === pageId);
const edgesForPage = (pageId) => { /* filter edges whose both endpoints are on the page */ };
```

### Files
- `sidebar-v2.jsx` — `<SidebarV2>` component

---

## 3. Canvas ↔ Doc Transition — Zoom Morph Only

### What changed
Removed the split-view panel. **Zoom morph is the only transition.**

### How it works
1. User double-clicks a doc node on the canvas (or clicks a Stack card).
2. The element's `getBoundingClientRect()` is captured as the morph source.
3. A positioned `div` (`.morph-frame`) animates from the source rect to `inset: 0` (full screen) using CSS transitions on `left / top / width / height`.
4. A dim overlay (`.morph-dim`) fades in behind it.
5. **Esc** or the back button reverses the animation back to the source rect, then unmounts.

### State machine (in app)
```
idle → opening → open → closing → idle
```

```js
const startMorph = (docId, sourceRect) => {
  setOpenDocId(docId);
  setMorphRect(sourceRect);
  setMorphPhase('opening');
  requestAnimationFrame(() => requestAnimationFrame(() => setMorphPhase('open')));
};

const closeDoc = () => {
  setMorphPhase('closing');
  setTimeout(() => {
    setOpenDocId(null); setMorphPhase('idle'); setMorphRect(null);
  }, transitionMs);
};
```

### CSS
```css
.morph-frame {
  position: absolute;
  transition: left 380ms ease, top 380ms ease, width 380ms ease, height 380ms ease, border-radius 380ms ease;
}
.morph-frame.full { left: 0; top: 0; width: 100%; height: 100%; border-radius: 0; }
```

### Works from both views
- **Freeform canvas** — double-click a `[type="doc"]` node → capture its DOM rect → morph
- **Stack view** — click a `<StackCard>` → capture its DOM rect → morph
- **Sidebar doc click** — if the doc has a node on the current canvas, pan to it first, then morph from the node. If not, use a center-origin rect.

---

## 4. Cmd+K Quick Switcher

### What it does
Global fuzzy-search across all pages, docs, and canvas nodes. Keyboard-navigable.

### Trigger
`Cmd+K` (or `Ctrl+K`) anywhere in the app — register in the top-level `keydown` handler.

### Results grouped as
1. Pages
2. Notes (docs)
3. Canvas Nodes (sticky notes with text)

### Actions on pick
- **Page** → `setActivePageId(id)`
- **Doc** → `openDoc(id)` (navigates to the doc's page, then zoom-morphs)
- **Node** → `focusNode(id)` (pans canvas + pulses the node)

### Files
- `quick-switcher.jsx` — `<QuickSwitcher open onClose onPickPage onPickDoc onPickNode />`

---

## 5. Obsidian-Style Note Features

### `[[Wikilinks]]`
- Inline syntax: `[[Doc Title]]`
- Renders as a clickable chip. Clicking opens the referenced doc via `openDoc`.
- Hover shows a preview card (title + first 140 chars + tags).
- Missing links render in muted italic style.

### `@node:id` — Canvas Node Links
- Inline syntax: `@node:intro` (where `intro` is the node's `id`)
- Renders as a green pill button.
- Clicking calls `focusNode(id)` → pans canvas to that node and pulses it.
- Useful for docs referencing specific beats in a level flow.

### `#hashtags`
- Inline syntax: `#design`, `#systems`, `#worldbuilding`
- Renders highlighted. Clickable (filter in future).
- Tags also appear on doc cards in Stack view.

### Backlinks
- Computed at render time by scanning all doc blocks for `[[This Doc Title]]` references.
- Shown in a "Linked mentions" section at the bottom of every doc.
- Each backlink shows the source doc title + the sentence containing the mention.
- Clicking a backlink opens that doc.
- Stack cards show a backlink count badge.

### Resolver helpers needed in real codebase
```js
resolveWikilink(title)   // title string → doc object or null
backlinksToDoc(docId)    // → [{ from: doc, context: string }]
nodeMentionsInDoc(docId) // → [node, ...]
```

---

## 6. Top Bar Changes

- Added **layout mode switcher** (Freeform / Stack segmented control)  
- Added **⌘K search pill** (replaces empty space)  
- Removed doc-mode breadcrumb ("← Back to Canvas") — back is now always the morph-close gesture

---

## 7. Doc Editor Changes

- **Single variant** (`zoom`) — the split-view variant is removed
- **Back button** says "Zoom out" and triggers `closeDoc()`
- Breadcrumb: `Page Title › Doc Title`
- Wikilink hover previews are rendered with `position: fixed` (not relative to doc body) to avoid clipping
- Source view still available via segmented toggle (Preview / Source)
- "Place on canvas" footer removed — docs belong to a page, not placed manually

---

## 8. What Was Removed

| Removed | Reason |
|---|---|
| Documents sidebar section | Replaced by Stack pages |
| Split-view panel transition | Zoom morph is cleaner and canvas-native |
| "Back to Canvas" full-screen doc mode | Replaced by zoom morph with Esc |
| Global flat document list | Docs live inside pages |
| "Place on canvas" button in doc editor | Docs are placed on creation, not drag-dropped |

---

## Suggested Refactor Order for Claude Code

1. Add `layoutMode` to the Page model + migration/default for existing pages
2. Add `pageId` to the Doc model (or infer from which canvas they're on)
3. Implement `docsForPage`, `nodesForPage`, `edgesForPage` helpers
4. Build `<StackView>` and wire into the page renderer (switch on `layoutMode`)
5. Add layout-mode switcher to top bar
6. Implement zoom-morph state machine (replace current full-screen transition)
7. Update sidebar to remove Documents section; add page-type glyphs
8. Wire `Cmd+K` keydown + implement `<QuickSwitcher>`
9. Add wikilink / node-link / hashtag inline parsing to doc editor
10. Add backlinks computation + render at bottom of each doc
