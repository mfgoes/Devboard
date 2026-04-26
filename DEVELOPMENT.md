# DevBoard — Development Guide

## Dev environment

```bash
npm install       # first time only
npm run dev       # starts local server at http://localhost:5173
npm run tauri:dev # Tauri desktop window with hot-reload
```

---

## Building

```bash
npm run build
```

Outputs a single self-contained `dist/index.html` (~480 KB). All JS and CSS are inlined by `vite-plugin-singlefile` — no separate assets, runs fully offline.

For full desktop and itch.io release steps, see [BUILD.md](BUILD.md).

---

## Project structure

```
src/
  types/index.ts                  — all TypeScript types (CanvasNode, Tool, Camera, etc.)
  store/boardStore.ts             — Zustand state (nodes, camera, clipboard, actions)
  App.tsx                         — root component, keyboard shortcuts, view routing
  main.tsx                        — React entry point
  index.css                       — Tailwind directives + canvas overrides
  components/
    Canvas.tsx                    — Konva Stage, pan/zoom, line drawing, tool dispatch
    Toolbar.tsx                   — bottom-center floating toolbar
    TopBar.tsx                    — board title, export, save/load, share
    WorkspaceExplorer.tsx         — VS Code-style file explorer sidebar
    DocumentMode.tsx              — full document editor
    FocusMode.tsx                 — full-screen distraction-free writing
    StackView.tsx                 — vertical list view of all documents/notes
    DocFormattingBar.tsx          — rich-text toolbar for documents
    DocSidebar.tsx                — document outline / sidebar
    DocumentToolbar.tsx           — document-specific actions toolbar
    QuickSwitcher.tsx             — keyboard-driven page/note switcher
    TextEditor.tsx                — HTML textarea overlay for editing sticky text
    StickyColorPicker.tsx         — color swatches shown when a sticky is selected
    WelcomeModal.tsx              — first-visit / about modal
    CanvasToolPreviews.tsx        — tool preview overlays
    CanvasToolbars.tsx            — context-sensitive node toolbars
    nodes/
      StickyNote.tsx              — sticky note (Konva Group + Transformer + anchor dots)
      ConnectorLine.tsx           — bezier connector arrow between nodes
      DocumentNode.tsx            — pinned document/note on the canvas
  hooks/
    useDocumentAutoSave.ts        — auto-saves open documents to workspace
    useCanvasImageDrop.ts         — handles image drag-and-drop onto canvas
    useCanvasInteraction.ts       — mouse/touch interaction state
    useCanvasKeyboard.ts          — keyboard shortcuts
    useTreeState.ts               — file explorer expand/collapse state
  utils/
    workspaceManager.ts           — File System Access API, workspace open/save
    exportMarkdown.ts             — board / document → Markdown export
    canvasPlacement.ts            — auto-place nodes when opening files
    richText.ts                   — rich-text serialisation helpers
    focusNode.ts                  — scroll/pan to a node on the canvas
```

---

## Adding a new tool

1. Add the tool id to the `Tool` union in `src/types/index.ts`
2. Add a new node interface and add it to the `CanvasNode` union
3. Handle the tool in `Canvas.tsx` (`handleMouseDown`, node rendering)
4. Add the button to `TOOLS` in `Toolbar.tsx` and remove it from `isComingSoon`
5. Create a new component in `src/components/nodes/`

---

## Roadmap

### Done
- [x] Canvas with pan, zoom, dot grid
- [x] Sticky notes — place, drag, resize, edit, color picker
- [x] Connector lines (bezier arrows between stickies)
- [x] Copy / paste / duplicate (`⌘C` / `⌘V` / `⌘D`)
- [x] Alt+drag to duplicate — hold Alt while dragging to leave a copy at the origin
- [x] Board title, Export PNG, Save/Load JSON, Share link (base64 URL)
- [x] Welcome modal with keyboard cheatsheet
- [x] Single-file build for itch.io
- [x] Fullscreen button
- [x] Text blocks (standalone text, no background)
- [x] Basic shapes — rectangle, ellipse, diamond, triangle
- [x] Multi-select with Shift
- [x] Undo / redo (`⌘Z` / `⌘⇧Z`)
- [x] Context-sensitive toolbars per node type
- [x] Alignment guides (snap to edges and centers)
- [x] Re-center button
- [x] Themes (dark mode, color schemes)
- [x] Sticker tool (emoji stickers with picker)
- [x] Canvas start screen (first visit seeds welcome note)
- [x] Code block node with syntax highlighting
- [x] Group / ungroup (`⌘G`)
- [x] Lock nodes (right-click → Lock)
- [x] Right-click context menu
- [x] Keyboard nudge — arrow keys / Shift+arrow
- [x] Templates (planning board, retro, architecture diagram)
- [x] Image upload (drop PNG/JPG onto canvas)
- [x] Embedded links
- [x] Workspace / folder support — multiple pages + notes per workspace
- [x] Document editor — full Markdown document writing mode
- [x] Focus mode — full-screen distraction-free writing
- [x] Stack view — toggle between canvas and vertical document list
- [x] Markdown export
- [x] VS Code-style file explorer sidebar
- [x] Quick switcher

### Up next
- [ ] Freehand pen / draw tool
- [ ] Board-wide text search
- [ ] Mini-map / overview panel
- [ ] Export selection as `.txt` / `.md`
- [ ] Toggle for auto-save / manual save mode

### Later / ideas
- [ ] Line tool upgrade — intentional diagramming mode
- [ ] More export options (entire board, PDF, with background)
- [ ] Pages browser (flip between named pages like Figma/FigJam)
- [ ] Multiple boards / tabs
- [ ] Real-time collaboration (WebSocket / WebRTC)
- [ ] Mobile-friendly posting
