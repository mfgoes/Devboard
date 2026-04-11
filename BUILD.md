# DevBoard — Build & Release Guide

## Prerequisites

| Tool | Install |
|------|---------|
| Node.js 20+ | https://nodejs.org |
| Rust (stable) | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Butler (itch.io) | `brew install itchio/itchio/butler` → `butler login` |

---

## Local development

```bash
npm run dev          # browser dev server
npm run tauri:dev    # Tauri desktop window (hot-reload)
```

---

## Building

### Web (itch.io HTML)

```bash
npm run zip
# → devboard-itchio.zip + docs/app.html updated
```

### Desktop — current platform

```bash
npm run tauri:build
```

| Platform | Output |
|----------|--------|
| macOS (ARM) | `src-tauri/target/release/bundle/dmg/DevBoard_*.dmg` |
| Windows | `src-tauri/target/release/bundle/nsis/DevBoard_*_x64-setup.exe` |
| Linux | `src-tauri/target/release/bundle/deb/*.deb` / `appimage/*.AppImage` |

### macOS ARM cross-build (explicit target)

```bash
npm run tauri:build:mac-arm
```

> macOS Intel (x86_64) is no longer supported.

---

## Releasing to itch.io

### HTML web build
```bash
npm run zip
butler push devboard-itchio.zip mischa/devboard:html
```

### macOS ARM
```bash
# Build locally, then:
butler push "src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/DevBoard_*.dmg" mischa/devboard:mac-arm
```

### Windows & Linux (download from CI, then push)

Trigger a build if one hasn't run yet:
```bash
gh workflow run tauri-build.yml --repo mfgoes/Devboard
```

Find the run ID:
```bash
gh run list --workflow=tauri-build.yml --repo mfgoes/Devboard --limit=5
```

Download and push Windows:
```bash
gh run download <RUN_ID> --repo mfgoes/Devboard --name devboard-windows-x64 --dir /tmp/win-build
butler push "/tmp/win-build/DevBoard_*_x64-setup.exe" mischa/devboard:windows
```

Download and push Linux:
```bash
gh run download <RUN_ID> --repo mfgoes/Devboard --name devboard-linux-x64 --dir /tmp/linux-build
butler push "/tmp/linux-build/DevBoard-Linux.AppImage" mischa/devboard:linux
```

> Each build also produces fixed-name artifacts (`DevBoard-macOS.dmg`, `DevBoard-Windows.exe`,
> `DevBoard-Linux.AppImage`) alongside the versioned ones. These are used as stable
> `releases/latest/download/` URLs on the download page.

---

## CI (GitHub Actions)

Workflow: `.github/workflows/tauri-build.yml`

**Triggers:**
- Push to `main` — builds all platforms, uploads as artifacts
- Tag `v*` — builds all platforms and creates a GitHub Release

```bash
git tag v0.2.0 && git push origin v0.2.0
# ~10–15 min → binaries in the GitHub Release
```

**Platforms built:** macOS ARM, Windows x64, Linux x64.

---

## Icons

Generated from `public/favicon.ico` into `src-tauri/icons/`:

```bash
npm run tauri:icon
# or with a high-res source:
npx tauri icon path/to/icon-1024.png
```

---

## Version bumps

Update `version` in `package.json` **and** `src-tauri/tauri.conf.json` before each release.
