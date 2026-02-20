const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const DEFAULT_SETTINGS = {
  "workbench.startupEditor": "none",
  "workbench.colorTheme": "Default Dark Modern",
  "workbench.tips.enabled": false,
  "extensions.autoUpdate": true,
  "telemetry.telemetryLevel": "off",
};

// IDs to remove from the activity bar (set pinned:false in state.vscdb)
const ACTIVITY_BAR_HIDDEN_IDS = new Set([
  'workbench.view.scm',
  'workbench.view.debug',
  'workbench.view.extensions',
]);

async function installExtension(codiumBinary, occodeDir) {
  // Look for bundled .vsix files in the app's resources or local extensions/ dir
  const searchPaths = [
    path.join(__dirname, '..', 'extensions'),
    path.join(process.resourcesPath || '', 'extensions'),
  ];

  console.log('[OCcode] Looking for extensions in:', searchPaths);

  const extensionsDir = path.join(occodeDir, 'extensions');
  fs.mkdirSync(extensionsDir, { recursive: true });

  let installedAny = false;
  for (const dir of searchPaths) {
    if (!fs.existsSync(dir)) continue;
    const vsixFiles = fs.readdirSync(dir).filter(f => f.endsWith('.vsix'));
    console.log('[OCcode] Found VSIX in', dir, ':', vsixFiles);
    for (const vsix of vsixFiles) {
      const vsixPath = path.join(dir, vsix);
      const userDataDir = path.join(occodeDir, 'user-data');
      try {
        // Use execSync with shell:true — codium binary is a shell script on Linux/Mac
        const cmd = `"${codiumBinary}" --install-extension "${vsixPath}" --user-data-dir "${userDataDir}" --extensions-dir "${extensionsDir}" --force`;
        console.log('[OCcode] Running:', cmd);
        const output = execSync(cmd, { timeout: 120000, shell: true, encoding: 'utf8' });
        console.log('[OCcode] Install result:', output.trim());
        installedAny = true;
      } catch (err) {
        console.warn(`[OCcode] Failed to install ${vsix}:`, err.message);
      }
    }
  }

  if (installedAny) return;

  // Dev fallback: install from local extension source if present (no VSIX).
  const devExtDir = path.join(__dirname, '..', '..', 'extension');
  const pkgPath = path.join(devExtDir, 'package.json');
  const outEntry = path.join(devExtDir, 'out', 'extension.js');
  if (!fs.existsSync(pkgPath) || !fs.existsSync(outEntry)) {
    console.warn('[OCcode] No VSIX and no compiled extension found.');
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const extId = `${pkg.publisher}.${pkg.name}-${pkg.version}`;
  const targetDir = path.join(extensionsDir, extId);

  const skip = new Set([
    'node_modules',
    'src',
    '.git',
    '.vscode',
    '.github',
    'tsconfig.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
  ]);

  const copyDir = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDir(srcPath, destPath);
      } else if (entry.isFile()) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  };

  try {
    copyDir(devExtDir, targetDir);
    console.log('[OCcode] Installed extension from source into:', targetDir);
  } catch (err) {
    console.warn('[OCcode] Failed to copy extension from source:', err.message);
  }
}

async function setDefaults(occodeDir) {
  const userDataDir = path.join(occodeDir, 'user-data');
  const settingsDir = path.join(userDataDir, 'User');
  const settingsFile = path.join(settingsDir, 'settings.json');

  fs.mkdirSync(settingsDir, { recursive: true });

  // Merge with existing settings if any
  let existing = {};
  if (fs.existsSync(settingsFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    } catch {}
  }

  const merged = { ...DEFAULT_SETTINGS, ...existing };
  fs.writeFileSync(settingsFile, JSON.stringify(merged, null, 2));
}

/**
 * Patches state.vscdb to hide the unwanted activity bar icons.
 * Uses sql.js (pure-JS SQLite — no native bindings required).
 * Only runs once per install; skips if the flag file already exists.
 */
