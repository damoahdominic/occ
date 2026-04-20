import * as vscode from 'vscode';
import type {
	HostAdapter,
	HostChoiceType,
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

/** Extension IDs trusted to register adapters without user confirmation. */
const TRUSTED_ADAPTER_EXTENSIONS = new Set([
	'openclaw.openclaw-local',
	'openclaw.openclaw-docker',
	'openclaw.openclaw-ssh',
	'openclaw.openclaw-cloud',
	'openclaw.home',
]);

/** globalState key for user-approved adapter extension IDs. */
const APPROVED_ADAPTERS_KEY = 'occ.approvedAdapterExtensions';

export class HostManager implements OpenClawCoreAPI, vscode.Disposable {
	readonly version = '1.0.0';

	private _adapters = new Map<HostType, HostAdapter>();
	private _connections = new Map<string, HostConnection>();
	private _disposables: vscode.Disposable[] = [];
	private _globalState: vscode.Memento | undefined;
	private readonly _log: vscode.OutputChannel;

	private readonly _onDidChangeActiveHost = new vscode.EventEmitter<HostConnection | undefined>();
	readonly onDidChangeActiveHost: vscode.Event<HostConnection | undefined> = this._onDidChangeActiveHost.event;

	private readonly _onDidChangeHostStatus = new vscode.EventEmitter<{ hostId: string; status: HostStatus }>();
	readonly onDidChangeHostStatus: vscode.Event<{ hostId: string; status: HostStatus }> = this._onDidChangeHostStatus.event;

	private readonly _onDidAddHost = new vscode.EventEmitter<HostEntry>();
	readonly onDidAddHost: vscode.Event<HostEntry> = this._onDidAddHost.event;

	private readonly _onDidRemoveHost = new vscode.EventEmitter<string>();
	readonly onDidRemoveHost: vscode.Event<string> = this._onDidRemoveHost.event;

	constructor(private readonly registry: HostRegistry, globalState?: vscode.Memento) {
		this._globalState = globalState;
		this._log = vscode.window.createOutputChannel('OpenClaw Adapters');
		this._disposables.push(
			this._log,
			registry.onDidChange(() => this._onRegistryChange()),
		);
	}

	// ── Adapter registration ──────────────────

	registerHostAdapter(adapter: HostAdapter, extensionId: string): vscode.Disposable {
		// Verify the extension actually exists in VS Code
		const ext = vscode.extensions.getExtension(extensionId);
		if (!ext) {
			this._log.appendLine(`[BLOCKED] Adapter "${adapter.type}" from unknown extension "${extensionId}"`);
			throw new Error(`Extension "${extensionId}" not found`);
		}

		// Check trust
		if (!this._isAdapterTrusted(extensionId)) {
			this._log.appendLine(`[UNTRUSTED] Adapter "${adapter.type}" from "${extensionId}" — awaiting user approval`);
			// Return a no-op disposable; actual registration happens if user approves
			void this._promptAdapterApproval(adapter, extensionId);
			return new vscode.Disposable(() => { /* no-op until approved */ });
		}

		return this._doRegister(adapter, extensionId);
	}

	private _isAdapterTrusted(extensionId: string): boolean {
		if (TRUSTED_ADAPTER_EXTENSIONS.has(extensionId)) { return true; }
		const approved = this._globalState?.get<string[]>(APPROVED_ADAPTERS_KEY, []) ?? [];
		return approved.includes(extensionId);
	}

	private async _promptAdapterApproval(adapter: HostAdapter, extensionId: string): Promise<void> {
		const choice = await vscode.window.showWarningMessage(
			`Extension "${extensionId}" wants to register as an OpenClaw host adapter (type: ${adapter.type}). Allow?`,
			{ modal: true },
			'Allow',
			'Deny',
		);
		if (choice === 'Allow') {
			// Persist approval
			const approved = this._globalState?.get<string[]>(APPROVED_ADAPTERS_KEY, []) ?? [];
			if (!approved.includes(extensionId)) {
				approved.push(extensionId);
				await this._globalState?.update(APPROVED_ADAPTERS_KEY, approved);
			}
			this._doRegister(adapter, extensionId);
			this._log.appendLine(`[APPROVED] Adapter "${adapter.type}" from "${extensionId}"`);
		} else {
			this._log.appendLine(`[DENIED] Adapter "${adapter.type}" from "${extensionId}"`);
		}
	}

	private _doRegister(adapter: HostAdapter, extensionId: string): vscode.Disposable {
		this._log.appendLine(`[OK] Adapter "${adapter.type}" registered from "${extensionId}"`);
		this._adapters.set(adapter.type, adapter);
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

	// ── ticket-053: chosenHostType pass-throughs ──

	getChosenHostType(): HostChoiceType | undefined {
		return this.registry.getChosenHostType();
	}

	async markActiveHostChosen(type: HostChoiceType): Promise<void> {
		await this.registry.markActiveHostChosen(type);
	}

	async clearActiveHostChoice(): Promise<void> {
		await this.registry.clearActiveHostChoice();
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
		// Hydrate full connection config from SecretStorage
		const fullConnection = await this.registry.getHostConnection(id);
		if (!fullConnection) { return undefined; }
		try {
			const conn = await adapter.connect(fullConnection);
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

	async addHost(entry: Omit<HostEntry, 'id' | 'createdAt'>): Promise<HostEntry> {
		const id = `${entry.type}-${Date.now()}`;
		const full: HostEntry = { ...entry, id, createdAt: new Date().toISOString() };
		await this.registry.addHost(full);
		this._onDidAddHost.fire(full);
		await this._ensureConnected(id).catch(() => { /* ignore — caller handles */ });
		return full;
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
