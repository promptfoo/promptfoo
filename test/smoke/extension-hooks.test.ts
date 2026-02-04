/**
 * Smoke tests for extension hook logger support.
 *
 * These tests verify that:
 * - JS extension hooks receive context.logger
 * - Python extension hooks receive context['logger'] and can use direct import
 * - Mixed JS + Python hooks work together
 * - Legacy calling convention hooks receive logger in context
 * - Python structured log messages are routed to correct log levels
 * - Evals complete successfully with hook extensions
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
const OUTPUT_DIR = path.resolve(__dirname, '.temp-output-extension-hooks');

/**
 * Check if Python 3 is available on the system.
 * Checks PROMPTFOO_PYTHON env, then python3, python, and py (Windows launcher).
 */
function isPythonAvailable(): boolean {
  const candidates: Array<string | [string, string[]]> = ['python3', 'python'];
  if (process.platform === 'win32') {
    // Try `py -3` first (explicit Python 3), then bare `py`
    candidates.push(['py', ['-3', '--version']], 'py');
  }
  // Prefer the user-configured Python path if set
  const envPython = process.env.PROMPTFOO_PYTHON;
  if (envPython) {
    candidates.unshift(envPython);
  }
  for (const entry of candidates) {
    try {
      const [cmd, args] = Array.isArray(entry) ? entry : [entry, ['--version']];
      const result = spawnSync(cmd, args, { encoding: 'utf-8', timeout: 5000 });
      if (result.status === 0 && (result.stdout + result.stderr).includes('Python 3')) {
        return true;
      }
    } catch {
      // try next
    }
  }
  return false;
}

/**
 * Helper to run the CLI and capture output.
 */
function runCli(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    cwd: options.cwd || ROOT_DIR,
    encoding: 'utf-8',
    env: { ...process.env, LOG_LEVEL: 'info', ...options.env, NO_COLOR: '1' },
    timeout: 60000,
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

describe('Extension Hook Logger Smoke Tests', () => {
  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(`Built CLI not found at ${CLI_PATH}. Run 'npm run build' first.`);
    }
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  describe('JS extension hooks with logger', () => {
    it('completes eval with JS hooks using context.logger', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/extension-hook-js-logger.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'js-hooks-output.json');

      const { stdout, stderr, exitCode } = runCli([
        'eval',
        '-c',
        configPath,
        '-o',
        outputPath,
        '--no-cache',
      ]);

      expect(exitCode).toBe(0);

      // Verify eval results are correct
      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.results.results[0].success).toBe(true);
      expect(parsed.results.results[0].response.output).toContain('World');

      // Verify JS logger messages appear in stdout (info level)
      const combined = stdout + stderr;
      expect(combined).toContain('js-beforeAll-context-logger');
      expect(combined).toContain('js-beforeEach-test');
      expect(combined).toContain('js-afterEach-result');
      expect(combined).toContain('js-afterAll-complete');
    });
  });

  describe.skipIf(!isPythonAvailable())('Python extension hooks with logger', () => {
    it('completes eval with Python hooks using context logger and direct import', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/extension-hook-py-logger.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'py-hooks-output.json');

      const { stdout, stderr, exitCode } = runCli([
        'eval',
        '-c',
        configPath,
        '-o',
        outputPath,
        '--no-cache',
      ]);

      expect(exitCode).toBe(0);

      // Verify eval results are correct
      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.results.results[0].success).toBe(true);
      expect(parsed.results.results[0].response.output).toContain('World');

      // Verify Python logger messages are routed with [Python] prefix
      const combined = stdout + stderr;
      expect(combined).toContain('[Python] py-beforeAll-context-logger');
      expect(combined).toContain('[Python] py-beforeAll-direct-import');
      expect(combined).toContain('[Python] py-beforeEach-test');
      expect(combined).toContain('[Python] py-afterEach-result');
      expect(combined).toContain('[Python] py-afterAll-complete');
    });

    it('routes Python warn-level messages correctly', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/extension-hook-py-logger.yaml');

      const { stdout, stderr, exitCode } = runCli(['eval', '-c', configPath, '--no-cache']);

      expect(exitCode).toBe(0);

      // Warn messages should appear in output
      const combined = stdout + stderr;
      expect(combined).toContain('[Python] py-beforeAll-warn-msg');
    });

    it('shows Python debug messages only with LOG_LEVEL=debug', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/extension-hook-py-logger.yaml');

      // Without debug level - debug messages should NOT appear
      const normalRun = runCli(['eval', '-c', configPath, '--no-cache']);
      expect(normalRun.exitCode).toBe(0);
      const normalCombined = normalRun.stdout + normalRun.stderr;
      expect(normalCombined).not.toContain('py-beforeAll-debug-msg');

      // With debug level - debug messages SHOULD appear
      const debugRun = runCli(['eval', '-c', configPath, '--no-cache'], {
        env: { LOG_LEVEL: 'debug' },
      });
      expect(debugRun.exitCode).toBe(0);
      const debugCombined = debugRun.stdout + debugRun.stderr;
      expect(debugCombined).toContain('py-beforeAll-debug-msg');
    });

    it('includes structured data in Python log messages', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/extension-hook-py-logger.yaml');

      const { stdout, stderr, exitCode } = runCli(['eval', '-c', configPath, '--no-cache']);

      expect(exitCode).toBe(0);

      // Structured data should be included in log output
      const combined = stdout + stderr;
      expect(combined).toContain('"source":"context"');
    });
  });

  describe.skipIf(!isPythonAvailable())('Mixed JS + Python extension hooks', () => {
    it('completes eval with both JS and Python hooks', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/extension-hook-mixed-logger.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'mixed-hooks-output.json');

      const { stdout, stderr, exitCode } = runCli([
        'eval',
        '-c',
        configPath,
        '-o',
        outputPath,
        '--no-cache',
      ]);

      expect(exitCode).toBe(0);

      // Verify all test results pass
      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.results.results).toHaveLength(2);
      expect(parsed.results.results.every((r: { success: boolean }) => r.success)).toBe(true);

      // Verify both Python and JS hooks logged
      const combined = stdout + stderr;
      expect(combined).toContain('[Python] py-beforeAll-context-logger');
      expect(combined).toContain('js-beforeEach-test');
      expect(combined).toContain('js-afterEach-result');
      expect(combined).toContain('[Python] py-afterAll-complete');
    });

    it('Python afterAll receives correct result count in mixed mode', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/extension-hook-mixed-logger.yaml');

      const { stdout, stderr, exitCode } = runCli(['eval', '-c', configPath, '--no-cache']);

      expect(exitCode).toBe(0);

      // afterAll should report 2 results
      const combined = stdout + stderr;
      expect(combined).toContain('"resultCount":2');
    });
  });

  describe('Legacy calling convention', () => {
    it('completes eval with legacy hook receiving logger in context', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/extension-hook-legacy-logger.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'legacy-hooks-output.json');

      const { stdout, stderr, exitCode } = runCli([
        'eval',
        '-c',
        configPath,
        '-o',
        outputPath,
        '--no-cache',
      ]);

      expect(exitCode).toBe(0);

      // Verify eval results
      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.results.results[0].success).toBe(true);

      // Legacy hook should log for all hook phases
      const combined = stdout + stderr;
      expect(combined).toContain('js-legacy-beforeAll');
      expect(combined).toContain('js-legacy-beforeEach');
      expect(combined).toContain('js-legacy-afterEach');
      expect(combined).toContain('js-legacy-afterAll');
    });
  });
});
