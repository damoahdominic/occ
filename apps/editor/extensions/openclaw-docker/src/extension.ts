import * as vscode from 'vscode';
import type { OpenClawCoreAPI } from '../../openclaw/src/hosts/types';
import { DockerHostAdapter } from './adapter';
import { DockerSetupPanel } from './setup-panel';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const coreExt = vscode.extensions.getExtension<OpenClawCoreAPI>('openclaw.home');
	if (!coreExt) {
		console.warn('[openclaw-docker] Core extension openclaw.home not found — docker adapter not registered');
		return;
	}

	const coreAPI = coreExt.isActive
		? coreExt.exports
		: await coreExt.activate();

	if (!coreAPI || typeof coreAPI.registerHostAdapter !== 'function') {
		console.warn('[openclaw-docker] Core extension did not export OpenClawCoreAPI — docker adapter not registered');
		return;
	}

	const adapter = new DockerHostAdapter();
	const disposable = coreAPI.registerHostAdapter(adapter, 'openclaw.openclaw-docker');
	context.subscriptions.push(disposable);

	const setupCmd = vscode.commands.registerCommand('openclaw.host.setup.docker', () => {
		DockerSetupPanel.createOrShow(context.extensionUri, coreAPI);
	});
	context.subscriptions.push(setupCmd);

	console.log('[openclaw-docker] DockerHostAdapter registered');
}

export function deactivate(): void {
	// Subscriptions cleaned up automatically
}
