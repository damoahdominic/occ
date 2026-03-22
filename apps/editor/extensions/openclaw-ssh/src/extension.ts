import * as vscode from 'vscode';
import type { OpenClawCoreAPI } from '../../openclaw/src/hosts/types';
import { SSHHostAdapter } from './adapter';
import { SSHSetupPanel } from './setup-panel';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const coreExt = vscode.extensions.getExtension<OpenClawCoreAPI>('openclaw.home');
	if (!coreExt) {
		console.warn('[openclaw-ssh] Core extension not found');
		return;
	}
	const coreAPI = coreExt.isActive ? coreExt.exports : await coreExt.activate();
	if (!coreAPI) {
		console.warn('[openclaw-ssh] Core extension did not export API');
		return;
	}
	const disposable = coreAPI.registerHostAdapter(new SSHHostAdapter());
	context.subscriptions.push(disposable);

	const setupCmd = vscode.commands.registerCommand('openclaw.host.setup.ssh', () => {
		SSHSetupPanel.createOrShow(context.extensionUri, coreAPI);
	});
	context.subscriptions.push(setupCmd);

	console.log('[openclaw-ssh] SSHHostAdapter registered');
}

export function deactivate(): void {}
