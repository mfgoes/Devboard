---
name: UX Improvements — Phases 1–3
description: Layout modes, StackView, and zoom-morph doc transition — what's done and what's next
type: project
---

## Completed (Phases 1–3)

**Data model:**
- `PageMeta.layoutMode?: 'freeform' | 'stack'` — default freeform
- `Document.pageId?: string` — defaults to `activePageId` on creation
- `BoardData.pages` type includes `layoutMode`
- Store: `setPageLayoutMode(id, mode)`, `openDocumentWithMorph(id, rect?)`, `morphSourceRect` (ephemeral)
- `addDocument` now defaults `pageId` to `activePageId`

**StackView (`src/components/StackView.tsx`):**
- Scrollable writing-first list for Stack pages
- Sort: Recent / A–Z / Tag
- "New note" button (with ⌘N hint)
- StackCard: title, 2-line stripped HTML preview, tags, relative date

**TopBar layout switcher:**
- Canvas / Stack segmented control added after the pages toggle

**Zoom-morph transition (replaces hard-cut full-screen):**
- `DocumentMode` no longer uses `position: fixed` — fills the morph frame
- `DocumentNode` cards pass their `getBoundingClientRect()` via `openDocumentWithMorph`
- StackCard clicks also pass source rect
- Morph: `opening → open → closing → idle` state machine in `App.tsx`
- 380ms CSS transition on left/top/width/height/border-radius
- Esc closes with reverse animation

**App.tsx changes:**
- Renders `<StackView>` or `<Canvas>` based on `activePage.layoutMode`
- Toolbar/ZoomToolbar hidden on Stack pages
- ⌘N on Stack page → creates new doc and opens it in morph

## Still TODO (Phases 4–5)

**Phase 4 — Cmd+K Quick Switcher:**
- `<QuickSwitcher>` component (search across pages, docs, canvas nodes)
- Register Cmd+K in App.tsx keydown handler
- `focusNode(id)` — pan camera + pulse node

**Phase 5 — Inline text features:**
- `[[Wikilinks]]` → clickable chip → opens referenced doc
- `@node:id` → green pill → focusNode
- `#hashtags` → highlighted inline
- Backlinks section in doc editor

**Why:** Designed per DEVBOARD_HANDOFF.md in `ClaudeDesign - Devboard improvements/`
**How to apply:** Phase 4 is self-contained; Phase 5 requires parsing in DocumentMode's contentEditable.
