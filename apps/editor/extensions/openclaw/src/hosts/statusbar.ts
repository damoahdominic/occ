import * as vscode from 'vscode';
import type { HostManager } from './manager';
import type { HostEntry } from './types';

// ─────────────────────────────────────────────
// HostStatusBarItem
// Shows the active host name in the status bar.
// Click → host picker quick-pick.
// ─────────────────────────────────────────────

export class HostStatusBarItem implements vscode.Disposable {
	private readonly _item: vscode.StatusBarItem;
	private _disposables: vscode.Disposable[] = [];

	constructor(private readonly manager: HostManager) {
		this._item = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			100,
		);
		this._item.command = 'openclaw.pickHost';
		this._item.tooltip = 'OpenClaw: active host — click to switch';
		this._disposables.push(this._item);

		this._disposables.push(
			manager.onDidChangeActiveHost(() => this._refresh()),
			manager.onDidChangeHostStatus(() => this._refresh()),
		);

		this._refresh();
		this._item.show();
	}

	private _refresh(): void {
		const activeId = (this.manager as any).registry?.getActiveHostId?.() ?? 'local';
		const hosts: HostEntry[] = this.manager.getAllHosts();
		const entry = hosts.find(h => h.id === activeId);
		const label = entry?.label ?? 'Local';
		const status = entry?.lastStatus;

		const icon = status === 'online'  ? '$(vm-active)'
		           : status === 'error'   ? '$(vm-connect)'
		           : status === 'offline' ? '$(vm)'
		           : '$(vm)';

		this._item.text = `${icon} ${label}`;
	}

	dispose(): void {
		this._disposables.forEach(d => d.dispose());
	}
}
