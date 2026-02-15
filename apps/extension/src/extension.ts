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
      const terminal = vscode.window.createTerminal('OpenClaw Install');
      terminal.show();
      terminal.sendText('npm install -g openclaw@latest && openclaw onboard');
    }),
    vscode.commands.registerCommand('openclaw.status', () => {
      StatusPanel.createOrShow(context.extensionUri);
    }),
  );

  // Auto-show Home panel on startup
  HomePanel.createOrShow(context.extensionUri);
}

export function deactivate() {}
