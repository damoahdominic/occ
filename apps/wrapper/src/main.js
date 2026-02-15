const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { downloadVSCodium, getVSCodiumBinary } = require('./download');
const { installExtension, setDefaults, launchVSCodium } = require('./setup');

const APP_NAME = 'OCcode';
const VSCODIUM_VERSION = '1.109.31074';
const OCCODE_DIR = path.join(require('os').homedir(), '.occode');
const VSCODE_DIR = path.join(OCCODE_DIR, 'vscode');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 380,
    title: APP_NAME,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'splash.html'));
  mainWindow.setMenuBarVisibility(false);
}

function sendStatus(msg) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.executeJavaScript(
      `document.getElementById('status').textContent = ${JSON.stringify(msg)}`
    );
  }
}

async function bootstrap() {
  try {
    sendStatus('Checking VSCodium installation…');
    const binary = getVSCodiumBinary(VSCODE_DIR);

    const fs = require('fs');
    if (!fs.existsSync(binary)) {
      sendStatus('Downloading VSCodium…');
      await downloadVSCodium(VSCODIUM_VERSION, VSCODE_DIR);
    }

    sendStatus('Installing OpenClaw extension…');
    await installExtension(binary, OCCODE_DIR);

    sendStatus('Setting defaults…');
    await setDefaults(OCCODE_DIR);

    sendStatus('Launching editor…');
    await launchVSCodium(binary, OCCODE_DIR);

    // Close wrapper after launching editor
    setTimeout(() => app.quit(), 2000);
  } catch (err) {
    dialog.showErrorBox('OCcode Error', err.message);
    app.quit();
  }
}

app.setName(APP_NAME);
app.whenReady().then(() => {
  createWindow();
  bootstrap();
});

app.on('window-all-closed', () => app.quit());
