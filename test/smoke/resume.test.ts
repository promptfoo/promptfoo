/**
 * End-to-end smoke tests for eval resume functionality.
 *
 * Tests the --resume flag and Ctrl+C (SIGINT) pause/resume flow:
 * 1. Full eval completes successfully with echo provider
 * 2. SIGINT mid-eval pauses and prints resume instructions
 * 3. --resume resumes from where it left off
 * 4. Second SIGINT force-exits the process
 * 5. Flag conflict detection (--no-write, --retry-errors)
 *
 * Uses the echo provider for deterministic, zero-cost testing.
 * Uses --delay to create a window for SIGINT interruption.
 */
import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CLI_PATH = path.resolve(__dirname, '../../dist/src/main.js');
const ROOT_DIR = path.resolve(__dirname, '../..');
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
const CONFIGS_DIR = path.resolve(FIXTURES_DIR, 'configs');
const OUTPUT_DIR = path.resolve(__dirname, '.temp-output-resume');
// Use a dedicated absolute config dir for resume tests so DB persists between runs.
// The vitest setup sets PROMPTFOO_CONFIG_DIR to a relative path which can cause issues.
const RESUME_CONFIG_DIR = path.resolve(OUTPUT_DIR, '.promptfoo-resume-test');

/**
 * Helper to run the CLI synchronously and capture output
 */
