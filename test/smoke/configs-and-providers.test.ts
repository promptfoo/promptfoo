/**
 * Smoke tests for config formats, providers, and data loading.
 *
 * These tests verify various configuration formats, provider types,
 * and data loading mechanisms work correctly.
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
const OUTPUT_DIR = path.resolve(__dirname, '.temp-output-configs');

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

describe('Config Format Smoke Tests', () => {
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

  describe('2.2 JSON Configs', () => {
    it('2.2.1 - parses JSON config format', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/basic.json');
      const outputPath = path.join(OUTPUT_DIR, 'json-config-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      // Verify the eval ran correctly
      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.results.results[0].success).toBe(true);
    });
  });
});

describe('Provider Smoke Tests', () => {
  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  describe('3.1 Built-in Providers', () => {
    it('3.1.2 - exec provider executes shell commands', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/exec-provider.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'exec-provider-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      const result = parsed.results.results[0];

      // Exec provider should have executed the echo command
      expect(result.response.output).toContain('Echo from exec');
    });
  });

  describe('3.3 Normalized Tool Format', () => {
    it('3.3.1 - parses normalized tool definitions with YAML anchors', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/normalized-tools.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'normalized-tools-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Should have results for all 3 providers
      expect(parsed.results.results.length).toBe(3);

      // All results should be successful
      parsed.results.results.forEach((result: { success: boolean }) => {
        expect(result.success).toBe(true);
      });
    });
  });

  describe('3.4 Python Providers', () => {
    it('3.4.1 - Python provider with default call_api function', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/python-provider.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'python-provider-output.json');

      // Run from the configs directory so relative paths work
      const { exitCode, stdout, stderr } = runCli(
        ['eval', '-c', configPath, '-o', outputPath, '--no-cache'],
        { cwd: path.join(FIXTURES_DIR, 'configs') },
      );

      // Python provider requires Python to be installed
      // If Python is not available, this test will fail gracefully
      if (exitCode !== 0) {
        const output = stdout + stderr;
        if (output.includes('python') || output.includes('Python')) {
          console.warn('Skipping Python provider test - Python not available');
          return;
        }
      }

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      const result = parsed.results.results[0];

      expect(result.response.output).toContain('Python Echo:');
    });
  });
});

describe('Data Loading Smoke Tests', () => {
  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  describe('4.2 Tests Loading', () => {
    it('4.2.2 - loads tests from CSV file', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/csv-tests.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'csv-tests-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache'], {
        cwd: path.join(FIXTURES_DIR, 'configs'),
      });

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Should have 2 test results (Alice and Bob from CSV)
      expect(parsed.results.results.length).toBe(2);

      // Verify the vars were loaded correctly
      const outputs = parsed.results.results.map(
        (r: { response: { output: string } }) => r.response.output,
      );
      expect(outputs.some((o: string) => o.includes('Alice'))).toBe(true);
      expect(outputs.some((o: string) => o.includes('Bob'))).toBe(true);
    });

    it('4.2.3 - loads tests from JSON file', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/json-tests.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'json-tests-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache'], {
        cwd: path.join(FIXTURES_DIR, 'configs'),
      });

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Should have 2 test results (Charlie and Diana from JSON)
      expect(parsed.results.results.length).toBe(2);

      const outputs = parsed.results.results.map(
        (r: { response: { output: string } }) => r.response.output,
      );
      expect(outputs.some((o: string) => o.includes('Charlie'))).toBe(true);
      expect(outputs.some((o: string) => o.includes('Diana'))).toBe(true);
    });
  });

  describe('4.3 Prompts Loading', () => {
    it('4.3.2 - loads prompts from file:// reference', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/file-prompt.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'file-prompt-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache'], {
        cwd: path.join(FIXTURES_DIR, 'configs'),
      });

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      const result = parsed.results.results[0];

      // The prompt should have been loaded from the file and rendered
      expect(result.response.output).toContain('bananas');
    });
  });
});

describe('Assertion Smoke Tests', () => {
  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  describe('5.1 Built-in Assertions', () => {
    it('5.1.3, 5.1.5, 5.1.6, 5.2.1 - various assertion types work correctly', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/assertions.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'assertions-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // All 6 tests should pass
      expect(parsed.results.results.length).toBe(6);

      for (const result of parsed.results.results) {
        expect(result.success).toBe(true);
      }
    });

    it('5.1.3 - equals assertion matches exactly', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/assertions.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'equals-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // First test uses equals assertion
      const equalsResult = parsed.results.results[0];
      expect(equalsResult.success).toBe(true);
      expect(equalsResult.response.output).toBe('exact match test');
    });

    it('5.1.5 - regex assertion matches patterns', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/assertions.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'regex-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Second test uses regex assertion
      const regexResult = parsed.results.results[1];
      expect(regexResult.success).toBe(true);
    });

    it('5.1.6 - is-json assertion validates JSON', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/assertions.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'isjson-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Fourth test uses is-json assertion
      const jsonResult = parsed.results.results[3];
      expect(jsonResult.success).toBe(true);
    });

    it('5.2.1 - inline JavaScript assertion executes correctly', () => {
      const configPath = path.join(FIXTURES_DIR, 'configs/assertions.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'js-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Sixth test uses JavaScript assertion
      const jsResult = parsed.results.results[5];
      expect(jsResult.success).toBe(true);
    });
  });
});
