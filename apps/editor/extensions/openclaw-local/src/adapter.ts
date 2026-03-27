import * as vscode from 'vscode';
import type {
	HostAdapter,
	HostType,
	HostConnection,
	HostConnectionConfig,
	LocalConnection,
	TestResult,
	DiscoveredHost,
	ConfigField,
	ConfigValidationResult,
} from '../../openclaw/src/hosts/types';
import { LocalHostConnection } from './connection';

// ─────────────────────────────────────────────
// LocalHostAdapter
// ─────────────────────────────────────────────

export class LocalHostAdapter implements HostAdapter {
	readonly type: HostType = 'local';
	readonly displayName = 'Local Machine';
	readonly icon = new vscode.ThemeIcon('device-desktop');

	/** Always discovers exactly one local host. */
	async discover(): Promise<DiscoveredHost[]> {
		return [
			{
				suggestedId: 'local',
				suggestedLabel: 'Local',
				connection: { type: 'local' } as LocalConnection,
			},
		];
	}

	async connect(_config: HostConnectionConfig): Promise<HostConnection> {
		return new LocalHostConnection();
	}

	async testConnection(_config: HostConnectionConfig): Promise<TestResult> {
		const conn = new LocalHostConnection();
		try {
			const cliCheck = await conn.testOpenClawCli();
			const gwStatus = cliCheck.ok ? await conn.gatewayHealthCheck() : undefined;
			return {
				success: cliCheck.ok,
				message: cliCheck.ok
					? `OpenClaw CLI found (${cliCheck.output ?? ''})`
					: `OpenClaw CLI not found: ${cliCheck.error ?? 'unknown'}`,
				details: {
					openclawInstalled: cliCheck.ok,
					openclawVersion: cliCheck.output,
					gatewayRunning: gwStatus?.state === 'running',
					os: process.platform,
					hostname: require('os').hostname(),
				},
			};
		} finally {
			conn.dispose();
		}
	}

	getConfigFields(): ConfigField[] {
		// Local needs no config fields
		return [];
	}

	validateConfig(_config: HostConnectionConfig): ConfigValidationResult {
		return { valid: true };
	}
}
