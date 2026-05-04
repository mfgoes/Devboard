# DevBoard

**The note app that thinks visually.**  
A focused Markdown editor with `[[wikilinks]]` and a real infinite canvas — now with optional cloud sync.

[Open in browser](https://mfgoes.github.io/Devboard/) · [Download](https://mfgoes.github.io/Devboard/download.html) · [Manual](https://mfgoes.github.io/Devboard/manual.html)

---

## Why DevBoard exists

Some ideas do not fit in a linear document.

Writers need character maps next to chapters. Developers need architecture diagrams next to technical notes. Researchers and PKM users need backlinks, references, and visual structure in the same place.

Most tools force that work across two apps: one for writing, another for diagrams. That breaks the thread — your notes lose the map, and your map loses the context.

DevBoard brings both modes into one local-first workspace:

- **Write** in Markdown with `[[wikilinks]]`, backlinks, and focus mode
- **Map** ideas on an infinite canvas with notes, shapes, connectors, and code blocks
- **Connect** documents and canvas nodes with `@node:` references

It is the place for ideas that start as notes, become systems, and need to stay connected.

---

## Local-first, with optional EU cloud sync

DevBoard works without an account. Your workspace is a folder of Markdown and JSON files on your machine.

When you want backup or multi-device access, you can sign in with GitHub or Google and sync up to 3 workspaces through EU-hosted cloud storage.

Cloud sync is optional. Local ownership stays the default.

---

## Future subscriptions

DevBoard is free to use locally. The core note-taking, canvas, linking, and export features are not meant to sit behind a subscription.

In the future, paid plans will focus on convenience, storage, and continuity — the parts that cost money to run — while keeping the local-first workflow intact.

### Free / Local

For people who want a private, offline workspace.

- Unlimited local workspaces
- Markdown notes and canvas pages
- `[[wikilinks]]`, backlinks, and `@node:` references
- Local folder storage
- Manual backup and `git` workflows
- Export to Markdown, JSON, and PNG
- No account required

### Sync

For people who want backup and access across devices.

**Proposed price:** €5/month, or €48/year  
**Early supporter price:** €4/month, or €36/year

Includes:

- Cloud sync for up to 3 workspaces
- GitHub or Google login
- EU-hosted cloud storage
- Automatic backup
- Multi-device access
- Future version history / restore points

This pricing is intentionally close to other local-first sync products rather than full SaaS whiteboard tools. The goal is to make cloud sync sustainable without making DevBoard feel like another subscription-first app.

### Possible future paid extras

These are not part of the core promise, but may become paid add-ons later:

- More synced workspaces
- More cloud storage
- Longer version history
- Publishing or shareable read-only spaces
- Collaboration features
- Team or project workspaces
- Priority support

The goal is simple: DevBoard should be sustainable without turning into a lock-in SaaS product.

Local stays free. Cloud convenience pays for the infrastructure.


## Who it's for

**Writers & worldbuilders**  
Link characters, locations, and chapters with `[[wikilinks]]`. Use the canvas to map relationships and story structure.

**PKM / second-brain users**  
Backlinks, plain Markdown files, keyboard-first navigation — built in, not bolted on.

**Indie devs & makers**  
Keep architecture diagrams, planning boards, and notes next to your project files — all in one workspace.

---

## Key features

### ✍️ Notes and knowledge graph
- Clean Markdown editor with formatting toolbar  
- `[[Wikilinks]]` between notes  
- Backlinks panel (bi-directional linking)  
- `@node:` mentions — reference canvas nodes inside documents  
- Focus mode for deep work  
- Stack view for browsing notes  

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
- Quick switcher (`⌘K`)  

### ☁️ Sync (optional)
- Cloud backup & sync (up to 3 workspaces)  
- GitHub / Google login  
- Hosted in EU (NL) infrastructure  
- Built on Supabase → AWS (EU region)  

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
| [Development guide](DEVELOPMENT.md) | Project structure, roadmap |
| [Build & release guide](BUILD.md) | Packaging & deployment |

---

## Philosophy

DevBoard isn’t trying to be “another SaaS note app.”

It’s a **local-first thinking tool** — with optional cloud convenience.

- Your files stay yours  
- Your workflow stays flexible  
- Your ideas stay connected  
