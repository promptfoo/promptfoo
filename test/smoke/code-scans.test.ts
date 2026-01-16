/**
 * Smoke tests for code-scans command.
 *
 * These tests verify the code-scans module loads correctly without missing dependencies.
 * This catches issues like static imports of optional packages (e.g., @anthropic-ai/sdk)
 * that would break in minimal/bundled environments like the code-scan-action.
 *
 * @see https://github.com/promptfoo/promptfoo/pull/7082 for context
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { beforeAll, describe, expect, it } from 'vitest';

const CLI_PATH = path.resolve(__dirname, '../../dist/src/main.js');
const ROOT_DIR = path.resolve(__dirname, '../..');

/**
 * Helper to run the CLI and capture output
 */
function runCli(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    cwd: options.cwd || ROOT_DIR,
    encoding: 'utf-8',
    env: { ...process.env, ...options.env, NO_COLOR: '1' },
    timeout: 30000,
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

describe('Code-Scans Smoke Tests', () => {
  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(`Built CLI not found at ${CLI_PATH}. Run 'npm run build' first.`);
    }
  });

  describe('Module Loading', () => {
    /**
     * This test catches missing dependencies in the code-scans module.
     * If a static import references an uninstalled package, this will fail.
     */
    it('should register code-scans command without dependency errors', () => {
      const { stdout, stderr, exitCode } = runCli(['--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('code-scans');

      // Verify no module loading errors
      expect(stderr).not.toContain('Cannot find module');
      expect(stderr).not.toContain('MODULE_NOT_FOUND');
      expect(stderr).not.toContain('Error: Cannot find package');
    });

    it('should show code-scans help without dependency errors', () => {
      const { stdout, stderr, exitCode } = runCli(['code-scans', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('run');
      expect(stdout).toContain('security vulnerabilities');

      // Verify no module loading errors
      expect(stderr).not.toContain('Cannot find module');
      expect(stderr).not.toContain('MODULE_NOT_FOUND');
    });

    it('should show code-scans run help without dependency errors', () => {
      const { stdout, stderr, exitCode } = runCli(['code-scans', 'run', '--help']);

      expect(exitCode).toBe(0);

      // Verify command options are available (proves module loaded)
      expect(stdout).toContain('--api-key');
      expect(stdout).toContain('--base');
      expect(stdout).toContain('--compare');
      expect(stdout).toContain('--diffs-only');
      expect(stdout).toContain('--min-severity');

      // Verify no module loading errors in stderr
      expect(stderr).not.toContain('Cannot find module');
      expect(stderr).not.toContain('MODULE_NOT_FOUND');
      expect(stderr).not.toContain('Error: Cannot find package');
    });
  });

  describe('Provider Registry Independence', () => {
    /**
     * This test verifies that code-scans doesn't inadvertently pull in
     * provider dependencies through shared imports. The registry uses
     * dynamic imports for optional SDK packages.
     */
    it('should not require @anthropic-ai/sdk for code-scans help', () => {
      // Run with a marker env var to help debug if this ever fails
      const { stderr, exitCode } = runCli(['code-scans', 'run', '--help'], {
        env: { PROMPTFOO_SMOKE_TEST: '1' },
      });

      expect(exitCode).toBe(0);

      // These patterns would appear if Anthropic SDK was missing and statically imported
      expect(stderr).not.toContain('@anthropic-ai/sdk');
      expect(stderr).not.toContain("Cannot find package '@anthropic-ai");
    });
  });
});
