/**
 * Smoke tests for CLI binary operations.
 *
 * These tests verify the built CLI binary works correctly.
 * They run against dist/src/main.js (the built package).
 *
 * @see docs/plans/smoke-tests.md for the full checklist
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Path to the built CLI binaries
const CLI_PATH = path.resolve(__dirname, '../../dist/src/main.js');
const ENTRYPOINT_PATH = path.resolve(__dirname, '../../dist/src/entrypoint.js');
const ROOT_DIR = path.resolve(__dirname, '../..');

/**
 * Helper to run the CLI and capture output
 */
function runCli(
  args: string[],
  options: { cwd?: string; expectError?: boolean; env?: NodeJS.ProcessEnv } = {},
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

/**
 * Helper to run the CLI via entrypoint.js (the actual bin entry)
 */
function runEntrypoint(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync('node', [ENTRYPOINT_PATH, ...args], {
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

describe('CLI Smoke Tests', () => {
  beforeAll(() => {
    // Verify the built binaries exist
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(`Built CLI not found at ${CLI_PATH}. Run 'npm run build' first.`);
    }
    if (!fs.existsSync(ENTRYPOINT_PATH)) {
      throw new Error(
        `Built entrypoint not found at ${ENTRYPOINT_PATH}. Run 'npm run build' first.`,
      );
    }
  });

  describe('1.1 Basic CLI Operations', () => {
    it('1.1.1 - outputs version with --version', () => {
      const { stdout, exitCode } = runCli(['--version']);

      expect(exitCode).toBe(0);
      // Version should contain semver pattern (e.g., 1.2.3 or 1.2.3-beta.1)
      // Note: Output may include warnings if invalid config files exist in cwd
      expect(stdout).toMatch(/\d+\.\d+\.\d+(-[\w.]+)?/);
    });

    it('1.1.2 - outputs help with --help', () => {
      const { stdout, exitCode } = runCli(['--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('promptfoo');
      expect(stdout).toContain('eval');
      expect(stdout).toContain('Commands:');
    });

    it('1.1.3 - outputs subcommand help with eval --help', () => {
      const { stdout, exitCode } = runCli(['eval', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('--config');
      expect(stdout).toContain('--output');
      expect(stdout).toContain('--no-cache');
    });

    it('1.1.4 - handles unknown command gracefully', () => {
      const { stderr, exitCode } = runCli(['unknowncommand123']);

      expect(exitCode).toBe(1);
      // Commander outputs "error: unknown command" (lowercase)
      expect(stderr.toLowerCase()).toContain('unknown command');
    });

    it('1.1.5 - handles missing config file gracefully', () => {
      const { stdout, stderr, exitCode } = runCli(['eval', '-c', 'nonexistent-config-file.yaml']);

      expect(exitCode).toBe(1);
      // Error may appear in stdout (uncaught exception) or stderr
      const output = stdout + stderr;
      // Should indicate the file wasn't found
      expect(output.toLowerCase()).toMatch(
        /not found|no such file|does not exist|cannot find|no configuration file/i,
      );
    });
  });

  describe('1.2 Init Command', () => {
    let tempDir: string;

    beforeAll(() => {
      // Create a temp directory for init tests
      tempDir = path.join(ROOT_DIR, 'test/smoke/.temp-init-test');
      fs.mkdirSync(tempDir, { recursive: true });
    });

    afterAll(() => {
      // Clean up temp directory
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('1.2.1 - init --no-interactive creates config file', () => {
      const initDir = path.join(tempDir, 'init-test');
      fs.mkdirSync(initDir, { recursive: true });

      const { exitCode } = runCli(['init', '--no-interactive'], { cwd: initDir });

      expect(exitCode).toBe(0);
      // Should create a promptfooconfig file
      const configExists =
        fs.existsSync(path.join(initDir, 'promptfooconfig.yaml')) ||
        fs.existsSync(path.join(initDir, 'promptfooconfig.yml'));
      expect(configExists).toBe(true);
    });
  });

  describe('1.3 Validate Command', () => {
    const fixturesDir = path.join(__dirname, 'fixtures/configs');

    it('1.3.1 - validates a correct config file', () => {
      const { stdout, exitCode } = runCli(['validate', '-c', path.join(fixturesDir, 'basic.yaml')]);

      expect(exitCode).toBe(0);
      expect(stdout.toLowerCase()).toContain('valid');
    });

    it('1.3.2 - rejects an invalid config file', () => {
      const { stdout, stderr, exitCode } = runCli([
        'validate',
        '-c',
        path.join(fixturesDir, 'invalid.yaml'),
      ]);

      expect(exitCode).toBe(1);
      // Error may appear in stdout or stderr
      const output = stdout + stderr;
      expect(output.length).toBeGreaterThan(0);
      // Should indicate a validation error (missing providers)
      expect(output.toLowerCase()).toMatch(/provider|invalid|error/i);
    });
  });

  describe('1.6 Cache Commands', () => {
    it('1.6.1 - cache clear executes without error', () => {
      const { exitCode } = runCli(['cache', 'clear']);

      // Should succeed (exit 0) even if cache is empty
      expect(exitCode).toBe(0);
    });
  });

  describe('1.5 List Commands', () => {
    it('1.5.1 - list evals executes without error', () => {
      const { exitCode } = runCli(['list', 'evals']);

      // Should succeed even if no evals exist
      expect(exitCode).toBe(0);
    });

    it('1.5.2 - list datasets executes without error', () => {
      const { exitCode } = runCli(['list', 'datasets']);

      // Should succeed even if no datasets exist
      expect(exitCode).toBe(0);
    });
  });

  describe('1.7 Entrypoint Wrapper', () => {
    /**
     * These tests verify that entrypoint.js (the actual bin entry) works correctly.
     * The entrypoint provides a Node.js version check before loading dependencies.
     */

    it('1.7.1 - entrypoint outputs version with --version', () => {
      const { stdout, exitCode } = runEntrypoint(['--version']);

      expect(exitCode).toBe(0);
      // Version should contain semver pattern
      expect(stdout).toMatch(/\d+\.\d+\.\d+(-[\w.]+)?/);
    });

    it('1.7.2 - entrypoint outputs help with --help', () => {
      const { stdout, exitCode } = runEntrypoint(['--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('promptfoo');
      expect(stdout).toContain('eval');
      expect(stdout).toContain('Commands:');
    });

    it('1.7.3 - entrypoint handles subcommands correctly', () => {
      const { stdout, exitCode } = runEntrypoint(['eval', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('--config');
      expect(stdout).toContain('--output');
    });

    it('1.7.4 - entrypoint produces identical output to main.js', () => {
      // Verify entrypoint delegates to main.js correctly
      const entrypointResult = runEntrypoint(['--version']);
      const mainResult = runCli(['--version']);

      expect(entrypointResult.exitCode).toBe(mainResult.exitCode);
      expect(entrypointResult.stdout.trim()).toBe(mainResult.stdout.trim());
    });
  });
});