async function patchActivityBarState(occodeDir) {
  const flagFile = path.join(occodeDir, '.activity-bar-patched');

  // For the seed-copy path (fresh install): state.vscdb doesn't exist yet,
  // so copy our pre-seeded database into place so VSCodium starts with the
  // correct pinned state from the very first launch.
  const globalStorageDir = path.join(occodeDir, 'user-data', 'User', 'globalStorage');
  const stateDbPath = path.join(globalStorageDir, 'state.vscdb');

  if (!fs.existsSync(stateDbPath)) {
    // Fresh install — copy the seed database.
    const seedPaths = [
      path.join(__dirname, '..', 'assets', 'seed-state.vscdb'),
      path.join(process.resourcesPath || '', 'assets', 'seed-state.vscdb'),
    ];
    for (const seedPath of seedPaths) {
      if (fs.existsSync(seedPath)) {
        fs.mkdirSync(globalStorageDir, { recursive: true });
        fs.copyFileSync(seedPath, stateDbPath);
        console.log('[OCcode] Seeded activity bar state from:', seedPath);
        fs.writeFileSync(flagFile, '1');
        return;
      }
    }
    // No seed found — VSCodium will create defaults on first launch; we'll
    // patch on next wrapper run (flag file won't exist yet).
    console.warn('[OCcode] seed-state.vscdb not found; skipping activity bar seed.');
    return;
  }

  // Already patched on a previous run — leave the user's layout alone.
  if (fs.existsSync(flagFile)) return;

  // Existing install: use sql.js to patch the live state.vscdb.
  try {
    const initSqlJs = require('sql.js');
    // Locate the WASM file bundled alongside sql.js in node_modules.
    const wasmSearchPaths = [
      path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist'),
      path.join(process.resourcesPath || '', 'node_modules', 'sql.js', 'dist'),
    ];
    const wasmDir = wasmSearchPaths.find(p => fs.existsSync(path.join(p, 'sql-wasm.wasm')));
    const SQL = await initSqlJs({
      locateFile: file => wasmDir ? path.join(wasmDir, file) : file,
    });

    const dbBuffer = fs.readFileSync(stateDbPath);
    const db = new SQL.Database(dbBuffer);

    // Read the current pinned viewlets value.
    const stmt = db.prepare(
      "SELECT value FROM ItemTable WHERE key='workbench.activity.pinnedViewlets2'"
    );
    let viewlets = [];
    if (stmt.step()) {
      try { viewlets = JSON.parse(stmt.getAsObject().value); } catch {}
    }
    stmt.free();

    // Apply pinned:false for the hidden IDs; add entries for any that are missing.
    const seen = new Set();
    viewlets = viewlets.map(v => {
      seen.add(v.id);
      if (ACTIVITY_BAR_HIDDEN_IDS.has(v.id)) return { ...v, pinned: false };
      return v;
    });
    for (const id of ACTIVITY_BAR_HIDDEN_IDS) {
      if (!seen.has(id)) {
        viewlets.push({ id, pinned: false, visible: false, order: 99 });
      }
    }

    db.run(
      "INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)",
      ['workbench.activity.pinnedViewlets2', JSON.stringify(viewlets)]
    );

    const data = db.export();
    db.close();
    fs.writeFileSync(stateDbPath, Buffer.from(data));
    fs.writeFileSync(flagFile, '1');
    console.log('[OCcode] Patched activity bar state in state.vscdb');
  } catch (err) {
    console.warn('[OCcode] Failed to patch activity bar state (non-fatal):', err.message);
  }
}

