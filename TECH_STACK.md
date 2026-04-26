# DevBoard — Tech Stack

## Overview

DevBoard is a FigJam-style whiteboard application built as a single-page React app. The current distribution target is a **single self-contained HTML file** (no server, no install). The planned future target is a **desktop executable (.exe / native app)** via Electron or Tauri.

---

## Runtime

| Layer | Technology | Version | Notes |
|---|---|---|---|
| UI framework | React | 18.2 | Functional components, hooks only |
| Language | TypeScript | 5.2 | Strict mode, ESNext target |
| Canvas rendering | Konva.js + react-konva | 9.3.6 / 18.2.10 | 2D canvas via HTML5 `<canvas>` |
| State management | Zustand | 4.5 | `persist` middleware → localStorage |
| Styling | Tailwind CSS | 3.4 | Utility classes for all chrome/UI |
| File export | file-saver | 2.0 | Browser `saveAs()` for JSON + PNG |

---

## Build Tooling

| Tool | Version | Role |
|---|---|---|
| Vite | 5.2 | Dev server + production bundler |
| `@vitejs/plugin-react` | 4.2 | Babel-based JSX transform + HMR |
| `vite-plugin-singlefile` | 2.0 | Inlines all JS + CSS into one `dist/index.html` |
| esbuild | (via Vite) | Fast TS/JS transpilation |
| PostCSS + Autoprefixer | 8.4 / 10.4 | CSS processing for Tailwind |

**Build output:** `dist/index.html` — a single file with all JS, CSS, and assets inlined. No network requests needed at runtime. Currently deployed to itch.io.

### Key build config (`vite.config.ts`)
```ts
viteSingleFile()          // inlines everything
target: 'esnext'          // modern JS, no legacy polyfills
assetsInlineLimit: 100MB  // forces all assets inline
cssCodeSplit: false        // single CSS bundle
```

---

## Architecture

### Canvas
- `Stage` → `Layer` → Konva node components
- All canvas coordinates are in **world space**; camera `{ x, y, scale }` transforms to screen space
- Pan: spacebar+drag or middle-mouse; Zoom: Ctrl+scroll / pinch
- Node types rendered: `StickyNoteNode`, `ShapeNode`, `TextBlockNode`, `ConnectorNode`, `SectionNode`

### State (`src/store/boardStore.ts`)
- Single Zustand store, persisted to `localStorage` under key `devboard-v1`
- Non-persisted state: `clipboard`, `past`/`future` (undo stack), `activeShapeKind`
- History: manual `saveHistory()` call before mutations; `undo()`/`redo()` swap `past`/`future` stacks

### Data model (`src/types/index.ts`)
- `CanvasNode` = `StickyNoteNode | ConnectorNode | TextBlockNode | ShapeNode | SectionNode`
- Board serialised as `{ boardTitle: string; nodes: CanvasNode[] }` — plain JSON, no binary

### HTML overlays
- Text editing uses a positioned `<textarea>` over the canvas (not Konva text input)
- Toolbars (ShapeToolbar, TextBlockToolbar, etc.) are HTML `<div>` elements positioned via camera math

---

## Data Persistence

| Mechanism | What | When |
|---|---|---|
| `localStorage` (`devboard-v1`) | Board nodes + camera | Auto, on every state change |
| JSON export (`file-saver`) | Full `BoardData` object | Manual — "Save JSON" button |
| PNG export | `stage.toDataURL()` | Manual — "Export PNG" button |
| URL share | Base64-encoded JSON in `window.location.hash` | Manual — "Share" button |

---

## Desktop App

DevBoard ships as a **Tauri** desktop app for macOS, Windows, and Linux.

### Current path: **Tauri**

- Tauri uses the OS webview, which keeps desktop bundles much smaller than an Electron wrapper.
- The React/Vite frontend stays the same; the native layer is handled in Rust under `src-tauri/`.
- Desktop packaging, native menus, and release builds are documented in `BUILD.md`.

### What stays shared with the web app

- All React components and Konva canvas code
- Zustand store logic
- TypeScript types
- Tailwind styling
- Vite build pipeline

---

## Project Structure

```
src/
  types/index.ts              Node types, Tool, Camera, BoardData
  store/boardStore.ts         Zustand store (state + all actions)
  App.tsx                     Root; keyboard shortcuts (Cmd+Z/Y/C/V/D)
  main.tsx                    React entry point
  index.css                   Tailwind directives + canvas overrides
  components/
    Canvas.tsx                Stage, pan/zoom, tool dispatch, marquee select
    TopBar.tsx                Title, Export PNG/JSON, Load, Share
    Toolbar.tsx               Bottom floating tool palette
    TextEditor.tsx            Textarea overlay for in-place text editing
    MultiSelectToolbar.tsx    Align + bulk text ops for multi-selection
    StickyColorPicker.tsx     Color swatches for sticky notes
    ShapeToolbar.tsx          Shape kind, fill, stroke, text styling
    TextBlockToolbar.tsx      Text color, size, bold/italic/underline, link
    ConnectorToolbar.tsx      Line style, stroke, arrow head options
    SectionToolbar.tsx        Section name + color
    ColorSwatches.tsx         Shared reusable color swatch grid
    nodes/
      StickyNote.tsx          Sticky note Konva component
      ShapeNode.tsx           Shape (rect/ellipse/diamond/triangle) Konva component
      TextBlock.tsx           Free text block Konva component
      ConnectorLine.tsx       Bezier/orthogonal connector + geometry helpers
      SectionNode.tsx         Section/frame Konva component
```

---

## Commands

```bash
npm run dev      # Vite dev server at localhost:5173
npm run build    # tsc + vite build → dist/index.html (single file)
npm run preview  # Serve dist/ locally
npm run zip      # build + zip dist/index.html → devboard-itchio.zip
```
