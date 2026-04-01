#!/usr/bin/env node

/**
 * Development Docker Validation Script
 *
 * Validates the docker-compose.yml setup and workflow for OCCode.
 * Run from the repository root.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

const COMPOSE_FILE = path.resolve(process.cwd(), 'docker-compose.yml');
const EDITOR_PORT = 3001;
const WEB_PORT = 3002;

async function execCmd(cmd, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'pipe', ...options });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', data => stdout += data.toString());
    child.stderr.on('data', data => stderr += data.toString());
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Command ${cmd} ${args.join(' ')} failed with code ${code}\n${stderr}`));
    });
    child.on('error', err => reject(err));
  });
}

function portInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, '127.0.0.1', () => {
      server.close();
      resolve(false); // free
    });
    server.on('error', () => {
      resolve(true); // in use
    });
  });
}

async function task1DockerEnv() {
  console.log('\n🔍 Task 1: Docker Environment Check');
  try {
    await execCmd('docker', ['--version']);
    console.log('  ✓ Docker CLI found');
  } catch (e) {
    console.error('  ✗ Docker CLI not found:', e.message);
    throw e;
  }

  try {
    const { stdout } = await execCmd('docker', ['info']);
    console.log('  ✓ Docker daemon is running');
  } catch (e) {
    console.error('  ✗ Docker daemon not accessible:', e.message);
    throw e;
  }

  try {
    await execCmd('docker', ['compose', 'version']);
    console.log('  ✓ Docker Compose v2 available');
  } catch (e) {
    console.error('  ✗ Docker Compose not available:', e.message);
    throw e;
  }
}

async function task2ConfigValidation() {
  console.log('\n🔍 Task 2: Configuration Validation');
  if (!fs.existsSync(COMPOSE_FILE)) {
    console.error(`  ✗ Compose file not found: ${COMPOSE_FILE}`);
    throw new Error('Compose file missing');
  }
  console.log('  ✓ docker-compose.yml exists');

  try {
    await execCmd('docker', ['compose', 'config', '--dry-run']);
    console.log('  ✓ Compose configuration is valid');
  } catch (e) {
    console.error('  ✗ Compose configuration error:', e.message);
    throw e;
  }

  // Volume mount paths: check that current directory exists on host
  const cwd = process.cwd();
  if (!fs.existsSync(cwd)) {
    console.error(`  ✗ Working directory does not exist: ${cwd}`);
    throw new Error('Missing workspace directory');
  }
  console.log(`  ✓ Workspace directory present: ${cwd}`);

  // Port conflicts
  const ports = [EDITOR_PORT, WEB_PORT];
  for (const port of ports) {
    const inUse = await portInUse(port);
    if (inUse) {
      console.warn(`  ⚠ Port ${port} is already in use (might be an existing container)`);
    } else {
      console.log(`  ✓ Port ${port} is available`);
    }
  }
}

async function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.on('timeout', () => resolve(false));
    socket.on('error', () => resolve(false));
    socket.connect(port, '127.0.0.1');
  });
}

async function task3ContainerTesting() {
  console.log('\n🔍 Task 3: Container Testing');

  // Build images
  console.log('  → Building images (this may take a while)...');
  try {
    await execCmd('docker', ['compose', '-f', 'docker-compose.yml', 'build']);
    console.log('  ✓ Build succeeded');
  } catch (e) {
    console.error('  ✗ Build failed:', e.message);
    throw e;
  }

  // Start services
  console.log('  → Starting services...');
  try {
    await execCmd('docker', ['compose', '-f', 'docker-compose.yml', 'up', '-d']);
    console.log('  ✓ Services started');
  } catch (e) {
    console.error('  ✗ Failed to start services:', e.message);
    throw e;
  }

  // Wait for health
  console.log('  → Waiting for health checks...');
  const maxAttempts = 24;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { stdout } = await execCmd('docker', ['compose', '-f', 'docker-compose.yml', 'ps']);
      if (stdout.includes('healthy')) {
        console.log('  ✓ Containers are healthy');
        break;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 5000));
  }

  // Port accessibility
  for (const port of [EDITOR_PORT, WEB_PORT]) {
    const open = await checkPort(port);
    if (open) {
      console.log(`  ✓ Port ${port} is open`);
    } else {
      console.warn(`  ⚠ Port ${port} is not reachable`);
    }
  }
}

async function task4DevWorkflow() {
  console.log('\n🔍 Task 4: Development Workflow');

  // Check that hot-reload is configured (volumes are mounted)
  console.log('  → Verifying volume mounts...');
  const { stdout } = await execCmd('docker', ['compose', '-f', 'docker-compose.yml', 'exec', 'editor', 'sh', '-c', 'mount | grep /workspace']);
  if (stdout.includes('/workspace')) {
    console.log('  ✓ Workspace volume is mounted in editor');
  } else {
    console.warn('  ⚠ Workspace mount not detected; hot-reload may not work');
  }

  // Source change reflection: touch a file and see if it appears in container
  const testFile = path.join(process.cwd(), '.docker-validation-test.txt');
  fs.writeFileSync(testFile, `test ${Date.now()}\n`);
  try {
    const { stdout } = await execCmd('docker', ['compose', '-f', 'docker-compose.yml', 'exec', 'editor', 'cat', '/workspace/.docker-validation-test.txt']);
    if (stdout.trim()) {
      console.log('  ✓ File changes reflect in container (volume mount working)');
    } else {
      console.warn('  ⚠ File not found inside container');
    }
  } catch (e) {
    console.warn('  ⚠ Could not verify file sync:', e.message);
  } finally {
    fs.unlinkSync(testFile);
    await execCmd('docker', ['compose', '-f', 'docker-compose.yml', 'exec', 'editor', 'rm', '-f', '/workspace/.docker-validation-test.txt']).catch(() => {});
  }
}

async function task5Cleanup() {
  console.log('\n🔍 Task 5: Cleanup and Documentation');

  console.log('  → Tearing down containers...');
  try {
    await execCmd('docker', ['compose', '-f', 'docker-compose.yml', 'down']);
    console.log('  ✓ Containers stopped and removed');
  } catch (e) {
    console.error('  ✗ Teardown failed:', e.message);
    throw e;
  }

  // Verify no orphaned containers
  const { stdout } = await execCmd('docker', ['ps', '-a', '--filter', 'name=occ-']);
  const lines = stdout.trim().split('\n').filter(l => l && !l.includes('CONTAINER'));
  if (lines.length === 0) {
    console.log('  ✓ No orphaned OCC containers');
  } else {
    console.warn('  ⚠ Found potential orphaned containers:\n' + lines.join('\n'));
  }
}

async function main() {
  console.log('🚀 Starting Docker Compose Validation for OCCode');
  const start = Date.now();

  try {
    await task1DockerEnv();
    await task2ConfigValidation();
    await task3ContainerTesting();
    await task4DevWorkflow();
    await task5Cleanup();

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n✅ All validations passed in ${elapsed}s`);
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Validation failed:', err.message);
    process.exit(1);
  }
}

main();
