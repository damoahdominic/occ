import * as vscode from 'vscode';
import { HomePanel } from './panels/home';
import { SetupPanel } from './panels/setup';
import { StatusPanel } from './panels/status';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaw.home', () => {
      HomePanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand('openclaw.setupLocal', () => {
      SetupPanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand('openclaw.status', () => {
      StatusPanel.createOrShow(context.extensionUri);
    }),
  );

  // Show home panel on first activation
  vscode.commands.executeCommand('openclaw.home');
}

export function deactivate() {}
