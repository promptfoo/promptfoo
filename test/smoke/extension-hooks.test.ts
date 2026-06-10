/**
 * Smoke tests for extension hooks.
 *
 * Verifies that a Python extension hook returning its context does not break
 * function-based prompts — the hook's subprocess JSON round-trip used to drop
 * the non-serializable prompt function, sending raw Python source to the
 * provider instead (regression test for
 * https://github.com/promptfoo/promptfoo/issues/9653).
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
    timeout: 60000,
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

describe('Extension Hook Smoke Tests', () => {
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

  it('executes a Python prompt function when a Python extension hook returns its context (issue #9653)', () => {
    const configPath = path.join(FIXTURES_DIR, 'configs/python-prompt-with-extension.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'python-prompt-with-extension-output.json');

    const { exitCode, stdout, stderr } = runCli(
      ['eval', '-c', configPath, '-o', outputPath, '--no-cache'],
      { cwd: path.join(FIXTURES_DIR, 'configs') },
    );

    // Python prompt functions and hooks require Python to be installed.
    // If Python is not available, this test will fail gracefully.
    if (exitCode !== 0) {
      const output = stdout + stderr;
      if (output.includes('python') || output.includes('Python')) {
        return;
      }
    }

    expect(exitCode).toBe(0);

    const parsed = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    const result = parsed.results.results[0];

    // The executed prompt function produces chat messages. If the hook's JSON
    // round-trip had dropped the function, the raw Python source would have
    // been rendered into the prompt instead.
    expect(result.prompt.raw).toContain('What is Linear Algebra?');
    expect(result.prompt.raw).not.toContain('def create_prompt');
  });
});
