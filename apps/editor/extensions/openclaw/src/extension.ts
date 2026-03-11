import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { HomePanel } from './panels/home';
import { OnboardingPanel } from './panels/onboarding';
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

type PinnedContainer = {
  id: string;
  pinned: boolean;
  visible: boolean;
  order?: number;
};

/**
 * Writes a complete, authoritative activity-bar container list that keeps
 * only Explorer and Search visible and hides everything else (SCM, Debug,
 * Extensions, Remote Explorer, etc.).
 *
 * Writing a FULL list — rather than patching the existing one — is the only
 * reliable way to override VS Code's built-in defaults on fresh installs where
 * `pinnedViewContainers` is empty.
 */
async function hideActivityBarItems(
  context: vscode.ExtensionContext,
): Promise<void> {
  // Bumped to V5 — disables git entirely so SCM button never appears.
  const APPLIED_KEY = 'activityBarHiddenConfiguredV5';
  if (context.globalState.get<boolean>(APPLIED_KEY, false)) {
    return;
  }

  try {
    const config = vscode.workspace.getConfiguration();

    // Disable git entirely — users don't need it and it causes the SCM button
    // to reappear even after hiding it via pinnedViewContainers.
    await config.update('git.enabled', false, vscode.ConfigurationTarget.Global);
    await config.update('git.decorations.enabled', false, vscode.ConfigurationTarget.Global);

    // Complete authoritative list of all standard VS Code activity-bar containers.
    // Only Explorer and Search stay visible; everything else is hidden.
    const authoritative: PinnedContainer[] = [
      { id: 'workbench.view.explorer',   pinned: true,  visible: true,  order: 0 },
      { id: 'workbench.view.search',     pinned: true,  visible: true,  order: 1 },
      { id: 'workbench.view.scm',        pinned: false, visible: false, order: 2 },
      { id: 'workbench.view.debug',      pinned: false, visible: false, order: 3 },
      { id: 'workbench.view.extensions', pinned: false, visible: false, order: 4 },
      { id: 'workbench.view.remote',     pinned: false, visible: false, order: 5 },
    ];

    // Preserve any extra containers the user may have added (e.g. third-party
    // extensions) so we don't accidentally remove them.
    const existing =
      config.get<PinnedContainer[]>('workbench.activityBar.pinnedViewContainers') ?? [];
    const knownIds = new Set(authoritative.map(c => c.id));
    for (const c of existing) {
      if (!knownIds.has(c.id)) {
        authoritative.push({ ...c });
      }
    }

    await config.update(
      'workbench.activityBar.pinnedViewContainers',
      authoritative,
      vscode.ConfigurationTarget.Global,
    );

    await context.globalState.update(APPLIED_KEY, true);
  } catch {
    // Non-fatal — settings.json defaults already cover most cases.
  }
}

/**
 * Opens ~/.openclaw as a named workspace — but only if OpenClaw is already installed.
 *
 * Strategy:
 *  - ~/.occ is OCcode's internal state directory. It is never opened as a workspace.
 *  - ~/.openclaw is OpenClaw's directory, created by OpenClaw after it installs.
 *    We open it as the workspace so users can browse their config files.
 *    If it doesn't exist yet (pre-install), we do nothing.
 *  - The .code-workspace file lives in ~/.occ so we don't pollute ~/.openclaw.
 *    The workspace file points at ~/.openclaw as the folder using an absolute path.
 */
const WORKSPACE_FILENAME = 'My OpenClaw Workspace.code-workspace';

async function openOpenClawFolder(): Promise<void> {
  // Ensure ~/.occ exists — OCcode's internal state directory.
  const occPath = path.join(os.homedir(), '.occ');
  if (!fs.existsSync(occPath)) {
    fs.mkdirSync(occPath, { recursive: true });
  }

  // Only open the workspace if OpenClaw is already installed.
  const openclawPath = path.join(os.homedir(), '.openclaw');
  if (!fs.existsSync(openclawPath)) {
    return; // OpenClaw not installed yet — nothing to open.
  }

  // Workspace file lives in ~/.occ, points at ~/.openclaw as the folder.
  const workspaceFilePath = path.join(occPath, WORKSPACE_FILENAME);
  if (!fs.existsSync(workspaceFilePath)) {
    fs.writeFileSync(
      workspaceFilePath,
      JSON.stringify(
        {
          folders: [{ path: openclawPath }],
          settings: {
            'files.exclude': { '*.code-workspace': true },
          },
        },
        null,
        '\t',
      ),
    );
  }

  // If we're already inside this workspace, nothing more to do.
  const workspaceFileUri = vscode.Uri.file(workspaceFilePath);
  if (vscode.workspace.workspaceFile?.fsPath === workspaceFileUri.fsPath) {
    return;
  }

  // Open the workspace — reloads the window once, then VS Code remembers it.
  await vscode.commands.executeCommand('vscode.openFolder', workspaceFileUri);
}


