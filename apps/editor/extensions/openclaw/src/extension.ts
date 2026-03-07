import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { HomePanel } from './panels/home';
import { StatusPanel } from './panels/status';
import { ConfigPanel, stopConfigProxy } from './panels/config';

const CONFIG_URL = 'http://localhost:18789/config';

/** Returns true if the OpenClaw web server is reachable. */
function isWebServerReachable(): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get(CONFIG_URL, { timeout: 3000 }, res => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

/** Activity-bar container IDs to hide from every OCcode installation. */
const HIDDEN_ACTIVITY_BAR_IDS = [
  'workbench.view.scm',        // Source Control
  'workbench.view.debug',      // Run and Debug
  'workbench.view.extensions', // Extensions
  'workbench.view.remote',     // Remote Explorer
] as const;

type PinnedContainer = {
  id: string;
  pinned: boolean;
  visible: boolean;
  order?: number;
};

/**
 * Hides the specified activity bar containers.
 * Reads the current `workbench.activityBar.pinnedViewContainers` value,
 * marks the target containers as hidden, then persists to GlobalTarget
 * so the change applies across all workspaces on this machine.
 */
async function hideActivityBarItems(
  context: vscode.ExtensionContext,
): Promise<void> {
  // Only run once per installation to avoid fighting user customisations.
  const APPLIED_KEY = 'activityBarHiddenConfiguredV2';
  if (context.globalState.get<boolean>(APPLIED_KEY, false)) {
    return;
  }

  try {
    const config = vscode.workspace.getConfiguration();
    const current =
      config.get<PinnedContainer[]>('workbench.activityBar.pinnedViewContainers') ?? [];

    // Clone array so we can mutate safely.
    const updated: PinnedContainer[] = current.map(c => ({ ...c }));

    for (const id of HIDDEN_ACTIVITY_BAR_IDS) {
      const entry = updated.find(c => c.id === id);
      if (entry) {
        entry.visible = false;
        entry.pinned = false;
      } else {
        updated.push({ id, pinned: false, visible: false });
      }
    }

    await config.update(
      'workbench.activityBar.pinnedViewContainers',
      updated,
      vscode.ConfigurationTarget.Global,
    );

    await context.globalState.update(APPLIED_KEY, true);
  } catch {
    // Non-fatal — wrapper's settings.json defaults already cover most cases.
  }
}

/**
 * Opens ~/.openclaw in the Explorer as a named workspace ("My OpenClaw Workspace").
 *
 * Strategy:
 *  1. Trust ~/.openclaw silently — we create and own this directory.
 *  2. Create ~/.openclaw/My OpenClaw Workspace.code-workspace if it doesn't exist.
 *     VS Code uses the filename (sans extension) as the window title, giving us
 *     "My OpenClaw Workspace" instead of "Untitled Workspace".
 *     The workspace file hides itself from the Explorer via files.exclude.
 *  3. If we're not already inside that workspace, open it (one-time window reload).
 *     After the first launch VS Code remembers the workspace, so no further reloads.
 */
const WORKSPACE_FILENAME = 'My OpenClaw Workspace.code-workspace';

async function openOpenClawFolder(): Promise<void> {
  const openclawPath = path.join(os.homedir(), '.openclaw');

  // Ensure the directory exists.
  if (!fs.existsSync(openclawPath)) {
    fs.mkdirSync(openclawPath, { recursive: true });
  }

  // 1. Create the named workspace file if it doesn't exist.
  const workspaceFilePath = path.join(openclawPath, WORKSPACE_FILENAME);
  if (!fs.existsSync(workspaceFilePath)) {
    fs.writeFileSync(
      workspaceFilePath,
      JSON.stringify(
        {
          folders: [{ path: '.' }],
          settings: {
            // Hide the workspace file itself so the Explorer stays clean.
            'files.exclude': { '*.code-workspace': true },
          },
        },
        null,
        '\t',
      ),
    );
  }

  // 2. If we're already inside this workspace, nothing more to do.
  const workspaceFileUri = vscode.Uri.file(workspaceFilePath);
  if (vscode.workspace.workspaceFile?.fsPath === workspaceFileUri.fsPath) {
    return;
  }

  // 3. Open the workspace file — reloads the window once, then VS Code remembers it.
  await vscode.commands.executeCommand('vscode.openFolder', workspaceFileUri);
}

/**
 * Cross-platform guide the AI can follow to install Node.js if it is missing
 * or too old on the user's machine.
 */
function nodeInstallGuide(platform: string): string {
  if (platform === 'win32') {
    return [
      `**Installing Node.js on Windows (choose one):**`,
      `- **winget** (built into Windows 10+): \`winget install OpenJS.NodeJS.LTS\``,
      `- **Chocolatey**: \`choco install nodejs-lts\``,
      `- **Scoop**: \`scoop install nodejs-lts\``,
      `- **nvm-windows**: download from https://github.com/coreybutler/nvm-windows/releases, then \`nvm install lts && nvm use lts\``,
      `- **Volta**: \`winget install Volta.Volta\` then \`volta install node\``,
      `- **Direct installer**: download the Windows MSI from https://nodejs.org/en/download/ (LTS recommended)`,
      `After installing Node.js, open a **new** terminal and verify with \`node --version\` and \`npm --version\`.`,
      `Then re-run the OpenClaw installer.`,
    ].join('\n');
  }
  if (platform === 'darwin') {
    return [
      `**Installing Node.js on macOS (choose one):**`,
      `- **Homebrew** (recommended): \`brew install node@lts\` or \`brew install node\``,
      `- **nvm** (manages multiple versions):`,
      `  \`curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash\``,
      `  then restart the shell and run \`nvm install --lts && nvm use --lts\``,
      `- **Volta**: \`curl https://get.volta.sh | bash\` then \`volta install node\``,
      `- **Direct installer**: download the macOS pkg from https://nodejs.org/en/download/ (LTS recommended)`,
      `After installing, open a **new** terminal and verify with \`node --version\` and \`npm --version\`.`,
      `Then re-run the OpenClaw installer.`,
    ].join('\n');
  }
  // Linux
  return [
    `**Installing Node.js on Linux (choose one):**`,
    `- **Debian / Ubuntu / Mint**: \`sudo apt update && sudo apt install -y nodejs npm\``,
    `  (for latest LTS via NodeSource: \`curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo bash - && sudo apt install -y nodejs\`)`,
    `- **RHEL / CentOS / Fedora / Rocky**: \`sudo dnf install -y nodejs\``,
    `  (for latest LTS via NodeSource: \`curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash - && sudo dnf install -y nodejs\`)`,
    `- **Arch / Manjaro**: \`sudo pacman -S nodejs npm\``,
    `- **Alpine**: \`apk add nodejs npm\``,
    `- **nvm** (distro-agnostic, no sudo):`,
    `  \`curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash\``,
    `  then restart the shell and run \`nvm install --lts && nvm use --lts\``,
    `- **Volta**: \`curl https://get.volta.sh | bash\` then \`volta install node\``,
    `After installing, verify with \`node --version\` and \`npm --version\`, then re-run the OpenClaw installer.`,
  ].join('\n');
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Apply hidden activity bar items on first activation on this machine.
  await hideActivityBarItems(context);

  // Open ~/.openclaw as "My OpenClaw Workspace" (may reload the window once).
  await openOpenClawFolder();

  context.subscriptions.push(
    vscode.commands.registerCommand('openclaw.home', () => {
      HomePanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand('openclaw.configure', async () => {
      const reachable = await isWebServerReachable();
      if (reachable) {
        await ConfigPanel.createOrShow();
      } else {
        // Web server not running — ask the AI to start it
        const message =
          `The OpenClaw web configuration server is not running at ${CONFIG_URL}.\n\n` +
          `Please start it now by running the OpenClaw gateway in the terminal:\n` +
          `\`\`\`\nopenclaw gateway start\n\`\`\`\n\n` +
          `Once it is running, I will be able to open the configuration UI at ${CONFIG_URL} inside the editor.`;
        await vscode.commands.executeCommand('void.openChatWithMessage', message);
      }
    }),
    vscode.commands.registerCommand('openclaw.aiFixConfig', () => {
      const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
      let configContent: string;
      try {
        configContent = fs.readFileSync(configPath, 'utf-8');
      } catch {
        vscode.window.showErrorMessage(
          'openclaw.json not found at ~/.openclaw/openclaw.json. Please create it first.',
        );
        return;
      }
      const message =
        `Please review my openclaw.json configuration below, identify any issues ` +
        `(syntax errors, missing required fields, invalid values, etc.), ` +
        `and provide a corrected version with an explanation of what you changed.\n\n` +
        `\`\`\`json\n${configContent}\n\`\`\``;
      vscode.commands.executeCommand('void.openChatWithMessage', message);
    }),
    vscode.commands.registerCommand('openclaw.install', async () => {
      await HomePanel.runInstall(
        context.extensionUri,
        process.platform,
        process.arch,
        (vscode.env.shell || '').toLowerCase(),
      );
    }),
    vscode.commands.registerCommand('openclaw.status', () => {
      StatusPanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand('openclaw.configureTUI', async () => {
      // On Windows, Electron may not inherit the full user PATH, so resolve the
      // openclaw binary the same way the home panel does (via HomePanel._findOpenClawPath).
      // Fall back to the plain shell command if the panel hasn't been created yet.
      const terminal = vscode.window.createTerminal({
        name: 'OpenClaw Configure',
        location: vscode.TerminalLocation.Editor,
      });
      terminal.show();
      if (process.platform === 'win32') {
        // Use `cmd /c openclaw configure` so Windows resolves .cmd shims correctly
        terminal.sendText('cmd /c openclaw configure', true);
      } else {
        terminal.sendText('openclaw configure', true);
      }
    }),
  );

  // ── Anonymous install ping (fires once per install, no personal data) ──
  const PING_KEY = 'aptabasePingedV1';
  if (!context.globalState.get<boolean>(PING_KEY)) {
    void context.globalState.update(PING_KEY, true);
    const osName = process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux';
    const version = vscode.extensions.getExtension('openclaw.openclaw')?.packageJSON?.version ?? 'unknown';
    fetch('https://api.aptabase.com/v0/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'App-Key': 'A-US-4013869858',
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        sessionId: Math.random().toString(36).slice(2),
        eventName: 'install',
        systemProps: {
          osName,
          appVersion: version,
          sdkVersion: 'manual-1.0',
        },
        props: {},
      }),
    }).catch(() => {}); // silent — never block the app
  }

  // Auto-show Home panel on startup (after activation settles)
  setTimeout(() => {
    HomePanel.createOrShow(context.extensionUri);
  }, 250);
}

export function deactivate() {
  stopConfigProxy();
}
