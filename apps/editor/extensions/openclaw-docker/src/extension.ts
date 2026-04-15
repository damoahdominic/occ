import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { OpenClawCoreAPI } from '../../openclaw/src/hosts/types';
import { DockerHostAdapter } from './adapter';
import { DockerSetupPanel } from './setup-panel';

const CONTAINER = 'occ-openclaw';
const DEFAULT_PORT = 18789;

// Embedded compose file — written to docker/docker-compose.openclaw.yml on
// first run if the file is missing (e.g. fresh clone or installed build).
const COMPOSE_YML = `# OpenClaw Gateway — Base Production Configuration
#
# PURPOSE:
#   Production-ready configuration for OpenClaw gateway and supporting services
#   (PostgreSQL, Redis). This is the ONLY config used for builds and CI/CD.
#   No dev-specific logic or overrides.
#
# USAGE:
#   Production/CI: docker compose -f docker/docker-compose.openclaw.yml up -d
#   Development:   docker compose -f docker/docker-compose.openclaw.yml \\
#                    -f docker/docker-compose.openclaw.override.yml up -d
#
# SERVICES:
#   - occ-gateway  : OpenClaw gateway (port 18789)
#   - occ-postgres : PostgreSQL 16 (port 5432)
#   - occ-redis    : Redis 7 (port 6379)
#
# NETWORKS:
#   - occ-network  : Custom bridge network for service communication
#
# VOLUMES:
#   - occ-postgres-data : Persistent PostgreSQL data
#   - occ-redis-data    : Persistent Redis data (not currently used)
#
# ENVIRONMENT:
#   Load variables from docker/.env.openclaw
#   Required: POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_USER, DATABASE_URL, REDIS_URL
#
# See DOCKER.md for detailed configuration and usage.

services:
  occ-gateway:
    container_name: occ-openclaw
    image: \${OCC_GATEWAY_IMAGE:-ghcr.io/openclaw/openclaw:latest}
    command: ["openclaw", "gateway", "run", "--allow-unconfigured", "--bind", "lan"]
    restart: unless-stopped
    ports:
      - "\${GATEWAY_BIND_HOST:-127.0.0.1}:\${GATEWAY_PORT:-18789}:18789"
    environment:
      DATABASE_URL: postgresql://openclaw:occdev@occ-postgres:5432/openclaw
      REDIS_URL: redis://occ-redis:6379
    volumes:
      - \${OPENCLAW_DATA_DIR:-./openclaw_docker_data}:/home/node/.openclaw
    networks:
      - occ-network
    depends_on:
      occ-postgres:
        condition: service_healthy
      occ-redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:18789/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  occ-postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: occdev
      POSTGRES_DB: openclaw
      POSTGRES_USER: openclaw
    volumes:
      - occ-postgres-data:/var/lib/postgresql/data
    networks:
      - occ-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U openclaw"]
      interval: 5s
      timeout: 3s
      retries: 5

  occ-redis:
    image: redis:7-alpine
    restart: unless-stopped
    networks:
      - occ-network
    healthcheck:
      test: ["CMD-SHELL", "redis-cli ping"]
      interval: 5s
      timeout: 3s
      retries: 5

networks:
  occ-network:
    driver: bridge

volumes:
  occ-openclaw-data:
  occ-postgres-data:
`;

/**
 * Write docker/docker-compose.openclaw.yml from the embedded constant if it
 * does not already exist on disk. Runs silently — a missing file is not fatal,
 * but we log the outcome so it shows in the extension host output.
 */
function ensureDockerAssets(projectRoot: string): void {
	const dockerDir = path.join(projectRoot, 'docker');
	const composePath = path.join(dockerDir, 'docker-compose.openclaw.yml');
	try {
		if (fs.existsSync(composePath)) { return; }
		fs.mkdirSync(dockerDir, { recursive: true });
		fs.writeFileSync(composePath, COMPOSE_YML, 'utf-8');
		console.log('[openclaw-docker] Wrote missing docker/docker-compose.openclaw.yml from embedded template');
	} catch (err) {
		console.warn('[openclaw-docker] Could not write docker/docker-compose.openclaw.yml:', err);
	}
}

/** Read saved user config from .env.openclaw */
function readUserConfig(extensionUri: vscode.Uri): { port: number; bindHost: string; dataDir: string } | null {
	// Resolve docker dir from extension path (4 levels up to project root)
	const projectRoot = path.dirname(path.dirname(path.dirname(path.dirname(extensionUri.fsPath))));
	const configPath = path.join(projectRoot, 'docker', '.env.openclaw');

	try {
		if (!fs.existsSync(configPath)) { return null; }
		const content = fs.readFileSync(configPath, 'utf-8');
		const portMatch = content.match(/^GATEWAY_PORT=(.+)$/m);
		const bindMatch = content.match(/^BIND_HOST=(.+)$/m);
		const dataDirMatch = content.match(/^OPENCLAW_DATA_DIR=(.+)$/m);
		return {
			port: portMatch?.[1] ? parseInt(portMatch[1].trim(), 10) || DEFAULT_PORT : DEFAULT_PORT,
			bindHost: bindMatch?.[1]?.trim() || '127.0.0.1',
			dataDir: dataDirMatch?.[1]?.trim() || '',
		};
	} catch {
		return null;
	}
}

/** Probe gateway health at configured port */
function probeGateway(host: string, port: number): boolean {
	try {
		const addr = host === '0.0.0.0' ? '127.0.0.1' : host;
		const result = cp.spawnSync('curl', ['-sf', '-o', '/dev/null', '-w', '%{http_code}', `http://${addr}:${port}/health`, '--max-time', '2'], { timeout: 5000, windowsHide: true });
		const code = result.stdout?.toString().trim();
		return code === '200' || code === '204';
	} catch {
		return false;
	}
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const projectRoot = path.dirname(path.dirname(path.dirname(path.dirname(context.extensionUri.fsPath))));
	ensureDockerAssets(projectRoot);

	const coreExt = vscode.extensions.getExtension<OpenClawCoreAPI>('openclaw.home');
	if (!coreExt) {
		console.warn('[openclaw-docker] Core extension openclaw.home not found — docker adapter not registered');
		return;
	}

	const coreAPI = coreExt.isActive
		? coreExt.exports
		: await coreExt.activate();

	if (!coreAPI || typeof coreAPI.registerHostAdapter !== 'function') {
		console.warn('[openclaw-docker] Core extension did not export OpenClawCoreAPI — docker adapter not registered');
		return;
	}

	const adapter = new DockerHostAdapter();
	const disposable = coreAPI.registerHostAdapter(adapter, 'openclaw.openclaw-docker');
	context.subscriptions.push(disposable);

	const setupCmd = vscode.commands.registerCommand('openclaw.host.setup.docker', () => {
		DockerSetupPanel.createOrShow(context.extensionUri, coreAPI);
	});
	context.subscriptions.push(setupCmd);

	console.log('[openclaw-docker] DockerHostAdapter registered');

	// Auto-detect: read saved user config and log gateway status.
	// Registration happens in _initHtml when the Docker panel opens —
	// doing it here would trigger a panel open → setHost → panel reopen loop.
	const userConfig = readUserConfig(context.extensionUri);
	if (userConfig) {
		const { port, bindHost } = userConfig;
		if (probeGateway(bindHost, port)) {
			console.log(`[openclaw-docker] Gateway detected at ${bindHost}:${port} — will auto-connect when panel opens`);
		} else {
			console.log(`[openclaw-docker] Saved config found (port ${port}) but gateway not responding`);
		}
	}
}

export function deactivate(): void {
	// Subscriptions cleaned up automatically
}
