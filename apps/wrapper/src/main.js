const { app, BrowserWindow, dialog, nativeImage } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { getAssetPath } = require('./utils/assets');
const {
  downloadVSCodium,
  findVSCodiumBinary,
  getVSCodiumBinary,
  getPlatformInfo,
} = require('./download');
const { installExtension, setDefaults, launchVSCodium } = require('./setup');

const APP_NAME = 'OCcode';
const manifest = require('../vscodium-manifest.json');
const VSCODIUM_VERSION = manifest.version;
const OCCODE_DIR = path.join(require('os').homedir(), '.occode');
const VSCODE_DIR = path.join(OCCODE_DIR, 'vscode');
const ICON_PATH = getAssetPath('icon.png');
const isLinux = process.platform === 'linux';
const isHeadless = isLinux && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;

let mainWindow;

function applyAppIcon() {
  if (process.platform === 'darwin' && app.dock) {
    const image = nativeImage.createFromPath(ICON_PATH);
    if (!image.isEmpty()) {
      app.dock.setIcon(image);
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 380,
    title: APP_NAME,
    resizable: false,
    icon: ICON_PATH,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'splash.html'));
  mainWindow.webContents.once('did-finish-load', () => {
    const logoUrl = pathToFileURL(ICON_PATH).toString();
    mainWindow.webContents.executeJavaScript(
      `const img = document.getElementById('logo-img'); if (img) { img.src = ${JSON.stringify(logoUrl)}; }`
    );
  });
  mainWindow.setMenuBarVisibility(false);
}

function sendStatus(msg) {
  console.log(`[OCcode] ${msg}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.executeJavaScript(
      `document.getElementById('status').textContent = ${JSON.stringify(msg)}`
    );
  }
}

async function bootstrap() {
  try {
    sendStatus('Checking VSCodium installation…');
    let binary = findVSCodiumBinary(VSCODE_DIR);

    const fs = require('fs');
    if (!binary || !fs.existsSync(binary)) {
      sendStatus('Downloading VSCodium…');
      await downloadVSCodium(VSCODIUM_VERSION, VSCODE_DIR);
    }
    binary = getVSCodiumBinary(VSCODE_DIR);

    sendStatus('Customizing appearance…');
    const { rebrandVSCodium } = require('./rebrand');
    await rebrandVSCodium(VSCODE_DIR);

    const os = require('os');
    if (process.platform !== 'win32') {
      // Use the actual binary's directory for chmod (handles both flat and nested structures)
      const binDir = path.dirname(binary);
      if (fs.existsSync(binDir)) {
        for (const file of fs.readdirSync(binDir)) {
          const fullPath = path.join(binDir, file);
          try { fs.chmodSync(fullPath, 0o755); } catch {}
        }
      }
    }

    sendStatus('Installing OpenClaw extension…');
    await installExtension(binary, OCCODE_DIR);

    sendStatus('Setting defaults…');
    await setDefaults(OCCODE_DIR);

    sendStatus('Launching editor…');
    await launchVSCodium(binary, OCCODE_DIR, VSCODE_DIR);

    // Close wrapper after launching editor
    setTimeout(() => app.quit(), 2000);
  } catch (err) {
    console.error('[OCcode] Error:', err);
    dialog.showErrorBox('OCcode Error', err.message);
    app.quit();
  }
}

app.setName(APP_NAME);
if (isLinux) {
  // Silence DBus connection errors in headless/limited environments.
  app.commandLine.appendSwitch('disable-features', 'UseDBus');
}
if (process.env.OCCODE_DISABLE_GPU === '1' || isHeadless) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
}
app.whenReady().then(() => {
  applyAppIcon();
  createWindow();
  bootstrap();
});

app.on('window-all-closed', () => app.quit());
