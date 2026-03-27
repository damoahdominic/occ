import * as vscode from 'vscode';
import type {
	HostAdapter,
	HostType,
	HostConnection,
	HostConnectionConfig,
	SSHConnection,
	TestResult,
	DiscoveredHost,
	ConfigField,
	ConfigValidationResult,
} from '../../openclaw/src/hosts/types';
import { SSHHostConnection } from './connection';

export class SSHHostAdapter implements HostAdapter {
	readonly type: HostType = 'ssh';
	readonly displayName = 'SSH Server';
	readonly icon = new vscode.ThemeIcon('remote');

	async discover(): Promise<DiscoveredHost[]> {
		// Future: parse ~/.ssh/config for known hosts
		return [];
	}

	async connect(config: HostConnectionConfig): Promise<HostConnection> {
		return new SSHHostConnection(config as SSHConnection);
	}

	async testConnection(config: HostConnectionConfig): Promise<TestResult> {
		const sshCfg = config as SSHConnection;
		const conn = new SSHHostConnection(sshCfg);
		try {
			const r = await conn.exec('echo', ['ok'], { timeout: 15000 });
			if (r.code !== 0 || !r.stdout.includes('ok')) {
				return { success: false, message: `SSH connection failed: ${r.stderr.trim()}` };
			}
			const cliCheck = await conn.testOpenClawCli();
			return {
				success: true,
				message: cliCheck.ok
					? `Connected to ${sshCfg.user}@${sshCfg.host}. OpenClaw ${cliCheck.output ?? ''}`
					: `Connected to ${sshCfg.user}@${sshCfg.host}. OpenClaw not installed.`,
				details: {
					openclawInstalled: cliCheck.ok,
					openclawVersion: cliCheck.output,
					os: 'remote',
					hostname: sshCfg.host,
				},
			};
		} catch (err) {
			return { success: false, message: `SSH error: ${String(err)}` };
		}
	}

	getConfigFields(): ConfigField[] {
		return [
			{ id: 'host', label: 'Hostname or IP', type: 'text', placeholder: 'example.com or 192.168.1.10', required: true },
			{ id: 'user', label: 'SSH User', type: 'text', placeholder: 'ubuntu, ec2-user, root...', required: true },
			{ id: 'port', label: 'Port', type: 'number', placeholder: '22', defaultValue: 22 },
			{ id: 'keyPath', label: 'SSH Key Path', type: 'text', placeholder: '~/.ssh/id_rsa (blank = SSH agent)', required: false },
		];
	}

	validateConfig(config: HostConnectionConfig): ConfigValidationResult {
		const sshCfg = config as SSHConnection;
		const errors: { fieldId: string; message: string }[] = [];
		if (!sshCfg.host) { errors.push({ fieldId: 'host', message: 'Hostname is required' }); }
		if (!sshCfg.user) { errors.push({ fieldId: 'user', message: 'SSH user is required' }); }
		return errors.length ? { valid: false, errors } : { valid: true };
	}
}
