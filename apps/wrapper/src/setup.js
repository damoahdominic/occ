const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

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

  for (const dir of searchPaths) {
    if (!fs.existsSync(dir)) continue;
    const vsixFiles = fs.readdirSync(dir).filter(f => f.endsWith('.vsix'));
    for (const vsix of vsixFiles) {
      const vsixPath = path.join(dir, vsix);
      const userDataDir = path.join(occodeDir, 'user-data');
      try {
        await execFileAsync(codiumBinary, [
          '--install-extension', vsixPath,
          '--user-data-dir', userDataDir,
          '--force',
        ], { timeout: 60000 });
      } catch (err) {
        console.warn(`Failed to install ${vsix}:`, err.message);
      }
    }
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
  const child = spawn(codiumBinary, [
    '--user-data-dir', userDataDir,
  ], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

module.exports = { installExtension, setDefaults, launchVSCodium };
