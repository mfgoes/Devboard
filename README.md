# DevBoard — Developer Guide

## Dev environment

```bash
npm install       # first time only
npm run dev       # starts local server at http://localhost:5173
```

Hot reload is on. Edit anything in `src/` and the browser updates instantly.

---

## Building

```bash
npm run build
```

Outputs a single self-contained `dist/index.html` (~480KB). All JS and CSS are inlined by `vite-plugin-singlefile` — no separate assets, runs fully offline.

---

## Uploading to itch.io

### Manual (zip upload)

```bash
npm run zip
```

Creates `devboard-itchio.zip` in the project root — contains only `dist/index.html`.

Upload steps:
1. Go to your itch.io game page → **Edit** → **Uploads**
2. Drop `devboard-itchio.zip`
3. Set **Kind**: `HTML`
4. Check **"This file will be played in the browser"**
5. Recommended viewport: `960 × 640` (canvas fills the window regardless)

### Automated (Butler CLI)

Butler is itch.io's official CLI for pushing builds directly from the terminal.

**Install Butler:**
```bash
# macOS (via itch app — recommended)
# Download from: https://itch.io/docs/butler/installing.html
# Or via direct download and add to PATH
```

**Login once:**
```bash
butler login
```

**Push a build:**
```bash
npm run build
butler push dist/ mischa/devboard:html
```

The channel name (`html`) can be anything — it just labels the build on itch.io.

**Tip:** Add a `push` script to `package.json` once you have Butler set up:
```json
"push": "npm run build && butler push dist/ your-username/devboard:html"
```
Then just run `npm run push` to build and deploy in one step.

---

## Project structure

```
src/
  types/index.ts          — all TypeScript types (CanvasNode, Tool, Camera, etc.)
  store/boardStore.ts     — Zustand state (nodes, camera, clipboard, actions)
  App.tsx                 — root component, keyboard shortcuts, welcome modal
  main.tsx                — React entry point
  index.css               — Tailwind directives + canvas overrides
  components/
    Canvas.tsx            — Konva Stage, pan/zoom, line drawing, tool dispatch
    Toolbar.tsx           — bottom-center floating toolbar
    TopBar.tsx            — board title, export, save/load, share
    TextEditor.tsx        — HTML textarea overlay for editing sticky text
    StickyColorPicker.tsx — color swatches shown when a sticky is selected
    WelcomeModal.tsx      — first-visit / about modal
    nodes/
      StickyNote.tsx      — sticky note (Konva Group + Transformer + anchor dots)
      ConnectorLine.tsx   — bezier connector arrow between nodes
```

## Roadmap

### Done
- [x] Canvas with pan, zoom, dot grid
- [x] Sticky notes — place, drag, resize, edit, color picker
- [x] Connector lines (bezier arrows between stickies)
- [x] Copy / paste / duplicate (`⌘C` / `⌘V` / `⌘D`)
- [x] **Alt+drag to duplicate** — hold Alt while dragging any node to leave a copy at the origin
- [x] Board title, Export PNG, Save/Load JSON, Share link (base64 URL)
- [x] Welcome modal with keyboard cheatsheet
- [x] Single-file build for itch.io
- [x] Fullscreen button
- [x] Text blocks (standalone text, no background)
- [x] Basic shapes — rectangle, ellipse, diamond, triangle
- [x] Allow moving multiple sections together (left mouse + shift select)
- [x] Brave browser shield notice
- [x] Split zoom control to separate toolbar
- [x] Sections / grouping areas
- [x] Undo / redo (`⌘Z` / `⌘⇧Z`)
- [x] Context-sensitive toolbars per node type
- [x] Align option when multiple objects are selected
- [x] Re-center button (press zoom number)
- [x] Themes (dark mode, color schemes)
- [x] Sticker tool (emoji stickers with picker)
- [x] **Snap / alignment guides** — subtle guides appear when dragging near other nodes’ edges or centers
- [x] **Canvas start screen** — first visit seeds the board with a welcome note instead of a modal
- [x] Shape + text tool stays selected after placing (multi-place)
- [x] Text alignment (left / center / right) in text block toolbar
- [x] Code block node with syntax highlighting
- [x] **Multi-node Alt+drag** — hold Alt while dragging any node; if multiple are selected, all are duplicated together
- [x] **Group / ungroup** — `⌘G` to group selected nodes, `⌘G` again to ungroup; click a group member to select the whole group
- [x] **Lock nodes** — right-click any node → Lock to prevent moves/edits; small 🔒 badge appears
- [x] **Right-click context menu** — duplicate, copy, lock/unlock, bring to front/back, group/ungroup, delete

### Up next

- [x] **Multi-node Alt+drag** — when multiple nodes are selected, Alt+drag duplicates all of them together
- [x] **Keyboard nudge** — arrow keys move selected node(s) by 1px; Shift+arrow moves by 10px
- [x] **Group / ungroup** (`⌘G`) — bundle selected nodes so they move together; clicking a group member selects the whole group
- [x] **Lock nodes** — prevent accidental moves on static layout elements; right-click → Lock or use context menu
- [x] **Right-click context menu** — duplicate, delete, lock/unlock, bring to front/back, group/ungroup
- [ ] Templates to choose from (dev-focused: planning board, retro, architecture diagram)
- [ ] Freehand pen / draw tool
- [ ] Image upload (drop PNG/JPG onto canvas) -> Requires app + workspace
- [ ] Mini-map / overview panel
- [ ] Load folder/workspace -> Allows saving images (works similar to ie VS Code) + Better handling of multiple pages + ability to reference code snippets better

### Later / ideas

- [ ] More export options (entire board, PDF, with background)
- [ ] Advertise on Reddit + X
- [ ] Enable pages (see Figjam / Figma) which makes organising your boards easier
- [ ] Dropdown menu from the top left (like Figjam) giving even more options (saving, settings, etc)
  - [ ] Allow inserting code sections and comments (toggle to show in toolbar)
  - [ ] Open a template (enable different templates, ie planning board or note taking)
- [ ] Multiple boards / tabs
- [ ] Real-time collaboration (WebSocket / WebRTC)

### Much later / Post release
- [ ] Mobile-friendly posting of items on board

---

## Adding a new tool

1. Add the tool id to the `Tool` union in `src/types/index.ts`
2. Add a new node interface and add it to the `CanvasNode` union
3. Handle the tool in `Canvas.tsx` (`handleMouseDown`, node rendering)
4. Add the button to `TOOLS` in `Toolbar.tsx` and remove it from `isComingSoon`
5. Create a new component in `src/components/nodes/`
