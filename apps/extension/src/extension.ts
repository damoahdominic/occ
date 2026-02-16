import * as vscode from 'vscode';
import { HomePanel } from './panels/home';
import { ConfigPanel } from './panels/setup';
import { StatusPanel } from './panels/status';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaw.home', () => {
      HomePanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand('openclaw.configure', () => {
      ConfigPanel.createOrShow(context.extensionUri);
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

  // Auto-show Home panel on startup
  HomePanel.createOrShow(context.extensionUri);
}

export function deactivate() {}
