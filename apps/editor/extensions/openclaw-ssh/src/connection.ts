import * as cp from 'child_process';
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
	SSHConnection,
} from '../../openclaw/src/hosts/types';

export class SSHHostConnection implements HostConnection {
	readonly type: HostType = 'ssh';

	get id(): string { return `ssh:${this._cfg.user}@${this._cfg.host}`; }
	get label(): string { return `${this._cfg.user}@${this._cfg.host}`; }

	constructor(private readonly _cfg: SSHConnection) {}

	dispose(): void {}

	// ── SSH helpers ───────────────────────────

	private _sshBaseArgs(): string[] {
		const args = [
			'-o', 'BatchMode=yes',
			'-o', 'ConnectTimeout=15',
			'-o', 'StrictHostKeyChecking=accept-new',
		];
		if (this._cfg.port && this._cfg.port !== 22) { args.push('-p', String(this._cfg.port)); }
		if (this._cfg.keyPath) { args.push('-i', this._cfg.keyPath); }
		if (this._cfg.jumpHost) { args.push('-J', this._cfg.jumpHost); }
		return args;
	}

	private _remote(): string {
		return `${this._cfg.user}@${this._cfg.host}`;
	}

	private _remoteHome(): string {
		return this._cfg.user === 'root' ? '/root' : `/home/${this._cfg.user}`;
	}

	// ── Process execution ─────────────────────

	exec(cmd: string, args: string[], opts: ExecOpts = {}): Promise<ExecResult> {
		const remoteCmd = [cmd, ...args]
			.map(a => `'${a.replace(/'/g, "'\\''")}'`)
			.join(' ');
		return new Promise((resolve, reject) => {
			const proc = cp.spawn('ssh', [...this._sshBaseArgs(), this._remote(), remoteCmd], {
				env: { ...process.env, ...opts.env },
				timeout: opts.timeout,
				windowsHide: opts.windowsHide ?? true,
			});
			if (opts.stdinData !== undefined) { proc.stdin.write(opts.stdinData); proc.stdin.end(); }
			let stdout = '';
			let stderr = '';
			proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
			proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
			proc.on('error', reject);
			proc.on('close', code => resolve({ stdout, stderr, code: code ?? -1 }));
		});
	}

	execStream(cmd: string, args: string[], opts: ExecOpts, onData: LogFn, onError: LogFn): Promise<number> {
		const remoteCmd = [cmd, ...args]
			.map(a => `'${a.replace(/'/g, "'\\''")}'`)
			.join(' ');
		return new Promise((resolve, reject) => {
			const proc = cp.spawn('ssh', [...this._sshBaseArgs(), this._remote(), remoteCmd], {
				env: { ...process.env, ...opts.env },
				timeout: opts.timeout,
				windowsHide: opts.windowsHide ?? true,
			});
			if (opts.stdinData !== undefined) { proc.stdin.write(opts.stdinData); proc.stdin.end(); }
			proc.stdout.on('data', (d: Buffer) => { onData(d.toString()); });
			proc.stderr.on('data', (d: Buffer) => { onError(d.toString()); });
			proc.on('error', reject);
			proc.on('close', code => resolve(code ?? -1));
		});
	}

	// ── Filesystem ────────────────────────────

	async readFile(filePath: string): Promise<string> {
		const r = await this.exec('cat', [filePath]);
		if (r.code !== 0) { throw new Error(`cat ${filePath} failed: ${r.stderr}`); }
		return r.stdout;
	}

