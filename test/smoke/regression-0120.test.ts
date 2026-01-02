/**
 * Regression tests for bugs fixed in 0.120.x releases.
 *
 * These tests verify that critical bugs from the ESM migration (0.120.0)
 * and subsequent patch releases don't regress.
 *
 * Bug categories tested:
 * - 10.1.x: ESM Module Loading (CJS fallback, require() resolution, process.mainModule)
 * - 10.2.x: Provider Path Resolution (relative paths from config directory)
 * - 10.3.x: Config Options (maxConcurrency from config file)
 * - 10.5.x: Language Providers (Go, Ruby wrapper fixes)
 * - 11.2.x: Parsing Issues (JSON chat messages)
 *
 * @see docs/plans/smoke-tests.md for the full bug documentation
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Path to the built CLI binary
const CLI_PATH = path.resolve(__dirname, '../../dist/src/main.js');
const ROOT_DIR = path.resolve(__dirname, '../..');
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
const OUTPUT_DIR = path.resolve(__dirname, '.temp-output-regression');

/**
 * Helper to run the CLI and capture output
 */
function runCli(
  args: string[],
  options: { cwd?: string; expectError?: boolean; env?: NodeJS.ProcessEnv; timeout?: number } = {},
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    cwd: options.cwd || ROOT_DIR,
    encoding: 'utf-8',
    env: { ...process.env, ...options.env, NO_COLOR: '1' },
    timeout: options.timeout || 60000,
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

/**
 * Check if Go is available on the system
 */
function isGoAvailable(): boolean {
  try {
    const result = spawnSync('go', ['version'], { encoding: 'utf-8', timeout: 5000 });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Check if Ruby is available on the system
 */
function isRubyAvailable(): boolean {
  try {
    const result = spawnSync('ruby', ['--version'], { encoding: 'utf-8', timeout: 5000 });
    return result.status === 0;
  } catch {
    return false;
  }
}

describe('0.120.x Regression Tests', () => {
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

  describe('10.1 ESM Module Loading', () => {
    describe('10.1.1 CJS module.exports Provider', () => {
      it('loads .js provider with module.exports syntax', () => {
        // Bug #6501: .js files with CJS syntax failed to load in 0.120.0
        const configPath = path.join(FIXTURES_DIR, 'configs/cjs-module-exports.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'cjs-module-exports-output.json');

        const { exitCode, stderr } = runCli([
          'eval',
          '-c',
          configPath,
          '-o',
          outputPath,
          '--no-cache',
        ]);

        expect(exitCode).toBe(0);
        expect(stderr).not.toContain('Cannot find module');
        expect(stderr).not.toContain('is not a constructor');

        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        expect(parsed.results.results[0].success).toBe(true);
        expect(parsed.results.results[0].response.output).toContain('CJS Echo:');
      });
    });

    describe('10.1.2 CJS Provider with require()', () => {
      it('allows require() calls in provider code', () => {
        // Bug #6468: require() resolution was broken in 0.120.0
        const configPath = path.join(FIXTURES_DIR, 'configs/cjs-with-require.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'cjs-with-require-output.json');

        const { exitCode, stderr } = runCli([
          'eval',
          '-c',
          configPath,
          '-o',
          outputPath,
          '--no-cache',
        ]);

        expect(exitCode).toBe(0);
        expect(stderr).not.toContain('require is not defined');
        expect(stderr).not.toContain('Cannot find module');

        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        expect(parsed.results.results[0].success).toBe(true);
        expect(parsed.results.results[0].response.output).toContain('Require Test:');
        expect(parsed.results.results[0].response.output).toContain('platform=');
      });
    });

    describe('10.1.3 Inline JS with process Access', () => {
      it('provides process object in inline JavaScript assertions', () => {
        // Bug #6606: process.mainModule.require broke in 0.120.0
        const configPath = path.join(FIXTURES_DIR, 'configs/inline-js-process.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'inline-js-process-output.json');

        const { exitCode, stderr } = runCli([
          'eval',
          '-c',
          configPath,
          '-o',
          outputPath,
          '--no-cache',
        ]);

        expect(exitCode).toBe(0);
        expect(stderr).not.toContain('process is not defined');

        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        expect(parsed.results.results[0].success).toBe(true);
      });
    });
  });

  describe('10.2 Provider Path Resolution', () => {
    describe('10.2.1 Relative Path from Config Directory', () => {
      it('resolves provider paths relative to config file, not CWD', () => {
        // Bug #6503: Provider paths resolved from CWD instead of config directory
        // Run from ROOT_DIR but config is in fixtures/subdir/
        const configPath = path.join(FIXTURES_DIR, 'subdir/config-relative-provider.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'relative-provider-output.json');

        // Run from the root directory (different from config location)
        const { exitCode, stderr } = runCli(
          ['eval', '-c', configPath, '-o', outputPath, '--no-cache'],
          { cwd: ROOT_DIR },
        );

        expect(exitCode).toBe(0);
        expect(stderr).not.toContain('Cannot find module');
        expect(stderr).not.toContain('ENOENT');

        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        expect(parsed.results.results[0].success).toBe(true);
        expect(parsed.results.results[0].response.output).toContain('Subdir Provider:');
      });

      it('resolves provider paths when running from different directory', () => {
        // Additional test: run from a completely different directory
        const configPath = path.join(FIXTURES_DIR, 'subdir/config-relative-provider.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'relative-provider-diff-dir-output.json');

        // Run from the test directory itself
        const { exitCode, stderr } = runCli(
          ['eval', '-c', configPath, '-o', outputPath, '--no-cache'],
          { cwd: __dirname },
        );

        expect(exitCode).toBe(0);
        expect(stderr).not.toContain('Cannot find module');

        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        expect(parsed.results.results[0].success).toBe(true);
      });
    });
  });

  describe('10.3 Cache & Config Options', () => {
    describe('10.3.2 maxConcurrency from Config File', () => {
      it('respects maxConcurrency setting in config.yaml', () => {
        // Bug #6526: maxConcurrency from config file was ignored in 0.120.0
        const configPath = path.join(FIXTURES_DIR, 'configs/max-concurrency-config.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'max-concurrency-output.json');

        const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

        expect(exitCode).toBe(0);

        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        // All 3 tests should complete successfully
        expect(parsed.results.results.length).toBe(3);
        expect(parsed.results.stats.successes).toBe(3);

        // Note: We can't easily verify sequential execution in a smoke test,
        // but we verify the config loads and tests run correctly
      });
    });
  });

  describe('10.5 Language Providers', () => {
    describe('10.5.1 Go Provider', () => {
      it.skipIf(!isGoAvailable())('loads and executes Go provider', () => {
        // Bug #6506: Go provider wrapper failed in 0.120.0
        const configPath = path.join(FIXTURES_DIR, 'configs/go-provider.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'go-provider-output.json');

        const { exitCode, stderr } = runCli(
          ['eval', '-c', configPath, '-o', outputPath, '--no-cache'],
          { timeout: 120000 }, // Go compilation can be slow
        );

        expect(exitCode).toBe(0);
        expect(stderr).not.toContain('Error running Go');

        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        expect(parsed.results.results[0].success).toBe(true);
        expect(parsed.results.results[0].response.output).toContain('Go Echo:');
      });
    });

    describe('10.5.2 Ruby Provider', () => {
      it.skipIf(!isRubyAvailable())('loads and executes Ruby provider', () => {
        // Bug #6506: Ruby provider wrapper failed in 0.120.0
        const configPath = path.join(FIXTURES_DIR, 'configs/ruby-provider.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'ruby-provider-output.json');

        const { exitCode, stderr } = runCli([
          'eval',
          '-c',
          configPath,
          '-o',
          outputPath,
          '--no-cache',
        ]);

        expect(exitCode).toBe(0);
        expect(stderr).not.toContain('Error running Ruby');

        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        expect(parsed.results.results[0].success).toBe(true);
        expect(parsed.results.results[0].response.output).toContain('Ruby Echo:');
      });
    });
  });

  describe('11.2 Parsing Issues', () => {
    describe('11.2.1 JSON Chat Message Parsing', () => {
      it('correctly parses JSON array chat format prompts', () => {
        // Bug #6568: Incorrect parsing of JSON vs non-JSON chat messages
        const configPath = path.join(FIXTURES_DIR, 'configs/json-chat-format.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'json-chat-format-output.json');

        const { exitCode, stderr } = runCli([
          'eval',
          '-c',
          configPath,
          '-o',
          outputPath,
          '--no-cache',
        ]);

        expect(exitCode).toBe(0);
        expect(stderr).not.toContain('SyntaxError');
        expect(stderr).not.toContain('Unexpected token');

        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        expect(parsed.results.results[0].success).toBe(true);
        expect(parsed.results.results[0].response.output).toContain('ChatParseTest');
      });
    });
  });

  describe('10.4 CLI Issues', () => {
    describe('10.4.1 Eval Completion', () => {
      it('completes eval within reasonable time (no hanging)', () => {
        // Bug #6460: Eval command hung indefinitely in 0.120.0
        const configPath = path.join(FIXTURES_DIR, 'configs/basic.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'eval-completion-output.json');

        const startTime = Date.now();
        const { exitCode } = runCli(
          ['eval', '-c', configPath, '-o', outputPath, '--no-cache'],
          { timeout: 30000 }, // 30 second timeout
        );
        const duration = Date.now() - startTime;

        expect(exitCode).toBe(0);
        // Should complete well within the timeout
        expect(duration).toBeLessThan(25000);
      });
    });

    describe('10.4.3 Multiple Evals Without Logger Errors', () => {
      it('runs multiple evals in sequence without Winston errors', () => {
        // Bug #6511: Winston "write after end" errors during shutdown
        const configPath = path.join(FIXTURES_DIR, 'configs/basic.yaml');

        // Run 3 evals in sequence
        for (let i = 0; i < 3; i++) {
          const outputPath = path.join(OUTPUT_DIR, `multi-eval-${i}-output.json`);
          const { exitCode, stderr } = runCli([
            'eval',
            '-c',
            configPath,
            '-o',
            outputPath,
            '--no-cache',
          ]);

          expect(exitCode).toBe(0);
          expect(stderr).not.toContain('write after end');
          expect(stderr).not.toContain('Cannot call write after a stream was destroyed');
        }
      });
    });
  });
});
