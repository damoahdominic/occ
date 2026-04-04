import * as vscode from 'vscode';
import * as cp from 'child_process';
import type {
	HostAdapter,
	HostType,
	HostConnection,
	HostConnectionConfig,
	DockerConnection,
	TestResult,
	DiscoveredHost,
	ConfigField,
	ConfigValidationResult,
} from '../../openclaw/src/hosts/types';
import { DockerHostConnection } from './connection';
import { dockerPreflight } from './preflight';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function listRunningContainers(): Array<{ id: string; name: string; image: string }> {
	try {
		const result = cp.spawnSync(
			'docker',
			['ps', '--format', '{{.ID}}\t{{.Names}}\t{{.Image}}'],
			{ timeout: 6000, windowsHide: true },
		);
		if (result.status !== 0) { return []; }
		return result.stdout
			.toString()
			.trim()
			.split('\n')
			.filter(Boolean)
			.map(line => {
				const [id, name, image] = line.split('\t');
				return { id: id ?? '', name: name ?? '', image: image ?? '' };
			});
	} catch {
		return [];
	}
}

async function resolveContainerId(config: DockerConnection): Promise<string> {
	if (config.containerId) { return config.containerId; }

	if (config.containerLabel) {
		const result = cp.spawnSync(
			'docker',
			['ps', '--filter', `name=${config.containerLabel}`, '--format', '{{.ID}}'],
			{ timeout: 6000, windowsHide: true },
		);
		if (result.status === 0) {
			const id = result.stdout.toString().trim().split('\n')[0];
			if (id) { return id; }
		}
	}

	if (config.composeService) {
		const args = config.composeFile
			? ['-f', config.composeFile, 'ps', '-q', config.composeService]
			: ['ps', '-q', config.composeService];
		const result = cp.spawnSync('docker', ['compose', ...args], {
			timeout: 6000,
			windowsHide: true,
		});
		if (result.status === 0) {
			const id = result.stdout.toString().trim().split('\n')[0];
			if (id) { return id; }
		}
	}

	throw new Error(
		'Could not resolve Docker container ID. Specify containerId, containerLabel, or composeService.',
	);
}

// ─────────────────────────────────────────────
// DockerHostAdapter
// ─────────────────────────────────────────────

export class DockerHostAdapter implements HostAdapter {
	readonly type: HostType = 'docker';
	readonly displayName = 'Docker Container';
	readonly icon = new vscode.ThemeIcon('package');

	async discover(): Promise<DiscoveredHost[]> {
		const preflight = await dockerPreflight();
		if (!preflight.ok) { return []; }

		return listRunningContainers().map(c => ({
			suggestedId: `docker:${c.id.slice(0, 12)}`,
			suggestedLabel: c.name || c.id.slice(0, 12),
			connection: {
				type: 'docker',
				containerId: c.id,
				containerLabel: c.name,
			} as DockerConnection,
			metadata: { image: c.image },
		}));
	}

	async connect(config: HostConnectionConfig): Promise<HostConnection> {
		const dockerConfig = config as DockerConnection;

		// Run preflight before attempting connection
		const preflight = await dockerPreflight();
		if (!preflight.ok) {
			throw new Error(preflight.remedy);
		}

		const containerId = await resolveContainerId(dockerConfig);

		// Security audit: warn about dangerous container configurations
		void this._auditContainerSecurity(containerId, dockerConfig);

		return new DockerHostConnection(dockerConfig, containerId);
	}

