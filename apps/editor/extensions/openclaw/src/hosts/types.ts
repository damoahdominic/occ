import * as vscode from 'vscode';

// ─────────────────────────────────────────────
// Primitive helpers
// ─────────────────────────────────────────────

export type LogFn = (line: string) => void;

export interface ExecOpts {
	cwd?: string;
	env?: Record<string, string | undefined>;
	timeout?: number;
	/** Bytes to pipe to stdin before closing it */
	stdinData?: string;
	windowsHide?: boolean;
	/** Run via OS shell (required for .cmd/.bat shims on Windows) */
	shell?: boolean;
}

export interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
}

export interface CliCheckResult {
	ok: boolean;
	output?: string;
	error?: string;
	command: string;
}

// ─────────────────────────────────────────────
// Gateway
// ─────────────────────────────────────────────

export type GatewayRunState = 'running' | 'stopped' | 'starting' | 'error' | 'unknown';

export interface GatewayStatus {
	state: GatewayRunState;
	port?: number;
	version?: string;
	uptime?: string;
	error?: string;
}

// ─────────────────────────────────────────────
// OpenClaw config (openclaw.json)
// ─────────────────────────────────────────────

export interface OpenClawConfig {
	gateway?: { port?: number; [key: string]: unknown };
	[key: string]: unknown;
}

// ─────────────────────────────────────────────
// Setup params (what home.ts passes to runSetup)
// ─────────────────────────────────────────────

export interface SetupParams {
	provider: string;
	apiKey: string;
	port: string;
}

// ─────────────────────────────────────────────
// Add-Host wizard config fields
// ─────────────────────────────────────────────

export interface ConfigField {
	id: string;
	label: string;
	type: 'text' | 'password' | 'number' | 'select' | 'checkbox';
	placeholder?: string;
	required?: boolean;
	options?: { label: string; value: string }[];
	defaultValue?: string | number | boolean;
}

export interface ConfigValidationResult {
	valid: boolean;
	errors?: { fieldId: string; message: string }[];
}

export interface TestResult {
	success: boolean;
	message: string;
	details?: {
		openclawInstalled?: boolean;
		openclawVersion?: string;
		gatewayRunning?: boolean;
		os?: string;
		hostname?: string;
	};
}

// ─────────────────────────────────────────────
// Discovery
// ─────────────────────────────────────────────

export interface DiscoveredHost {
	suggestedId: string;
	suggestedLabel: string;
	connection: HostConnectionConfig;
	metadata?: Record<string, string>;
}

// ─────────────────────────────────────────────
// Connection configs (stored in hosts.json)
// ─────────────────────────────────────────────

export interface LocalConnection {
	type: 'local';
}

export interface DockerConnection {
	type: 'docker';
	containerId?: string;
	containerLabel?: string;
	composeService?: string;
	composeFile?: string;
	dockerHost?: string;
	shell?: string;
	portMappings?: { gateway?: number };
	/** Host-side directory mounted as /home/node/.openclaw inside the container (e.g. ~/Desktop/occ-state-dir). */
	localMountPath?: string;
}

export interface SSHConnection {
	type: 'ssh';
	host: string;
	port?: number;
	user: string;
	authMethod: 'key' | 'agent' | 'password';
	keyPath?: string;
	passphrase?: boolean;
	jumpHost?: string;
	gatewayPort?: number;
	sshConfigHost?: string;
}

export interface CloudConnection {
	type: 'cloud';
	provider: 'moltpod';
	podId: string;
	apiEndpoint?: string;
}

export type HostConnectionConfig =
	| LocalConnection
	| DockerConnection
	| SSHConnection
	| CloudConnection;

// ─────────────────────────────────────────────
// Host entry (one row in hosts.json)
// ─────────────────────────────────────────────

export type HostType = 'local' | 'docker' | 'ssh' | 'cloud';
export type HostStatus = 'online' | 'offline' | 'error' | 'unknown';

export interface HostEntry {
	id: string;
	type: HostType;
	label: string;
	connection: HostConnectionConfig;
	configPath?: string;
	default?: boolean;
	color?: string;
	tags?: string[];
	createdAt: string;
	lastConnectedAt?: string;
	lastStatus?: HostStatus;
	lastError?: string;
}

// ─────────────────────────────────────────────
// hosts.json root schema
// ─────────────────────────────────────────────

export interface HostsFile {
	version: 1;
	activeHostId: string;
	hosts: HostEntry[];
}

// ─────────────────────────────────────────────
// Per-host cache (~/.occ/hosts/{id}/cache.json)
// ─────────────────────────────────────────────

