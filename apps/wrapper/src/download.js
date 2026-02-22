const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const https = require('https');
const crypto = require('crypto');
const manifest = require('../vscodium-manifest.json');

const PLATFORM_MAP = {
  win32:  { os: 'win32', arch: 'x64', ext: 'zip',    dir: 'VSCodium-win32-x64' },
  darwin: { os: 'darwin', arch: 'x64', ext: 'zip',    dir: 'VSCodium-darwin-x64' },
  linux:  { os: 'linux',  arch: 'x64', ext: 'tar.gz', dir: 'VSCodium-linux-x64' },
};

function getPlatformInfo() {
  const p = PLATFORM_MAP[process.platform];
  if (!p) throw new Error(`Unsupported platform: ${process.platform}`);
  if (process.arch === 'arm64') {
    if (process.platform === 'darwin') {
      return { ...p, arch: 'arm64', dir: 'VSCodium-darwin-arm64' };
    }
    if (process.platform === 'linux') {
      return { ...p, arch: 'arm64', dir: 'VSCodium-linux-arm64' };
    }
    if (process.platform === 'win32') {
      return { ...p, arch: 'arm64', dir: 'VSCodium-win32-arm64' };
    }
  }
  return p;
}

function buildDownloadUrl(version) {
  const p = getPlatformInfo();
  const filename = `VSCodium-${p.os}-${p.arch}-${version}.${p.ext}`;
  return `https://github.com/VSCodium/vscodium/releases/download/${version}/${filename}`;
}

