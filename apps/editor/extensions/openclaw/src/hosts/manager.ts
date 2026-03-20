import * as vscode from 'vscode';
import type {
	HostAdapter,
	HostConnection,
	HostEntry,
	HostStatus,
	HostType,
	OpenClawCoreAPI,
} from './types';
import { HostRegistry } from './registry';

// ─────────────────────────────────────────────
// HostManager
// Owns adapters, live connections, and the registry.
// Implements OpenClawCoreAPI for export to adapter extensions.
// ─────────────────────────────────────────────

export class HostManager implements OpenClawCoreAPI, vscode.Disposable {
	readonly version = '1.0.0';

	private _adapters = new Map<HostType, HostAdapter>();
	private _connections = new Map<string, HostConnection>();
	private _disposables: vscode.Disposable[] = [];

	private readonly _onDidChangeActiveHost = new vscode.EventEmitter<HostConnection | undefined>();
	readonly onDidChangeActiveHost: vscode.Event<HostConnection | undefined> = this._onDidChangeActiveHost.event;

	private readonly _onDidChangeHostStatus = new vscode.EventEmitter<{ hostId: string; status: HostStatus }>();
	readonly onDidChangeHostStatus: vscode.Event<{ hostId: string; status: HostStatus }> = this._onDidChangeHostStatus.event;

	private readonly _onDidAddHost = new vscode.EventEmitter<HostEntry>();
	readonly onDidAddHost: vscode.Event<HostEntry> = this._onDidAddHost.event;

	private readonly _onDidRemoveHost = new vscode.EventEmitter<string>();
	readonly onDidRemoveHost: vscode.Event<string> = this._onDidRemoveHost.event;

	constructor(private readonly registry: HostRegistry) {
		this._disposables.push(
			registry.onDidChange(() => this._onRegistryChange()),
		);
	}

	// ── Adapter registration ──────────────────

	registerHostAdapter(adapter: HostAdapter): vscode.Disposable {
		this._adapters.set(adapter.type, adapter);
		// Attempt to connect any persisted hosts of this type
		this._connectPersistedHosts(adapter.type);
		return new vscode.Disposable(() => {
			this._adapters.delete(adapter.type);
		});
	}

	getAdapter(type: HostType): HostAdapter | undefined {
		return this._adapters.get(type);
	}

	// ── Host queries ──────────────────────────

	getActiveHost(): HostConnection | undefined {
		const id = this.registry.getActiveHostId();
		return this._connections.get(id);
	}

	getHost(id: string): HostConnection | undefined {
		return this._connections.get(id);
	}

	getAllHosts(): HostEntry[] {
		return this.registry.getAllHosts();
	}

	async setActiveHost(id: string): Promise<void> {
		const prev = this.registry.getActiveHostId();
		if (prev === id) { return; }
		this.registry.setActiveHostId(id);
		// Ensure connected
		await this._ensureConnected(id);
		this._onDidChangeActiveHost.fire(this._connections.get(id));
	}

	// ── Connection management ─────────────────

	private async _connectPersistedHosts(type: HostType): Promise<void> {
		const entries = this.registry.getAllHosts().filter(h => h.type === type);
		for (const entry of entries) {
			await this._ensureConnected(entry.id).catch(() => {/* ignore individual failures */});
		}
	}

	private async _ensureConnected(id: string): Promise<HostConnection | undefined> {
		if (this._connections.has(id)) {
			return this._connections.get(id);
		}
		const entry = this.registry.getHost(id);
		if (!entry) { return undefined; }
		const adapter = this._adapters.get(entry.type);
		if (!adapter) { return undefined; }
		try {
			const conn = await adapter.connect(entry.connection);
			this._connections.set(id, conn);
			this.registry.touchLastConnected(id);
			return conn;
		} catch (err) {
			this.registry.setHostStatus(id, 'error', String(err));
			this._onDidChangeHostStatus.fire({ hostId: id, status: 'error' });
			return undefined;
		}
	}

	// ── Wizard / picker ───────────────────────

	async showHostPicker(): Promise<string | undefined> {
		const entries = this.registry.getAllHosts();
		const activeId = this.registry.getActiveHostId();
		const items = entries.map(e => ({
			label: e.label,
			description: e.type + (e.id === activeId ? ' • active' : ''),
			id: e.id,
		}));
		const pick = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select a host',
		});
		return pick?.id;
	}

	async showAddHostWizard(_type?: HostType): Promise<HostEntry | undefined> {
		// Full wizard lives in the webview panel; this is a lightweight fallback.
		vscode.window.showInformationMessage('Use the OpenClaw panel to add hosts.');
		return undefined;
	}

	async refreshHost(id: string): Promise<void> {
		const conn = this._connections.get(id);
		if (!conn) {
			await this._ensureConnected(id);
			return;
		}
		try {
			const status = await conn.gatewayHealthCheck();
			const hostStatus: HostStatus =
				status.state === 'running' ? 'online' :
				status.state === 'error'   ? 'error'  : 'offline';
			this.registry.setHostStatus(id, hostStatus, status.error);
			this._onDidChangeHostStatus.fire({ hostId: id, status: hostStatus });
		} catch {
			this.registry.setHostStatus(id, 'error', 'Health check failed');
			this._onDidChangeHostStatus.fire({ hostId: id, status: 'error' });
		}
	}

	// ── Internal ──────────────────────────────

	private _onRegistryChange(): void {
		// Drop connections for removed hosts
		for (const [id, conn] of this._connections) {
			if (!this.registry.getHost(id)) {
				conn.dispose();
				this._connections.delete(id);
			}
		}
	}

	// ── Dispose ───────────────────────────────

	dispose(): void {
		for (const conn of this._connections.values()) {
			conn.dispose();
		}
		this._connections.clear();
		this._onDidChangeActiveHost.dispose();
		this._onDidChangeHostStatus.dispose();
		this._onDidAddHost.dispose();
		this._onDidRemoveHost.dispose();
		this._disposables.forEach(d => d.dispose());
	}
}
