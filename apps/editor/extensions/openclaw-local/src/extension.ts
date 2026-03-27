import * as vscode from 'vscode';
import type { OpenClawCoreAPI } from '../../openclaw/src/hosts/types';
import { LocalHostAdapter } from './adapter';
import { LocalSetupPanel } from './setup-panel';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	// Grab the core API exported by the openclaw.home extension
	const coreExt = vscode.extensions.getExtension<OpenClawCoreAPI>('openclaw.home');
	if (!coreExt) {
		console.warn('[openclaw-local] Core extension openclaw.home not found — local adapter not registered');
		return;
	}

	const coreAPI = coreExt.isActive
		? coreExt.exports
		: await coreExt.activate();

	if (!coreAPI || typeof coreAPI.registerHostAdapter !== 'function') {
		console.warn('[openclaw-local] Core extension did not export OpenClawCoreAPI — local adapter not registered');
		return;
	}

	const adapter = new LocalHostAdapter();
	const disposable = coreAPI.registerHostAdapter(adapter);
	context.subscriptions.push(disposable);

	const setupCmd = vscode.commands.registerCommand('openclaw.host.setup.local', () => {
		LocalSetupPanel.createOrShow(context.extensionUri, coreAPI);
	});
	context.subscriptions.push(setupCmd);

	console.log('[openclaw-local] LocalHostAdapter registered');
}

export function deactivate(): void {
	// Subscriptions cleaned up automatically
}