function findMacAppBundle(vscodeDir, codiumBinary) {
  if (codiumBinary) {
    const marker = `${path.sep}VSCodium.app${path.sep}`;
    const idx = codiumBinary.indexOf(marker);
    if (idx !== -1) {
      return codiumBinary.slice(0, idx + marker.length - 1);
    }
  }
  if (vscodeDir && fs.existsSync(vscodeDir)) {
    const direct = path.join(vscodeDir, 'VSCodium.app');
    if (fs.existsSync(direct)) return direct;
    for (const entry of fs.readdirSync(vscodeDir)) {
      const candidate = path.join(vscodeDir, entry, 'VSCodium.app');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

async function launchVSCodium(codiumBinary, occodeDir, vscodeDir) {
  const userDataDir = path.join(occodeDir, 'user-data');
  const extensionsDir = path.join(occodeDir, 'extensions');
  const args = [
    '--user-data-dir', userDataDir,
    '--extensions-dir', extensionsDir,
  ];
  const isWin = process.platform === 'win32';
  const isLinux = process.platform === 'linux';
  const disableGpu =
    process.env.OCCODE_DISABLE_GPU === '1' ||
    (isLinux && process.env.OCCODE_ENABLE_GPU !== '1');
  const noSandbox = isLinux && process.env.OCCODE_NO_SANDBOX === '1';
  if (isLinux) {
    args.push('--disable-features=UseDBus');
    args.push('--disable-dev-shm-usage');
  }
  if (noSandbox) {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }
  if (disableGpu) {
    args.push(
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-gpu-compositing',
      '--disable-accelerated-2d-canvas',
      '--disable-accelerated-video-decode',
      '--disable-gpu-sandbox',
      '--use-gl=swiftshader'
    );
  }
  const debug = process.env.OCCODE_DEBUG === '1';
  const spawnEnv = {
    ...process.env,
    ELECTRON_DISABLE_GPU: disableGpu ? '1' : process.env.ELECTRON_DISABLE_GPU,
    LIBGL_ALWAYS_SOFTWARE: disableGpu ? '1' : process.env.LIBGL_ALWAYS_SOFTWARE,
  };

  // Get the binary directory for cwd - needed for ICU data loading
  const binaryDir = path.dirname(codiumBinary);

  const spawnOpts = {
    detached: !debug,
    stdio: debug ? 'inherit' : 'ignore',
    env: spawnEnv,
    cwd: binaryDir,
  };

  let child;
  try {
    if (process.platform === 'darwin') {
      const appBundle = findMacAppBundle(vscodeDir, codiumBinary);
      if (appBundle) {
        const openArgs = ['-n', '-a', appBundle, '--args', ...args];
        console.log(`[OCcode] Spawning: open ${openArgs.join(' ')}`);
        child = spawn('open', openArgs, spawnOpts);
        if (!debug) child.unref();
        return;
      }
    }
    if (isWin && codiumBinary.toLowerCase().endsWith('.cmd')) {
      const comspec = process.env.ComSpec || 'cmd.exe';
      const quote = (s) => (/[ \t&(){}\^=;!'+,`~\[\]]/.test(s) ? `"${s}"` : s);
      const cmdline = [quote(codiumBinary), ...args.map(quote)].join(' ');
      console.log(`[OCcode] Spawning: ${comspec} /d /s /c ${cmdline}`);
      console.log(`[OCcode] Working directory: ${binaryDir}`);
      child = spawn(comspec, ['/d', '/s', '/c', cmdline], {
        ...spawnOpts,
        windowsVerbatimArguments: true,
      });
    } else {
      console.log(`[OCcode] Spawning: ${codiumBinary} ${args.join(' ')}`);
      console.log(`[OCcode] Working directory: ${binaryDir}`);
      child = spawn(codiumBinary, args, spawnOpts);
    }
    
    child.on('error', (err) => {
      console.error(`[OCcode] Failed to spawn VSCodium: ${err.message}`);
    });
    
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[OCcode] VSCodium exited with code ${code}`);
      }
    });
    
    if (!debug) child.unref();
  } catch (err) {
    console.error(`[OCcode] Error launching VSCodium: ${err.message}`);
    throw err;
  }
}

module.exports = { installExtension, setDefaults, patchActivityBarState, launchVSCodium };