// ── Inference balance status bar ──────────────────────────────────────────────
const BALANCE_KEY = 'inferenceBalanceV1';
const BALANCE_CAP = 1.00;

function initBalanceBar(context: vscode.ExtensionContext): (amount?: number) => void {
  let balance = context.globalState.get<number>(BALANCE_KEY, BALANCE_CAP);
  // displayBalance is what's shown — animated separately from the true balance
  let displayBalance = balance;
  let animTimer: ReturnType<typeof setInterval> | undefined;

  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 16);
  bar.command = 'openclaw.balance.details';
  bar.name = 'OCC Free Tier';
  context.subscriptions.push(bar);

  function renderAt(value: number): void {
    const pct = Math.max(0, value / BALANCE_CAP);
    const filled = Math.round(pct * 10);
    const track = '█'.repeat(filled) + '░'.repeat(10 - filled);

    bar.text = `$(credit-card) $${value.toFixed(4)}`;

    const tip = new vscode.MarkdownString(undefined, true);
    tip.isTrusted = true;
    tip.appendMarkdown(
      `**OCC Free Tier**\n\n` +
      `\`${track}\`  **$${value.toFixed(4)}** of $${BALANCE_CAP.toFixed(2)} remaining\n\n` +
      `_$1 should typically last you for more than a week._`
    );
    bar.tooltip = tip;

    if (pct > 0.5) {
      bar.color = undefined;
      bar.backgroundColor = undefined;
    } else if (pct > 0.2) {
      bar.color = new vscode.ThemeColor('statusBarItem.warningForeground');
      bar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      bar.color = new vscode.ThemeColor('statusBarItem.errorForeground');
      bar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
    bar.show();
  }

  function animateTo(from: number, to: number): void {
    if (animTimer !== undefined) { clearInterval(animTimer); }
    const DURATION = 380; // ms
    const FPS = 60;
    const STEP = 1000 / FPS;
    const start = Date.now();
    animTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      const t = Math.min(elapsed / DURATION, 1);
      // Ease-out cubic: decelerates as it approaches the target
      const eased = 1 - Math.pow(1 - t, 3);
      displayBalance = from + (to - from) * eased;
      renderAt(displayBalance);
      if (t >= 1) {
        clearInterval(animTimer!);
        animTimer = undefined;
        displayBalance = to;
        renderAt(to);
      }
    }, STEP);
  }

  function spend(amount: number = 0.0001): void {
    const prev = displayBalance;
    balance = Math.max(0, +(balance - amount).toFixed(6));
    void context.globalState.update(BALANCE_KEY, balance);
    animateTo(prev, balance);
  }

  renderAt(balance);

  context.subscriptions.push(
    vscode.commands.registerCommand('openclaw.balance.spend', (amount?: number) => {
      spend(amount);
    }),
    vscode.commands.registerCommand('openclaw.balance.details', () => {
      const pct = balance / BALANCE_CAP;
      const statusLine =
        pct > 0.5 ? `You have $${balance.toFixed(4)} remaining — you're in good shape.` :
        pct > 0.2 ? `Running low — $${balance.toFixed(4)} of your $1.00 free credit left.` :
                    `Almost depleted — $${balance.toFixed(4)} remaining.`;
      vscode.window.showInformationMessage(
        `OCC Free Tier · ${statusLine} $1 should typically last you for more than a week.`,
        'Buy More Credits'
      ).then(sel => {
        if (sel === 'Buy More Credits') {
          vscode.env.openExternal(vscode.Uri.parse('https://openclaw.ai/billing'));
        }
      });
    }),
  );

  return spend;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Inference balance bar (shown at bottom-right, tracks $1.00 free budget).
  const spendBalance = initBalanceBar(context);

  // Apply hidden activity bar items on first activation on this machine.
  await hideActivityBarItems(context);

  // Open ~/.openclaw as "My OpenClaw Workspace" (may reload the window once).
  await openOpenClawFolder();

  context.subscriptions.push(
    vscode.commands.registerCommand('openclaw.home', () => {
      HomePanel.createOrShow(context.extensionUri, context);
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
        spendBalance();
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
      spendBalance();
    }),
    vscode.commands.registerCommand('openclaw.install', () => {
      void HomePanel.runInstall(
        context.extensionUri,
        process.platform,
        process.arch,
        process.env.SHELL ?? '',
      );
    }),
    vscode.commands.registerCommand('openclaw.openWorkspace', () => {
      void openOpenClawFolder();
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

  // Auto-show on startup: onboarding on first launch, OCC Home on subsequent launches.
  setTimeout(() => {
    const shown = OnboardingPanel.showIfNeeded(context, context.extensionUri);
    if (!shown) {
      HomePanel.createOrShow(context.extensionUri, context);
    }
  }, 250);
}

export function deactivate() {
  stopConfigProxy();
}
