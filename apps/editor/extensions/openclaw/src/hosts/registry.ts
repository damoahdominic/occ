import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { HostConnectionConfig, HostEntry, HostsFile, HostType, HostStatus } from './types';

// ─────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────

export function getOccDir(): string {
	return path.join(os.homedir(), '.occ');
}

export function getHostsFilePath(): string {
	return path.join(getOccDir(), 'hosts.json');
}

export function getHostCacheDir(hostId: string): string {
	return path.join(getOccDir(), 'hosts', hostId);
}

export function getHostCachePath(hostId: string): string {
	return path.join(getHostCacheDir(hostId), 'cache.json');
}

// ─────────────────────────────────────────────
// Default local host seed
// ─────────────────────────────────────────────

function makeLocalDefaultEntry(): HostEntry {
	return {
		id: 'local',
		type: 'local' as HostType,
		label: 'Local',
		connection: { type: 'local' },
		default: true,
		createdAt: new Date().toISOString(),
	};
}

function makeEmptyHostsFile(localEntry: HostEntry): HostsFile {
	return {
		version: 1,
		activeHostId: localEntry.id,
		hosts: [localEntry],
	};
}

// ─────────────────────────────────────────────
// HostRegistry
// ─────────────────────────────────────────────

/** SecretStorage key prefix for connection configs. */
const CONN_SECRET_PREFIX = 'occ.host.conn.';

/** Returns true if a connection object has sensitive fields beyond just `type`. */
function hasConnectionDetails(conn: HostConnectionConfig): boolean {
	return Object.keys(conn).some(k => k !== 'type');
}

/** Returns a stub with only the `type` field, safe for plaintext storage. */
function stubConnection(conn: HostConnectionConfig): HostConnectionConfig {
	return { type: conn.type } as HostConnectionConfig;
}

export class HostRegistry implements vscode.Disposable {
	private _hostsFile: HostsFile | undefined;
	private _watcher: fs.FSWatcher | undefined;
	private _disposables: vscode.Disposable[] = [];

	private readonly _onDidChange = new vscode.EventEmitter<void>();
	readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

	constructor(private readonly _secrets: vscode.SecretStorage) {}

	// ── Init ──────────────────────────────────

	async init(): Promise<void> {
		await this._ensureOccDir();
		await this._loadOrSeed();
		await this._migrateConnectionsToSecrets();
		this._startWatching();
	}

	private async _ensureOccDir(): Promise<void> {
		const dir = getOccDir();
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		const hostsDir = path.join(dir, 'hosts');
		if (!fs.existsSync(hostsDir)) {
			fs.mkdirSync(hostsDir, { recursive: true });
		}
	}

	private async _loadOrSeed(): Promise<void> {
		const filePath = getHostsFilePath();
		if (!fs.existsSync(filePath)) {
			const seed = makeEmptyHostsFile(makeLocalDefaultEntry());
			this._hostsFile = seed;
			this._persist();
		} else {
			this._hostsFile = this._readFromDisk();
			// Ensure local default is always present
			if (!this._hostsFile.hosts.find(h => h.id === 'local')) {
				this._hostsFile.hosts.unshift(makeLocalDefaultEntry());
				if (!this._hostsFile.activeHostId) {
					this._hostsFile.activeHostId = 'local';
				}
				this._persist();
			}
		}
	}

	private _readFromDisk(): HostsFile {
		try {
			const raw = fs.readFileSync(getHostsFilePath(), 'utf-8');
			return JSON.parse(raw) as HostsFile;
		} catch {
			return makeEmptyHostsFile(makeLocalDefaultEntry());
		}
	}

	private _persist(): void {
		try {
			fs.writeFileSync(
				getHostsFilePath(),
				JSON.stringify(this._hostsFile, null, 2),
				{ encoding: 'utf-8', mode: 0o600 },
			);
		} catch (err) {
			console.error('[HostRegistry] Failed to persist hosts.json:', err);
		}
	}

	private _startWatching(): void {
		const filePath = getHostsFilePath();
		try {
			this._watcher = fs.watch(filePath, (_event) => {
				const fresh = this._readFromDisk();
				this._hostsFile = fresh;
				this._onDidChange.fire();
			});
		} catch {
			// File watcher is best-effort
		}
	}

