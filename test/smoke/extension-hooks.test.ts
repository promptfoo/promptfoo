/**
 * Smoke tests for extension hooks.
 *
 * Verifies that a Python extension hook returning its context does not break
 * function-based prompts — the hook's subprocess JSON round-trip used to drop
 * the non-serializable prompt function, sending raw Python source to the
 * provider instead (regression test for
 * https://github.com/promptfoo/promptfoo/issues/9653).
 *
 * Also verifies extension hook logger support:
 * - JS extension hooks receive context.logger
 * - Python extension hooks receive context['logger'] and can use direct import
 * - Mixed JS + Python hooks work together
 * - Legacy calling convention hooks receive logger in context
 * - Python structured log messages are routed to correct log levels
 * - Evals complete successfully with hook extensions
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

function findPythonPath(): string | undefined {
  const candidates: Array<[string, string[]]> = [];
  if (process.env.PROMPTFOO_PYTHON) {
    candidates.push([process.env.PROMPTFOO_PYTHON, ['-c', 'import sys; print(sys.executable)']]);
  }
  if (process.platform === 'win32') {
    candidates.push(['py', ['-3', '-c', 'import sys; print(sys.executable)']]);
  }
  candidates.push(
    ['python3', ['-c', 'import sys; print(sys.executable)']],
    ['python', ['-c', 'import sys; print(sys.executable)']],
  );

  for (const [command, args] of candidates) {
    const result = spawnSync(command, args, { encoding: 'utf-8', timeout: 5000 });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  }
  return undefined;
}

const PYTHON_PATH = findPythonPath();
const pythonAvailable = PYTHON_PATH !== undefined;

describe('Extension Hook Smoke Tests', () => {
  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(`Built CLI not found at ${CLI_PATH}. Run 'npm run build' first.`);
    }
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  });

  it.skipIf(!PYTHON_PATH)(
    'executes a Python prompt function when a Python extension hook returns its context (issue #9653)',
    () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/python-prompt-with-extension.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'python-prompt-with-extension-output.json');

      const { exitCode } = runCli(
        [
          'eval',
          '-c',
          configPath,
          '-o',
          outputPath,
          '--no-cache',
          '--no-share',
          '--no-table',
          '--no-progress-bar',
        ],
        {
          cwd: path.join(FIXTURES_DIR, 'configs'),
          env: {
            PROMPTFOO_CONFIG_DIR: OUTPUT_DIR,
            PROMPTFOO_PYTHON: PYTHON_PATH,
            PROMPTFOO_DISABLE_SHARING: 'true',
            PROMPTFOO_DISABLE_TELEMETRY: 'true',
            PROMPTFOO_DISABLE_UPDATE: 'true',
          },
        },
      );

      expect(exitCode).toBe(0);

      const parsed = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      const result = parsed.results.results[0];

      // The executed prompt function produces chat messages. If the hook's JSON
      // round-trip had dropped the function, the raw Python source would have
      // been rendered into the prompt instead.
      expect(result.prompt.raw).toContain('What is Linear Algebra?');
      expect(result.prompt.raw).not.toContain('def create_prompt');
    },
  );
});

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

  describe('Python extension hooks with logger', () => {
    it('completes eval with Python hooks using context logger and direct import', () => {
      if (!pythonAvailable) {
        return;
      }

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
      if (!pythonAvailable) {
        return;
      }

      const configPath = path.join(FIXTURES_DIR, 'configs/extension-hook-py-logger.yaml');

      const { stdout, stderr, exitCode } = runCli(['eval', '-c', configPath, '--no-cache']);

      expect(exitCode).toBe(0);

      // Warn messages should appear in output
      const combined = stdout + stderr;
      expect(combined).toContain('[Python] py-beforeAll-warn-msg');
    });

    it('shows Python debug messages only with LOG_LEVEL=debug', () => {
      if (!pythonAvailable) {
        return;
      }

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
      if (!pythonAvailable) {
        return;
      }

      const configPath = path.join(FIXTURES_DIR, 'configs/extension-hook-py-logger.yaml');

      const { stdout, stderr, exitCode } = runCli(['eval', '-c', configPath, '--no-cache']);

      expect(exitCode).toBe(0);

      // Structured data should be included in log output
      const combined = stdout + stderr;
      expect(combined).toContain('"source":"context"');
    });
  });

  describe('Mixed JS + Python extension hooks', () => {
    it('completes eval with both JS and Python hooks', () => {
      if (!pythonAvailable) {
        return;
      }

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
      if (!pythonAvailable) {
        return;
      }

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
