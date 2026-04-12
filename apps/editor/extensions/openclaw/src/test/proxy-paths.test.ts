/**
 * Proxy URL Path Handling Unit Tests
 *
 * Tests for +/- path operations:
 * - Adding paths to proxy base URLs
 * - Removing/normalizing trailing slashes
 * - Merging dashboard paths with proxy URLs
 * - Handling various path combinations
 *
 * These tests can be run standalone without the full VS Code editor:
 *   npm test --filter proxy-paths
 */

import {
  addPathToUrl,
  removeTrailingSlash,
  normalizePath,
  mergeDashboardWithProxy,
} from '../utils/proxyUrl';

interface TestCase {
  name: string;
  proxyUrl: string;
  dashboardPath: string;
  dashboardSearch?: string;
  dashboardHash?: string;
  expected: string;
}

interface NormalizeTestCase {
  name: string;
  input: string;
  expected: string;
}

interface MergeTestCase {
  name: string;
  dashboardUrl: string;
  proxyUrl?: string;
  portMapping?: { containerPort: number; hostPort: number };
  expected: string;
}

// Simple test runner
function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function runTests(): Promise<void> {
  console.log('Running Proxy Path Tests...\n');

  // ──────────────────────────────────────────────────────────────────────
  // Test Suite 1: Adding Paths to Proxy URLs (+)
  // ──────────────────────────────────────────────────────────────────────

  const addPathTests: TestCase[] = [
    {
      name: 'Simple path addition to root proxy',
      proxyUrl: 'http://localhost:18790/',
      dashboardPath: '/dashboard',
      expected: 'http://localhost:18790/dashboard',
    },
    {
      name: 'Path addition without trailing slash on proxy',
      proxyUrl: 'http://localhost:18790',
      dashboardPath: '/dashboard',
      expected: 'http://localhost:18790/dashboard',
    },
    {
      name: 'Path addition with base path already present',
      proxyUrl: 'http://localhost:18790/openclaw/',
      dashboardPath: '/dashboard',
      expected: 'http://localhost:18790/openclaw/dashboard',
    },
    {
      name: 'Complex path with search params',
      proxyUrl: 'https://gateway.example.com/',
      dashboardPath: '/config/advanced',
      dashboardSearch: '?tab=network',
      expected: 'https://gateway.example.com/config/advanced?tab=network',
    },
    {
      name: 'Path with fragment token',
      proxyUrl: 'http://localhost:18790/',
      dashboardPath: '/',
      dashboardHash: 'token=abc123xyz',
      expected: 'http://localhost:18790/#token=abc123xyz',
    },
    {
      name: 'Multiple path segments added',
      proxyUrl: 'https://api.example.com/v1/',
      dashboardPath: '/gateway/config',
      expected: 'https://api.example.com/v1/gateway/config',
    },
    {
      name: 'Path with custom domain',
      proxyUrl: 'https://gateway.mycompany.com:8443/openclaw/',
      dashboardPath: '/dashboard',
      expected: 'https://gateway.mycompany.com:8443/openclaw/dashboard',
    },
  ];

  console.log('Test Suite 1: Adding Paths (+)\n');
  for (const tc of addPathTests) {
    try {
      const result = addPathToUrl(tc.proxyUrl, tc.dashboardPath, tc.dashboardSearch, tc.dashboardHash);
      assert(result === tc.expected, `${tc.name}\n  Got: ${result}\n  Expected: ${tc.expected}`);
      console.log(`  ✓ ${tc.name}`);
    } catch (err) {
      console.error(`  ✗ ${tc.name}: ${(err as Error).message}`);
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Test Suite 2: Removing Trailing Slashes (-)
  // ──────────────────────────────────────────────────────────────────────

  const removeSlashTests: NormalizeTestCase[] = [
    {
      name: 'Remove trailing slash from root',
      input: 'http://localhost:18790/',
      expected: 'http://localhost:18790',
    },
    {
      name: 'Remove trailing slash from path',
      input: 'http://localhost:18790/dashboard/',
      expected: 'http://localhost:18790/dashboard',
    },
    {
      name: 'No trailing slash to remove',
      input: 'http://localhost:18790/dashboard',
      expected: 'http://localhost:18790/dashboard',
    },
    {
      name: 'Remove trailing slash with search params',
      input: 'http://localhost:18790/dashboard/?tab=network',
      expected: 'http://localhost:18790/dashboard?tab=network',
    },
    {
      name: 'Preserve root when removing trailing slash',
      input: 'https://example.com/',
      expected: 'https://example.com',
    },
    {
      name: 'Handle HTTPS URLs',
      input: 'https://secure.example.com/api/',
      expected: 'https://secure.example.com/api',
    },
  ];

  console.log('\n\nTest Suite 2: Removing Trailing Slashes (-)\n');
  for (const tc of removeSlashTests) {
    try {
      const result = removeTrailingSlash(tc.input);
      assert(result === tc.expected, `${tc.name}\n  Got: ${result}\n  Expected: ${tc.expected}`);
      console.log(`  ✓ ${tc.name}`);
    } catch (err) {
      console.error(`  ✗ ${tc.name}: ${(err as Error).message}`);
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Test Suite 3: Path Normalization
  // ──────────────────────────────────────────────────────────────────────

  const normalizationTests: NormalizeTestCase[] = [
    {
      name: 'Remove duplicate slashes in path',
      input: 'http://localhost:18790//dashboard//config',
      expected: 'http://localhost:18790/dashboard/config',
    },
    {
      name: 'Keep single slashes',
      input: 'http://localhost:18790/dashboard/config',
      expected: 'http://localhost:18790/dashboard/config',
    },
    {
      name: 'Normalize with query params',
      input: 'http://localhost:18790//api//v1//gateway?token=abc',
      expected: 'http://localhost:18790/api/v1/gateway?token=abc',
    },
  ];

  console.log('\n\nTest Suite 3: Path Normalization\n');
  for (const tc of normalizationTests) {
    try {
      const result = normalizePath(tc.input);
      assert(result === tc.expected, `${tc.name}\n  Got: ${result}\n  Expected: ${tc.expected}`);
      console.log(`  ✓ ${tc.name}`);
    } catch (err) {
      console.error(`  ✗ ${tc.name}: ${(err as Error).message}`);
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Test Suite 4: Merge Operations (+ / -)
  // ──────────────────────────────────────────────────────────────────────

  console.log('\n\nTest Suite 4: Combined Path Operations\n');

  const combinedTests = [
    {
      name: 'Add path then remove trailing slash',
      fn: () => {
        const step1 = addPathToUrl('http://localhost:18790/', '/dashboard/', '', '');
        const step2 = removeTrailingSlash(step1);
        return step2;
      },
      expected: 'http://localhost:18790/dashboard',
    },
    {
      name: 'Normalize then add path',
      fn: () => {
        const step1 = normalizePath('http://localhost:18790//api//');
        const step2 = addPathToUrl(step1, '/gateway', '', '');
        return step2;
      },
      expected: 'http://localhost:18790/api/gateway',
    },
  ];

  for (const tc of combinedTests) {
    try {
      const result = tc.fn();
      assert(result === tc.expected, `${tc.name}\n  Got: ${result}\n  Expected: ${tc.expected}`);
      console.log(`  ✓ ${tc.name}`);
    } catch (err) {
      console.error(`  ✗ ${tc.name}: ${(err as Error).message}`);
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Test Suite 5: Merge Dashboard URL with Proxy
  // ──────────────────────────────────────────────────────────────────────

  console.log('\n\nTest Suite 5: Merge Dashboard URL with Proxy\n');

  const mergeDashboardTests: MergeTestCase[] = [
    {
      name: 'Merge dashboard URL with proxy URL',
      dashboardUrl: 'http://127.0.0.1:18789/#token=abc123',
      proxyUrl: 'https://gateway.example.com/',
      expected: 'https://gateway.example.com/#token=abc123',
    },
    {
      name: 'Proxy URL with base path',
      dashboardUrl: 'http://127.0.0.1:18789/config',
      proxyUrl: 'https://api.example.com/openclaw/',
      expected: 'https://api.example.com/openclaw/config',
    },
    {
      name: 'Rewrite container port to host port (no proxy)',
      dashboardUrl: 'http://127.0.0.1:18789/#token=xyz',
      proxyUrl: undefined,
      portMapping: { containerPort: 18789, hostPort: 18790 },
      expected: 'http://127.0.0.1:18790/#token=xyz',
    },
    {
      name: 'Proxy URL takes precedence over port mapping',
      dashboardUrl: 'http://127.0.0.1:18789/#token=abc',
      proxyUrl: 'https://secure.gateway.example.com/',
      portMapping: { containerPort: 18789, hostPort: 18790 },
      expected: 'https://secure.gateway.example.com/#token=abc',
    },
    {
      name: 'Rewrite localhost variant of port',
      dashboardUrl: 'http://localhost:18789/#token=test',
      proxyUrl: undefined,
      portMapping: { containerPort: 18789, hostPort: 18790 },
      expected: 'http://localhost:18790/#token=test',
    },
    {
      name: 'Handle empty dashboard URL gracefully',
      dashboardUrl: '',
      proxyUrl: 'https://gateway.example.com/',
      expected: '',
    },
  ];

  for (const tc of mergeDashboardTests) {
    try {
      const result = mergeDashboardWithProxy(tc.dashboardUrl, tc.proxyUrl, tc.portMapping);
      assert(result === tc.expected, `${tc.name}\n  Got: ${result}\n  Expected: ${tc.expected}`);
      console.log(`  ✓ ${tc.name}`);
    } catch (err) {
      console.error(`  ✗ ${tc.name}: ${(err as Error).message}`);
      throw err;
    }
  }

  console.log('\n\n✓ All proxy path tests passed!\n');
}

// Run tests
runTests().catch(err => {
  console.error('\nTest failed:', err);
  process.exit(1);
});
