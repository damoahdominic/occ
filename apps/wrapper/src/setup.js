const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const DEFAULT_SETTINGS = {
  "workbench.startupEditor": "none",
  "workbench.colorTheme": "Default Dark Modern",
  "workbench.tips.enabled": false,
  "extensions.autoUpdate": true,
  "telemetry.telemetryLevel": "off",
  // Hide Source Control, Run & Debug, and Extensions from the activity bar.
  // Items not listed here retain their default visibility (e.g. Explorer, Search,
  // and any contributed view containers like OpenClaw).
  "workbench.activityBar.pinnedViewContainers": [
    { "id": "workbench.view.explorer",   "pinned": true,  "visible": true  },
    { "id": "workbench.view.search",     "pinned": true,  "visible": true  },
    { "id": "workbench.view.scm",        "pinned": false, "visible": false },
    { "id": "workbench.view.debug",      "pinned": false, "visible": false },
    { "id": "workbench.view.extensions", "pinned": false, "visible": false },
  ],
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
      
      try {
        // Extract VSIX manually (it's just a ZIP file)
        // The extension folder name should be publisher.name-version
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(vsixPath);
        
        // Read package.json from the VSIX to get the extension ID
        const zipEntries = zip.getEntries();
        const packageJsonEntry = zipEntries.find(e => e.entryName === 'extension/package.json');
        
        if (!packageJsonEntry) {
          console.warn(`[OCcode] No package.json found in ${vsix}`);
          continue;
        }
        
        const pkg = JSON.parse(packageJsonEntry.getData().toString('utf8'));
        const extensionId = `${pkg.publisher}.${pkg.name}-${pkg.version}`;
        const targetDir = path.join(extensionsDir, extensionId);
        
        console.log(`[OCcode] Installing extension ${extensionId} to ${targetDir}`);
        
        // Remove existing installation if present
        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
        }
        
        // Extract to target directory
        fs.mkdirSync(targetDir, { recursive: true });
        
        // Extract only the 'extension' folder contents (not the extension folder itself)
        for (const entry of zipEntries) {
          if (entry.entryName.startsWith('extension/')) {
            const relativePath = entry.entryName.slice('extension/'.length);
            if (!relativePath) continue;
            
            const targetPath = path.join(targetDir, relativePath);
            
            if (entry.isDirectory) {
              fs.mkdirSync(targetPath, { recursive: true });
            } else {
              fs.mkdirSync(path.dirname(targetPath), { recursive: true });
              fs.writeFileSync(targetPath, entry.getData());
            }
          }
        }
        
        console.log(`[OCcode] Extension ${extensionId} installed successfully`);
        installedAny = true;
        
      } catch (err) {
        console.error(`[OCcode] Failed to install ${vsix}:`, err.message);
        console.error(err.stack);
        
        // Fallback: try CLI installation
        try {
          console.log(`[OCcode] Trying CLI fallback for ${vsix}`);
          let installBinary = codiumBinary;
          if (process.platform === 'win32') {
            const vscodeDir = path.dirname(path.dirname(codiumBinary));
            const vscodiumExe = path.join(vscodeDir, 'VSCodium.exe');
            if (fs.existsSync(vscodiumExe)) {
              installBinary = vscodiumExe;
            }
          }
          
          const userDataDir = path.join(occodeDir, 'user-data');
          const cmd = `"${installBinary}" --install-extension "${vsixPath}" --user-data-dir "${userDataDir}" --extensions-dir "${extensionsDir}" --force`;
          const output = execSync(cmd, { timeout: 120000, encoding: 'utf8', stdio: 'pipe' });
          console.log('[OCcode] CLI install result:', output.trim());
        } catch (cliErr) {
          console.error(`[OCcode] CLI fallback also failed:`, cliErr.message);
        }
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

module.exports = { installExtension, setDefaults, launchVSCodium };
