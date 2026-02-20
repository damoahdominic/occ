/**
 * rebrand.js – Replace VSCodium icons and product names with OCcode branding.
 *
 * All operations are non-fatal: failures are logged but never throw.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getAssetPath, assetBase: ASSETS_DIR } = require('./utils/assets');

/**
 * Rebrand extracted VSCodium at `vscodeDir` with OCcode icons and names.
 */
async function rebrandVSCodium(vscodeDir) {
  const platform = process.platform; // win32 | darwin | linux
  console.log(`[rebrand] Rebranding VSCodium for ${platform}…`);

  try {
    if (platform === 'win32') {
      await rebrandWindows(vscodeDir);
    } else if (platform === 'darwin') {
      await rebrandMacOS(vscodeDir);
    } else {
      await rebrandLinux(vscodeDir);
    }
  } catch (err) {
    console.warn('[rebrand] Icon replacement failed (non-fatal):', err.message);
  }

  try {
    patchProductJson(vscodeDir);
  } catch (err) {
    console.warn('[rebrand] product.json patch failed (non-fatal):', err.message);
  }
}

// ── Windows ──────────────────────────────────────────────────────────────────

async function rebrandWindows(vscodeDir) {
  const root = path.join(vscodeDir, 'VSCodium-win32-x64');
  const dir = fs.existsSync(root) ? root
    : findSubdir(vscodeDir, 'win32')
    || (fs.existsSync(path.join(vscodeDir, 'codium.exe')) ? vscodeDir : null);
  if (!dir) { console.warn('[rebrand] Windows VSCodium dir not found'); return; }

  // 1. Replace code.ico for file associations
  const codeIco = path.join(dir, 'resources', 'app', 'resources', 'win32', 'code.ico');
  const srcIco = getAssetPath('icon.ico');
  safeCopy(srcIco, codeIco);

  // 2. Patch codium.exe icon via rcedit
  const exePath = path.join(dir, 'codium.exe');
  if (fs.existsSync(exePath) && fs.existsSync(srcIco)) {
    try {
      const rcedit = require('@electron/rcedit');
      await rcedit(exePath, { icon: srcIco });
      console.log('[rebrand] Patched codium.exe icon via rcedit');
    } catch (err) {
      console.warn('[rebrand] rcedit patch skipped:', err.message);
    }
  }
}

// ── macOS ────────────────────────────────────────────────────────────────────

async function rebrandMacOS(vscodeDir) {
  const appBundle = path.join(vscodeDir, 'VSCodium.app');
  if (!fs.existsSync(appBundle)) {
    console.warn('[rebrand] VSCodium.app not found'); return;
  }

  const resourcesDir = path.join(appBundle, 'Contents', 'Resources');

  // Try pre-built .icns first, then generate at runtime
  const prebuiltIcns = getAssetPath('icon.icns');
  const targetIcns = path.join(resourcesDir, 'VSCodium.icns');

  if (fs.existsSync(prebuiltIcns)) {
    safeCopy(prebuiltIcns, targetIcns);
  } else {
    // Generate using sips (macOS built-in)
    const srcPng = getAssetPath('icon.png');
    try {
      const tmpIcns = path.join(resourcesDir, 'OCcode.icns');
      execSync(`sips -s format icns "${srcPng}" --out "${tmpIcns}"`, { stdio: 'pipe' });
      safeCopy(tmpIcns, targetIcns);
      console.log('[rebrand] Generated .icns via sips');
    } catch (err) {
      console.warn('[rebrand] .icns generation failed:', err.message);
    }
  }

  // Update Info.plist icon reference if we renamed
  const plistPath = path.join(appBundle, 'Contents', 'Info.plist');
  if (fs.existsSync(plistPath)) {
    try {
      let plist = fs.readFileSync(plistPath, 'utf8');
      // The icon key points to the .icns filename (without extension)
      // We're replacing VSCodium.icns in-place, so no plist change needed
      // But update display name
      plist = plist.replace(/<string>VSCodium<\/string>/g, '<string>OCcode</string>');
      fs.writeFileSync(plistPath, plist, 'utf8');
      console.log('[rebrand] Updated Info.plist display name');
    } catch (err) {
      console.warn('[rebrand] Info.plist update failed:', err.message);
    }
  }
}

// ── Linux ────────────────────────────────────────────────────────────────────

async function rebrandLinux(vscodeDir) {
  const root = path.join(vscodeDir, 'VSCodium-linux-x64');
  // Files may be in a subdirectory OR directly in vscodeDir (flat extraction)
  const dir = fs.existsSync(root) ? root
    : findSubdir(vscodeDir, 'linux')
    || (fs.existsSync(path.join(vscodeDir, 'resources', 'app')) ? vscodeDir : null);
  if (!dir) { console.warn('[rebrand] Linux VSCodium dir not found'); return; }

  const srcPng = getAssetPath('icon.png');

  // Replace pixmaps icon
  const pixmap = path.join(dir, 'pixmaps', 'vscodium.png');
  safeCopy(srcPng, pixmap);

  // Replace resources/app/resources/linux/code.png
  const codePng = path.join(dir, 'resources', 'app', 'resources', 'linux', 'code.png');
  safeCopy(srcPng, codePng);

  // Also overwrite any size-specific icons if they exist
  const linuxResDir = path.join(dir, 'resources', 'app', 'resources', 'linux');
  if (fs.existsSync(linuxResDir)) {
    for (const file of fs.readdirSync(linuxResDir)) {
      if (file.endsWith('.png')) {
        safeCopy(srcPng, path.join(linuxResDir, file));
      }
    }
  }
}

// ── Product JSON patching (all platforms) ────────────────────────────────────

function patchProductJson(vscodeDir) {
  // Find product.json in extracted VSCodium
  const candidates = findFiles(vscodeDir, 'product.json', 3);
  for (const pjPath of candidates) {
    // Only patch the one inside resources/app/
    if (!pjPath.includes(path.join('resources', 'app'))) continue;
    try {
      const product = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
      let changed = false;
      for (const key of ['nameShort', 'nameLong', 'applicationName']) {
        if (product[key] && product[key] !== 'OCcode') {
          product[key] = key === 'nameLong' ? 'OCcode' : 'OCcode';
          changed = true;
        }
      }
      if (product.win32AppUserModelId) {
        product.win32AppUserModelId = 'OpenClaw.OCcode';
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(pjPath, JSON.stringify(product, null, 2), 'utf8');
        console.log(`[rebrand] Patched ${pjPath}`);
      }
    } catch (err) {
      console.warn(`[rebrand] Failed to patch ${pjPath}:`, err.message);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeCopy(src, dest) {
  try {
    if (!fs.existsSync(src)) { console.warn(`[rebrand] Source missing: ${src}`); return; }
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`[rebrand] Copied ${path.basename(src)} → ${dest}`);
  } catch (err) {
    console.warn(`[rebrand] Copy failed ${src} → ${dest}:`, err.message);
  }
}

function findSubdir(base, keyword) {
  if (!fs.existsSync(base)) return null;
  for (const d of fs.readdirSync(base)) {
    if (d.toLowerCase().includes(keyword) && fs.statSync(path.join(base, d)).isDirectory()) {
      return path.join(base, d);
    }
  }
  return null;
}

function findFiles(dir, name, maxDepth, depth = 0) {
  const results = [];
  if (depth > maxDepth || !fs.existsSync(dir)) return results;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === name) results.push(full);
      if (entry.isDirectory()) results.push(...findFiles(full, name, maxDepth, depth + 1));
    }
  } catch {}
  return results;
}

module.exports = { rebrandVSCodium };
