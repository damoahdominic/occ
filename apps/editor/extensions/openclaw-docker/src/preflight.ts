import * as cp from 'child_process';
import * as fs from 'fs';

// ─────────────────────────────────────────────
// Docker preflight results
// ─────────────────────────────────────────────

export type DockerPreflightStatus =
	| { ok: true }
	| { ok: false; reason: 'cli_missing'; remedy: string }
	| { ok: false; reason: 'daemon_down'; remedy: string }
	| { ok: false; reason: 'permission_denied'; remedy: string }
	| { ok: false; reason: 'unknown'; error: string; remedy: string };

// ─────────────────────────────────────────────
// Platform remedies
// ─────────────────────────────────────────────

function installRemedy(): string {
	switch (process.platform) {
		case 'darwin':
			return (
				'Docker is not installed.\n\n' +
				'Install options:\n' +
				'  • OrbStack (recommended): https://orbstack.dev — lightweight, fast\n' +
				'  • Docker Desktop: https://www.docker.com/products/docker-desktop\n' +
				'  • Homebrew: brew install --cask docker'
			);
		case 'win32':
			return (
				'Docker is not installed.\n\n' +
				'Install options:\n' +
				'  • Docker Desktop for Windows: https://www.docker.com/products/docker-desktop\n' +
				'    Requires WSL 2 (Windows Subsystem for Linux).\n' +
				'    Enable WSL 2 first: wsl --install'
			);
		default: // linux
			return (
				'Docker is not installed.\n\n' +
				'Install options:\n' +
				'  • Ubuntu/Debian: sudo apt-get install docker.io && sudo systemctl enable --now docker\n' +
				'  • Fedora/RHEL:   sudo dnf install docker-ce && sudo systemctl enable --now docker\n' +
				'  • Official script: curl -fsSL https://get.docker.com | sh'
			);
	}
}

function daemonDownRemedy(): string {
	switch (process.platform) {
		case 'darwin':
			return (
				'Docker daemon is not running.\n\n' +
				'Start it:\n' +
				'  • OrbStack: open the OrbStack app in your Applications folder\n' +
				'  • Docker Desktop: open Docker Desktop from your Applications folder\n' +
				'  • After starting, wait ~10 s for the daemon to be ready'
			);
		case 'win32':
			return (
				'Docker daemon is not running.\n\n' +
				'Start it:\n' +
				'  • Open Docker Desktop from the Start menu or system tray\n' +
				'  • Wait for the whale icon to stop animating\n' +
				'  • Ensure WSL 2 backend is enabled in Docker Desktop → Settings → General'
			);
		default: // linux
			return (
				'Docker daemon is not running.\n\n' +
				'Start it:\n' +
				'  • sudo systemctl start docker\n' +
				'  • To auto-start on boot: sudo systemctl enable docker'
			);
	}
}

function permissionRemedy(): string {
	switch (process.platform) {
		case 'darwin':
			return (
				'Permission denied connecting to Docker socket.\n\n' +
				'If you are using OrbStack or Docker Desktop, try restarting the app.\n' +
				'If you installed Docker CLI manually: sudo usermod -aG docker $USER && newgrp docker'
			);
		case 'win32':
			return (
				'Permission denied connecting to Docker socket.\n\n' +
				'Make sure your Windows user account has access to Docker Desktop.\n' +
				'Open Docker Desktop → Settings → General → "Use WSL 2 based engine" and restart.'
			);
		default: // linux
			return (
				'Permission denied connecting to Docker socket.\n\n' +
				'Add your user to the docker group:\n' +
				'  sudo usermod -aG docker $USER\n' +
				'Then log out and back in (or run: newgrp docker)'
			);
	}
}

// ─────────────────────────────────────────────
// Check helpers
// ─────────────────────────────────────────────

function isDockerCliOnPath(): boolean {
	try {
		const whichCmd = process.platform === 'win32' ? 'where' : 'which';
		const result = cp.spawnSync(whichCmd, ['docker'], { timeout: 5000 });
		return result.status === 0 && result.stdout.toString().trim().length > 0;
	} catch {
		return false;
	}
}

function isDockerCliOnWellKnownPath(): boolean {
	const paths = process.platform === 'win32'
		? [
			'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
			'C:\\ProgramData\\DockerDesktop\\version-bin\\docker.exe',
		  ]
		: process.platform === 'darwin'
		? [
			'/usr/local/bin/docker',
			'/opt/homebrew/bin/docker',
			'/Applications/OrbStack.app/Contents/MacOS/xbin/docker',
			'/Applications/Docker.app/Contents/Resources/bin/docker',
		  ]
		: [
			'/usr/bin/docker',
			'/usr/local/bin/docker',
			'/snap/bin/docker',
		  ];
	return paths.some(p => fs.existsSync(p));
}

function runDockerInfo(): { ok: boolean; permissionDenied: boolean; daemonDown: boolean } {
	try {
		const result = cp.spawnSync('docker', ['info'], {
			timeout: 8000,
			windowsHide: true,
		});
		if (result.status === 0) {
			return { ok: true, permissionDenied: false, daemonDown: false };
		}
		const combined = (result.stdout?.toString() ?? '') + (result.stderr?.toString() ?? '');
		const lower = combined.toLowerCase();
		const permissionDenied = lower.includes('permission denied') || lower.includes('access is denied');
		const daemonDown =
			lower.includes('cannot connect') ||
			lower.includes('is the docker daemon running') ||
			lower.includes('error during connect') ||
			lower.includes('pipe') ||
			lower.includes('no such file');
		return { ok: false, permissionDenied, daemonDown };
	} catch {
		return { ok: false, permissionDenied: false, daemonDown: true };
	}
}

// ─────────────────────────────────────────────
// Main preflight check
// ─────────────────────────────────────────────

export async function dockerPreflight(): Promise<DockerPreflightStatus> {
	const cliPresent = isDockerCliOnPath() || isDockerCliOnWellKnownPath();

	if (!cliPresent) {
		return { ok: false, reason: 'cli_missing', remedy: installRemedy() };
	}

	const info = runDockerInfo();

	if (info.ok) {
		return { ok: true };
	}

	if (info.permissionDenied) {
		return { ok: false, reason: 'permission_denied', remedy: permissionRemedy() };
	}

	if (info.daemonDown) {
		return { ok: false, reason: 'daemon_down', remedy: daemonDownRemedy() };
	}

	return {
		ok: false,
		reason: 'unknown',
		error: 'docker info failed for unknown reason',
		remedy: daemonDownRemedy(),
	};
}
