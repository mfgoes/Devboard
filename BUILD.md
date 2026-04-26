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

### Windows (download from CI, then push)

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

> Each build also produces fixed-name artifacts (`DevBoard-macOS.dmg`, `DevBoard-Windows.exe`,
> `DevBoard-Linux.AppImage`) alongside the versioned ones. These are used as stable
> `releases/latest/download/` URLs on the download page.

### Linux — local build (no CI required)

Linux requires the GTK/WebKit system libraries that aren't available on macOS.
Two options: **Docker** (from any machine) or **native Linux**.

#### Option A — Docker (from macOS or any host)

```bash
# Pull the Tauri community Linux builder image
docker pull ghcr.io/tauri-apps/tauri-action-linux-x64:latest

# Run the build inside the container (mounts repo read/write)
docker run --rm \
  -v "$(pwd):/app" \
  -w /app \
  ghcr.io/tauri-apps/tauri-action-linux-x64:latest \
  bash -c "npm ci && npm run tauri:build"
```

The AppImage lands at:
```
src-tauri/target/release/bundle/appimage/devboard_*.AppImage
```

Copy it to a fixed name and push:
```bash
cp src-tauri/target/release/bundle/appimage/devboard_*.AppImage DevBoard-Linux.AppImage
butler push DevBoard-Linux.AppImage mischa/devboard:linux
```

> **First time with Docker?** `docker login ghcr.io` shouldn't be needed for this public image.
> If the pull fails, use the alternative Debian-based approach below.

#### Option A (alternative) — Debian slim + manual deps

```bash
docker run --rm \
  -v "$(pwd):/app" \
  -w /app \
  rust:1-slim-bookworm \
  bash -c "
    apt-get update -q && apt-get install -y --no-install-recommends \
      curl ca-certificates nodejs npm \
      libgtk-3-dev libwebkit2gtk-4.1-dev \
      libayatana-appindicator3-dev librsvg2-dev patchelf && \
    npm ci && npm run tauri:build
  "
cp src-tauri/target/release/bundle/appimage/devboard_*.AppImage DevBoard-Linux.AppImage
butler push DevBoard-Linux.AppImage mischa/devboard:linux
```

#### Option B — native Linux machine

Install system deps (Ubuntu/Debian):
```bash
sudo apt-get update
sudo apt-get install -y \
  libgtk-3-dev libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf
```

Then build and push exactly like macOS:
```bash
npm ci
npm run tauri:build
cp src-tauri/target/release/bundle/appimage/devboard_*.AppImage DevBoard-Linux.AppImage
butler push DevBoard-Linux.AppImage mischa/devboard:linux
```

> Make sure `butler` is installed and logged in on the Linux machine:
> ```bash
> # Install butler on Linux
> curl -L https://broth.itch.ovh/butler/linux-amd64/LATEST/archive/default -o butler.zip
> unzip butler.zip && chmod +x butler && sudo mv butler /usr/local/bin/
> butler login
> ```

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

The desktop app's built-in updater now uses Tauri's signed updater flow and checks `https://github.com/mfgoes/Devboard/releases/latest/download/latest.json`.

Before building release binaries, make sure these environment values are available:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if your key uses one
- `TAURI_UPDATER_PUBKEY`

Generate the signing keypair once with the Tauri CLI and store the private key safely. The private key must stay stable across future releases or installed apps will stop accepting updates.