	/**
	 * Audits a container for dangerous security configurations and warns the user.
	 * Checks: running as root, Docker socket mounted, privileged mode.
	 */
	private async _auditContainerSecurity(containerId: string, config: DockerConnection): Promise<void> {
		try {
			const hostArgs = config.dockerHost ? ['-H', config.dockerHost] : [];
			const inspect = cp.spawnSync('docker', [
				...hostArgs, 'inspect',
				'--format', '{{.Config.User}}||{{.HostConfig.Privileged}}||{{range .Mounts}}{{.Source}}:{{end}}',
				containerId,
			], { timeout: 5000, windowsHide: true });
			if (inspect.status !== 0) { return; }
			const output = inspect.stdout.toString().trim();
			const [user, privileged, mounts] = output.split('||');
			const warnings: string[] = [];

			// Check if running as root
			if (!user || user === 'root' || user === '0') {
				warnings.push('Container is running as root.');
			}
			// Check for privileged mode
			if (privileged === 'true') {
				warnings.push('Container is running in --privileged mode (near-full host access).');
			}
			// Check for Docker socket mount
			if (mounts?.includes('/var/run/docker.sock')) {
				warnings.push('Docker socket is mounted — container can control the Docker daemon.');
			}

			if (warnings.length > 0) {
				void vscode.window.showWarningMessage(
					`⚠ Container security: ${warnings.join(' ')} ` +
					`This increases the risk of container escape. Consider using a non-root user and dropping capabilities.`,
					'Dismiss',
				);
			}
		} catch { /* best-effort audit */ }
	}

	async testConnection(config: HostConnectionConfig): Promise<TestResult> {
		const dockerConfig = config as DockerConnection;

		// 1. Docker daemon preflight
		const preflight = await dockerPreflight();
		if (!preflight.ok) {
			return {
				success: false,
				message: preflight.remedy,
				details: { os: process.platform },
			};
		}

		// 2. Resolve container
		let containerId: string;
		try {
			containerId = await resolveContainerId(dockerConfig);
		} catch (err) {
			return {
				success: false,
				message: String(err),
				details: { os: process.platform },
			};
		}

		// 3. Test CLI inside container
		const conn = new DockerHostConnection(dockerConfig, containerId);
		try {
			const cliCheck = await conn.testOpenClawCli();
			const gwStatus = cliCheck.ok ? await conn.gatewayHealthCheck() : undefined;
			return {
				success: cliCheck.ok,
				message: cliCheck.ok
					? `OpenClaw CLI found in container ${containerId.slice(0, 12)} (${cliCheck.output ?? ''})`
					: `Container ${containerId.slice(0, 12)}: ${cliCheck.error ?? 'CLI not found'}`,
				details: {
					openclawInstalled: cliCheck.ok,
					openclawVersion: cliCheck.output,
					gatewayRunning: gwStatus?.state === 'running',
					os: process.platform,
					hostname: containerId.slice(0, 12),
				},
			};
		} finally {
			conn.dispose();
		}
	}

	getConfigFields(): ConfigField[] {
		return [
			{
				id: 'containerId',
				label: 'Container ID or Name',
				type: 'text',
				placeholder: 'e.g. my-openclaw or abc123def456',
				required: false,
			},
			{
				id: 'composeService',
				label: 'Docker Compose Service',
				type: 'text',
				placeholder: 'e.g. openclaw (from docker-compose.yml)',
				required: false,
			},
			{
				id: 'composeFile',
				label: 'Compose File Path',
				type: 'text',
				placeholder: 'Leave blank for default docker-compose.yml',
				required: false,
			},
			{
				id: 'dockerHost',
				label: 'Docker Host (DOCKER_HOST)',
				type: 'text',
				placeholder: 'Leave blank for local socket',
				required: false,
			},
			{
				id: 'shell',
				label: 'Shell inside container',
				type: 'text',
				placeholder: '/bin/sh (default) or /bin/bash',
				defaultValue: '/bin/sh',
				required: false,
			},
		];
	}

	validateConfig(config: HostConnectionConfig): ConfigValidationResult {
		const dockerConfig = config as DockerConnection;
		if (!dockerConfig.containerId && !dockerConfig.containerLabel && !dockerConfig.composeService) {
			return {
				valid: false,
				errors: [
					{
						fieldId: 'containerId',
						message: 'Provide at least one of: Container ID/Name or Compose Service.',
					},
				],
			};
		}
		return { valid: true };
	}
}
