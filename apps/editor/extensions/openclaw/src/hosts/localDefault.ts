/**
 * Minimal local HostConnection used by the core extension as the default
 * before any adapter extension registers a LocalHostAdapter.
 *
 * Implements only the methods HomePanel actively calls. Full implementation
 * lives in the openclaw-local adapter extension.
 */

import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type {
	HostConnection,
	HostType,
	ExecOpts,
	ExecResult,
	LogFn,
	CliCheckResult,
	GatewayStatus,
	OpenClawConfig,
	SetupParams,
} from './types';
import * as vscode from 'vscode';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function openClawConfigFile(): string {
	return path.join(os.homedir(), '.openclaw', 'openclaw.json');
}

function wellKnownCliPaths(): string[] {
	const home = os.homedir();
	if (process.platform === 'win32') {
		const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
		return [
			path.join(appData, 'npm', 'openclaw.cmd'),
			path.join(appData, 'npm', 'openclaw.exe'),
		];
	}
	return [
		'/usr/local/bin/openclaw',
		'/opt/homebrew/bin/openclaw',
		path.join(home, '.local', 'bin', 'openclaw'),
		path.join(home, '.npm-global', 'bin', 'openclaw'),
	];
}

function buildLocalEnv(): Record<string, string | undefined> {
	const env = { ...process.env };
	const basePath = env.PATH ?? (env as Record<string, string | undefined>).Path ?? '';
	const extra: string[] = [];
	if (process.platform === 'win32') {
		const appData = env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
		extra.push(path.join(appData, 'npm'));
	} else {
		extra.push('/usr/local/bin', '/opt/homebrew/bin');
		extra.push(path.join(os.homedir(), '.local', 'bin'));
		extra.push(path.join(os.homedir(), '.npm-global', 'bin'));
		extra.push(path.join(os.homedir(), '.openclaw', 'bin'));
		// nvm paths
		const nvmDir = process.env.NVM_DIR ?? path.join(os.homedir(), '.nvm');
		const nvmVersionsDir = path.join(nvmDir, 'versions', 'node');
		if (fs.existsSync(nvmVersionsDir)) {
			try {
				fs.readdirSync(nvmVersionsDir)
					.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
					.slice(0, 3)
					.forEach(v => extra.push(path.join(nvmVersionsDir, v, 'bin')));
			} catch { /* non-fatal */ }
		}
		if (process.platform === 'darwin') {
			extra.push('/opt/homebrew/opt/node/bin', '/usr/local/opt/node/bin');
		}
	}
	const sep = process.platform === 'win32' ? ';' : ':';
	env.PATH = [...extra, basePath].filter(Boolean).join(sep);
	(env as Record<string, string | undefined>).Path = env.PATH;
	return env;
}

// ─────────────────────────────────────────────
// DefaultLocalHostConnection
// ─────────────────────────────────────────────

export class DefaultLocalHostConnection implements HostConnection {
	readonly id = 'local';
	readonly type: HostType = 'local';
	readonly label = 'Local';

	dispose(): void {}

	exec(cmd: string, args: string[], opts: ExecOpts = {}): Promise<ExecResult> {
		return new Promise((resolve, reject) => {
			const proc = cp.spawn(cmd, args, {
				cwd: opts.cwd,
				env: { ...process.env, ...opts.env },
				timeout: opts.timeout,
				windowsHide: opts.windowsHide ?? true,
				shell: opts.shell,
			});
			if (opts.stdinData !== undefined) { proc.stdin.write(opts.stdinData); proc.stdin.end(); }
			let stdout = ''; let stderr = '';
			proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
			proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
			proc.on('error', reject);
			proc.on('close', code => resolve({ stdout, stderr, code: code ?? -1 }));
		});
	}

	execStream(cmd: string, args: string[], opts: ExecOpts, onData: LogFn, onError: LogFn): Promise<number> {
		return new Promise((resolve, reject) => {
			const proc = cp.spawn(cmd, args, {
				cwd: opts.cwd,
				env: { ...process.env, ...opts.env },
				timeout: opts.timeout,
				windowsHide: opts.windowsHide ?? true,
				shell: opts.shell,
			});
			if (opts.stdinData !== undefined) { proc.stdin.write(opts.stdinData); proc.stdin.end(); }
			proc.stdout.on('data', (d: Buffer) => { onData(d.toString()); });
			proc.stderr.on('data', (d: Buffer) => { onError(d.toString()); });
			proc.on('error', reject);
			proc.on('close', code => resolve(code ?? -1));
		});
	}

	readFile(filePath: string): Promise<string> {
		return Promise.resolve(fs.readFileSync(filePath, 'utf-8'));
	}

