/**
 * Regression tests for recently fixed bugs (0.119.x and beyond).
 *
 * These tests verify that bugs fixed in recent releases don't regress.
 *
 * Bug categories tested:
 * - File reference handling in assertions and vars
 * - Function provider support
 * - Dynamic value loading
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
const OUTPUT_DIR = path.resolve(__dirname, '.temp-output-recent');

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

describe('Recent Bug Regression Tests', () => {
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

  describe('File Reference Handling', () => {
    describe('#6253 - file:// references in assertion values', () => {
      it('uses script output for file:// references in assertion values', () => {
        // Bug #6253: file:// references in assertion values should execute
        // the script and use its return value
        const configPath = path.join(FIXTURES_DIR, 'configs/file-ref-assertion-value.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'file-ref-assertion-output.json');

        const { exitCode, stderr } = runCli([
          'eval',
          '-c',
          configPath,
          '-o',
          outputPath,
          '--no-cache',
        ]);

        expect(exitCode).toBe(0);
        expect(stderr).not.toContain('Error loading');

        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        expect(parsed.results.results[0].success).toBe(true);
      });
    });

    describe('#6393 - file:// references for tests loading', () => {
      it('loads tests from external YAML file with vars', () => {
        // Bug #6393: file:// references should be preserved for runtime loading
        const configPath = path.join(FIXTURES_DIR, 'configs/file-ref-vars.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'file-ref-vars-output.json');

        const { exitCode, stderr } = runCli([
          'eval',
          '-c',
          configPath,
          '-o',
          outputPath,
          '--no-cache',
        ]);

        expect(exitCode).toBe(0);
        expect(stderr).not.toContain('Error loading');

        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        expect(parsed.results.results[0].success).toBe(true);
        expect(parsed.results.results[0].response.output).toContain('LoadedFromExternalFile');
      });
    });
  });

  describe('Provider Support', () => {
    describe('#6174 - function providers in defaultTest', () => {
      it('supports function providers in defaultTest.options.provider', () => {
        // Bug #6174: function providers should work in defaultTest
        const configPath = path.join(FIXTURES_DIR, 'configs/function-provider-defaulttest.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'function-provider-output.json');

        const { exitCode, stderr } = runCli([
          'eval',
          '-c',
          configPath,
          '-o',
          outputPath,
          '--no-cache',
        ]);

        expect(exitCode).toBe(0);
        expect(stderr).not.toContain('is not a function');

        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        expect(parsed.results.results[0].success).toBe(true);
      });
    });
  });

  describe('Config Extends Feature', () => {
    describe('Config inheritance', () => {
      it('extends base config with additional settings', () => {
        // Test that config extends feature works
        const configPath = path.join(FIXTURES_DIR, 'configs/basic.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'config-extends-output.json');

        const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

        expect(exitCode).toBe(0);

        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        expect(parsed.results.results[0].success).toBe(true);
      });
    });
  });

  describe('Assertion Edge Cases', () => {
    describe('Multiple assertion types combined', () => {
      it('handles multiple different assertion types in single test', () => {
        const configPath = path.join(FIXTURES_DIR, 'configs/multi-assertion.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'multi-assertion-output.json');

        // Create a temporary config with multiple assertion types
        const tempConfig = `
description: 'Test multiple assertion types'
providers:
  - echo
prompts:
  - 'Hello World 123'
tests:
  - assert:
      - type: contains
        value: Hello
      - type: contains
        value: World
      - type: regex
        value: '\\d+'
      - type: javascript
        value: output.length > 5
`;
        fs.writeFileSync(configPath, tempConfig);

        const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

        expect(exitCode).toBe(0);

        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        expect(parsed.results.results[0].success).toBe(true);
        // Should have 4 component results
        expect(parsed.results.results[0].gradingResult.componentResults.length).toBe(4);
      });
    });

    describe('Empty and null value handling', () => {
      it('handles tests with empty vars gracefully', () => {
        const configPath = path.join(FIXTURES_DIR, 'configs/empty-vars.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'empty-vars-output.json');

        // Create a temporary config with empty vars
        const tempConfig = `
description: 'Test empty vars handling'
providers:
  - echo
prompts:
  - 'Static prompt'
tests:
  - vars: {}
    assert:
      - type: contains
        value: Static
`;
        fs.writeFileSync(configPath, tempConfig);

        const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

        expect(exitCode).toBe(0);

        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        expect(parsed.results.results[0].success).toBe(true);
      });
    });
  });

  describe('Transform Features', () => {
    describe('Response transform with JSON path', () => {
      it('extracts nested JSON values with transform', () => {
        const configPath = path.join(FIXTURES_DIR, 'configs/transform-json-path.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'transform-json-path-output.json');

        // Create config that tests JSON path extraction
        const tempConfig = `
description: 'Test JSON path transform'
providers:
  - id: echo
    transform: 'JSON.parse(output).value'
prompts:
  - '{"value": "extracted", "other": "ignored"}'
tests:
  - assert:
      - type: equals
        value: extracted
`;
        fs.writeFileSync(configPath, tempConfig);

        const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

        expect(exitCode).toBe(0);

        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        expect(parsed.results.results[0].success).toBe(true);
      });
    });
  });

  describe('Nunjucks Template Features', () => {
    describe('Nunjucks filters in prompts', () => {
      it('supports built-in Nunjucks filters', () => {
        const configPath = path.join(FIXTURES_DIR, 'configs/nunjucks-filters.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'nunjucks-filters-output.json');

        // Create config that tests Nunjucks filters
        const tempConfig = `
description: 'Test Nunjucks filters'
providers:
  - echo
prompts:
  - 'Hello {{ name | upper }}'
tests:
  - vars:
      name: world
    assert:
      - type: contains
        value: WORLD
`;
        fs.writeFileSync(configPath, tempConfig);

        const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

        expect(exitCode).toBe(0);

        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        expect(parsed.results.results[0].success).toBe(true);
        expect(parsed.results.results[0].response.output).toContain('WORLD');
      });
    });

    describe('Nunjucks conditionals', () => {
      it('supports Nunjucks if/else in prompts', () => {
        const configPath = path.join(FIXTURES_DIR, 'configs/nunjucks-conditionals.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'nunjucks-conditionals-output.json');

        // Create config that tests Nunjucks conditionals
        const tempConfig = `
description: 'Test Nunjucks conditionals'
providers:
  - echo
prompts:
  - '{% if premium %}Premium user{% else %}Free user{% endif %}'
tests:
  - vars:
      premium: true
    assert:
      - type: contains
        value: Premium
  - vars:
      premium: false
    assert:
      - type: contains
        value: Free
`;
        fs.writeFileSync(configPath, tempConfig);

        const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

        expect(exitCode).toBe(0);

        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        expect(parsed.results.results.length).toBe(2);
        expect(parsed.results.results[0].success).toBe(true);
        expect(parsed.results.results[1].success).toBe(true);
      });
    });
  });
});