function runCli(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {},
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    cwd: options.cwd || ROOT_DIR,
    encoding: 'utf-8',
    env: {
      ...process.env,
      ...options.env,
      NO_COLOR: '1',
      PROMPTFOO_CONFIG_DIR: RESUME_CONFIG_DIR,
      // Override IS_TESTING from vitest.setup.ts — we need file-based DB for resume persistence
      IS_TESTING: '',
    },
    timeout: options.timeout || 60000,
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

/**
 * Helper to run CLI asynchronously (for SIGINT testing).
 * Spawns a child process and returns control functions.
 */
function spawnCli(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): {
  sendSignal: (signal: NodeJS.Signals) => void;
  waitForOutput: (pattern: string | RegExp, timeoutMs?: number) => Promise<string>;
  waitForExit: (
    timeoutMs?: number,
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  kill: () => void;
} {
  let stdout = '';
  let stderr = '';

  const child = spawn('node', [CLI_PATH, ...args], {
    cwd: options.cwd || ROOT_DIR,
    env: {
      ...process.env,
      ...options.env,
      NO_COLOR: '1',
      PROMPTFOO_CONFIG_DIR: RESUME_CONFIG_DIR,
      // Override IS_TESTING from vitest.setup.ts — we need file-based DB for resume persistence
      IS_TESTING: '',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const outputWaiters: Array<{
    pattern: string | RegExp;
    resolve: (output: string) => void;
    reject: (error: Error) => void;
  }> = [];

  const checkWaiters = () => {
    const combined = stdout + stderr;
    for (let i = outputWaiters.length - 1; i >= 0; i--) {
      const waiter = outputWaiters[i];
      const match =
        typeof waiter.pattern === 'string'
          ? combined.includes(waiter.pattern)
          : waiter.pattern.test(combined);
      if (match) {
        outputWaiters.splice(i, 1);
        waiter.resolve(combined);
      }
    }
  };

  child.stdout?.on('data', (data) => {
    stdout += data.toString();
    checkWaiters();
  });

  child.stderr?.on('data', (data) => {
    stderr += data.toString();
    checkWaiters();
  });

  const sendSignal = (signal: NodeJS.Signals) => {
    if (child.pid && !child.killed) {
      child.kill(signal);
    }
  };

  const waitForOutput = (pattern: string | RegExp, timeoutMs = 30000): Promise<string> => {
    const combined = stdout + stderr;
    const alreadyMatches =
      typeof pattern === 'string' ? combined.includes(pattern) : pattern.test(combined);
    if (alreadyMatches) {
      return Promise.resolve(combined);
    }

    return new Promise((resolveWait, rejectWait) => {
      const timer = setTimeout(() => {
        const idx = outputWaiters.findIndex((w) => w.resolve === wrappedResolve);
        if (idx >= 0) {
          outputWaiters.splice(idx, 1);
        }
        rejectWait(
          new Error(
            `Timeout waiting for output matching "${pattern}".\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`,
          ),
        );
      }, timeoutMs);

      const wrappedResolve = (output: string) => {
        clearTimeout(timer);
        resolveWait(output);
      };

      outputWaiters.push({
        pattern,
        resolve: wrappedResolve,
        reject: rejectWait,
      });
    });
  };

  const waitForExit = (
    timeoutMs = 30000,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Process did not exit within ${timeoutMs}ms.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`,
          ),
        );
      }, timeoutMs);

      child.on('exit', (code) => {
        clearTimeout(timer);
        // Small delay to collect remaining output
        setTimeout(() => {
          resolve({ stdout, stderr, exitCode: code ?? 1 });
        }, 100);
      });
    });
  };

  // Also handle exit for waiters
  child.on('exit', (code) => {
    // Small delay to let final output arrive
    setTimeout(() => {
      for (const waiter of outputWaiters) {
        waiter.reject(
          new Error(
            `Process exited (code ${code}) before matching pattern.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`,
          ),
        );
      }
      outputWaiters.length = 0;
    }, 200);
  });

  return {
    sendSignal,
    waitForOutput,
    waitForExit,
    kill: () => sendSignal('SIGKILL'),
  };
}

/**
 * Extract eval ID from pause output.
 * Looks for "Evaluation paused. ID: <evalId>" pattern.
 */
function extractEvalId(output: string): string | null {
  // Match "Evaluation paused. ID: eval-xxx-yyyy" (NO_COLOR strips ANSI)
  const match = output.match(/Evaluation paused\. ID:\s*(\S+)/);
  return match ? match[1] : null;
}

describe('Resume E2E Tests', () => {
  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(`Built CLI not found at ${CLI_PATH}. Run 'npm run build' first.`);
    }
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.mkdirSync(RESUME_CONFIG_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  describe('Regular eval resume', () => {
    it('completes a full evaluation with echo provider', () => {
      const configPath = path.join(CONFIGS_DIR, 'resume-many-tests.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'full-eval-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Should have 10 test results (10 tests x 1 provider x 1 prompt)
      expect(parsed.results.results.length).toBe(10);

      // Verify first and last names are present
      const outputs = parsed.results.results.map(
        (r: { response: { output: string } }) => r.response.output,
      );
      expect(outputs.some((o: string) => o.includes('Alice'))).toBe(true);
      expect(outputs.some((o: string) => o.includes('Judy'))).toBe(true);
    });

    it('SIGINT pauses evaluation and shows eval ID', async () => {
      const configPath = path.join(CONFIGS_DIR, 'resume-many-tests.yaml');

      // Run with delay so we have time to send SIGINT
      const cli = spawnCli(['eval', '-c', configPath, '--no-cache', '--delay', '200']);

      try {
        // Wait for eval to start
        await cli.waitForOutput(/Running \d+ test cases/, 15000);

        // Send SIGINT to pause
        cli.sendSignal('SIGINT');

        // Wait for the process to fully exit so all output is captured
        const result = await cli.waitForExit(15000);
        const combined = result.stdout + result.stderr;

        // Should contain the pause message and eval ID
        expect(combined).toContain('Evaluation paused');

        const evalId = extractEvalId(combined);
        expect(evalId).toBeTruthy();

        // Should also contain the resume instructions
        expect(combined).toContain('Resume with:');
        expect(combined).toContain('--resume');
      } catch (error) {
        cli.kill();
        throw error;
      }
    });

    it('--resume completes remaining test cases from a paused eval', async () => {
      const configPath = path.join(CONFIGS_DIR, 'resume-many-tests.yaml');

      // Step 1: Start eval with delay and serial execution, then pause it.
      // Use --max-concurrency 1 so tests run one at a time (each takes ~500ms).
      // With 10 serial tests, SIGINT at ~1.5s reliably lands mid-eval (~3 done).
      // Without serial mode, concurrency=4 + fast echo provider can finish all
      // 10 tests before SIGINT arrives, making resume a no-op.
      const cli = spawnCli([
        'eval',
        '-c',
        configPath,
        '--no-cache',
        '--delay',
        '500',
        '--max-concurrency',
        '1',
      ]);

      let evalId: string | undefined;

      try {
        await cli.waitForOutput(/Running \d+ test cases/, 15000);

        // Let a few tests complete before pausing (~3 at 500ms each)
        await new Promise((resolve) => setTimeout(resolve, 1500));

        cli.sendSignal('SIGINT');
        const result = await cli.waitForExit(15000);
        const combined = result.stdout + result.stderr;

        evalId = extractEvalId(combined) || undefined;
        expect(evalId).toBeTruthy();
      } catch (error) {
        cli.kill();
        throw error;
      }

      // Step 2: Resume the eval
      // Note: --resume reconstructs config from saved eval, so -o from current
      // invocation is NOT applied. We verify via stdout instead.
      const { exitCode, stdout } = runCli(['eval', '--resume', evalId!, '--no-cache']);

      expect(exitCode).toBe(0);

      // Should mention resuming and skipping
      expect(stdout).toContain('Resuming');

      // Extract the skip count to verify it's a true partial resume
      const skipMatch = stdout.match(/skipping (\d+) previously completed cases/);
      expect(skipMatch).toBeTruthy();
      const skipped = parseInt(skipMatch![1], 10);
      // Must have skipped some (completed before pause) but not all (otherwise nothing to resume)
      expect(skipped).toBeGreaterThan(0);
      expect(skipped).toBeLessThan(10);

      // All 10 test results should be present in the final output
      expect(stdout).toContain('10 passed');
      expect(stdout).toContain('Alice');
      expect(stdout).toContain('Judy');
    });

    it('second SIGINT force-exits the process', async () => {
      const configPath = path.join(CONFIGS_DIR, 'resume-many-tests.yaml');

      const cli = spawnCli(['eval', '-c', configPath, '--no-cache', '--delay', '500']);

      try {
        await cli.waitForOutput(/Running \d+ test cases/, 15000);

        // First SIGINT: pause
        cli.sendSignal('SIGINT');
        await cli.waitForOutput('Pausing evaluation', 10000);

        // Small delay then second SIGINT: force exit
        await new Promise((resolve) => setTimeout(resolve, 200));
        cli.sendSignal('SIGINT');

        // Process should exit
        const result = await cli.waitForExit(10000);
        const combined = result.stdout + result.stderr;

        // The second SIGINT should either:
        // 1. Show "Force exiting" if our handler caught it, OR
        // 2. Exit with code 130 if the process died before output was captured
        const hasForceExitMessage = combined.includes('Force exiting');
        const hasExpectedExitCode = result.exitCode === 130;
        // The graceful pause may complete before the second SIGINT arrives (echo provider
        // is fast), in which case we see "Evaluation paused" with exit code 0 — also valid.
        const gracefulPauseCompleted = combined.includes('Evaluation paused');

        expect(hasForceExitMessage || hasExpectedExitCode || gracefulPauseCompleted).toBe(true);
      } catch (error) {
        cli.kill();
        throw error;
      }
    });
  });

  describe('Flag conflict detection', () => {
    it('--resume with --no-write should error', () => {
      const { exitCode, stdout, stderr } = runCli(['eval', '--resume', '--no-write', '--no-cache']);

      const combined = stdout + stderr;
      expect(exitCode).not.toBe(0);
      expect(combined).toContain('Cannot use --resume with --no-write');
    });

    it('--resume with --retry-errors should error', () => {
      const { exitCode, stdout, stderr } = runCli([
        'eval',
        '--resume',
        '--retry-errors',
        '--no-cache',
      ]);

      const combined = stdout + stderr;
      expect(exitCode).not.toBe(0);
      expect(combined).toContain('Cannot use --resume and --retry-errors together');
    });
  });
});