	// ── Migration: move plaintext connections → SecretStorage ──

	private async _migrateConnectionsToSecrets(): Promise<void> {
		if (!this._hostsFile) { return; }
		let migrated = false;
		for (const host of this._hostsFile.hosts) {
			if (hasConnectionDetails(host.connection)) {
				await this._secrets.store(
					CONN_SECRET_PREFIX + host.id,
					JSON.stringify(host.connection),
				);
				host.connection = stubConnection(host.connection);
				migrated = true;
			}
		}
		if (migrated) {
			this._persist();
		}
	}

	// ── Connection secrets ────────────────────

	/** Retrieve the full connection config from SecretStorage. */
	async getHostConnection(id: string): Promise<HostConnectionConfig | undefined> {
		const raw = await this._secrets.get(CONN_SECRET_PREFIX + id);
		if (raw) {
			try { return JSON.parse(raw) as HostConnectionConfig; } catch { /* fall through */ }
		}
		// Fallback: return whatever is in the hosts file (e.g. local type stub)
		return this._hostsFile?.hosts.find(h => h.id === id)?.connection;
	}

	/** Store a connection config in SecretStorage. */
	private async _storeConnectionSecret(id: string, conn: HostConnectionConfig): Promise<void> {
		await this._secrets.store(CONN_SECRET_PREFIX + id, JSON.stringify(conn));
	}

	/** Remove a connection config from SecretStorage. */
	private async _deleteConnectionSecret(id: string): Promise<void> {
		await this._secrets.delete(CONN_SECRET_PREFIX + id);
	}

	// ── Read ──────────────────────────────────

	getAllHosts(): HostEntry[] {
		return this._hostsFile?.hosts ?? [];
	}

	getHost(id: string): HostEntry | undefined {
		return this._hostsFile?.hosts.find(h => h.id === id);
	}

	getActiveHostId(): string {
		return this._hostsFile?.activeHostId ?? 'local';
	}

	// ── Write ─────────────────────────────────

	async addHost(entry: HostEntry): Promise<void> {
		if (!this._hostsFile) { return; }
		// Store full connection config in SecretStorage
		await this._storeConnectionSecret(entry.id, entry.connection);
		// Write only the type stub to hosts.json
		const safeEntry: HostEntry = { ...entry, connection: stubConnection(entry.connection) };
		this._hostsFile.hosts = this._hostsFile.hosts.filter(h => h.id !== safeEntry.id);
		this._hostsFile.hosts.push(safeEntry);
		this._persist();
		this._onDidChange.fire();
	}

	updateHost(id: string, patch: Partial<HostEntry>): void {
		if (!this._hostsFile) { return; }
		const idx = this._hostsFile.hosts.findIndex(h => h.id === id);
		if (idx === -1) { return; }
		this._hostsFile.hosts[idx] = { ...this._hostsFile.hosts[idx], ...patch };
		this._persist();
		this._onDidChange.fire();
	}

	async removeHost(id: string): Promise<void> {
		if (!this._hostsFile || id === 'local') { return; } // local is permanent
		this._hostsFile.hosts = this._hostsFile.hosts.filter(h => h.id !== id);
		if (this._hostsFile.activeHostId === id) {
			this._hostsFile.activeHostId = 'local';
		}
		await this._deleteConnectionSecret(id);
		this._persist();
		this._onDidChange.fire();
	}

	setActiveHostId(id: string): void {
		if (!this._hostsFile) { return; }
		if (!this._hostsFile.hosts.find(h => h.id === id)) { return; }
		this._hostsFile.activeHostId = id;
		this._persist();
		this._onDidChange.fire();
	}

	setHostStatus(id: string, status: HostStatus, error?: string): void {
		this.updateHost(id, {
			lastStatus: status,
			lastError: error,
		});
	}

	touchLastConnected(id: string): void {
		this.updateHost(id, { lastConnectedAt: new Date().toISOString() });
	}

	// ── Host cache dir ────────────────────────

	ensureHostCacheDir(hostId: string): void {
		const dir = getHostCacheDir(hostId);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
	}

	// ── Dispose ───────────────────────────────

	dispose(): void {
		this._watcher?.close();
		this._onDidChange.dispose();
		this._disposables.forEach(d => d.dispose());
	}
}
