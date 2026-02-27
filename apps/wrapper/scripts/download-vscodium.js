const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execSync } = require('child_process');
const manifest = require('../vscodium-manifest.json');

const PLATFORM_MAP = {
  win32:  { os: 'win32', arch: 'x64', ext: 'zip' },
  darwin: { os: 'darwin', arch: 'x64', ext: 'zip' },
  linux:  { os: 'linux',  arch: 'x64', ext: 'tar.gz' },
};

function getPlatformInfo() {
  const p = PLATFORM_MAP[process.platform];
  if (!p) throw new Error(`Unsupported platform: ${process.platform}`);
  if (process.arch === 'arm64') {
    if (process.platform === 'darwin') {
      return { ...p, arch: 'arm64' };
    }
    if (process.platform === 'linux') {
      return { ...p, arch: 'arm64' };
    }
    if (process.platform === 'win32') {
      return { ...p, arch: 'arm64' };
    }
  }
  return p;
}

function getChecksumKey(p) {
  return `${p.os}-${p.arch}`;
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u) => {
      https.get(u, { headers: { 'User-Agent': 'OCcode' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', reject);
    };
    get(url);
  });
}

async function verifyChecksum(filePath, expected) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => {
      const digest = hash.digest('hex');
      if (digest.toLowerCase() !== expected.toLowerCase()) {
        reject(new Error(`Checksum mismatch: expected ${expected} but got ${digest}`));
        return;
      }
      resolve(true);
    });
    stream.on('error', reject);
  });
}

async function main() {
  const p = getPlatformInfo();
  const version = manifest.version;
  const filename = `VSCodium-${p.os}-${p.arch}-${version}.${p.ext}`;
  const vscodiumDir = path.join(__dirname, '..', 'assets', 'vscodium');
  const archivePath = path.join(vscodiumDir, filename);

  fs.mkdirSync(vscodiumDir, { recursive: true });

  if (fs.existsSync(archivePath)) {
    console.log(`[dev] VSCodium archive already exists: ${archivePath}`);
    const checksumKey = getChecksumKey(p);
    const expectedHash = (manifest.sha256 || {})[checksumKey];
    if (expectedHash) {
      console.log(`[dev] Verifying checksum...`);
      await verifyChecksum(archivePath, expectedHash);
      console.log(`[dev] Checksum verified.`);
    }
    console.log(`[dev] Done.`);
    return;
  }

  const url = `https://github.com/VSCodium/vscodium/releases/download/${version}/${filename}`;
  console.log(`[dev] Downloading VSCodium from: ${url}`);
  console.log(`[dev] Saving to: ${archivePath}`);

  await downloadFile(url, archivePath);
  console.log(`[dev] Download complete.`);

  const checksumKey = getChecksumKey(p);
  const expectedHash = (manifest.sha256 || {})[checksumKey];
  if (expectedHash) {
    console.log(`[dev] Verifying checksum...`);
    await verifyChecksum(archivePath, expectedHash);
    console.log(`[dev] Checksum verified.`);
  } else {
    console.warn(`[dev] No checksum available for ${checksumKey}`);
  }

  console.log(`[dev] Done. VSCodium is now bundled at: ${archivePath}`);
  console.log(`[dev] Run 'npm start' to test with bundled VSCodium.`);
}

main().catch(err => {
  console.error('[dev] Error:', err.message);
  process.exit(1);
});
