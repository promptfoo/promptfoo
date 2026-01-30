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

    describe('#7334 - dynamic vars not resolved in assertion context.vars', () => {
      it('resolves file:// vars before passing to assertion functions', () => {
        // Bug #7334: Dynamic variables with file:// prefix were resolved in prompts
        // but when passed to JavaScript assertion functions via context.vars,
        // they contained the raw file path instead of the resolved value.
        const configPath = path.join(FIXTURES_DIR, 'configs/dynamic-var-assertion-7334.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'dynamic-var-assertion-output.json');

        const { exitCode, stderr } = runCli([
          'eval',
          '-c',
          configPath,
          '-o',
          outputPath,
          '--no-cache',
        ]);

        expect(exitCode).toBe(0);
        expect(stderr).not.toContain('Error');

        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        // The assertion should pass because context.vars.DYNAMIC_VAR
        // contains the resolved ISO date, not the file:// path
        expect(parsed.results.results[0].success).toBe(true);
        // Check the individual assertion result (componentResults), not the aggregate reason
        const componentResult = parsed.results.results[0].gradingResult.componentResults[0];
        expect(componentResult.pass).toBe(true);
        expect(componentResult.reason).toContain('correctly resolved');
        expect(componentResult.reason).not.toContain('file://');
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

  describe('Circular Reference Handling', () => {
    // NOTE: This test uses a custom provider instead of the 'echo' provider.
    // This is an intentional exception to smoke test guidelines because:
    // - The echo provider cannot generate circular references in response metadata
    // - We need to verify that circular reference objects are properly sanitized
    // - The custom provider (circular-ref-provider.js) creates controlled circular
    //   structures that reproduce the exact bug scenario from GitHub issue #7266
    describe('#7266 - Converting circular structure to JSON error', () => {
      it('handles provider responses with circular references without crashing', () => {
        // Bug #7266: When providers return data with circular references
        // (e.g., leaked Timeout objects with _idlePrev/_idleNext),
        // saving results to DB would fail with:
        // "TypeError: Converting circular structure to JSON"
        //
        // The fix adds sanitizeForDb() to strip circular references before DB insert.
        const configPath = path.join(FIXTURES_DIR, 'configs/circular-ref-7266.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'circular-ref-7266-output.json');

        const { exitCode, stderr, stdout } = runCli(
          ['eval', '-c', configPath, '-o', outputPath, '--no-cache'],
          { cwd: FIXTURES_DIR },
        );

        // On main (before fix): exitCode would be non-zero or stderr would contain
        // "Converting circular structure to JSON" or "Error saving result"
        //
        // With fix: exitCode should be 0 and results should be saved successfully
        if (exitCode !== 0) {
          console.error('stdout:', stdout);
          console.error('stderr:', stderr);
        }

        expect(exitCode).toBe(0);
        expect(stderr).not.toContain('Converting circular structure to JSON');
        expect(stderr).not.toContain('Error saving result');

        // Verify the output file was created and contains valid results
        expect(fs.existsSync(outputPath)).toBe(true);
        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        // The test should have run successfully
        expect(parsed.results.results[0].success).toBe(true);
        expect(parsed.results.results[0].response.output).toContain('Processed');

        // The metadata should exist (circular refs stripped, but normal data preserved)
        expect(parsed.results.results[0].response.metadata).toBeDefined();
        expect(parsed.results.results[0].response.metadata.normalData).toBe('this is fine');
      });
    });
  });

  describe('Provider Wrapper', () => {
    describe('#7353 - class-based provider prototype id() method preservation', () => {
      it('preserves id() method when using class-based providers in eval', () => {
        // Bug #7353: When wrapProviderWithRateLimiting wraps a class-based provider,
        // the spread operator doesn't copy prototype methods like id().
        // This caused "TypeError: redteamProvider.id is not a function" in redteam
        // strategies that call TokenUsageTracker.trackUsage(provider.id(), ...).
        //
        // The fix explicitly delegates id() to the original provider.
        const configPath = path.join(FIXTURES_DIR, 'configs/class-provider-7353.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'class-provider-7353-output.json');

        const { exitCode, stderr, stdout } = runCli(
          ['eval', '-c', configPath, '-o', outputPath, '--no-cache'],
          { cwd: path.join(FIXTURES_DIR, 'configs') },
        );

        if (exitCode !== 0) {
          console.error('stdout:', stdout);
          console.error('stderr:', stderr);
        }

        // Should not fail with "id is not a function"
        expect(stderr).not.toContain('is not a function');
        expect(exitCode).toBe(0);

        // Verify the output file was created and contains valid results
        expect(fs.existsSync(outputPath)).toBe(true);
        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        // The test should have run successfully with the class-based provider
        expect(parsed.results.results[0].success).toBe(true);
        // Verify the provider's id() method was accessible (included in output)
        expect(parsed.results.results[0].response.output).toContain('ClassProvider');
      });

      it('preserves id() method when using class-based providers in redteam', () => {
        // This tests the actual redteam flow where the bug manifested.
        // The redteam provider (attacker model) gets wrapped with rate limiting,
        // and strategies call TokenUsageTracker.trackUsage(provider.id(), ...).
        const configPath = path.join(FIXTURES_DIR, 'configs/redteam-class-provider-7353.yaml');

        const { exitCode, stderr, stdout } = runCli(
          ['redteam', 'generate', '-c', configPath, '--no-cache'],
          { cwd: path.join(FIXTURES_DIR, 'configs'), timeout: 120000 },
        );

        // The key assertion: should NOT fail with "id is not a function"
        // This was the specific error from bug #7353
        expect(stderr).not.toContain('is not a function');
        expect(stdout + stderr).not.toContain('redteamProvider.id is not a function');

        // The command may fail for other reasons (e.g., our simple provider
        // doesn't generate proper attack prompts), but that's OK - we just
        // need to verify the id() method is accessible.
        if (exitCode !== 0) {
          // If it failed, make sure it wasn't due to the id() bug
          const output = stdout + stderr;
          expect(output).not.toContain('TypeError');
          expect(output).not.toContain('is not a function');
        }
      });
    });
  });

  describe('JSON Schema Validation', () => {
    describe('#7096 - TestCase options and metadata schema validation', () => {
      it('validates config with combined options from merged schemas', () => {
        // Bug #7096: z.intersection() in Zod v4 generates allOf with additionalProperties:false
        // which caused JSON Schema validators to reject valid options like 'provider' when
        // combined with other options like 'prefix' from different sub-schemas.
        const configPath = path.join(FIXTURES_DIR, 'configs/schema-validation-7096.yaml');
        const outputPath = path.join(OUTPUT_DIR, 'schema-validation-7096-output.json');

        const { exitCode, stderr } = runCli([
          'eval',
          '-c',
          configPath,
          '-o',
          outputPath,
          '--no-cache',
        ]);

        // Should succeed - the config uses options.provider, options.prefix, options.transform
        // which come from different merged schemas (GradingConfig, PromptConfig, OutputConfig)
        expect(exitCode).toBe(0);
        if (exitCode !== 0) {
          console.error('stderr:', stderr);
        }

        const content = fs.readFileSync(outputPath, 'utf-8');
        const parsed = JSON.parse(content);

        // Verify the test ran successfully
        expect(parsed.results.results[0].success).toBe(true);
        // Verify metadata with custom keys was preserved
        expect(parsed.results.results[0].testCase.metadata).toHaveProperty(
          'customTag',
          'math-test',
        );
        expect(parsed.results.results[0].testCase.metadata).toHaveProperty('experimentId', 12345);
      });

      it('generates valid JSON Schema without problematic allOf pattern for options', () => {
        // This test validates the generated schema file doesn't have the broken pattern
        const schemaPath = path.join(ROOT_DIR, 'site/static/config-schema.json');

        // Verify schema file exists
        expect(fs.existsSync(schemaPath)).toBe(true);

        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

        // The schema should exist and have definitions
        expect(schema).toHaveProperty('definitions');
        expect(schema).toHaveProperty('$schema');

        // Find the TestCase options schema definition
        // The fix changed it from nested z.intersection() (which creates allOf with multiple additionalProperties:false)
        // to a flat z.object() with spread (which creates a single object with all properties)
        const definitions = schema.definitions;

        // Look for a definition that has the options properties (prefix, suffix, provider, etc.)
        // and verify it's NOT using the problematic allOf pattern
        let foundOptionsSchema = false;
        for (const [_key, def] of Object.entries(definitions)) {
          const defObj = def as Record<string, unknown>;
          const props = defObj.properties as Record<string, unknown> | undefined;

          // Check if this is the options schema (has prefix, provider, disableVarExpansion)
          if (props && props.prefix && props.provider && props.disableVarExpansion) {
            foundOptionsSchema = true;

            // The fix should result in a flat object, NOT an allOf
            // If there's an allOf, it should NOT have multiple sub-schemas with additionalProperties:false
            if (defObj.allOf) {
              const allOf = defObj.allOf as Array<Record<string, unknown>>;
              const schemasWithAdditionalPropsFalse = allOf.filter(
                (s) => s.additionalProperties === false,
              );
              // The problematic pattern had 4 schemas each with additionalProperties:false
              expect(schemasWithAdditionalPropsFalse.length).toBeLessThan(2);
            }
            break;
          }
        }

        expect(foundOptionsSchema).toBe(true);
      });
    });
  });
});
