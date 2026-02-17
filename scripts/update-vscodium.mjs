#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'apps', 'wrapper', 'vscodium-manifest.json');

const PLATFORM_ASSETS = [
  { key: 'linux-x64', filename: (v) => `VSCodium-linux-x64-${v}.tar.gz` },
  { key: 'linux-arm64', filename: (v) => `VSCodium-linux-arm64-${v}.tar.gz` },
  { key: 'darwin-x64', filename: (v) => `VSCodium-darwin-x64-${v}.zip` },
  { key: 'darwin-arm64', filename: (v) => `VSCodium-darwin-arm64-${v}.zip` },
  { key: 'win32-x64', filename: (v) => `VSCodium-win32-x64-${v}.zip` },
  { key: 'win32-arm64', filename: (v) => `VSCodium-win32-arm64-${v}.zip` }
];

async function fetchSha256(version, assetName) {
  const url = `https://github.com/VSCodium/vscodium/releases/download/${version}/${assetName}.sha256`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch checksum for ${assetName}: HTTP ${res.status}`);
  }
  const body = (await res.text()).trim();
  const hash = body.split(/\s+/)[0];
  if (!hash || hash.length < 32) {
    throw new Error(`Unexpected checksum format for ${assetName}: ${body}`);
  }
  return hash;
}

async function main() {
  const existing = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const version = process.argv[2] || existing.version;
  if (!version) {
    throw new Error('Provide a version as an argument or set one in vscodium-manifest.json');
  }
  console.log(`[update-vscodium] Fetching checksums for ${version}...`);
  const sha256 = {};
  for (const platform of PLATFORM_ASSETS) {
    try {
      const filename = platform.filename(version);
      const hash = await fetchSha256(version, filename);
      sha256[platform.key] = hash;
      console.log(`  - ${platform.key}: ${hash}`);
    } catch (err) {
      console.warn(`[update-vscodium] Skipping ${platform.key}: ${err.message}`);
    }
  }
  const updated = {
    version,
    sha256,
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(manifestPath, JSON.stringify(updated, null, 2) + '\n');
  console.log(`[update-vscodium] Manifest updated at ${manifestPath}`);
}

main().catch(err => {
  console.error('[update-vscodium]', err.message);
  process.exit(1);
});
