import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
	HostConnection,
	HostType,
	ExecOpts,
	ExecResult,
	LogFn,
	CliCheckResult,
	GatewayStatus,
	GatewayRunState,
	OpenClawConfig,
	SetupParams,
} from '../../openclaw/src/hosts/types';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function platformOpenClawPaths(): string[] {
	switch (process.platform) {
		case 'win32':
			return [
				path.join(process.env['LOCALAPPDATA'] ?? 'C:\\Users\\Default\\AppData\\Local', 'Programs', 'openclaw', 'openclaw.exe'),
				path.join(process.env['PROGRAMFILES'] ?? 'C:\\Program Files', 'openclaw', 'openclaw.exe'),
				'C:\\openclaw\\openclaw.exe',
			];
		case 'darwin':
			return [
				'/usr/local/bin/openclaw',
				'/opt/homebrew/bin/openclaw',
				path.join(os.homedir(), '.local', 'bin', 'openclaw'),
				'/usr/bin/openclaw',
			];
		default: // linux
			return [
				'/usr/local/bin/openclaw',
				path.join(os.homedir(), '.local', 'bin', 'openclaw'),
				'/usr/bin/openclaw',
				'/snap/bin/openclaw',
			];
	}
}

function openClawConfigDir(): string {
	return path.join(os.homedir(), '.openclaw');
}

function openClawConfigFile(): string {
	return path.join(openClawConfigDir(), 'openclaw.json');
}

// ─────────────────────────────────────────────
// LocalHostConnection
// ─────────────────────────────────────────────

export class LocalHostConnection implements HostConnection {
	readonly id = 'local';
	readonly type: HostType = 'local';
	readonly label = 'Local';

	private _disposed = false;

	// ── vscode.Disposable ─────────────────────

	dispose(): void {
		this._disposed = true;
	}

	// ── Process execution ─────────────────────

	exec(cmd: string, args: string[], opts: ExecOpts = {}): Promise<ExecResult> {
		return new Promise((resolve, reject) => {
			const proc = cp.spawn(cmd, args, {
				cwd: opts.cwd,
				env: { ...process.env, ...opts.env },
				timeout: opts.timeout,
				windowsHide: opts.windowsHide ?? true,
				shell: opts.shell,
			});

			if (opts.stdinData !== undefined) {
				proc.stdin.write(opts.stdinData);
				proc.stdin.end();
			}

			let stdout = '';
			let stderr = '';
			proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
			proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

			proc.on('error', reject);
			proc.on('close', code => {
				resolve({ stdout, stderr, code: code ?? -1 });
			});
		});
	}

	execStream(
		cmd: string,
		args: string[],
		opts: ExecOpts,
		onData: LogFn,
		onError: LogFn,
	): Promise<number> {
		return new Promise((resolve, reject) => {
			const proc = cp.spawn(cmd, args, {
				cwd: opts.cwd,
				env: { ...process.env, ...opts.env },
				timeout: opts.timeout,
				windowsHide: opts.windowsHide ?? true,
				shell: opts.shell,
			});

			if (opts.stdinData !== undefined) {
				proc.stdin.write(opts.stdinData);
				proc.stdin.end();
			}

			proc.stdout.on('data', (d: Buffer) => { onData(d.toString()); });
			proc.stderr.on('data', (d: Buffer) => { onError(d.toString()); });
			proc.on('error', reject);
			proc.on('close', code => resolve(code ?? -1));
		});
	}

	// ── Filesystem ────────────────────────────

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

	// ── CLI ───────────────────────────────────

	async findOpenClawPath(): Promise<string | undefined> {
		// 1. User-configured path
		const configuredPath = vscode.workspace.getConfiguration('openclaw').get<string>('cliPath');
		if (configuredPath && fs.existsSync(configuredPath)) {
			return configuredPath;
		}

		// 2. $PATH via `which` / `where`
		try {
			const whichCmd = process.platform === 'win32' ? 'where' : 'which';
			const result = await this.exec(whichCmd, ['openclaw'], { timeout: 5000 });
			const found = result.stdout.trim().split('\n')[0];
			if (found && fs.existsSync(found)) { return found; }
		} catch { /* ignore */ }

		// 3. Well-known platform paths
		for (const p of platformOpenClawPaths()) {
			if (fs.existsSync(p)) { return p; }
		}

		return undefined;
	}

	async isCliInstalled(): Promise<boolean> {
		const p = await this.findOpenClawPath();
		return p !== undefined;
	}

	async getCliVersion(): Promise<string | null> {
		const p = await this.findOpenClawPath();
		if (!p) { return null; }
		try {
			const result = await this.exec(p, ['--version'], { timeout: 8000 });
			const out = (result.stdout + result.stderr).trim();
			const match = out.match(/[\d]+\.[\d]+\.[\d]+/);
			return match ? match[0] : out || null;
		} catch {
			return null;
		}
	}

	async testOpenClawCli(): Promise<CliCheckResult> {
		const p = await this.findOpenClawPath();
		const command = p ?? 'openclaw';
		if (!p) {
			return { ok: false, command, error: 'OpenClaw CLI not found' };
		}
		try {
			const result = await this.exec(p, ['--version'], { timeout: 8000 });
			const out = (result.stdout + result.stderr).trim();
			if (result.code === 0) {
				return { ok: true, command, output: out };
			} else {
				return { ok: false, command, error: `Exit code ${result.code}: ${out}` };
			}
		} catch (err) {
			return { ok: false, command, error: String(err) };
		}
	}

