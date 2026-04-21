/**
 * Smoke tests for the eval command.
 *
 * These tests verify the core evaluation pipeline works correctly
 * using the echo provider (no external API dependencies).
 *
 * @see docs/plans/smoke-tests.md for the full checklist
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Path to the built CLI binary
const CLI_PATH = path.resolve(__dirname, '../../dist/src/main.js');
const ROOT_DIR = path.resolve(__dirname, '../..');
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
const OUTPUT_DIR = path.resolve(__dirname, '.temp-output');

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
    timeout: 60000, // Eval can take longer
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

describe('Eval Smoke Tests', () => {
  beforeAll(() => {
    // Verify the built binary exists
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(`Built CLI not found at ${CLI_PATH}. Run 'npm run build' first.`);
    }

    // Create output directory for test artifacts
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    // Clean up output directory
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  describe('1.4 Eval Command', () => {
    it('1.4.1 - runs basic eval with echo provider', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/basic.yaml');
      const { stdout, exitCode } = runCli(['eval', '-c', configPath, '--no-cache']);

      // Should complete successfully
      expect(exitCode).toBe(0);

      // Should show eval results
      expect(stdout).toContain('PASS');
    });

    it('1.4.2 - outputs JSON format', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/basic.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);
      expect(fs.existsSync(outputPath)).toBe(true);

      // Verify it's valid JSON with expected structure
      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed).toHaveProperty('results');
      expect(parsed.results).toHaveProperty('results');
      expect(Array.isArray(parsed.results.results)).toBe(true);
    });

    it('1.4.3 - outputs YAML format', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/basic.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'output.yaml');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);
      expect(fs.existsSync(outputPath)).toBe(true);

      // Verify it contains YAML-like content
      const content = fs.readFileSync(outputPath, 'utf-8');
      expect(content).toContain('results:');
    });

    it('1.4.4 - outputs CSV format', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/basic.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'output.csv');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);
      expect(fs.existsSync(outputPath)).toBe(true);

      // Verify it's CSV format (has header row with columns)
      const content = fs.readFileSync(outputPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBeGreaterThan(0);
      // CSV should have comma-separated values
      expect(lines[0]).toContain(',');
    });

    it('1.4.5 - respects --max-concurrency flag', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/basic.yaml');
      const { exitCode } = runCli([
        'eval',
        '-c',
        configPath,
        '--max-concurrency',
        '1',
        '--no-cache',
      ]);

      // Should complete successfully with concurrency limit
      expect(exitCode).toBe(0);
    });

    it('1.4.6 - respects --repeat flag', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/basic.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'repeat-output.json');

      const { exitCode } = runCli([
        'eval',
        '-c',
        configPath,
        '--repeat',
        '2',
        '-o',
        outputPath,
        '--no-cache',
      ]);

      expect(exitCode).toBe(0);

      // Verify we got repeated results
      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      // With repeat=2 and 1 test case, we should have 2 results
      expect(parsed.results.results.length).toBe(2);
    });

    it('1.4.7 - runs with --verbose flag', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/basic.yaml');
      const { stdout, exitCode } = runCli(['eval', '-c', configPath, '--verbose', '--no-cache']);

      expect(exitCode).toBe(0);
      // Verbose mode should produce more output
      expect(stdout.length).toBeGreaterThan(0);
    });
  });

  describe('1.7 Exit Codes', () => {
    it('1.7.1 - returns exit code 0 when all assertions pass', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/basic.yaml');
      const { exitCode } = runCli(['eval', '-c', configPath, '--no-cache']);

      expect(exitCode).toBe(0);
    });

    it('1.7.2 - returns exit code 100 when assertions fail', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/failing-assertion.yaml');
      const { exitCode } = runCli(['eval', '-c', configPath, '--no-cache']);

      // Exit code 100 indicates test failures
      expect(exitCode).toBe(100);
    });

    it('1.7.3 - returns exit code 1 for config errors', () => {
      const { exitCode } = runCli(['eval', '-c', 'nonexistent-file.yaml', '--no-cache']);

      expect(exitCode).toBe(1);
    });
  });

  describe('Built-in Providers', () => {
    it('3.1.1 - echo provider works correctly', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/basic.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'echo-test.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      // Verify echo provider returns the prompt
      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      const firstResult = parsed.results.results[0];

      // Echo provider should return the prompt in the response
      expect(firstResult.response.output).toContain('Hello');
      expect(firstResult.response.output).toContain('World');
    });
  });
});
