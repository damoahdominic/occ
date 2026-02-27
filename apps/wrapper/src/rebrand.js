/*
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
  // After flattening, files should be directly in vscodeDir
  const dir = fs.existsSync(path.join(vscodeDir, 'VSCodium.exe'))
    ? vscodeDir
    : path.join(vscodeDir, 'VSCodium-win32-x64');
  if (!fs.existsSync(dir)) { console.warn('[rebrand] Windows VSCodium dir not found'); return; }

  const srcIco = getAssetPath('icon.ico');
  const srcPng = getAssetPath('icon.png');
  const win32Dir = path.join(dir, 'resources', 'app', 'resources', 'win32');

  // 1. Replace code.ico (file-association icon + fallback)
  safeCopy(srcIco, path.join(win32Dir, 'code.ico'));

  // 2. Replace the PNG icons that VSCodium's BrowserWindow uses as the
  //    window/taskbar icon on Windows (resources/win32/code_150x150.png and
  //    code_70x70.png). VSCodium reads these at runtime to set window.icon.
  safeCopy(srcPng, path.join(win32Dir, 'code_150x150.png'));
  safeCopy(srcPng, path.join(win32Dir, 'code_70x70.png'));

  // 3. Patch VSCodium's compiled main.js so the icon is always applied.
  //    In production builds VSCodium only sets the BrowserWindow icon in
  //    dev mode (!isBuilt guard). We remove that guard so our PNG above is
  //    always used, making it show in the OS taskbar.
  patchMainJsIcon(dir);

  // 4. Patch the exe's embedded PE icon resource via rcedit.
  //    This is what Windows taskbar / Start menu / file explorer actually show.
  //    @electron/rcedit is a hard dependency — log clearly if it fails.
  const mainExePath = path.join(dir, 'VSCodium.exe');
  if (fs.existsSync(mainExePath) && fs.existsSync(srcIco)) {
    try {
      const rcedit = require('rcedit');
      await rcedit(mainExePath, { icon: srcIco });
      console.log('[rebrand] Patched VSCodium.exe embedded icon via rcedit');
    } catch (rceditErr) {
      console.warn('[rebrand] rcedit failed — Windows taskbar may still show VSCodium icon:', rceditErr.message);
    }
  } else {
    if (!fs.existsSync(mainExePath)) console.warn('[rebrand] VSCodium.exe not found for rcedit patch');
    if (!fs.existsSync(srcIco)) console.warn('[rebrand] icon.ico not found for rcedit patch:', srcIco);
  }
}

/**
 * Remove the `!isBuilt` guard in VSCodium's compiled main.js so that the
 * BrowserWindow icon (code_150x150.png → our OCcode icon) is always set on
 * Windows, making the correct icon appear in the OS taskbar.
 *
 * The minified pattern looks like:
 *   $&&!a.isBuilt&&(l.icon=O(a.appRoot,"resources/win32/code_150x150.png"))
 * We replace it with:
 *   $&&(l.icon=O(a.appRoot,"resources/win32/code_150x150.png"))
 */
function patchMainJsIcon(dir) {
  const mainJsPath = path.join(dir, 'resources', 'app', 'out', 'main.js');
  if (!fs.existsSync(mainJsPath)) {
    console.warn('[rebrand] main.js not found, skipping icon patch');
    return;
  }
  try {
    let src = fs.readFileSync(mainJsPath, 'utf8');
    const before = src;

    // Strategy: remove any `!<var>.isBuilt &&` guard that gates the icon assignment.
    // VSCodium minifies differently per build — we try patterns from most to least specific.

    // Pattern 1 (original): variable names seen in some builds
    src = src.replace(
      /(\$&&)![\w$]+\.isBuilt&&(\([\w$]+\.icon=)/g,
      '$1$2'
    );

    // Pattern 2: looser — captures the full icon assignment expression
    if (src === before) {
      src = src.replace(
        /&&![\w$]+\.isBuilt&&(\([\w$]+\.icon=[\w$]+\([\w$]+\.appRoot,"resources\/win32\/code_150x150\.png"\)\))/g,
        '&&$1'
      );
    }

    // Pattern 3: broadest — any isBuilt guard anywhere near an .icon= assignment
    // Handles any variable naming scheme across VSCodium versions
    if (src === before) {
      src = src.replace(
        /![\w$]+\.isBuilt&&([\w$]+\.icon=)/g,
        '$1'
      );
    }

    // Pattern 4: ultra-broad — strip any isBuilt check that precedes a win32 icon path
    if (src === before) {
      src = src.replace(
        /![\w$]+\.isBuilt&&(?=[\w$()."'\/]*code_150x150)/g,
        ''
      );
    }

    if (src !== before) {
      fs.writeFileSync(mainJsPath, src, 'utf8');
      console.log('[rebrand] Patched main.js: removed isBuilt icon guard (taskbar icon will now show)');
    } else {
      // Last-resort: if none of the patterns matched, log the surrounding context
      // so we can add a pattern for this VSCodium version.
      const match = src.match(/.{0,80}isBuilt.{0,80}/);
      if (match) {
        console.warn('[rebrand] main.js: isBuilt still present — pattern not matched. Context:', match[0]);
      } else {
        console.log('[rebrand] main.js: no isBuilt guard found (already clean or different build)');
      }
    }
  } catch (err) {
    console.warn('[rebrand] main.js icon patch failed (non-fatal):', err.message);
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
