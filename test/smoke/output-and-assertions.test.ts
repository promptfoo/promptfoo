/**
 * Smoke tests for output formats and assertion variants.
 *
 * These tests verify:
 * - Additional assertion types (contains-all, contains-any, levenshtein, cost, latency, json-schema)
 * - Provider labels in output
 * - Inline JavaScript assertions
 * - YAML anchors/aliases
 * - JSON chat format prompts
 * - Repeat flag with count verification
 * - Verbose flag behavior
 * - YAML output format
 * - Description in JSON output
 * - Max concurrency flag
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
const OUTPUT_DIR = path.resolve(__dirname, '.temp-output-assertions');

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

describe('Output and Assertion Variants Smoke Tests', () => {
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

  describe('5.1.8 contains-all Assertion', () => {
    it('5.1.8 - contains-all requires all values present', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/contains-all-assertion.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'contains-all-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.results.results[0].success).toBe(true);
    });
  });

  describe('5.1.9 contains-any Assertion', () => {
    it('5.1.9 - contains-any requires at least one value present', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/contains-any-assertion.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'contains-any-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.results.results[0].success).toBe(true);
    });
  });

  describe('5.1.10 levenshtein Assertion', () => {
    it('5.1.10 - levenshtein checks edit distance', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/levenshtein-assertion.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'levenshtein-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.results.results[0].success).toBe(true);
    });
  });

  describe('5.1.11 cost Assertion', () => {
    it('5.1.11 - cost assertion checks cost threshold', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/cost-assertion.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'cost-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.results.results[0].success).toBe(true);
    });
  });

  describe('5.1.12 latency Assertion', () => {
    it('5.1.12 - latency assertion checks response time', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/latency-assertion.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'latency-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.results.results[0].success).toBe(true);
    });
  });

  describe('5.1.7b contains-json with JSON Schema', () => {
    it('5.1.7b - contains-json validates against JSON Schema', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/json-schema-assertion.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'json-schema-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.results.results[0].success).toBe(true);
      // Should have 2 assertions (is-json and contains-json with schema)
      expect(parsed.results.results[0].gradingResult.componentResults.length).toBe(2);
    });
  });

  describe('5.2.1b Inline JavaScript Assertion', () => {
    it('5.2.1b - inline JavaScript expression evaluates correctly', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/inline-js-assertion.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'inline-js-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.results.results[0].success).toBe(true);
    });
  });

  describe('7.1.2 Provider Label', () => {
    it('7.1.2 - provider label appears in output', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/provider-label.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'provider-label-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Check that the custom label appears in the output
      expect(parsed.results.prompts[0].provider).toContain('My Custom Echo Provider');
    });
  });

  describe('2.1.2 YAML Anchors', () => {
    it('2.1.2 - YAML anchors and aliases work correctly', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/yaml-anchors.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'yaml-anchors-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Should have 2 test results (Alice and Bob)
      expect(parsed.results.results.length).toBe(2);
      // Both should pass
      expect(parsed.results.results[0].success).toBe(true);
      expect(parsed.results.results[1].success).toBe(true);
    });
  });

  describe('4.3.5 JSON Chat Format Prompt', () => {
    it('4.3.5 - JSON chat format prompt loads correctly', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/json-prompt.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'json-prompt-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.results.results[0].success).toBe(true);
      // Verify the chat format was parsed (output should contain ChatTest)
      expect(parsed.results.results[0].response.output).toContain('ChatTest');
    });
  });

  describe('1.4.6b Repeat Flag Count', () => {
    it('1.4.6b - --repeat flag produces correct number of results', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/simple-repeat.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'repeat-count-output.json');

      const { exitCode } = runCli([
        'eval',
        '-c',
        configPath,
        '--repeat',
        '3',
        '-o',
        outputPath,
        '--no-cache',
      ]);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // With 1 test and repeat=3, should have 3 results
      expect(parsed.results.results.length).toBe(3);
    });
  });

  describe('1.4.7b Verbose Flag', () => {
    it('1.4.7b - --verbose produces additional output', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/basic.yaml');

      const { stdout, exitCode } = runCli(['eval', '-c', configPath, '--verbose', '--no-cache']);

      expect(exitCode).toBe(0);
      // Verbose mode should include configuration info or debug messages
      expect(stdout.length).toBeGreaterThan(100);
    });
  });

  describe('1.4.3b YAML Output', () => {
    it('1.4.3b - YAML output contains expected structure', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/basic.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'yaml-output.yaml');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);
      expect(fs.existsSync(outputPath)).toBe(true);

      const content = fs.readFileSync(outputPath, 'utf-8');
      // YAML output should contain results structure
      expect(content).toContain('results:');
      expect(content).toContain('success:');
    });
  });

  describe('1.11.1b Description in Output', () => {
    it('1.11.1b - description appears in JSON output', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/basic.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'description-output.json');

      const { exitCode } = runCli([
        'eval',
        '-c',
        configPath,
        '--description',
        'Test run description',
        '-o',
        outputPath,
        '--no-cache',
      ]);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Description should appear in config
      expect(parsed.config.description).toContain('Test run description');
    });
  });

  describe('1.4.5b Max Concurrency', () => {
    it('1.4.5b - --max-concurrency 1 runs tests sequentially', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/multi-test.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'max-concurrency-output.json');

      const { exitCode } = runCli([
        'eval',
        '-c',
        configPath,
        '--max-concurrency',
        '1',
        '-o',
        outputPath,
        '--no-cache',
      ]);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // All 5 tests should complete
      expect(parsed.results.results.length).toBe(5);
      // All should pass
      expect(parsed.results.stats.successes).toBe(5);
    });
  });
});
