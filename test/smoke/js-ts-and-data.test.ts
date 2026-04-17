/**
 * Smoke tests for JS/TS configs, providers, data loading, and script assertions.
 *
 * Tests JavaScript/TypeScript configuration files, custom providers,
 * various data loading formats, and script-based assertions.
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
const OUTPUT_DIR = path.resolve(__dirname, '.temp-output-jsts');

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

describe('JavaScript/TypeScript Config Smoke Tests', () => {
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

  describe('2.3 JavaScript Configs', () => {
    it('2.3.1 - CJS config with module.exports object', () => {
      const configPath = path.join(CONFIGS_DIR, 'config-cjs.cjs');
      const outputPath = path.join(OUTPUT_DIR, 'cjs-config-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.results.results[0].success).toBe(true);
      expect(parsed.results.results[0].response.output).toContain('CJS');
    });

    it('2.3.5 - ESM config with export default', () => {
      const configPath = path.join(CONFIGS_DIR, 'config-esm.mjs');
      const outputPath = path.join(OUTPUT_DIR, 'esm-config-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.results.results[0].success).toBe(true);
      expect(parsed.results.results[0].response.output).toContain('ESM');
    });
  });

  describe('2.4 TypeScript Configs', () => {
    it('2.4.1 - TypeScript config with export default', () => {
      const configPath = path.join(CONFIGS_DIR, 'config-ts.ts');
      const outputPath = path.join(OUTPUT_DIR, 'ts-config-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.results.results[0].success).toBe(true);
      expect(parsed.results.results[0].response.output).toContain('TypeScript');
    });
  });
});

describe('JavaScript/TypeScript Provider Smoke Tests', () => {
  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  describe('3.2 JavaScript Providers', () => {
    it('3.2.1 - CJS provider class with module.exports', () => {
      const configPath = path.join(CONFIGS_DIR, 'provider-cjs.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'cjs-provider-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache'], {
        cwd: CONFIGS_DIR,
      });

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.results.results[0].success).toBe(true);
      expect(parsed.results.results[0].response.output).toContain('CJS Echo:');
    });

    it('3.2.4 - ESM provider class with export default', () => {
      const configPath = path.join(CONFIGS_DIR, 'provider-esm.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'esm-provider-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache'], {
        cwd: CONFIGS_DIR,
      });

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.results.results[0].success).toBe(true);
      expect(parsed.results.results[0].response.output).toContain('ESM Echo:');
    });
  });

  describe('3.3 TypeScript Providers', () => {
    it('3.3.1 - TypeScript provider class with export default', () => {
      const configPath = path.join(CONFIGS_DIR, 'provider-ts.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'ts-provider-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache'], {
        cwd: CONFIGS_DIR,
      });

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.results.results[0].success).toBe(true);
      expect(parsed.results.results[0].response.output).toContain('TypeScript Echo:');
    });
  });
});

describe('Data Loading Format Smoke Tests', () => {
  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  describe('4.2 Tests Loading', () => {
    it('4.2.4 - loads tests from JSONL file', () => {
      const configPath = path.join(CONFIGS_DIR, 'jsonl-tests.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'jsonl-tests-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache'], {
        cwd: CONFIGS_DIR,
      });

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Should have 3 test results (Eve, Frank, Grace from JSONL)
      expect(parsed.results.results.length).toBe(3);

      const outputs = parsed.results.results.map(
        (r: { response: { output: string } }) => r.response.output,
      );
      expect(outputs.some((o: string) => o.includes('Eve'))).toBe(true);
      expect(outputs.some((o: string) => o.includes('Frank'))).toBe(true);
      expect(outputs.some((o: string) => o.includes('Grace'))).toBe(true);
    });

    it('4.2.5 - loads tests from external YAML file', () => {
      const configPath = path.join(CONFIGS_DIR, 'yaml-tests.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'yaml-tests-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache'], {
        cwd: CONFIGS_DIR,
      });

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Should have 2 test results (Henry, Ivy from YAML)
      expect(parsed.results.results.length).toBe(2);

      const outputs = parsed.results.results.map(
        (r: { response: { output: string } }) => r.response.output,
      );
      expect(outputs.some((o: string) => o.includes('Henry'))).toBe(true);
      expect(outputs.some((o: string) => o.includes('Ivy'))).toBe(true);
    });
  });
});

describe('Script Assertion Smoke Tests', () => {
  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  describe('5.2 Script Assertions', () => {
    it('5.2.2 - JavaScript file assertion', () => {
      const configPath = path.join(CONFIGS_DIR, 'js-assertion.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'js-assertion-output.json');

      const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache'], {
        cwd: CONFIGS_DIR,
      });

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.results.results[0].success).toBe(true);
    });

    it('5.2.5 - Python file assertion', () => {
      const configPath = path.join(CONFIGS_DIR, 'python-assertion.yaml');
      const outputPath = path.join(OUTPUT_DIR, 'python-assertion-output.json');

      const { exitCode, stdout, stderr } = runCli(
        ['eval', '-c', configPath, '-o', outputPath, '--no-cache'],
        { cwd: CONFIGS_DIR },
      );

      // Python may not be available in all environments
      if (exitCode !== 0) {
        const output = stdout + stderr;
        if (output.toLowerCase().includes('python') && output.toLowerCase().includes('not found')) {
          console.warn('Skipping Python assertion test - Python not available');
          return;
        }
      }

      expect(exitCode).toBe(0);

      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.results.results[0].success).toBe(true);
    });
  });
});
