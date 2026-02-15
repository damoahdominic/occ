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

  for (const dir of searchPaths) {
    if (!fs.existsSync(dir)) continue;
    const vsixFiles = fs.readdirSync(dir).filter(f => f.endsWith('.vsix'));
    console.log('[OCcode] Found VSIX in', dir, ':', vsixFiles);
    for (const vsix of vsixFiles) {
      const vsixPath = path.join(dir, vsix);
      const userDataDir = path.join(occodeDir, 'user-data');
      try {
        // Use execSync with shell:true — codium binary is a shell script on Linux/Mac
        const cmd = `"${codiumBinary}" --install-extension "${vsixPath}" --user-data-dir "${userDataDir}" --force`;
        console.log('[OCcode] Running:', cmd);
        const output = execSync(cmd, { timeout: 120000, shell: true, encoding: 'utf8' });
        console.log('[OCcode] Install result:', output.trim());
      } catch (err) {
        console.warn(`[OCcode] Failed to install ${vsix}:`, err.message);
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
