# DevBoard

**The note app that thinks visually.** A focused Markdown editor with `[[wikilinks]]` and a real infinite canvas — in one offline workspace. Your folder, your files, no account.

[Open in browser](https://mfgoes.github.io/Devboard/) · [Download](https://mfgoes.github.io/Devboard/download.html) · [Manual](https://mfgoes.github.io/Devboard/manual.html)

---

## Why DevBoard exists

Most workflows end up split across two apps: one for writing and linking notes, another for diagrams and visual thinking. Switching between them loses the connection — your character notes don't know about the relationship map you drew, your architecture doc doesn't know about the diagram next to it.

DevBoard puts both modes in one workspace, on one folder on your disk:

- **Write** in a clean Markdown editor with `[[wikilinks]]`, backlinks, and focus mode.
- **Map** on an infinite canvas with sticky notes, shapes, connectors, and code blocks.
- **Cross-reference** — `@node:` mention any canvas node from inside a document; jump from doc to canvas with one click.

No cloud. No account. No sync server. The workspace is just a local folder of Markdown and JSON — open it in VS Code, version it with `git`, back it up however you like.

---

## Who it's for

**Writers and worldbuilders** — link characters, locations, and chapters with `[[wikilinks]]`. Use focus mode for deep work, stack view to browse everything, canvas mode to plot story structure visually.

**Second-brain / PKM users** — a real backlinks panel, Markdown files on disk, full keyboard navigation. Not a plugin you have to install — built in.

**Solo devs and indie makers** — diagrams, planning boards, and code-block notes in the same workspace as your project README. Single-file build, fully offline.

---

## Key features

### Notes and documents
- Clean Markdown editor with rich-text formatting toolbar
- `[[Wikilinks]]` between notes + backlinks panel
- `@node:` mentions — reference canvas nodes from inside a document
- Focus mode — full-screen, distraction-free writing
- Stack view — browse all documents as a vertical list
- Markdown export

### Workspace
- Open any local folder as a workspace (File System Access API)
- VS Code-style file explorer sidebar
- Multiple canvas pages alongside Markdown notes
- Quick switcher (`⌘K`) to jump between notes and pages

### Canvas
- Sticky notes, shapes, freeform text, code blocks with syntax highlighting
- Bezier, straight, and orthogonal connector arrows
- Sections, snap guides, alignment tools
- Copy / paste / duplicate, undo / redo, image drop
- Pin document nodes onto the canvas

### General
- Fully offline — no server, no account, single-file build
- Desktop app for macOS, Windows, and Linux (via Tauri)
- Themes: dark mode + color schemes
- Share link (base64 URL of board state)
- Export: PNG, JSON, Markdown

---

## Try it

[Open in browser →](https://mfgoes.github.io/Devboard/) — no install, no login.

[Download the desktop app →](https://mfgoes.github.io/Devboard/download.html) — macOS, Windows, Linux.

---

## Documentation

| | |
|---|---|
| [Manual](https://mfgoes.github.io/Devboard/manual.html) | Full feature guide and keyboard shortcuts |
| [Download page](https://mfgoes.github.io/Devboard/download.html) | Desktop app downloads |
| [Self-hosting](https://mfgoes.github.io/Devboard/self-hosting.html) | Run your own instance |
| [Development guide](DEVELOPMENT.md) | Dev setup, project structure, adding tools, roadmap |
| [Build & release guide](BUILD.md) | Desktop builds, itch.io deployment, CI |
