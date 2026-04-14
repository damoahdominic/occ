import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Test that all scripts use docker-compose instead of docker run.
 * This ensures we maintain consistent Docker service management across the codebase.
 */
describe('Docker Compose Migration', () => {
  const rootDir = path.join(__dirname, '..');

  // Files that should NOT contain "docker run" (except in comments explaining why)
  const filesToCheck = [
    'test-docker-flow-mcp.sh',
    'scripts/test-node-version-detection.sh',
    'apps/editor/build/gulpfile.reh.js',
    'apps/editor/scripts/appimage/create_appimage.sh',
  ];

  describe('docker run migration', () => {
    filesToCheck.forEach((file) => {
      test(`${file} should not use "docker run" for service startup`, () => {
        const filePath = path.join(rootDir, file);

        if (!fs.existsSync(filePath)) {
          console.warn(`Skipping ${file} - file not found`);
          return;
        }

        const content = fs.readFileSync(filePath, 'utf-8');

        // Check for actual docker run commands (not in comments or documentation)
        const lines = content.split('\n');
        const dockerRunLines: number[] = [];

        lines.forEach((line, idx) => {
          // Skip if it's a comment-only line or documentation
          if (line.trim().startsWith('#') || line.trim().startsWith('*')) {
            return;
          }

          // Look for actual docker run invocations
          if (/^\s*docker\s+run\s+/.test(line) || /cp\.spawn\(['"]docker['"],\s*\['run'/.test(line)) {
            dockerRunLines.push(idx + 1);
          }
        });

        if (dockerRunLines.length > 0) {
          throw new Error(
            `Found ${dockerRunLines.length} docker run command(s) at lines ${dockerRunLines.join(', ')} in ${file}\n` +
            'Please migrate to docker-compose instead.'
          );
        }
      });
    });
  });

  describe('docker-compose files exist', () => {
    test('docker-compose.yml should exist for mcp-proxy', () => {
      const mcpComposeFile = path.join(rootDir, 'docker', 'docker-compose.mcp-proxy.yml');
      expect(fs.existsSync(mcpComposeFile)).toBe(true);
    });

    test('docker-compose.yml should exist for node version tests', () => {
      const nodeComposeFile = path.join(rootDir, 'docker', 'docker-compose.node-tests.yml');
      expect(fs.existsSync(nodeComposeFile)).toBe(true);
    });
  });

  describe('scripts use docker-compose', () => {
    test('test-docker-flow-mcp.sh should use docker-compose for mcp-proxy', () => {
      const filePath = path.join(rootDir, 'test-docker-flow-mcp.sh');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('docker-compose');
      expect(content).not.toMatch(/^\s*docker\s+run\s+.*mcp-proxy/m);
    });

    test('test-node-version-detection.sh should use docker-compose for node tests', () => {
      const filePath = path.join(rootDir, 'scripts/test-node-version-detection.sh');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('docker-compose');
      expect(content).not.toMatch(/^\s*docker\s+run\s+/m);
    });

    test('gulpfile.reh.js should use docker-compose for alpine extraction', () => {
      const filePath = path.join(rootDir, 'apps/editor/build/gulpfile.reh.js');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('docker-compose');
      expect(content).not.toMatch(/cp\.execSync\(['"`]docker\s+run/);
    });
  });
});
