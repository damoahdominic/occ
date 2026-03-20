import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { HostEntry, HostsFile, HostType, HostStatus } from './types';

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

export class HostRegistry implements vscode.Disposable {
	private _hostsFile: HostsFile | undefined;
	private _watcher: fs.FSWatcher | undefined;
	private _disposables: vscode.Disposable[] = [];

	private readonly _onDidChange = new vscode.EventEmitter<void>();
	readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

	// ── Init ──────────────────────────────────

	async init(): Promise<void> {
		await this._ensureOccDir();
		await this._loadOrSeed();
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
				'utf-8',
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

	addHost(entry: HostEntry): void {
		if (!this._hostsFile) { return; }
		// Remove any existing entry with same id
		this._hostsFile.hosts = this._hostsFile.hosts.filter(h => h.id !== entry.id);
		this._hostsFile.hosts.push(entry);
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

	removeHost(id: string): void {
		if (!this._hostsFile || id === 'local') { return; } // local is permanent
		this._hostsFile.hosts = this._hostsFile.hosts.filter(h => h.id !== id);
		if (this._hostsFile.activeHostId === id) {
			this._hostsFile.activeHostId = 'local';
		}
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
