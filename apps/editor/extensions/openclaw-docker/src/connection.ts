import * as vscode from 'vscode';
import * as cp from 'child_process';
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
	GatewayRunState,
	OpenClawConfig,
	SetupParams,
	DockerConnection,
} from '../../openclaw/src/hosts/types';

// ─────────────────────────────────────────────
// DockerHostConnection
// Runs all commands inside a Docker container via `docker exec`.
// ─────────────────────────────────────────────

export class DockerHostConnection implements HostConnection {
	readonly type: HostType = 'docker';

	get id(): string { return `docker:${this._containerId}`; }
	get label(): string { return this._config.containerLabel ?? this._containerId; }

	private _containerId: string;

	constructor(
		private readonly _config: DockerConnection,
		resolvedContainerId: string,
	) {
		this._containerId = resolvedContainerId;
	}

	// ── vscode.Disposable ─────────────────────

	dispose(): void {
		// No persistent resources to release
	}

	// ── docker exec helper ────────────────────

	private _dockerArgs(cmd: string, args: string[]): string[] {
		const dockerExecArgs = ['exec', this._containerId];
		if (this._config.shell) {
			return [...dockerExecArgs, this._config.shell, '-c', [cmd, ...args.map(a => `'${a.replace(/'/g, "'\\''")}'`)].join(' ')];
		}
		return [...dockerExecArgs, cmd, ...args];
	}

	private _dockerHost(): string[] {
		if (this._config.dockerHost) {
			return ['-H', this._config.dockerHost];
		}
		return [];
	}

	// ── Process execution ─────────────────────

	exec(cmd: string, args: string[], opts: ExecOpts = {}): Promise<ExecResult> {
		return new Promise((resolve, reject) => {
			const fullArgs = [...this._dockerHost(), ...this._dockerArgs(cmd, args)];
			const proc = cp.spawn('docker', fullArgs, {
				cwd: opts.cwd,
				env: { ...process.env, ...opts.env },
				timeout: opts.timeout,
				windowsHide: opts.windowsHide ?? true,
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
			proc.on('close', code => resolve({ stdout, stderr, code: code ?? -1 }));
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
			const fullArgs = [...this._dockerHost(), ...this._dockerArgs(cmd, args)];
			const proc = cp.spawn('docker', fullArgs, {
				cwd: opts.cwd,
				env: { ...process.env, ...opts.env },
				timeout: opts.timeout,
				windowsHide: opts.windowsHide ?? true,
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

	// ── Filesystem (via docker exec cat / tee / stat) ──────────────────────────

	async readFile(filePath: string): Promise<string> {
		const result = await this.exec('cat', [filePath]);
		if (result.code !== 0) {
			throw new Error(`cat ${filePath} failed: ${result.stderr}`);
		}
		return result.stdout;
	}

	async writeFile(filePath: string, content: string): Promise<void> {
		const dir = path.posix.dirname(filePath);
		await this.exec('mkdir', ['-p', dir]);
		// Pipe content via stdin to tee
		await new Promise<void>((resolve, reject) => {
			const fullArgs = [...this._dockerHost(), 'exec', '-i', this._containerId, 'tee', filePath];
			const proc = cp.spawn('docker', fullArgs, { windowsHide: true });
			proc.stdin.write(content);
			proc.stdin.end();
			proc.on('error', reject);
			proc.on('close', code => {
				if (code === 0) { resolve(); }
				else { reject(new Error(`tee ${filePath} failed with code ${code}`)); }
			});
		});
	}

	async exists(filePath: string): Promise<boolean> {
		const result = await this.exec('test', ['-e', filePath]);
		return result.code === 0;
	}

	async mkdir(dirPath: string): Promise<void> {
		await this.exec('mkdir', ['-p', dirPath]);
	}

	async stat(filePath: string): Promise<{ size: number; isDirectory: boolean } | null> {
		const result = await this.exec('stat', ['-c', '%s %F', filePath]);
		if (result.code !== 0) { return null; }
		const [sizeStr, type] = result.stdout.trim().split(' ');
		return {
			size: parseInt(sizeStr ?? '0', 10),
			isDirectory: (type ?? '').includes('directory'),
		};
	}

	// ── CLI ───────────────────────────────────

	async findOpenClawPath(): Promise<string | undefined> {
		const result = await this.exec('which', ['openclaw']);
		if (result.code === 0) {
			const p = result.stdout.trim().split('\n')[0];
			if (p) { return p; }
		}
		// Well-known paths inside the container
		for (const p of ['/usr/local/bin/openclaw', '/usr/bin/openclaw', `${os.homedir()}/.local/bin/openclaw`]) {
			if (await this.exists(p)) { return p; }
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
		const command = p ? `docker exec ${this._containerId} ${p} --version` : 'openclaw (not found)';
		if (!p) {
			return { ok: false, command, error: 'OpenClaw CLI not found inside container' };
		}
		try {
			const result = await this.exec(p, ['--version'], { timeout: 8000 });
			const out = (result.stdout + result.stderr).trim();
			if (result.code === 0) {
				return { ok: true, command, output: out };
			}
			return { ok: false, command, error: `Exit code ${result.code}: ${out}` };
		} catch (err) {
			return { ok: false, command, error: String(err) };
		}
	}

	async installCli(onLog: LogFn): Promise<void> {
		onLog('Installing OpenClaw inside container...\n');
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
		onLog('OpenClaw installed in container.\n');
	}

	// ── OpenClaw config ───────────────────────

	async getConfigPath(): Promise<string> {
		return '/home/node/.openclaw/openclaw.json'; // official image runs as user 'node' (uid 1000)
	}

	gatewayHostPort(): number | undefined {
		return this._config.portMappings?.gateway;
	}

	localStateDir(): string {
		return this._config.localMountPath ?? path.join(os.homedir(), 'Desktop', 'occ-state-dir');
	}

	async readConfig(): Promise<OpenClawConfig> {
		const cfgPath = await this.getConfigPath();
		if (!(await this.exists(cfgPath))) { return {}; }
		try {
			const raw = await this.readFile(cfgPath);
			return JSON.parse(raw) as OpenClawConfig;
		} catch {
			return {};
		}
	}

	async writeConfig(patch: Partial<OpenClawConfig>): Promise<void> {
		const cfgPath = await this.getConfigPath();
		let existing: OpenClawConfig = {};
		if (await this.exists(cfgPath)) {
			try { existing = JSON.parse(await this.readFile(cfgPath)) as OpenClawConfig; } catch { /* ok */ }
		}
		const merged = { ...existing, ...patch };
		await this.writeFile(cfgPath, JSON.stringify(merged, null, 2));
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
						port: parsed.port ?? this._config.portMappings?.gateway,
						version: parsed.version,
						uptime: parsed.uptime,
					};
				} catch {
					const out = (result.stdout + result.stderr).toLowerCase();
					const running = out.includes('running') || out.includes('started');
					return { state: running ? 'running' : 'stopped', port: this._config.portMappings?.gateway };
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
