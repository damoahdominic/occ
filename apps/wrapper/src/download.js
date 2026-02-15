const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const https = require('https');

const PLATFORM_MAP = {
  win32:  { os: 'win32', arch: 'x64', ext: 'zip',    dir: 'VSCodium-win32-x64' },
  darwin: { os: 'darwin', arch: 'x64', ext: 'zip',    dir: 'VSCodium-darwin-x64' },
  linux:  { os: 'linux',  arch: 'x64', ext: 'tar.gz', dir: 'VSCodium-linux-x64' },
};

function getPlatformInfo() {
  const p = PLATFORM_MAP[process.platform];
  if (!p) throw new Error(`Unsupported platform: ${process.platform}`);
  // Handle Apple Silicon
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return { ...p, arch: 'arm64', dir: 'VSCodium-darwin-arm64' };
  }
  return p;
}

function buildDownloadUrl(version) {
  const p = getPlatformInfo();
  const filename = `VSCodium-${p.os}-${p.arch}-${version}.${p.ext}`;
  return `https://github.com/VSCodium/vscodium/releases/download/${version}/${filename}`;
}

function downloadFile(url, dest) {
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

async function downloadVSCodium(version, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const url = buildDownloadUrl(version);
  const p = getPlatformInfo();
  const archivePath = path.join(os.tmpdir(), `vscodium.${p.ext}`);

  await downloadFile(url, archivePath);

  // Extract
  if (p.ext === 'zip') {
    if (process.platform === 'win32') {
      execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`);
    } else {
      execSync(`unzip -o "${archivePath}" -d "${destDir}"`);
    }
  } else {
    execSync(`tar -xzf "${archivePath}" -C "${destDir}"`);
  }

  fs.unlinkSync(archivePath);
}

function getVSCodiumBinary(vscodeDir) {
  switch (process.platform) {
    case 'win32':
      return path.join(vscodeDir, 'bin', 'codium.cmd');
    case 'darwin':
      return path.join(vscodeDir, 'VSCodium.app', 'Contents', 'Resources', 'app', 'bin', 'codium');
    default:
      return path.join(vscodeDir, 'bin', 'codium');
  }
}

module.exports = { downloadVSCodium, getVSCodiumBinary, getPlatformInfo };
