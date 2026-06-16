# DevBoard

**The note app that thinks visually.**  
Write Markdown notes, connect ideas with links and backlinks, then map the bigger picture on an infinite canvas.

[Open in browser](https://mfgoes.github.io/Devboard/) · [Download](https://mfgoes.github.io/Devboard/download.html) · [Manual](https://mfgoes.github.io/Devboard/manual.html)

---

## Why DevBoard exists

DevBoard starts with a simple goal: help you clear your head by writing things down, then connect those notes when the shape of the idea starts to appear.

Most note apps are good at pages. Most whiteboard tools are good at diagrams. But real thinking moves between both: a quick note becomes a related note, a backlink reveals a pattern, and eventually the pieces need a visual map.

DevBoard starts with notes and keeps the canvas close by:

- **Write** Markdown notes before the thought disappears
- **Link** related notes with `[[wikilinks]]`, backlinks, favorites, recents, and quick navigation
- **Focus** on one note or browse related notes in stack view
- **Map** connected ideas on an infinite canvas with stickies, shapes, sections, connectors, images, and code blocks
- **Reference** canvas nodes from documents with `@node:` mentions

It is for ideas that start as messy notes, grow through links and backlinks, and eventually need to become a visible system.

---

## Local-first, with optional EU cloud sync

DevBoard works without an account. Your workspace is a folder of Markdown and JSON files on your machine.

When you want backup or multi-device access, you can sign in with GitHub or Google and sync selected workspaces through EU-hosted Supabase storage.

Cloud sync is optional. Local ownership stays the default.

---

## Local and cloud

DevBoard is free to use locally. The core note-taking, canvas, linking, and export features are not meant to sit behind a subscription.

Cloud sync is the convenience layer: backup, continuity, and access from more than one device. Local files remain the source of trust.

Local use includes:

- Unlimited local workspaces
- Markdown notes, canvas pages, and local assets
- `[[wikilinks]]`, backlinks, favorites, and `@node:` references
- Export to Markdown, JSON, PNG, and zip
- No account required

Optional sync adds:

- GitHub and Google login
- EU-hosted cloud storage
- Cloud workspace picker for create/open/rename/delete
- Push/pull sync for selected workspaces
- Local save and cloud sync status indicators


## Who it's for

**Writers & worldbuilders**  
Link characters, locations, and chapters with `[[wikilinks]]`. Use the canvas to map relationships and story structure.

**PKM / second-brain users**  
Backlinks, plain Markdown files, keyboard-first navigation — built in, not bolted on.

**Indie devs & makers**  
Keep architecture diagrams, planning boards, and notes next to your project files — all in one workspace.

---

## Key features

### ✍️ Notes-first workflow
- Markdown notes are the starting point
- `[[Wikilinks]]`, backlinks, favorites, recents, and quick switcher
- Focus mode for deep writing
- Stack view for browsing related notes
- `@node:` mentions — reference canvas nodes inside documents

### 🧠 Canvas (visual thinking)
- Infinite canvas — no limits  
- Sticky notes, shapes, free text, code blocks  
- Connectors (Bezier, straight, orthogonal)  
- Sections, alignment tools, snap guides  
- Embed documents directly onto the canvas  

### 📂 Workspace
- Open any local folder as a workspace  
- File explorer (VS Code-style)  
- Multiple canvas pages + Markdown notes  
- Favorites, recents, and quick switcher (`⌘K`)  

### 📱 Mobile-friendly notes
- Responsive note browsing and writing views
- Dedicated mobile navigation for folders, notes, search, sync, and account access
- Touch-friendly access to core note and canvas workflows
- Folder-based local workspaces still work best on desktop browsers or the desktop app

### ☁️ Sync (optional)
- Cloud backup and sync for selected workspaces  
- GitHub / Google login  
- Hosted in EU (NL) infrastructure  
- Built on Supabase with EU-region storage  
- Create, open, rename, delete, push, and pull synced workspaces  
- Local save and cloud sync status indicators  

### ⚙️ General
- Local-first by default  
- Desktop app (macOS, Windows, Linux via Tauri)  
- Themes (dark mode + color schemes)  
- Share boards via link (base64 state)  
- Export: PNG, JSON, Markdown  

---

## Try it

[Open in browser →](https://mfgoes.github.io/Devboard/)  
No install required.

[Download the desktop app →](https://mfgoes.github.io/Devboard/download.html)  
macOS · Windows · Linux

---

## Documentation

| | |
|---|---|
| [Manual](https://mfgoes.github.io/Devboard/manual.html) | Full feature guide |
| [Download page](https://mfgoes.github.io/Devboard/download.html) | Desktop builds |
| [Self-hosting](https://mfgoes.github.io/Devboard/self-hosting.html) | Run your own instance |
| [Engineering guide](DEVBOARD_ENGINEERING_GUIDE.md) | Development setup, tech stack, architecture, project structure, roadmap |
| [Release and packaging guide](RELEASE_AND_PACKAGING.md) | Desktop packaging, updater artifacts, itch.io, and GitHub releases |

---

## Philosophy

DevBoard isn’t trying to be “another SaaS note app.”

It’s a **local-first note app for connected thinking** — with optional cloud convenience.

- Write first, before the thought disappears
- Link notes when ideas start to connect
- Map the bigger picture when the page is not enough
- Keep your files yours