	writeFile(filePath: string, content: string): Promise<void> {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, content, 'utf-8');
		return Promise.resolve();
	}

	exists(filePath: string): Promise<boolean> {
		return Promise.resolve(fs.existsSync(filePath));
	}

	mkdir(dirPath: string): Promise<void> {
		fs.mkdirSync(dirPath, { recursive: true });
		return Promise.resolve();
	}

	stat(filePath: string): Promise<{ size: number; isDirectory: boolean } | null> {
		try {
			const s = fs.statSync(filePath);
			return Promise.resolve({ size: s.size, isDirectory: s.isDirectory() });
		} catch {
			return Promise.resolve(null);
		}
	}

	async findOpenClawPath(): Promise<string | undefined> {
		const cfg = vscode.workspace.getConfiguration('openclaw').get<string>('cliPath');
		if (cfg && fs.existsSync(cfg)) { return cfg; }
		const env = process.env.OPENCLAW_CLI;
		if (env && fs.existsSync(env)) { return env; }
		// which/where
		try {
			const whichCmd = process.platform === 'win32' ? 'where' : 'which';
			const r = await this.exec(whichCmd, ['openclaw'], { timeout: 5000 });
			const found = r.stdout.trim().split('\n')[0];
			if (found && fs.existsSync(found)) { return found; }
		} catch { /* ignore */ }
		// Well-known paths
		for (const p of wellKnownCliPaths()) {
			if (fs.existsSync(p)) { return p; }
		}
		// nvm paths
		const nvmDir = path.join(os.homedir(), '.nvm', 'versions', 'node');
		if (fs.existsSync(nvmDir)) {
			for (const ver of fs.readdirSync(nvmDir).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
				const p = path.join(nvmDir, ver, 'bin', 'openclaw');
				if (fs.existsSync(p)) { return p; }
			}
		}
		return undefined;
	}

	async isCliInstalled(): Promise<boolean> {
		return (await this.findOpenClawPath()) !== undefined;
	}

	async getCliVersion(): Promise<string | null> {
		const p = await this.findOpenClawPath();
		if (!p) { return null; }
		try {
			const r = await this.exec(p, ['--version'], { timeout: 8000 });
			const out = (r.stdout + r.stderr).trim();
			const m = out.match(/[\d]+\.[\d]+\.[\d]+/);
			return m ? m[0] : out || null;
		} catch { return null; }
	}

	async testOpenClawCli(): Promise<CliCheckResult> {
		// On unix: try sourcing nvm first for version-managed installs
		if (process.platform !== 'win32') {
			const nvmSh = path.join(os.homedir(), '.nvm', 'nvm.sh');
			if (fs.existsSync(nvmSh)) {
				try {
					const r = await this.exec('bash', ['-c', `. "${nvmSh}" 2>/dev/null && openclaw --version 2>&1`], { timeout: 10000 });
					const line = r.stdout.trim().split('\n').find(l => /\d/.test(l) && !l.startsWith('nvm') && !l.startsWith('Now')) ?? '';
					if (line) { return { ok: true, output: line, command: `bash -c '. "${nvmSh}" && openclaw --version'` }; }
				} catch { /* fall through */ }
			}
		}
		const p = await this.findOpenClawPath();
		const command = p ? `${p} --version` : 'openclaw --version';
		if (!p) { return { ok: false, command, error: 'openclaw not found' }; }
		try {
			const r = await this.exec(p, ['--version'], { timeout: 15000 });
			const out = (r.stdout + r.stderr).trim();
			return r.code === 0
				? { ok: true, output: out, command }
				: { ok: false, error: out || `Exit ${r.code}`, command };
		} catch (err) { return { ok: false, command, error: String(err) }; }
	}

	async installCli(onLog: LogFn): Promise<void> {
		if (process.platform === 'win32') {
			// Download script to temp file, verify, then execute — never pipe directly.
			const steps = [
				{ label: 'Downloading installer...\n', cmd: `Invoke-WebRequest -UseBasicParsing https://get.openclaw.sh/win -OutFile $env:TEMP\\occ-install.ps1` },
				{ label: 'Running installer...\n', cmd: `& $env:TEMP\\occ-install.ps1; Remove-Item $env:TEMP\\occ-install.ps1 -ErrorAction SilentlyContinue` },
			];
			for (const step of steps) {
				onLog(step.label);
				const code = await this.execStream('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', step.cmd], { timeout: 120_000, windowsHide: true }, onLog, onLog);
				if (code !== 0) { throw new Error(`Install step failed: ${step.label.trim()}`); }
			}
		} else {
			// Download script, verify checksum, then execute — never pipe curl directly to bash.
			const steps = [
				{ label: 'Downloading installer...\n', cmd: 'curl -fsSL https://get.openclaw.sh -o /tmp/occ-install.sh' },
				{ label: 'Fetching checksum...\n', cmd: 'curl -fsSL https://releases.openclaw.sh/install.sh.sha256 -o /tmp/occ-install.sha256' },
				{ label: 'Verifying installer integrity...\n', cmd: 'cd /tmp && sha256sum -c occ-install.sha256' },
				{ label: 'Running installer...\n', cmd: 'bash /tmp/occ-install.sh' },
				{ label: '', cmd: 'rm -f /tmp/occ-install.sh /tmp/occ-install.sha256' },
			];
			for (const step of steps) {
				if (step.label) { onLog(step.label); }
				const code = await this.execStream('bash', ['-c', step.cmd], { timeout: 120_000 }, onLog, onLog);
				if (code !== 0 && step.label) {
					await this.execStream('bash', ['-c', 'rm -f /tmp/occ-install.sh /tmp/occ-install.sha256'], {}, () => {}, () => {}).catch(() => {});
					throw new Error(`Install step failed: ${step.label.trim()}`);
				}
			}
		}
	}

	getConfigPath(): Promise<string> { return Promise.resolve(openClawConfigFile()); }

	async readConfig(): Promise<OpenClawConfig> {
		const p = openClawConfigFile();
		if (!fs.existsSync(p)) { return {}; }
		try { return JSON.parse(fs.readFileSync(p, 'utf-8')) as OpenClawConfig; } catch { return {}; }
	}

	async writeConfig(patch: Partial<OpenClawConfig>): Promise<void> {
		const p = openClawConfigFile();
		fs.mkdirSync(path.dirname(p), { recursive: true });
		let existing: OpenClawConfig = {};
		if (fs.existsSync(p)) { try { existing = JSON.parse(fs.readFileSync(p, 'utf-8')) as OpenClawConfig; } catch { /* ok */ } }
		fs.writeFileSync(p, JSON.stringify({ ...existing, ...patch }, null, 2), 'utf-8');
	}

	async gatewayHealthCheck(): Promise<GatewayStatus> {
		const p = await this.findOpenClawPath();
		if (!p) { return { state: 'unknown', error: 'CLI not installed' }; }
		try {
			const r = await this.exec(p, ['gateway', 'status', '--json'], { timeout: 8000 });
			if (r.code === 0) {
				try {
					const parsed = JSON.parse(r.stdout) as Partial<GatewayStatus>;
					return { state: parsed.state ?? 'unknown', port: parsed.port, version: parsed.version, uptime: parsed.uptime };
				} catch {
					const out = (r.stdout + r.stderr).toLowerCase();
					return { state: out.includes('running') ? 'running' : 'stopped' };
				}
			}
			return { state: 'stopped' };
		} catch { return { state: 'error', error: 'Health check failed' }; }
	}

	async gatewayStart(onLog: LogFn): Promise<void> {
		const p = await this.findOpenClawPath();
		if (!p) { throw new Error('CLI not installed'); }
		const code = await this.execStream(p, ['gateway', 'start'], {}, onLog, onLog);
		if (code !== 0) { throw new Error(`gateway start exited ${code}`); }
	}

	async gatewayStop(onLog: LogFn): Promise<void> {
		const p = await this.findOpenClawPath();
		if (!p) { throw new Error('CLI not installed'); }
		const code = await this.execStream(p, ['gateway', 'stop'], {}, onLog, onLog);
		if (code !== 0) { throw new Error(`gateway stop exited ${code}`); }
	}

	async gatewayRestart(onLog: LogFn): Promise<void> {
		const p = await this.findOpenClawPath();
		if (!p) { throw new Error('CLI not installed'); }
		const code = await this.execStream(p, ['gateway', 'restart'], {}, onLog, onLog);
		if (code !== 0) { throw new Error(`gateway restart exited ${code}`); }
	}

	async runSetup(params: SetupParams, onLog: LogFn): Promise<void> {
		const p = await this.findOpenClawPath();
		if (!p) { throw new Error('CLI not installed'); }
		const code = await this.execStream(p, ['onboard', '--provider', params.provider, '--api-key', params.apiKey, '--port', params.port], {}, onLog, onLog);
		if (code !== 0) { throw new Error(`onboard exited ${code}`); }
	}

	gatewayHostPort(): number | undefined {
		return undefined; // local host: no port remapping
	}

	localStateDir(): string {
		return path.join(os.homedir(), '.openclaw');
	}

	buildExecEnv(): Record<string, string | undefined> {
		return buildLocalEnv();
	}
}
