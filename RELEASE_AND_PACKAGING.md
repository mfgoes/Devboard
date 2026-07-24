# DevBoard - Release and Packaging Guide

## Prerequisites

| Tool | Install |
|------|---------|
| Node.js 20+ | https://nodejs.org |
| Rust (stable) | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Butler (itch.io) | `brew install itchio/itchio/butler` → `butler login` |

---

## Local Development

```bash
npm run dev          # browser dev server
npm run tauri:dev    # Tauri desktop window (hot-reload)
```

---

## Build Outputs

### Web Bundle

```bash
npm run zip
# → devboard-itchio.zip + docs/app.html updated
```

Use `npm run release:html` when you want to build the web bundle and push both itch.io HTML channels.

### Desktop - Current Platform

```bash
npm run tauri:build
```

| Platform | Output |
|----------|--------|
| macOS (ARM) | `src-tauri/target/release/bundle/dmg/DevBoard_*.dmg` |
| Windows | `src-tauri/target/release/bundle/nsis/DevBoard_*-setup.exe` |
| Linux | `src-tauri/target/release/bundle/deb/*.deb` / `appimage/*.AppImage` |

### macOS ARM Cross-Build

```bash
npm run tauri:build:mac-arm
```

> macOS Intel (x86_64) is no longer supported.

---

## Release to itch.io

### HTML Web Build
```bash
npm run release:html
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
gh run download <RUN_ID> --repo mfgoes/Devboard --name devboard-windows-x64 --dir /tmp/devboard-win-build
butler push "/tmp/devboard-win-build/DevBoard-Windows.exe" mischa/devboard:windows
```

Each CI build also produces fixed-name artifacts:

- `DevBoard-macOS.dmg`
- `DevBoard-macOS.app.tar.gz`
- `DevBoard-Windows.exe`
- `DevBoard-Linux.AppImage`

Tagged releases include updater signatures where applicable. The fixed names are used as stable `releases/latest/download/` URLs on the download page.

### Linux - Local Build

Linux requires the GTK/WebKit system libraries that aren't available on macOS.
CI builds Linux automatically. Use these local options only when you need to test or publish a Linux build outside CI.

#### Option A - Docker

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
src-tauri/target/release/bundle/appimage/DevBoard_*.AppImage
```

Copy it to a fixed name and push:
```bash
cp src-tauri/target/release/bundle/appimage/DevBoard_*.AppImage DevBoard-Linux.AppImage
butler push DevBoard-Linux.AppImage mischa/devboard:linux
```

> **First time with Docker?** `docker login ghcr.io` shouldn't be needed for this public image.
> If the pull fails, use the alternative Debian-based approach below.

#### Option A Alternative - Debian Slim

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
cp src-tauri/target/release/bundle/appimage/DevBoard_*.AppImage DevBoard-Linux.AppImage
butler push DevBoard-Linux.AppImage mischa/devboard:linux
```

#### Option B - Native Linux

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
cp src-tauri/target/release/bundle/appimage/DevBoard_*.AppImage DevBoard-Linux.AppImage
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

## CI and GitHub Releases

Workflow: `.github/workflows/tauri-build.yml`

**Triggers:**
- Push to `main`: builds all platforms and uploads artifacts
- Tag `v*`: builds all platforms and creates a GitHub Release

```bash
git tag vX.Y.Z && git push origin vX.Y.Z
# About 10-15 min later, binaries appear in the GitHub Release.
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

## Version Bumps and Updater Signing

Use the bump script instead of hand-editing version numbers — it keeps `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` in sync (all four must match for the Tauri build to be consistent).

```bash
npm run version:bump               # patch bump (0.4.3 -> 0.4.4), no commit/tag
npm run version:bump -- minor      # minor bump (0.4.3 -> 0.5.0)
npm run version:bump -- major      # major bump (0.4.3 -> 1.0.0)
npm run version:bump -- 1.2.3      # set an explicit version
npm run version:bump -- patch --tag   # bump, commit "Release vX.Y.Z", and create the git tag
```

`--tag` implies `--commit`. Without either flag the script only edits the four files locally so you can review the diff first. It never pushes — push explicitly when you're ready to trigger CI:

```bash
git push origin main --follow-tags   # runs .github/workflows/tauri-build.yml and, for the tag, creates the GitHub Release
```

The desktop app's built-in updater now uses Tauri's signed updater flow and checks `https://github.com/mfgoes/Devboard/releases/latest/download/latest.json`.

Before building release binaries, make sure these environment values are available:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if your key uses one
- `TAURI_UPDATER_PUBKEY`

Generate the signing keypair once with the Tauri CLI and store the private key safely. The private key must stay stable across future releases or installed apps will stop accepting updates.
