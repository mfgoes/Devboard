# DevBoard — Build Guide

How to compile DevBoard for different targets and upload to itch.io.

---

## Prerequisites

Install all dependencies (first time only):

```bash
npm install
```

This installs everything including `electron` and `electron-builder`.

---

## Targets

### 1. Web — single HTML file (current itch.io release)

```bash
npm run build
```

Output: `dist/index.html` — a self-contained single file, no server needed.

To zip it for itch.io:

```bash
npm run zip
```

Output: `devboard-itchio.zip` in the repo root. Upload this zip to itch.io as an HTML game/tool.

---

### 2. Desktop — Windows `.exe`

```bash
npm run electron:build:win
```

Output: `dist-electron/DevBoard Setup <version>.exe`

This produces an NSIS installer that users can run to install DevBoard on Windows.

---

### 3. Desktop — macOS `.dmg`

```bash
npm run electron:build:mac
```

Output: `dist-electron/DevBoard-<version>.dmg`

Builds universal binaries for both x64 (Intel) and arm64 (Apple Silicon).

> Note: macOS builds must be signed and notarized for Gatekeeper. For unsigned local testing, users need to right-click → Open.

---

### 4. Desktop — Linux AppImage

```bash
npm run electron:build:linux
```

Output: `dist-electron/DevBoard-<version>.AppImage`

---

### 5. All platforms at once

```bash
npm run electron:build:all
```

Cross-compiling from macOS to Windows requires Wine (`brew install --cask wine-stable`).
Cross-compiling from Windows to macOS is not possible — macOS builds need a Mac.

---

## Local Electron dev (test without packaging)

```bash
npm run electron:dev
```

This builds `dist/index.html` then opens it in an Electron window. Useful for checking window chrome, minimum size, and external link handling before packaging.

---

## Uploading to itch.io

### HTML version (recommended for web play)

1. Run `npm run zip` → produces `devboard-itchio.zip`
2. Go to your itch.io game page → Edit game
3. Under **Uploads**, add the zip and set kind to **HTML**
4. Check **This file will be played in the browser**
5. Set viewport size to `1280 × 720` (or larger)

### Desktop version — macOS `.dmg`

1. Run `npm run electron:build:mac` → produces `dist-electron/DevBoard-<version>-arm64.dmg`
2. On itch.io, add a new upload → select the `.dmg`
3. Set platform to **macOS**

Via butler:

```bash
butler push "dist-electron/DevBoard-0.1.0-arm64.dmg" mischa/devboard:mac
```

### Desktop version — Windows portable (no installer)

1. Run `npm run electron:build:win` → produces `dist-electron/win-unpacked/` (portable folder, no installer)
2. Users run `DevBoard.exe` directly from the folder — no install needed

Via butler (pushes the whole folder, butler zips it automatically):

```bash
butler push dist-electron/win-unpacked mischa/devboard:windows
```

---

## butler CLI setup

[butler](https://itchio.itch.io/butler) is the itch.io command-line upload tool. Faster than the web UI and tracks build history.

**Install (macOS):**

```bash
brew install itchio/itchio/butler
```

Or download manually from https://itchio.itch.io/butler and add to your PATH.

**Authenticate once:**

```bash
butler login
```

**Full release workflow (HTML + Mac):**

```bash
# 1. Build everything
npm run build
npm run electron:build:mac

# 2. Push HTML web build
butler push devboard-itchio.zip mischa/devboard:html

# 3. Push macOS build
butler push "dist-electron/DevBoard-0.1.0-arm64.dmg" mischa/devboard:mac

# 4. Push Windows portable build (if built on Windows or via cross-compile)
butler push dist-electron/win-unpacked mischa/devboard:windows
```

Replace `mischa/devboard` with your itch.io `username/game-slug` and update the version number to match `package.json`.

---

## App icons

electron-builder expects icons at:

| File | Used for |
|---|---|
| `public/icon.ico` | Windows (multi-size ICO) |
| `public/icon.icns` | macOS |
| `public/icon.png` | Linux (512×512 recommended) |

To generate them from a single 1024×1024 PNG, use [electron-icon-maker](https://github.com/jaretburkett/electron-icon-maker):

```bash
npx electron-icon-maker --input=public/icon-source.png --output=public/
```

---

## Version bumps

Update `version` in `package.json` before each release:

```json
"version": "0.2.0"
```

electron-builder uses this for the installer filename and About dialog.