	async writeFile(filePath: string, content: string): Promise<void> {
		if (/\0/.test(filePath)) { throw new Error('Invalid file path: null byte'); }
		if (!/^[/~]/.test(filePath)) { throw new Error('Invalid file path: must be absolute or home-relative'); }
		const dir = path.posix.dirname(filePath);
		await this.exec('mkdir', ['-p', dir]);
		await new Promise<void>((resolve, reject) => {
			const quotedPath = filePath.replace(/'/g, "'\\''");
			const proc = cp.spawn('ssh', [...this._sshBaseArgs(), this._remote(), `cat > '${quotedPath}'`], { windowsHide: true });
			proc.stdin.write(content);
			proc.stdin.end();
			proc.on('error', reject);
			proc.on('close', code => code === 0 ? resolve() : reject(new Error(`writeFile failed: code ${code}`)));
		});
	}

	async exists(filePath: string): Promise<boolean> {
		const r = await this.exec('test', ['-e', filePath]);
		return r.code === 0;
	}

	async mkdir(dirPath: string): Promise<void> {
		await this.exec('mkdir', ['-p', dirPath]);
	}

	async stat(filePath: string): Promise<{ size: number; isDirectory: boolean } | null> {
		const r = await this.exec('stat', ['-c', '%s %F', filePath]);
		if (r.code !== 0) { return null; }
		const parts = r.stdout.trim().split(' ');
		return {
			size: parseInt(parts[0] ?? '0', 10),
			isDirectory: (parts[1] ?? '').includes('directory'),
		};
	}

	// ── CLI ───────────────────────────────────

	async findOpenClawPath(): Promise<string | undefined> {
		const r = await this.exec('which', ['openclaw']);
		if (r.code === 0) {
			const p = r.stdout.trim().split('\n')[0];
			if (p) { return p; }
		}
		for (const p of [
			'/usr/local/bin/openclaw',
			'/usr/bin/openclaw',
			`${this._remoteHome()}/.local/bin/openclaw`,
		]) {
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
			const r = await this.exec(p, ['--version'], { timeout: 8000 });
			const out = (r.stdout + r.stderr).trim();
			const m = out.match(/[\d]+\.[\d]+\.[\d]+/);
			return m ? m[0] : out || null;
		} catch { return null; }
	}

	async testOpenClawCli(): Promise<CliCheckResult> {
		const p = await this.findOpenClawPath();
		const command = p ? `ssh ${this._remote()} ${p} --version` : `ssh ${this._remote()} openclaw --version`;
		if (!p) { return { ok: false, command, error: 'OpenClaw CLI not found on remote host' }; }
		try {
			const r = await this.exec(p, ['--version'], { timeout: 8000 });
			const out = (r.stdout + r.stderr).trim();
			return r.code === 0
				? { ok: true, command, output: out }
				: { ok: false, command, error: `Exit ${r.code}: ${out}` };
		} catch (err) { return { ok: false, command, error: String(err) }; }
	}

	async installCli(onLog: LogFn): Promise<void> {
		onLog('Installing OpenClaw on remote host...\n');
		const code = await this.execStream(
			'bash', ['-c', 'curl -fsSL https://get.openclaw.sh | bash'],
			{ timeout: 120_000 }, onLog, onLog,
		);
		if (code !== 0) { throw new Error(`Installer exited with code ${code}`); }
		onLog('OpenClaw installed.\n');
	}

	// ── OpenClaw config ───────────────────────

	async getConfigPath(): Promise<string> {
		return `${this._remoteHome()}/.openclaw/openclaw.json`;
	}

	async readConfig(): Promise<OpenClawConfig> {
		const p = await this.getConfigPath();
		if (!(await this.exists(p))) { return {}; }
		try { return JSON.parse(await this.readFile(p)) as OpenClawConfig; } catch { return {}; }
	}

	async writeConfig(patch: Partial<OpenClawConfig>): Promise<void> {
		const p = await this.getConfigPath();
		let existing: OpenClawConfig = {};
		if (await this.exists(p)) {
			try { existing = JSON.parse(await this.readFile(p)) as OpenClawConfig; } catch { /* ok */ }
		}
		await this.writeFile(p, JSON.stringify({ ...existing, ...patch }, null, 2));
	}

	// ── Gateway ───────────────────────────────

	async gatewayHealthCheck(): Promise<GatewayStatus> {
		const cliPath = await this.findOpenClawPath();
		if (!cliPath) { return { state: 'unknown' as GatewayRunState, error: 'CLI not installed' }; }
		try {
			const r = await this.exec(cliPath, ['gateway', 'status', '--json'], { timeout: 8000 });
			if (r.code === 0) {
				try {
					const parsed = JSON.parse(r.stdout) as Partial<GatewayStatus>;
					return {
						state: parsed.state ?? 'unknown',
						port: parsed.port ?? this._cfg.gatewayPort,
						version: parsed.version,
						uptime: parsed.uptime,
					};
				} catch {
					const out = (r.stdout + r.stderr).toLowerCase();
					return { state: out.includes('running') ? 'running' : 'stopped', port: this._cfg.gatewayPort };
				}
			}
			return { state: 'stopped' as GatewayRunState };
		} catch { return { state: 'error' as GatewayRunState, error: 'Health check failed' }; }
	}

	async gatewayStart(onLog: LogFn): Promise<void> {
		const p = await this.findOpenClawPath();
		if (!p) { throw new Error('OpenClaw CLI not installed'); }
		const code = await this.execStream(p, ['gateway', 'start'], {}, onLog, onLog);
		if (code !== 0) { throw new Error(`gateway start exited with code ${code}`); }
	}

	async gatewayStop(onLog: LogFn): Promise<void> {
		const p = await this.findOpenClawPath();
		if (!p) { throw new Error('OpenClaw CLI not installed'); }
		const code = await this.execStream(p, ['gateway', 'stop'], {}, onLog, onLog);
		if (code !== 0) { throw new Error(`gateway stop exited with code ${code}`); }
	}

	async gatewayRestart(onLog: LogFn): Promise<void> {
		const p = await this.findOpenClawPath();
		if (!p) { throw new Error('OpenClaw CLI not installed'); }
		const code = await this.execStream(p, ['gateway', 'restart'], {}, onLog, onLog);
		if (code !== 0) { throw new Error(`gateway restart exited with code ${code}`); }
	}

	async gatewayReboot(onLog: LogFn): Promise<void> {
		const p = await this.findOpenClawPath();
		if (p) {
			try {
				const code = await this.execStream(p, ['gateway', 'reboot'], {}, onLog, onLog);
				if (code === 0) return;
			} catch { /* fall through to OS-level reboot */ }
		}
		onLog('openclaw gateway reboot unavailable — falling back to OS reboot');
		const code = await this.execStream('sudo', ['reboot'], {}, onLog, onLog);
		if (code !== 0) { throw new Error(`OS reboot command exited with code ${code}`); }
	}

	async runSetup(params: SetupParams, onLog: LogFn): Promise<void> {
		const p = await this.findOpenClawPath();
		if (!p) { throw new Error('OpenClaw CLI not installed — call installCli first'); }
		const code = await this.execStream(
			p,
			['onboard', '--provider', params.provider, '--api-key', params.apiKey, '--port', params.port],
			{}, onLog, onLog,
		);
		if (code !== 0) { throw new Error(`onboard exited with code ${code}`); }
	}

	// ── Environment ───────────────────────────

	buildExecEnv(): Record<string, string | undefined> {
		return { ...process.env };
	}
}
