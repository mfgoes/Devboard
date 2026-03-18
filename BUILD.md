# DevBoard — Build & Release Guide

## Prerequisites

| Tool | Install |
|------|---------|
| Node.js 20+ | https://nodejs.org |
| Rust (stable) | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Butler (itch.io) | https://itch.io/docs/butler/installing.html |

**Linux build deps (Ubuntu/Debian):**
```bash
sudo apt-get install -y \
  libgtk-3-dev libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf
```

---

## First-time setup

```bash
# Install JS dependencies (includes @tauri-apps/cli)
npm install

# Generate all icon sizes from public/favicon.ico
npm run tauri:icon
```

This produces `src-tauri/icons/` with `.icns`, `.ico`, and all required PNG sizes.

---

## Local development

```bash
# Web dev server (browser only)
npm run dev

# Tauri desktop dev window (hot-reload via localhost:5173)
npm run tauri:dev
```

---

## Building

### Web build — single HTML file (itch.io)

Produces a self-contained `dist/index.html` via `vite-plugin-singlefile` (all JS/CSS inlined, no server needed).

```bash
npm run build
```

To zip for itch.io upload:

```bash
npm run zip
# → devboard-itchio.zip
```

### Desktop build — current platform

```bash
npm run tauri:build
```

Output locations:

| Platform | Path |
|----------|------|
| macOS DMG | `src-tauri/target/release/bundle/dmg/DevBoard_*.dmg` |
| macOS .app | `src-tauri/target/release/bundle/macos/DevBoard.app` |
| Windows NSIS | `src-tauri/target/release/bundle/nsis/DevBoard_*_x64-setup.exe` |
| Windows MSI | `src-tauri/target/release/bundle/msi/DevBoard_*.msi` |
| Linux .deb | `src-tauri/target/release/bundle/deb/devboard_*.deb` |
| Linux AppImage | `src-tauri/target/release/bundle/appimage/devboard_*.AppImage` |

### Cross-platform (explicit targets)

```bash
npm run tauri:build:mac-arm   # macOS Apple Silicon
npm run tauri:build:mac-x64   # macOS Intel
npm run tauri:build:win       # Windows x64 (must run on Windows)
npm run tauri:build:linux     # Linux x64 (must run on Linux)
```

> Tauri does not support true cross-compilation to Windows or Linux from macOS.
> Use GitHub Actions CI for those platforms (see below).

---

## Release workflow (itch.io via Butler)

### butler CLI setup

**Install (macOS):**
```bash
brew install itchio/itchio/butler
```

**Install (Linux):**
```bash
curl -L -o butler.zip https://broth.itch.ovh/butler/linux-amd64/LATEST/archive/default
unzip butler.zip -d ~/.local/bin/
chmod +x ~/.local/bin/butler
```

**Authenticate once:**
```bash
butler login
```

### Full release workflow

```bash
# 1. Build web version
npm run build
npm run zip

# 2. Build desktop (on each platform, or pull from CI artifacts — see below)
npm run tauri:build

# 3. Push HTML web build
butler push devboard-itchio.zip mischa/devboard:html

# 4. Push macOS build (run on macOS)
butler push "src-tauri/target/release/bundle/dmg/DevBoard_0.1.0_aarch64.dmg" mischa/devboard:mac-arm
butler push "src-tauri/target/release/bundle/dmg/DevBoard_0.1.0_x64.dmg" mischa/devboard:mac-x64

# 5. Push Windows build (run on Windows or from CI artifact)
butler push "src-tauri/target/release/bundle/nsis/DevBoard_0.1.0_x64-setup.exe" mischa/devboard:windows

# 6. Push Linux build (run on Linux or from CI artifact)
butler push "src-tauri/target/release/bundle/appimage/devboard_0.1.0_amd64.AppImage" mischa/devboard:linux
```

Replace `mischa/devboard` with your `username/game-slug` and update the version to match `package.json`.

---

## CI / Remote builds (GitHub Actions)

The workflow at `.github/workflows/tauri-build.yml` builds all four platforms automatically — no Windows or Linux machine required locally.

**Triggered by:**
- Push to `main` — builds all platforms, uploads as downloadable artifacts
- Git tag `v*` — builds all platforms **and creates a GitHub Release** with binaries attached

**Release a new version via tag:**
```bash
git tag v0.2.0
git push origin v0.2.0
```

After the run completes (~10–15 min), download the artifacts from the Actions page or the auto-created GitHub Release, then push to itch.io with butler.

---

## App icons

Icons are generated from `public/favicon.ico` and stored in `src-tauri/icons/`.

To regenerate (e.g. after updating the favicon):
```bash
npm run tauri:icon
```

To use a higher-quality source image (recommended — 1024×1024 PNG):
```bash
npx tauri icon path/to/icon-1024.png
```

---

## Flatpak (Linux — Flathub)

The manifest skeleton is at `src-tauri/io.devboard.app.yml`.

Flathub requires all dependencies vendored offline. Generate them:
```bash
# Vendor npm deps
npx @electron/flatpak-node-generator npm package-lock.json \
  -o src-tauri/flatpak-node-sources.json

# Vendor cargo deps
flatpak-cargo-generator src-tauri/Cargo.lock \
  -o src-tauri/flatpak-cargo-sources.json
```

Then add those files to the manifest `sources` section (see comments in `io.devboard.app.yml`) and open a PR to https://github.com/flathub/flathub.

---

## Version bumps

Update `version` in both `package.json` and `src-tauri/tauri.conf.json` before each release:

```json
"version": "0.2.0"
```

Tauri uses the version from `tauri.conf.json` for installer filenames and the About dialog.

---

## What changed from Electron

| | Electron (removed) | Tauri (current) |
|---|---|---|
| Bundle size | ~150 MB | ~5–10 MB |
| Runtime | Ships Chromium | Uses system WebView |
| Backend language | Node.js (`electron/main.cjs`) | Rust (`src-tauri/src/`) |
| Build tool | `electron-builder` | `@tauri-apps/cli` |
| Config | `electron-builder.yml` | `src-tauri/tauri.conf.json` |
| Output dir | `dist-electron/` | `src-tauri/target/release/bundle/` |
| Linux targets | AppImage | `.deb` + AppImage + Flatpak |
| CI | none | `.github/workflows/tauri-build.yml` |
| Icons | `public/icon.{ico,icns,png}` | `src-tauri/icons/` (auto-generated) |