	async installCli(onLog: LogFn): Promise<void> {
		// Platform-specific install script
		switch (process.platform) {
			case 'darwin':
			case 'linux':
				await this._installUnix(onLog);
				break;
			case 'win32':
				await this._installWindows(onLog);
				break;
			default:
				throw new Error(`Unsupported platform: ${process.platform}`);
		}
	}

	private async _installUnix(onLog: LogFn): Promise<void> {
		onLog('Downloading OpenClaw installer...\n');
		// Use curl to pipe the official install script
		const code = await this.execStream(
			'bash',
			['-c', 'curl -fsSL https://get.openclaw.sh | bash'],
			{ timeout: 120_000 },
			onLog,
			onLog,
		);
		if (code !== 0) {
			throw new Error(`Installer exited with code ${code}`);
		}
		onLog('OpenClaw installed.\n');
	}

	private async _installWindows(onLog: LogFn): Promise<void> {
		onLog('Downloading OpenClaw installer for Windows...\n');
		const code = await this.execStream(
			'powershell',
			['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
			 'irm https://get.openclaw.sh/win | iex'],
			{ timeout: 120_000, windowsHide: true },
			onLog,
			onLog,
		);
		if (code !== 0) {
			throw new Error(`Installer exited with code ${code}`);
		}
		onLog('OpenClaw installed.\n');
	}

	// ── OpenClaw config ───────────────────────

	async getConfigPath(): Promise<string> {
		return openClawConfigFile();
	}

	async readConfig(): Promise<OpenClawConfig> {
		const cfgPath = openClawConfigFile();
		if (!fs.existsSync(cfgPath)) { return {}; }
		try {
			return JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as OpenClawConfig;
		} catch {
			return {};
		}
	}

	async writeConfig(patch: Partial<OpenClawConfig>): Promise<void> {
		const cfgPath = openClawConfigFile();
		fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
		let existing: OpenClawConfig = {};
		if (fs.existsSync(cfgPath)) {
			try { existing = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as OpenClawConfig; } catch { /* ok */ }
		}
		const merged = { ...existing, ...patch };
		fs.writeFileSync(cfgPath, JSON.stringify(merged, null, 2), 'utf-8');
	}

	// ── Gateway ───────────────────────────────

	async gatewayHealthCheck(): Promise<GatewayStatus> {
		const cliPath = await this.findOpenClawPath();
		if (!cliPath) {
			return { state: 'unknown' as GatewayRunState, error: 'CLI not installed' };
		}

		try {
			const result = await this.exec(cliPath, ['gateway', 'status', '--json'], { timeout: 8000 });
			if (result.code === 0) {
				try {
					const parsed = JSON.parse(result.stdout) as Partial<GatewayStatus>;
					return {
						state: parsed.state ?? 'unknown',
						port: parsed.port,
						version: parsed.version,
						uptime: parsed.uptime,
					};
				} catch {
					// If not JSON, treat non-zero stderr as error
					const out = (result.stdout + result.stderr).toLowerCase();
					const running = out.includes('running') || out.includes('started');
					return { state: running ? 'running' : 'stopped' };
				}
			}
			return { state: 'stopped' as GatewayRunState };
		} catch {
			return { state: 'error' as GatewayRunState, error: 'Health check failed' };
		}
	}

	async gatewayStart(onLog: LogFn): Promise<void> {
		const cliPath = await this.findOpenClawPath();
		if (!cliPath) { throw new Error('OpenClaw CLI not installed'); }
		const code = await this.execStream(cliPath, ['gateway', 'start'], {}, onLog, onLog);
		if (code !== 0) { throw new Error(`gateway start exited with code ${code}`); }
	}

	async gatewayStop(onLog: LogFn): Promise<void> {
		const cliPath = await this.findOpenClawPath();
		if (!cliPath) { throw new Error('OpenClaw CLI not installed'); }
		const code = await this.execStream(cliPath, ['gateway', 'stop'], {}, onLog, onLog);
		if (code !== 0) { throw new Error(`gateway stop exited with code ${code}`); }
	}

	async gatewayRestart(onLog: LogFn): Promise<void> {
		const cliPath = await this.findOpenClawPath();
		if (!cliPath) { throw new Error('OpenClaw CLI not installed'); }
		const code = await this.execStream(cliPath, ['gateway', 'restart'], {}, onLog, onLog);
		if (code !== 0) { throw new Error(`gateway restart exited with code ${code}`); }
	}

	// ── Full install + onboard ────────────────

	async runSetup(params: SetupParams, onLog: LogFn): Promise<void> {
		const cliPath = await this.findOpenClawPath();
		if (!cliPath) { throw new Error('OpenClaw CLI not installed — call installCli first'); }

		onLog(`Setting up OpenClaw with provider=${params.provider}, port=${params.port}\n`);

		const args = ['onboard',
			'--provider', params.provider,
			'--api-key', params.apiKey,
			'--port', params.port,
		];

		const code = await this.execStream(cliPath, args, {}, onLog, onLog);
		if (code !== 0) { throw new Error(`onboard exited with code ${code}`); }
	}

	// ── Environment ───────────────────────────

	buildExecEnv(): Record<string, string | undefined> {
		return { ...process.env };
	}
}