function getBundledArchivePath(version) {
  const p = getPlatformInfo();
  const filename = `VSCodium-${p.os}-${p.arch}-${version}.${p.ext}`;
  const candidates = [
    // Packaged app resources
    process.resourcesPath ? path.join(process.resourcesPath, 'assets', 'vscodium', filename) : '',
    // Dev/working tree
    path.join(__dirname, '..', 'assets', 'vscodium', filename),
  ].filter(Boolean);
  
  console.log(`[OCcode] Debug: process.resourcesPath = ${process.resourcesPath}`);
  console.log(`[OCcode] Debug: __dirname = ${__dirname}`);
  console.log(`[OCcode] Debug: Looking for bundled archive candidates: ${JSON.stringify(candidates)}`);
  
  for (const candidate of candidates) {
    const exists = fs.existsSync(candidate);
    console.log(`[OCcode] Debug: Checking ${candidate} - exists: ${exists}`);
    if (exists) return candidate;
  }
  return null;
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
  const bundled = getBundledArchivePath(version);
  const archivePath = bundled || path.join(os.tmpdir(), `vscodium.${p.ext}`);
  const downloaded = !bundled;

  if (bundled) {
    console.log(`[OCcode] Using bundled VSCodium archive: ${bundled}`);
  } else {
    await downloadFile(url, archivePath);
  }

  const checksumKey = getChecksumKey(p);
  const expectedHash = (manifest.sha256 || {})[checksumKey];
  if (expectedHash) {
    console.log(`[OCcode] Verifying checksum for ${checksumKey}…`);
    await verifyChecksum(archivePath, expectedHash);
  } else {
    console.warn(`[OCcode] No checksum available for ${checksumKey}; skipping verification.`);
  }

  // Extract
  console.log(`[OCcode] Extracting ${archivePath} to ${destDir}...`);
  try {
    // Create destination directory if it doesn't exist
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    // Try extraction up to 3 times
    let extractSuccess = false;
    let attempts = 0;
    let lastError = null;
    
    while (!extractSuccess && attempts < 3) {
      attempts++;
      try {
        if (p.ext === 'zip') {
          if (process.platform === 'win32') {
            try {
              // Try PowerShell first
              execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`, { stdio: 'inherit' });
            } catch (psErr) {
              console.error(`[OCcode] PowerShell extraction failed: ${psErr.message}`);
              console.log(`[OCcode] Trying Node.js extraction fallback...`);
              
              // Fallback to Node.js extraction
              const AdmZip = require('adm-zip');
              try {
                const zip = new AdmZip(archivePath);
                zip.extractAllTo(destDir, true);
                console.log(`[OCcode] Extracted using Node.js AdmZip`);
              } catch (nodeErr) {
                throw new Error(`Both PowerShell and Node.js extraction failed: ${nodeErr.message}`);
              }
            }
          } else {
            execSync(`unzip -o "${archivePath}" -d "${destDir}"`, { stdio: 'inherit' });
          }
        } else {
          execSync(`tar -xzf "${archivePath}" -C "${destDir}"`, { stdio: 'inherit' });
        }
        
        // Verify extraction by checking if files were created
        const files = fs.readdirSync(destDir);
        if (files.length > 0) {
          extractSuccess = true;
          console.log(`[OCcode] Extraction complete (attempt ${attempts})`);
        } else {
          throw new Error('No files extracted');
        }
      } catch (err) {
        lastError = err;
        console.error(`[OCcode] Extraction attempt ${attempts} failed: ${err.message}`);
        if (attempts < 3) {
          console.log(`[OCcode] Retrying extraction...`);
        }
      }
    }
    
    if (!extractSuccess) {
      throw new Error(`Failed to extract after ${attempts} attempts: ${lastError?.message}`);
    }
    
    // Flatten: if archive created a single subdirectory, move contents up
    // Skip this on macOS - VSCodium.app must stay as a bundle
    if (process.platform !== 'darwin') {
      const extractedContents = fs.readdirSync(destDir);
      console.log(`[OCcode] Extracted contents: ${JSON.stringify(extractedContents)}`);
      
      if (extractedContents.length === 1) {
        const singleItem = path.join(destDir, extractedContents[0]);
        const stat = fs.statSync(singleItem);
        if (stat.isDirectory()) {
          console.log(`[OCcode] Flattening subdirectory: ${extractedContents[0]}`);
          // Move all contents from subdirectory to destDir
          const subContents = fs.readdirSync(singleItem);
          for (const item of subContents) {
            const src = path.join(singleItem, item);
            const dest = path.join(destDir, item);
            console.log(`[OCcode] Moving ${src} -> ${dest}`);
            fs.renameSync(src, dest);
          }
          // Remove empty subdirectory
          fs.rmdirSync(singleItem);
          console.log(`[OCcode] Flatten complete`);
        }
      }
    } else {
      // On macOS, just log what was extracted without flattening
      const extractedContents = fs.readdirSync(destDir);
      console.log(`[OCcode] macOS extracted contents (preserving bundle): ${JSON.stringify(extractedContents)}`);
    }
    
    // Special handling for Windows: Fix codium.cmd if it exists
    if (process.platform === 'win32') {
      const cmdPath = path.join(destDir, 'bin', 'codium.cmd');
      const vscodiumExe = path.join(destDir, 'VSCodium.exe');
      
      // If codium.cmd exists but VSCodium.exe is not in the expected location
      if (fs.existsSync(cmdPath) && !fs.existsSync(vscodiumExe)) {
        console.log(`[OCcode] Fixing codium.cmd script...`);
        try {
          // Find VSCodium.exe in the directory structure
          let exePath = null;
          const findExe = (dir) => {
            for (const item of fs.readdirSync(dir)) {
              const fullPath = path.join(dir, item);
              if (item === 'VSCodium.exe') {
                return fullPath;
              }
              if (fs.statSync(fullPath).isDirectory()) {
                const found = findExe(fullPath);
                if (found) return found;
              }
            }
            return null;
          };
          
          exePath = findExe(destDir);
          
          if (exePath) {
            console.log(`[OCcode] Found VSCodium.exe at ${exePath}`);
            // Copy it to the expected location
            fs.copyFileSync(exePath, vscodiumExe);
            console.log(`[OCcode] Copied VSCodium.exe to ${vscodiumExe}`);
          } else {
            console.error(`[OCcode] Could not find VSCodium.exe in ${destDir}`);
            // Create a fixed version of codium.cmd that uses absolute path
            fixCodiumCmd(cmdPath, destDir);
          }
        } catch (err) {
          console.error(`[OCcode] Error fixing codium.cmd: ${err.message}`);
          // Try to fix the cmd script as a fallback
          fixCodiumCmd(cmdPath, destDir);
        }
      }
    }
  } catch (err) {
    console.error(`[OCcode] Extraction failed: ${err.message}`);
    throw err;
  }

  if (downloaded) {
    fs.unlinkSync(archivePath);
  }
}

function getVSCodiumBinaryCandidates(vscodeDir) {
  if (process.platform === 'win32') {
    return [
      path.join(vscodeDir, 'VSCodium.exe'),
      path.join(vscodeDir, 'bin', 'codium.cmd'),
    ];
  }
  if (process.platform === 'darwin') {
    return [
      path.join(vscodeDir, 'VSCodium.app', 'Contents', 'Resources', 'app', 'bin', 'codium'),
    ];
  }
  return [
    path.join(vscodeDir, 'bin', 'codium'),
  ];
}

function findVSCodiumBinary(vscodeDir) {
  const candidates = getVSCodiumBinaryCandidates(vscodeDir);
  console.log(`[OCcode] Looking for VSCodium binary in ${vscodeDir}`);
  console.log(`[OCcode] Candidates: ${JSON.stringify(candidates)}`);
  for (const candidate of candidates) {
    const exists = fs.existsSync(candidate);
    console.log(`[OCcode] Checking ${candidate}: ${exists ? 'FOUND' : 'not found'}`);
    if (exists) return candidate;
  }
  return null;
}

function getVSCodiumBinary(vscodeDir) {
  const found = findVSCodiumBinary(vscodeDir);
  if (found) return found;
  const candidates = getVSCodiumBinaryCandidates(vscodeDir);
  throw new Error(
    `VSCodium binary not found. Checked: ${candidates.join(', ')}`
  );
}

function getChecksumKey(platform) {
  return `${platform.os}-${platform.arch}`;
}

async function verifyChecksum(filePath, expected) {
  if (!expected) return false;
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => {
      const digest = hash.digest('hex');
      if (digest.toLowerCase() !== expected.toLowerCase()) {
        reject(new Error(`Checksum mismatch for ${filePath}: expected ${expected} but got ${digest}`));
        return;
      }
      resolve(true);
    });
    stream.on('error', reject);
  });
}

/**
 * Fix the codium.cmd script to use an absolute path to VSCodium.exe
 */
function fixCodiumCmd(cmdPath, vscodeDir) {
  try {
    console.log(`[OCcode] Fixing codium.cmd script at ${cmdPath}`);
    
    // Read the current script
    let content = fs.readFileSync(cmdPath, 'utf8');
    
    // Create the absolute path to VSCodium.exe
    const vscodiumExePath = path.join(vscodeDir, 'VSCodium.exe');
    
    // Replace relative path with absolute path
    const fixedContent = content.replace(
      /"%~dp0\\\.\.\\VSCodium\.exe"/g,
      `"${vscodiumExePath.replace(/\\/g, '\\\\')}"`
    );
    
    // Write the fixed script
    fs.writeFileSync(cmdPath, fixedContent, 'utf8');
    console.log(`[OCcode] Fixed codium.cmd script to use absolute path`);
    
    return true;
  } catch (err) {
    console.error(`[OCcode] Failed to fix codium.cmd: ${err.message}`);
    return false;
  }
}

module.exports = {
  downloadVSCodium,
  getVSCodiumBinary,
  findVSCodiumBinary,
  getPlatformInfo,
};