export interface HostCache {
	lastCheckedAt: string;
	gateway: {
		running: boolean;
		version?: string;
		uptime?: string;
		port?: number;
	};
	agents: {
		count: number;
		names: string[];
		defaultAgent?: string;
	};
	channels: {
		count: number;
		connected: string[];
	};
	system: {
		os?: string;
		hostname?: string;
		openclawVersion?: string;
		nodeVersion?: string;
	};
}

// ─────────────────────────────────────────────
// HostConnection — what every adapter implements
// ─────────────────────────────────────────────

export interface HostConnection extends vscode.Disposable {
	readonly id: string;
	readonly type: HostType;
	readonly label: string;

	// ── CLI ──
	isCliInstalled(): Promise<boolean>;
	getCliVersion(): Promise<string | null>;
	installCli(onLog: LogFn): Promise<void>;
	findOpenClawPath(): Promise<string | undefined>;
	testOpenClawCli(): Promise<CliCheckResult>;

	// ── Process execution ──
	exec(cmd: string, args: string[], opts?: ExecOpts): Promise<ExecResult>;
	execStream(
		cmd: string,
		args: string[],
		opts: ExecOpts,
		onData: LogFn,
		onError: LogFn,
	): Promise<number>;

	// ── Filesystem ──
	readFile(path: string): Promise<string>;
	writeFile(path: string, content: string): Promise<void>;
	exists(path: string): Promise<boolean>;
	mkdir(path: string): Promise<void>;
	stat(path: string): Promise<{ size: number; isDirectory: boolean } | null>;

	// ── OpenClaw config ──
	readConfig(): Promise<OpenClawConfig>;
	writeConfig(patch: Partial<OpenClawConfig>): Promise<void>;
	getConfigPath(): Promise<string>;

	// ── Gateway ──
	gatewayHealthCheck(): Promise<GatewayStatus>;
	gatewayStart(onLog: LogFn): Promise<void>;
	gatewayStop(onLog: LogFn): Promise<void>;
	gatewayRestart(onLog: LogFn): Promise<void>;
	gatewayReboot(onLog: LogFn): Promise<void>;

	// ── Full install+onboard ──
	runSetup(params: SetupParams, onLog: LogFn): Promise<void>;

	// ── Port override (for tunnelled connections, e.g. Docker) ──
	/** Host-side port to poll for gateway health. Overrides the port read from openclaw.json. */
	gatewayHostPort?(): number | undefined;

	// ── Local filesystem paths ──
	/**
	 * Host-side path to the OpenClaw state directory.
	 * Local: ~/.openclaw   Docker: ~/Desktop/occ-state-dir (or whatever is mounted)
	 */
	localStateDir?(): string;

	// ── Environment ──
	buildExecEnv(): Record<string, string | undefined>;
}

// ─────────────────────────────────────────────
// HostAdapter — implemented by each adapter ext
// ─────────────────────────────────────────────

export interface HostAdapter {
	readonly type: HostType;
	readonly displayName: string;
	readonly icon: vscode.ThemeIcon;

	discover(): Promise<DiscoveredHost[]>;
	connect(config: HostConnectionConfig): Promise<HostConnection>;
	testConnection(config: HostConnectionConfig): Promise<TestResult>;
	getConfigFields(): ConfigField[];
	validateConfig(config: HostConnectionConfig): ConfigValidationResult;
}

// ─────────────────────────────────────────────
// OpenClawCoreAPI — returned from activate()
// Adapter extensions grab it via getExtension().exports
// ─────────────────────────────────────────────

export interface OpenClawCoreAPI {
	readonly version: string;

	registerHostAdapter(adapter: HostAdapter, extensionId: string): vscode.Disposable;

	getActiveHost(): HostConnection | undefined;
	getHost(id: string): HostConnection | undefined;
	getAllHosts(): HostEntry[];
	setActiveHost(id: string): Promise<void>;

	readonly onDidChangeActiveHost: vscode.Event<HostConnection | undefined>;
	readonly onDidChangeHostStatus: vscode.Event<{ hostId: string; status: HostStatus }>;
	readonly onDidAddHost: vscode.Event<HostEntry>;
	readonly onDidRemoveHost: vscode.Event<string>;

	showHostPicker(): Promise<string | undefined>;
	showAddHostWizard(type?: HostType): Promise<HostEntry | undefined>;
	addHost(entry: Omit<HostEntry, 'id' | 'createdAt'>): Promise<HostEntry>;
	refreshHost(id: string): Promise<void>;
}
