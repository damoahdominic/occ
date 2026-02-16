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

async function launchVSCodium(codiumBinary, occodeDir) {
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

  const spawnOpts = {
    detached: !debug,
    stdio: debug ? 'inherit' : 'ignore',
    env: spawnEnv,
  };

  let child;
  if (isWin && codiumBinary.toLowerCase().endsWith('.cmd')) {
    const comspec = process.env.ComSpec || 'cmd.exe';
    const quote = (s) => (/[ \t&(){}\^=;!'+,`~\[\]]/.test(s) ? `"${s}"` : s);
    const cmdline = [quote(codiumBinary), ...args.map(quote)].join(' ');
    child = spawn(comspec, ['/d', '/s', '/c', cmdline], {
      ...spawnOpts,
      windowsVerbatimArguments: true,
    });
  } else {
    child = spawn(codiumBinary, args, spawnOpts);
  }
  if (!debug) child.unref();
}

module.exports = { installExtension, setDefaults, launchVSCodium };
