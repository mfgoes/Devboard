import fs from 'node:fs';
import path from 'node:path';

const [tagName, artifactsDir = 'artifacts'] = process.argv.slice(2);

if (!tagName) {
  console.error('Usage: node scripts/generate-updater-json.mjs <tag> [artifacts-dir]');
  process.exit(1);
}

const repo = 'mfgoes/Devboard';
const version = tagName.replace(/^v/, '');
const releaseBaseUrl = `https://github.com/${repo}/releases/download/${tagName}`;
const manifestPath = path.join(artifactsDir, 'latest.json');

const platformFiles = [
  {
    key: 'darwin-aarch64',
    file: 'DevBoard-macOS.app.tar.gz',
    signatureFile: 'DevBoard-macOS.app.tar.gz.sig',
  },
  {
    key: 'linux-x86_64',
    file: 'DevBoard-Linux.AppImage',
    signatureFile: 'DevBoard-Linux.AppImage.sig',
  },
  {
    key: 'windows-x86_64',
    file: 'DevBoard-Windows.exe',
    signatureFile: 'DevBoard-Windows.exe.sig',
  },
];

const platforms = {};

for (const { key, file, signatureFile } of platformFiles) {
  const signaturePath = path.join(artifactsDir, signatureFile);
  const assetPath = path.join(artifactsDir, file);

  if (!fs.existsSync(signaturePath)) {
    throw new Error(`Missing updater signature: ${signatureFile}`);
  }
  if (!fs.existsSync(assetPath)) {
    throw new Error(`Missing updater asset: ${file}`);
  }

  platforms[key] = {
    signature: fs.readFileSync(signaturePath, 'utf8').trim(),
    url: `${releaseBaseUrl}/${file}`,
  };
}

const manifest = {
  version,
  notes: `https://github.com/${repo}/releases/tag/${tagName}`,
  pub_date: new Date().toISOString(),
  platforms,
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${manifestPath}`);
