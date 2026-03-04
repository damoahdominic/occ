import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { HomePanel } from './panels/home';
import { ConfigPanel } from './panels/setup';
import { StatusPanel } from './panels/status';

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

  const openclawUri = vscode.Uri.file(openclawPath);

  // 1. Trust ~/.openclaw globally so VS Code never prompts the user.
  const trustConfig = vscode.workspace.getConfiguration('security.workspace.trust');
  const trustedUris: string[] = trustConfig.get('trustedUris') ?? [];
  const uriString = openclawUri.toString();
  if (!trustedUris.includes(uriString)) {
    await trustConfig.update(
      'trustedUris',
      [...trustedUris, uriString],
      vscode.ConfigurationTarget.Global,
    );
  }

  // 2. Create the named workspace file if it doesn't exist.
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

  // 3. If we're already inside this workspace, nothing more to do.
  const workspaceFileUri = vscode.Uri.file(workspaceFilePath);
  if (vscode.workspace.workspaceFile?.fsPath === workspaceFileUri.fsPath) {
    return;
  }

  // Open the workspace file — reloads the window once, then VS Code remembers it.
  await vscode.commands.executeCommand('vscode.openFolder', workspaceFileUri);
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
    vscode.commands.registerCommand('openclaw.configure', () => {
      ConfigPanel.createOrShow(context.extensionUri);
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
    vscode.commands.registerCommand('openclaw.install', () => {
      const platform = process.platform;
      const shell = (vscode.env.shell || '').toLowerCase();
      let installCmd = 'curl -fsSL https://openclaw.ai/install.sh | bash';

      if (platform === 'win32') {
        const isPowerShell = shell.includes('powershell') || shell.includes('pwsh');
        installCmd = isPowerShell
          ? 'iwr -useb https://openclaw.ai/install.ps1 | iex'
          : 'curl -fsSL https://openclaw.ai/install.cmd -o install.cmd && install.cmd && del install.cmd';
      }

      const terminal = vscode.window.createTerminal('OpenClaw Install');
      terminal.show();
      terminal.sendText(installCmd);
    }),
    vscode.commands.registerCommand('openclaw.status', () => {
      StatusPanel.createOrShow(context.extensionUri);
    }),
  );

  // Auto-show Home panel on startup (after activation settles)
  setTimeout(() => {
    HomePanel.createOrShow(context.extensionUri);
  }, 250);
}

export function deactivate() {}
