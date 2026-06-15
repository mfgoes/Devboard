# DevBoard - Engineering Guide

DevBoard is a local-first note app for connected thinking. The product flow is:

1. Write notes in Markdown.
2. Link related ideas with `[[wikilinks]]`, backlinks, favorites, and quick navigation.
3. Map connected notes on a real infinite canvas when the page is not enough.

The canvas is part of the note workflow, not a separate whiteboard product. Keep that framing in mind when changing UI, docs, onboarding, or feature priority.

---

## Dev Environment

```bash
npm install       # first time only
npm run dev       # Vite dev server at http://localhost:5173
npm run tauri:dev # Tauri desktop window with hot reload
```

Useful build and release commands:

```bash
npm run build            # TypeScript check + single-file web build
npm run preview          # Serve dist/ locally
npm run zip              # Build docs/app.html and devboard-itchio.zip
npm run tauri:build      # Desktop production build
npm run tauri:build:mac-arm
npm run tauri:build:win
npm run tauri:build:linux
```

For desktop packaging, updater artifacts, and release steps, see [RELEASE_AND_PACKAGING.md](RELEASE_AND_PACKAGING.md).

---

## Runtime Stack

| Layer | Technology | Notes |
|---|---|---|
| UI framework | React 18.2 | Functional components and hooks |
| Language | TypeScript 5.2 | Strict mode, ESNext target |
| Build tool | Vite 7.3 | Dev server and production bundler |
| Canvas rendering | Konva 9.3 + react-konva 18.2 | Infinite 2D canvas via HTML5 canvas |
| State management | Zustand 4.5 | Central board/document workspace store |
| Styling | Tailwind CSS 3.4 | Utility classes plus shared CSS tokens |
| Icons | lucide-react | App chrome and tool controls where available |
| File export | file-saver, JSZip | JSON, PNG, Markdown, and zip exports |
| Auth/sync | Supabase JS 2.105 | Optional GitHub, Google, magic-link/email auth and EU-hosted sync |
| Desktop shell | Tauri 2 | Native app wrapper and filesystem/dialog/updater plugins |

---

## Build Output

The web build uses `vite-plugin-singlefile` and outputs a self-contained `dist/index.html` with JavaScript and CSS inlined.

Key config in [vite.config.ts](vite.config.ts):

```ts
viteSingleFile()
target: 'esnext'
assetsInlineLimit: 100000000
cssCodeSplit: false
```

The single-file build is used for browser distribution and for `docs/app.html`. The desktop app reuses the same React/Vite frontend through Tauri.

---

## Architecture

### Product Surfaces

- **Document mode** is the primary writing surface: Markdown/rich text editing, note links, backlinks, formatting, focus mode, and document export.
- **Workspace explorer** makes local folders visible: notes, pages, assets, documents, and workspace metadata.
- **Canvas mode** is the spatial thinking surface: sticky notes, document nodes, shapes, sections, connectors, images, tables, task cards, code blocks, and links.
- **Cloud modal** manages optional sync: sign-in, cloud workspace list, create/open/rename/delete, push/pull, and local download.

### State

Main state lives in [src/store/boardStore.ts](src/store/boardStore.ts).

- Zustand store contains pages, documents, canvas nodes, camera, selection, active tools, workspace metadata, sync markers, and app mode.
- Undo/redo uses explicit history snapshots for nodes and documents.
- `exportData()` serializes the current workspace into `BoardData`.
- `loadBoard()` hydrates a workspace from local files, JSON, or cloud data.

### Data Model

Core types live in [src/types/index.ts](src/types/index.ts).

- `BoardData` is the top-level serialized workspace model.
- `Document` stores note/document content and linked file metadata.
- `PageMeta` tracks canvas pages.
- `CanvasNode` is a union of sticky notes, connectors, text blocks, shapes, sections, stickers, tables, code blocks, images, links, task cards, and document nodes.

### Persistence

| Mechanism | Files/data | Purpose |
|---|---|---|
| Browser workspace | File System Access API + IndexedDB handles | Local folder open/save in supported browsers |
| Desktop workspace | Tauri fs/dialog plugins | Native local folder open/save |
| Workspace folder | `workspace.json`, `pages/*.json`, `notes/*.md`, assets | User-owned portable project data |
| Local recents | IndexedDB / local metadata | Reopen known workspaces and track permission state |
| Cloud sync | Supabase rows containing `BoardData` snapshots | Optional backup and multi-device access |
| Export | Markdown, JSON, PNG, zip | Manual portability and sharing |

`src/utils/workspaceManager.ts` owns local workspace read/write, recents, asset lookup, and folder materialization. `src/utils/cloudStorage.ts` owns Supabase persistence and sync metadata.

### Canvas

