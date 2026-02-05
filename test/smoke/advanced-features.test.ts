/**
 * Smoke tests for advanced CLI features.
 *
 * These tests verify advanced evaluation features including:
 * - Environment file loading (--env-file)
 * - Delay between tests (--delay)
 * - HTML output format
 * - Config loading from separate files
 * - Multiple prompts (prompt comparison/A-B testing)
 * - icontains assertion (case-insensitive)
 * - regex assertion with end-of-string pattern
 * - Multiple file prompts (file:// references)
 * - Assertion weights
 * - Test threshold option
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
const OUTPUT_DIR = path.resolve(__dirname, '.temp-output-advanced');

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
    timeout: 60000,
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

describe('Advanced Features Smoke Tests', () => {
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

  describe('1.4.8 Environment File Loading', () => {
    it('1.4.8 - --env-file loads environment variables', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/env-var-test.yaml');
      const envFilePath = path.join(FIXTURES_DIR, 'data/test.env');
      const outputPath = path.join(OUTPUT_DIR, 'env-test-output.json');

      const { exitCode } = runCli([
        'eval',
        '-c',
        configPath,
        '--env-file',
        envFilePath,
        '-o',
        outputPath,
        '--no-cache',
      ]);

      expect(exitCode).toBe(0);

      // Verify the env vars were substituted in the output
      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      const output = parsed.results.results[0].response.output;

      // The env vars should be present in the echoed output
      expect(output).toContain('sk-test-12345');
      expect(output).toContain('super-secret-value');
    });
  });

  describe('1.10.1 Delay Between Tests', () => {
    it('1.10.1 - --delay adds delay between tests', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/delay-test.yaml');

      // Run with 100ms delay between 3 tests
      const startTime = Date.now();
      const { exitCode } = runCli(['eval', '-c', configPath, '--delay', '100', '--no-cache']);
      const endTime = Date.now();

      expect(exitCode).toBe(0);

      // With 3 tests and 100ms delay, total time should be at least 200ms (2 delays)
      // Being generous with timing to avoid flaky tests
      const elapsed = endTime - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(150); // At least some delay occurred
    });
  });

  describe('1.4.4b HTML Output Format', () => {
    it('1.4.4b - outputs HTML format', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/basic.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'output.html');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);
      expect(fs.existsSync(outputPath)).toBe(true);

      // Verify it's HTML content (lowercase doctype is valid HTML5)
      const content = fs.readFileSync(outputPath, 'utf-8');
      expect(content).toContain('<!doctype html>');
      expect(content).toContain('<html');
    });
  });

  describe('2.5 Config Loading', () => {
    it('2.5.1 - loads separate config file correctly', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/config-tests.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'config-load-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      // Verify the config loaded and ran correctly
      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      const output = parsed.results.results[0].response.output;

      expect(output).toContain('ConfigMergeTest');
    });
  });

  describe('4.3.1b Multiple Prompts', () => {
    it('4.3.1b - evaluates multiple prompts against same tests', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/multi-prompt.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'multi-prompt-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      // Verify we have results for all 3 prompts
      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Should have 3 prompts
      expect(parsed.results.prompts.length).toBe(3);

      // Should have 3 results (one test case x 3 prompts)
      expect(parsed.results.results.length).toBe(3);

      // Each prompt should produce different output
      const outputs = parsed.results.results.map(
        (r: { response: { output: string } }) => r.response.output,
      );
      expect(outputs.some((o: string) => o.includes('Hello'))).toBe(true);
      expect(outputs.some((o: string) => o.includes('Hi'))).toBe(true);
      expect(outputs.some((o: string) => o.includes('Hey'))).toBe(true);
    });
  });

  describe('5.1.2b icontains Assertion', () => {
    it('5.1.2b - icontains performs case-insensitive match', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/icontains-assertion.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'icontains-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      // All case-insensitive assertions should pass
      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.results.results[0].success).toBe(true);
      // Should have 3 assertions all passing
      expect(parsed.results.results[0].gradingResult.componentResults.length).toBe(3);
      expect(
        parsed.results.results[0].gradingResult.componentResults.every(
          (r: { pass: boolean }) => r.pass,
        ),
      ).toBe(true);
    });
  });

  describe('5.1.5b Regex End-of-String Pattern', () => {
    it('5.1.5b - regex with $ anchor checks string suffix', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/ends-with-assertion.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'regex-ends-with-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      // Both regex end-of-string assertions should pass
      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.results.results[0].success).toBe(true);
      expect(parsed.results.results[0].gradingResult.componentResults.length).toBe(2);
    });
  });

  describe('4.3.2b Multiple File Prompts', () => {
    it('4.3.2b - file:// references load multiple prompt files', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/glob-prompts.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'file-prompts-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      // Should load both prompt files from file:// references
      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Should have 2 prompts (greeting.txt and farewell.txt)
      expect(parsed.results.prompts.length).toBe(2);

      // Should have 2 results (1 test x 2 prompts)
      expect(parsed.results.results.length).toBe(2);

      // Verify both prompts were used
      const outputs = parsed.results.results.map(
        (r: { response: { output: string } }) => r.response.output,
      );
      expect(outputs.some((o: string) => o.includes('welcome'))).toBe(true);
      expect(outputs.some((o: string) => o.includes('see you'))).toBe(true);
    });
  });

  describe('5.3 Assertion Weights', () => {
    it('5.3.1 - assertion weights affect scoring', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/weighted-assertions.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'weighted-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      // Both assertions pass, so test passes
      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.results.results[0].success).toBe(true);
      // The weighted assertions should both pass
      expect(parsed.results.results[0].gradingResult.componentResults.length).toBe(2);
    });
  });

  describe('7.4 Test Threshold', () => {
    it('7.4.1 - test threshold allows partial assertion passes', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/test-threshold.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'threshold-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      // The test should pass because 2/3 assertions pass (66%) > threshold (50%)
      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Test should pass due to threshold
      expect(parsed.results.results[0].success).toBe(true);

      // Verify assertion results
      const componentResults = parsed.results.results[0].gradingResult.componentResults;
      expect(componentResults.length).toBe(3);

      // 2 should pass, 1 should fail
      const passCount = componentResults.filter((r: { pass: boolean }) => r.pass).length;
      const failCount = componentResults.filter((r: { pass: boolean }) => !r.pass).length;
      expect(passCount).toBe(2);
      expect(failCount).toBe(1);
    });
  });
});
