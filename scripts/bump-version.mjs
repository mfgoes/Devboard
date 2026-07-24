import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const bump = positional[0];

const doTag = flags.has('--tag');
const doCommit = doTag || flags.has('--commit');

const packageJsonPath = path.join(rootDir, 'package.json');
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
const cargoLockPath = path.join(rootDir, 'src-tauri', 'Cargo.lock');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

const currentVersion = readJson(packageJsonPath).version;
const current = parseSemver(currentVersion);
if (!current) {
  console.error(`Current package.json version "${currentVersion}" isn't plain X.Y.Z semver — fix it manually first.`);
  process.exit(1);
}

let nextVersion;
if (!bump || bump === 'patch') {
  nextVersion = `${current.major}.${current.minor}.${current.patch + 1}`;
} else if (bump === 'minor') {
  nextVersion = `${current.major}.${current.minor + 1}.0`;
} else if (bump === 'major') {
  nextVersion = `${current.major + 1}.0.0`;
} else if (parseSemver(bump)) {
  nextVersion = bump;
} else {
  console.error(`Usage: node scripts/bump-version.mjs [patch|minor|major|X.Y.Z] [--commit] [--tag]`);
  process.exit(1);
}

// package.json
const pkg = readJson(packageJsonPath);
pkg.version = nextVersion;
writeJson(packageJsonPath, pkg);

// src-tauri/tauri.conf.json
const tauriConf = readJson(tauriConfPath);
tauriConf.version = nextVersion;
writeJson(tauriConfPath, tauriConf);

// src-tauri/Cargo.toml — version = "..." inside [package]
const cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
const cargoTomlNext = cargoToml.replace(
  /(\[package\][^[]*?\nversion = ")[^"]+(")/,
  `$1${nextVersion}$2`,
);
if (cargoTomlNext === cargoToml) {
  console.error(`Could not find a "version" field under [package] in ${path.relative(rootDir, cargoTomlPath)}.`);
  process.exit(1);
}
fs.writeFileSync(cargoTomlPath, cargoTomlNext);

// src-tauri/Cargo.lock — version right after the devboard package header
const cargoLock = fs.readFileSync(cargoLockPath, 'utf8');
const cargoLockNext = cargoLock.replace(
  /(name = "devboard"\nversion = ")[^"]+(")/,
  `$1${nextVersion}$2`,
);
if (cargoLockNext === cargoLock) {
  console.error(`Could not find the "devboard" package entry in ${path.relative(rootDir, cargoLockPath)}.`);
  process.exit(1);
}
fs.writeFileSync(cargoLockPath, cargoLockNext);

const touchedFiles = [packageJsonPath, tauriConfPath, cargoTomlPath, cargoLockPath].map((p) =>
  path.relative(rootDir, p),
);

console.log(`Bumped version: ${currentVersion} -> ${nextVersion}`);
for (const f of touchedFiles) console.log(`  ${f}`);

if (doCommit) {
  execFileSync('git', ['add', ...touchedFiles], { cwd: rootDir, stdio: 'inherit' });
  execFileSync('git', ['commit', '-m', `Release v${nextVersion}`], { cwd: rootDir, stdio: 'inherit' });
  console.log(`Committed as "Release v${nextVersion}".`);
}

if (doTag) {
  execFileSync('git', ['tag', '-a', `v${nextVersion}`, '-m', `v${nextVersion}`], { cwd: rootDir, stdio: 'inherit' });
  console.log(`Tagged v${nextVersion}.`);
}

console.log('');
if (doTag) {
  console.log(`Next: git push origin main --follow-tags   # triggers the tauri-build.yml release job`);
} else if (doCommit) {
  console.log(`Next: git tag v${nextVersion} && git push origin main --tags`);
} else {
  console.log(`Next: review the diff, then re-run with --commit or --tag, or commit/tag manually.`);
}
