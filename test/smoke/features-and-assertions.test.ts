/**
 * Smoke tests for additional assertions, transforms, and feature integration.
 *
 * Tests provider named functions, test generators, additional assertion types,
 * response transforms, and advanced config features.
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
const CONFIGS_DIR = path.resolve(FIXTURES_DIR, 'configs');
const OUTPUT_DIR = path.resolve(__dirname, '.temp-output-features');

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

describe('Named Function Provider Smoke Tests', () => {
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

  describe('5.1 Additional Assertions', () => {
    it('5.1.2 - not-contains assertion', () => {
      const configPath = path.join(CONFIGS_DIR, 'not-contains-assertion.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'not-contains-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache'], {
        cwd: CONFIGS_DIR,
      });

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.results.results[0].success).toBe(true);
    });
  });

  describe('3.4 Python Provider Named Functions', () => {
    it('3.4.2 - Python provider with named function', () => {
      const configPath = path.join(CONFIGS_DIR, 'provider-python-named.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'python-named-output.json');

      const { exitCode, stdout, stderr } = runCli(
        ['eval', '-c', configPath, '-o', outputPath, '--no-cache'],
        { cwd: CONFIGS_DIR },
      );

      // Python may not be available in all environments
      if (exitCode !== 0) {
        const output = stdout + stderr;
        if (
          output.toLowerCase().includes('python') &&
          (output.toLowerCase().includes('not found') ||
            output.toLowerCase().includes('no such file'))
        ) {
          console.warn('Skipping Python named function test - Python not available');
          return;
        }
      }

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.results.results[0].success).toBe(true);
      expect(parsed.results.results[0].response.output).toContain('Python Custom Echo:');
    });
  });
});

describe('Test Generator Smoke Tests', () => {
  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  describe('4.2 JavaScript Test Generator', () => {
    it('4.2.7 - loads tests from JavaScript generator file', () => {
      const configPath = path.join(CONFIGS_DIR, 'js-test-generator.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'js-generator-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache'], {
        cwd: CONFIGS_DIR,
      });

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Should have 3 test results from the generator
      expect(parsed.results.results.length).toBe(3);

      const outputs = parsed.results.results.map(
        (r: { response: { output: string } }) => r.response.output,
      );
      expect(outputs.some((o: string) => o.includes('Generated1'))).toBe(true);
      expect(outputs.some((o: string) => o.includes('Generated2'))).toBe(true);
      expect(outputs.some((o: string) => o.includes('Generated3'))).toBe(true);
    });
  });
});

describe('Additional Assertion Smoke Tests', () => {
  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  describe('5.1 Built-in Assertions', () => {
    it('5.1.1 - contains assertion', () => {
      const configPath = path.join(CONFIGS_DIR, 'contains-assertion.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'contains-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache'], {
        cwd: CONFIGS_DIR,
      });

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.results.results[0].success).toBe(true);
    });

    it('5.1.4 - starts-with assertion', () => {
      const configPath = path.join(CONFIGS_DIR, 'starts-with-assertion.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'starts-with-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache'], {
        cwd: CONFIGS_DIR,
      });

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.results.results[0].success).toBe(true);
    });

    it('5.1.7 - contains-json assertion', () => {
      const configPath = path.join(CONFIGS_DIR, 'contains-json-assertion.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'contains-json-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache'], {
        cwd: CONFIGS_DIR,
      });

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.results.results[0].success).toBe(true);
    });
  });
});

describe('Transform Smoke Tests', () => {
  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  describe('6.1 Response Transforms', () => {
    it('6.1.1 - transform response expression', () => {
      const configPath = path.join(CONFIGS_DIR, 'transform-response.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'transform-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache'], {
        cwd: CONFIGS_DIR,
      });

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.results.results[0].success).toBe(true);
    });
  });
});

describe('Feature Integration Smoke Tests', () => {
  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  describe('7.1 Provider Config Options', () => {
    it('7.1.1 - provider with config options', () => {
      const configPath = path.join(CONFIGS_DIR, 'provider-with-config.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'provider-config-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache'], {
        cwd: CONFIGS_DIR,
      });

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.results.results[0].success).toBe(true);
      // Check that the provider label is used
      expect(parsed.results.prompts[0].provider).toBe('Custom Echo Provider');
    });
  });

  describe('7.2 DefaultTest', () => {
    it('7.2.1 - defaultTest applies assertions to all tests', () => {
      const configPath = path.join(CONFIGS_DIR, 'default-test.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'default-test-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache'], {
        cwd: CONFIGS_DIR,
      });

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // All 3 tests should pass with the defaultTest assertion
      expect(parsed.results.results.length).toBe(3);
      expect(parsed.results.results.every((r: { success: boolean }) => r.success)).toBe(true);
    });
  });

  describe('7.3 Scenarios', () => {
    it('7.3.1 - scenarios feature loads and runs correctly', () => {
      const configPath = path.join(CONFIGS_DIR, 'scenarios.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'scenarios-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache'], {
        cwd: CONFIGS_DIR,
      });

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Should have 3 tests total (2 from US scenario + 1 from EU scenario)
      expect(parsed.results.results.length).toBe(3);
      expect(parsed.results.results.every((r: { success: boolean }) => r.success)).toBe(true);

      // Verify scenarios data
      const outputs = parsed.results.results.map(
        (r: { response: { output: string } }) => r.response.output,
      );
      expect(outputs.some((o: string) => o.includes('New York'))).toBe(true);
      expect(outputs.some((o: string) => o.includes('California'))).toBe(true);
      expect(outputs.some((o: string) => o.includes('Paris'))).toBe(true);
    });
  });
});
