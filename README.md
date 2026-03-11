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

Replace `your-username/devboard` with your actual itch.io username and game slug.
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
- [x] Copy / paste / duplicate
- [x] Board title, Export PNG, Save/Load JSON, Share link (base64 URL)
- [x] Welcome modal with keyboard cheatsheet
- [x] Single-file build for itch.io
- [x] Fullscreen button

### Up next
- [x] Text blocks (standalone text, no background)
- [x] Basic shapes — rectangle, ellipse, diamond, triangle
- [x] Allow moving multiple sections together (left mouse + shift select)
- [ ] When editing text in shape / post it, dont hide the bgr (it's disorienting)
- [ ] Freehand pen / draw tool
- [ ] Sections / grouping areas
- [x] Undo / redo (Ctrl+Z / Ctrl+Shift+Z)

### Later / ideas
- [ ] Mobile-friendly posting of items on board
- [x] When selecting a different object type (ie text or post it) change the toolbar to that one. When pressing escape switch back to Select tool.
- [ ] Align tools when multiple things are selected
- [ ] Re-center button appearing when users are far off from objects (ie top of page) 
- [ ] More export options (ie entire board, screen, PDF, with background)
- [ ] Advertise on Reddit + X
- [ ] Enable pages (see Figjam / Figma) which makes organising your boards easier. 
- [ ] Dropdown menu from the top left (like Figjam) giving even more options (ie saving, settings, etc)
  - [ ] Allow inserting code sections and comments (toggle to show in toolbar)
  - [ ] Open a template (enable different templates, ie planning board or note taking)
- [ ] Image upload (drop PNG/JPG onto canvas)
- [ ] Mini-map / overview panel
- [ ] Multiple boards / tabs
- [ ] Themes (dark mode, color schemes)
- [ ] Real-time collaboration (WebSocket / WebRTC)

---

## Adding a new tool

1. Add the tool id to the `Tool` union in `src/types/index.ts`
2. Add a new node interface and add it to the `CanvasNode` union
3. Handle the tool in `Canvas.tsx` (`handleMouseDown`, node rendering)
4. Add the button to `TOOLS` in `Toolbar.tsx` and remove it from `isComingSoon`
5. Create a new component in `src/components/nodes/`
