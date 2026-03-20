import * as vscode from 'vscode';
import type { HostManager } from './manager';
import type { HostEntry } from './types';

// ─────────────────────────────────────────────
// HostTreeItem
// ─────────────────────────────────────────────

class HostTreeItem extends vscode.TreeItem {
	constructor(readonly entry: HostEntry, isActive: boolean) {
		super(entry.label, vscode.TreeItemCollapsibleState.None);
		this.id = `host-${entry.id}`;
		this.contextValue = `host-${entry.type}`;
		this.description = entry.type;

		const status = entry.lastStatus;
		this.iconPath = new vscode.ThemeIcon(
			status === 'online'  ? 'vm-active'
			: status === 'error' ? 'vm-connect'
			: 'vm',
			isActive ? new vscode.ThemeColor('statusBarItem.prominentBackground') : undefined,
		);

		if (isActive) {
			this.label = `${entry.label} ●`;
		}

		this.command = {
			command: 'openclaw.setActiveHost',
			title: 'Switch to host',
			arguments: [entry.id],
		};

		this.tooltip = new vscode.MarkdownString(
			`**${entry.label}** (${entry.type})\n\n` +
			(entry.lastStatus ? `Status: ${entry.lastStatus}\n` : '') +
			(entry.lastConnectedAt ? `Last connected: ${entry.lastConnectedAt}` : ''),
		);
	}
}

// ─────────────────────────────────────────────
// HostTreeProvider
// ─────────────────────────────────────────────

export class HostTreeProvider
	implements vscode.TreeDataProvider<HostTreeItem>, vscode.Disposable
{
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<HostTreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<HostTreeItem | undefined | void> =
		this._onDidChangeTreeData.event;

	private _disposables: vscode.Disposable[] = [];

	constructor(private readonly manager: HostManager) {
		this._disposables.push(
			manager.onDidChangeActiveHost(() => this._onDidChangeTreeData.fire()),
			manager.onDidChangeHostStatus(() => this._onDidChangeTreeData.fire()),
			manager.onDidAddHost(() => this._onDidChangeTreeData.fire()),
			manager.onDidRemoveHost(() => this._onDidChangeTreeData.fire()),
		);
	}

	getTreeItem(element: HostTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(_element?: HostTreeItem): HostTreeItem[] {
		const entries = this.manager.getAllHosts();
		const activeId = (this.manager as any).registry?.getActiveHostId?.() ?? 'local';
		return entries.map(e => new HostTreeItem(e, e.id === activeId));
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	dispose(): void {
		this._onDidChangeTreeData.dispose();
		this._disposables.forEach(d => d.dispose());
	}
}
