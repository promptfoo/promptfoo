/**
 * Smoke tests for and/or combinator assertions.
 *
 * These tests verify that combinator assertions work correctly end-to-end.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CLI_PATH = path.resolve(__dirname, '../../dist/src/main.js');
const ROOT_DIR = path.resolve(__dirname, '../..');
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/configs');
const OUTPUT_DIR = path.resolve(__dirname, '.temp-output-combinators');

function runCli(
  args: string[],
  options: { cwd?: string; expectError?: boolean } = {},
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    cwd: options.cwd || ROOT_DIR,
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' },
    timeout: 60000,
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

describe('Combinator Assertions Smoke Tests', () => {
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

  it('should handle OR combinator correctly', () => {
    const configPath = path.join(FIXTURES_DIR, 'combinator-or.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'or-output.json');

    // Note: Exit code 100 is expected because one test intentionally fails
    const { stderr } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

    // No internal errors, just expected test failures
    expect(stderr).not.toMatch(/Error:|Exception:|Traceback/i);

    const output = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(output.results.results.length).toBe(3);

    // First two tests should pass
    expect(output.results.results[0].success).toBe(true);
    expect(output.results.results[1].success).toBe(true);

    // Third test should fail (expected failure with _expect_fail: true)
    expect(output.results.results[2].success).toBe(false);
  });

  it('should handle AND combinator correctly', () => {
    const configPath = path.join(FIXTURES_DIR, 'combinator-and.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'and-output.json');

    // Note: Exit code 100 is expected because one test intentionally fails
    const { stderr } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

    // No internal errors, just expected test failures
    expect(stderr).not.toMatch(/Error:|Exception:|Traceback/i);

    const output = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(output.results.results.length).toBe(2);

    // First test should pass
    expect(output.results.results[0].success).toBe(true);

    // Second test should fail (expected failure with _expect_fail: true)
    expect(output.results.results[1].success).toBe(false);
  });

  it('should handle nested combinators correctly', () => {
    const configPath = path.join(FIXTURES_DIR, 'combinator-nested.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'nested-output.json');

    const { exitCode, stderr } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

    expect(exitCode).toBe(0);
    expect(stderr).not.toContain('Error');

    const output = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(output.results.results.length).toBe(3);

    // All tests should pass
    output.results.results.forEach((result: { success: boolean }) => {
      expect(result.success).toBe(true);
    });
  });
});