- `Canvas.tsx` owns Konva `Stage` / `Layer`, pan/zoom, marquee selection, pointer dispatch, and rendering node components.
- Coordinates are stored in world space; the camera transforms world space to screen space.
- HTML overlays are used where normal DOM controls are better than Konva text input, especially text editing and context-sensitive toolbars.
- Node rendering lives under `src/components/nodes/`.

---

## Project Structure

```text
src/
  App.tsx                         root component, view routing, app-level callbacks
  main.tsx                        React entry point
  index.css                       Tailwind directives, theme tokens, global app styles
  theme.ts                        theme setup
  types/index.ts                  BoardData, Document, CanvasNode, Tool, Camera, PageMeta
  store/boardStore.ts             Zustand state and workspace actions
  contexts/AuthContext.tsx        Supabase session and auth methods
  components/
    TopBar.tsx                    app chrome, workspace actions, sync entry points
    CloudModal.tsx                optional cloud sync and auth UI
    WorkspaceExplorer.tsx         VS Code-style local workspace explorer
    DocumentMode.tsx              document/note editor surface
    FocusMode.tsx                 full-screen writing surface
    StackView.tsx                 vertical note/document browsing
    QuickSwitcher.tsx             keyboard note/page switcher
    Canvas.tsx                    Konva canvas surface and interaction dispatch
    Toolbar.tsx                   main tool palette
    CanvasToolbars.tsx            context-sensitive canvas controls
    DocFormattingBar.tsx          document formatting controls
    DocSidebar.tsx                document outline/sidebar
    nodes/                        Konva-backed canvas node components
  hooks/
    useDocumentAutoSave.ts        document autosave to workspace
    useCanvasInteraction.ts       pointer state for canvas interactions
    useCanvasKeyboard.ts          canvas keyboard shortcuts
    useCanvasImageDrop.ts         image drop/import handling
    useTreeState.ts               explorer tree expand/collapse state
  utils/
    workspaceManager.ts           local folder workspace persistence
    cloudStorage.ts               Supabase cloud workspace persistence
    applyWorkspaceSync.ts         sync metadata application
    exportMarkdown.ts             Markdown export
    exportZip.ts                  zip export
    documentExport.ts             document export helpers
    richText.ts                   rich-text serialization helpers
    focusNode.ts                  pan/scroll to canvas nodes
    supabase.ts                   Supabase client setup
```

Desktop/native code lives in `src-tauri/`. Public documentation and the static landing/app pages live in `docs/`.

---

## Adding a New Canvas Tool

1. Add the tool id to the `Tool` union in [src/types/index.ts](src/types/index.ts).
2. Add or extend the relevant node interface and `CanvasNode` union.
3. Handle placement/interaction in [src/components/Canvas.tsx](src/components/Canvas.tsx).
4. Add the control to [src/components/Toolbar.tsx](src/components/Toolbar.tsx) or a context toolbar.
5. Add the node renderer in `src/components/nodes/` if it is a new node type.
6. Add focused save/load/export coverage when the new node touches `BoardData`.

---

## Adding a Note/Document Feature

1. Start from [src/components/DocumentMode.tsx](src/components/DocumentMode.tsx) and the document helpers in `src/components/documentCommands.ts`.
2. Update the `Document` type if the feature needs persisted state.
3. Make sure local workspace save/load still materializes clean Markdown in `notes/`.
4. Preserve `[[wikilinks]]`, backlinks, and `@node:` references across export/import.
5. Check focus mode, stack view, quick switcher, and explorer behavior if the feature changes document navigation.

---

## Roadmap

### Done

- [x] Local-first workspace folder support
- [x] Markdown documents and note writing mode
- [x] `[[wikilinks]]`, backlinks, favorites, recents, stack view, and quick switcher
- [x] Focus mode for distraction-free writing
- [x] Infinite canvas with pan, zoom, dot grid, pages, sections, and templates
- [x] Sticky notes, text blocks, shapes, connectors, stickers, images, tables, task cards, links, document nodes, and code blocks
- [x] Context-sensitive toolbars, color controls, alignment guides, lock/group/ungroup, context menu, and keyboard nudge
- [x] Markdown, JSON, PNG, and zip export
- [x] Single-file browser build and Tauri desktop app
- [x] Optional cloud sync with GitHub, Google, email/password, and magic-link auth
- [x] Cloud workspace picker with create/open/rename/delete/push/pull
- [x] Local save and cloud sync status indicators

### Up Next

- [ ] Align manual/docs pages with the note-first positioning
- [ ] Board-wide text search across notes and canvas nodes
- [ ] Better note-link onboarding and first-run sample workspace
- [ ] Export selection as `.txt` / `.md`
- [ ] Toggle for auto-save / manual save mode

### Later / Ideas

- [ ] Freehand pen/draw tool
- [ ] Mini-map / overview panel
- [ ] More export options, including PDF and full-board image export
- [ ] Publishing or shareable read-only spaces
- [ ] Real-time collaboration
- [ ] More sync tiers, storage, and version history
