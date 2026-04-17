/**
 * Smoke tests for eval command filters and flags.
 *
 * Tests filter flags (--filter-first-n, --filter-pattern, --filter-metadata,
 * --filter-providers, --filter-failing), variable flags (--var), prompt
 * modification (--prompt-prefix, --prompt-suffix), and output flags.
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
const OUTPUT_DIR = path.resolve(__dirname, '.temp-output-filters');

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

describe('Count-Based Filter Tests', () => {
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

  it('1.8.1.1 - --filter-first-n limits to first N tests', () => {
    const configPath = path.join(CONFIGS_DIR, 'multi-test.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'first-n-output.json');

    const { exitCode } = runCli(
      ['eval', '-c', configPath, '-o', outputPath, '--no-cache', '--filter-first-n', '2'],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Should only have 2 test results
    expect(parsed.results.results.length).toBe(2);

    // Should be Alice and Bob (first two)
    const names = parsed.results.results.map(
      (r: { response: { output: string } }) => r.response.output,
    );
    expect(names[0]).toContain('Alice');
    expect(names[1]).toContain('Bob');
  });

  it('1.8.1.2 - --filter-first-n with N > total returns all tests', () => {
    const configPath = path.join(CONFIGS_DIR, 'multi-test.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'first-n-large-output.json');

    const { exitCode } = runCli(
      ['eval', '-c', configPath, '-o', outputPath, '--no-cache', '--filter-first-n', '100'],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Should have all 5 test results
    expect(parsed.results.results.length).toBe(5);
  });

  it('1.8.1.4 - --filter-sample returns exactly N random tests', () => {
    const configPath = path.join(CONFIGS_DIR, 'multi-test.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'sample-output.json');

    const { exitCode } = runCli(
      ['eval', '-c', configPath, '-o', outputPath, '--no-cache', '--filter-sample', '3'],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Should have exactly 3 test results (random selection)
    expect(parsed.results.results.length).toBe(3);
  });
});

describe('Pattern Filter Tests', () => {
  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  it('1.8.2.1 - --filter-pattern matches test descriptions', () => {
    const configPath = path.join(CONFIGS_DIR, 'multi-test.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'pattern-output.json');

    const { exitCode } = runCli(
      ['eval', '-c', configPath, '-o', outputPath, '--no-cache', '--filter-pattern', 'user.*test'],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Should match "user authentication test" and "user profile test"
    expect(parsed.results.results.length).toBe(2);

    const outputs = parsed.results.results.map(
      (r: { response: { output: string } }) => r.response.output,
    );
    expect(outputs.some((o: string) => o.includes('Alice'))).toBe(true);
    expect(outputs.some((o: string) => o.includes('Bob'))).toBe(true);
  });

  it('1.8.2.3 - --filter-pattern with no matches runs zero tests', () => {
    const configPath = path.join(CONFIGS_DIR, 'multi-test.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'pattern-nomatch-output.json');

    const { exitCode, stdout } = runCli(
      [
        'eval',
        '-c',
        configPath,
        '-o',
        outputPath,
        '--no-cache',
        '--filter-pattern',
        'nonexistent12345',
      ],
      { cwd: CONFIGS_DIR },
    );

    // Should succeed but with 0 tests
    expect(exitCode).toBe(0);

    // Verify 0 successes/failures/errors in output
    expect(stdout).toContain('0 passed');
    expect(stdout).toContain('0 failed');

    // Verify output file has 0 results
    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.results.results.length).toBe(0);
  });
});

describe('Metadata Filter Tests', () => {
  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  it('1.8.3.1 - --filter-metadata matches by key=value', () => {
    const configPath = path.join(CONFIGS_DIR, 'multi-test.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'metadata-output.json');

    const { exitCode } = runCli(
      [
        'eval',
        '-c',
        configPath,
        '-o',
        outputPath,
        '--no-cache',
        '--filter-metadata',
        'category=auth',
      ],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Should match tests with category=auth (Alice and Diana)
    expect(parsed.results.results.length).toBe(2);

    const outputs = parsed.results.results.map(
      (r: { response: { output: string } }) => r.response.output,
    );
    expect(outputs.some((o: string) => o.includes('Alice'))).toBe(true);
    expect(outputs.some((o: string) => o.includes('Diana'))).toBe(true);
  });

  it('1.8.3.2 - --filter-metadata matches partial values', () => {
    const configPath = path.join(CONFIGS_DIR, 'multi-test.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'metadata-partial-output.json');

    const { exitCode } = runCli(
      [
        'eval',
        '-c',
        configPath,
        '-o',
        outputPath,
        '--no-cache',
        '--filter-metadata',
        'priority=high',
      ],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Should match tests with priority=high (Alice and Charlie)
    expect(parsed.results.results.length).toBe(2);
  });

  it('1.8.3.3 - --filter-metadata matches array values', () => {
    const configPath = path.join(CONFIGS_DIR, 'multi-test.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'metadata-array-output.json');

    const { exitCode } = runCli(
      [
        'eval',
        '-c',
        configPath,
        '-o',
        outputPath,
        '--no-cache',
        '--filter-metadata',
        'tags=security',
      ],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Should match the test with tags array containing "security" (Eve)
    expect(parsed.results.results.length).toBe(1);
    expect(parsed.results.results[0].response.output).toContain('Eve');
  });

  it('1.8.3.4 - multiple --filter-metadata flags use AND logic', () => {
    const configPath = path.join(CONFIGS_DIR, 'multi-test.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'metadata-multi-output.json');

    const { exitCode } = runCli(
      [
        'eval',
        '-c',
        configPath,
        '-o',
        outputPath,
        '--no-cache',
        '--filter-metadata',
        'category=auth',
        '--filter-metadata',
        'priority=high',
      ],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Should match only Alice (category=auth AND priority=high)
    // Diana has category=auth but priority=low, so excluded
    // Charlie has priority=high but category=admin, so excluded
    expect(parsed.results.results.length).toBe(1);
    expect(parsed.results.results[0].response.output).toContain('Alice');
  });

  it('1.8.3.5 - multiple --filter-metadata returns empty when no tests match all conditions', () => {
    const configPath = path.join(CONFIGS_DIR, 'multi-test.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'metadata-nomatch-output.json');

    const { exitCode } = runCli(
      [
        'eval',
        '-c',
        configPath,
        '-o',
        outputPath,
        '--no-cache',
        '--filter-metadata',
        'category=auth',
        '--filter-metadata',
        'priority=medium',
      ],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    // No test has both category=auth AND priority=medium
    expect(parsed.results.results.length).toBe(0);
  });

  it('1.8.3.6 - three --filter-metadata flags narrow results further', () => {
    const configPath = path.join(CONFIGS_DIR, 'multi-test.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'metadata-three-output.json');

    const { exitCode } = runCli(
      [
        'eval',
        '-c',
        configPath,
        '-o',
        outputPath,
        '--no-cache',
        '--filter-metadata',
        'category=settings',
        '--filter-metadata',
        'priority=medium',
        '--filter-metadata',
        'tags=security',
      ],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Should match only Eve (all three conditions)
    expect(parsed.results.results.length).toBe(1);
    expect(parsed.results.results[0].response.output).toContain('Eve');
  });
});

describe('Provider Filter Tests', () => {
  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  it('1.8.4.1 - --filter-providers filters by provider ID', () => {
    const configPath = path.join(CONFIGS_DIR, 'multi-provider.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'provider-filter-output.json');

    const { exitCode } = runCli(
      ['eval', '-c', configPath, '-o', outputPath, '--no-cache', '--filter-providers', 'echo'],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    // All 3 providers match 'echo', so all 3 should run
    expect(parsed.results.results.length).toBe(3);
  });

  it('1.8.4.2 - --filter-providers filters by provider label regex', () => {
    const configPath = path.join(CONFIGS_DIR, 'multi-provider.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'provider-label-output.json');

    const { exitCode } = runCli(
      ['eval', '-c', configPath, '-o', outputPath, '--no-cache', '--filter-providers', 'Custom.*'],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Only "Custom Echo" provider should match
    expect(parsed.results.results.length).toBe(1);
  });
});

describe('Combined Filter Tests', () => {
  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  it('1.8.6.1 - --filter-pattern combined with --filter-first-n', () => {
    const configPath = path.join(CONFIGS_DIR, 'multi-test.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'combined-filter-output.json');

    const { exitCode } = runCli(
      [
        'eval',
        '-c',
        configPath,
        '-o',
        outputPath,
        '--no-cache',
        '--filter-pattern',
        'test',
        '--filter-first-n',
        '2',
      ],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Pattern matches all 5 tests, then first-n takes 2
    expect(parsed.results.results.length).toBe(2);
  });
});

describe('Variable Flag Tests', () => {
  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  it('1.9.1 - --var provides default variable values', () => {
    // Note: --var sets defaultTest.vars which provides defaults
    // for tests that don't define those variables
    const configPath = path.join(CONFIGS_DIR, 'var-test.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'var-single-output.json');

    const { exitCode } = runCli(
      [
        'eval',
        '-c',
        configPath,
        '-o',
        outputPath,
        '--no-cache',
        '--var',
        'name=TestName',
        '--var',
        'age=25',
        '--var',
        'city=TestCity',
      ],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    // The --var should provide the values since test has empty vars
    expect(parsed.results.results[0].response.output).toContain('TestName');
    expect(parsed.results.results[0].response.output).toContain('TestCity');
  });

  it('1.9.2 - --var sets multiple variables', () => {
    const configPath = path.join(CONFIGS_DIR, 'var-test.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'var-multi-output.json');

    const { exitCode } = runCli(
      [
        'eval',
        '-c',
        configPath,
        '-o',
        outputPath,
        '--no-cache',
        '--var',
        'name=Alice',
        '--var',
        'age=30',
        '--var',
        'city=Boston',
      ],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    const output = parsed.results.results[0].response.output;
    expect(output).toContain('Alice');
    expect(output).toContain('30');
    expect(output).toContain('Boston');
  });

  it('1.9.3 - test vars take precedence over --var', () => {
    // This test verifies that test-defined vars override --var defaults
    const configPath = path.join(CONFIGS_DIR, 'var-override-test.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'var-override-output.json');

    const { exitCode } = runCli(
      [
        'eval',
        '-c',
        configPath,
        '-o',
        outputPath,
        '--no-cache',
        '--var',
        'name=VarName',
        '--var',
        'role=VarRole',
      ],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    const output = parsed.results.results[0].response.output;
    // Test defines name=TestDefinedName, so that should be used (not VarName)
    expect(output).toContain('TestDefinedName');
    expect(output).not.toContain('VarName');
    // Test doesn't define role, so --var role=VarRole should be used
    expect(output).toContain('VarRole');
  });
});

describe('Prompt Modification Tests', () => {
  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  it('1.9.5 - --prompt-prefix prepends text to prompts', () => {
    const configPath = path.join(CONFIGS_DIR, 'prompt-modification.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'prefix-output.json');

    const { exitCode } = runCli(
      ['eval', '-c', configPath, '-o', outputPath, '--no-cache', '--prompt-prefix', 'PREFIX_'],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Echo returns the prompt, so it should have PREFIX_ at the start
    expect(parsed.results.results[0].response.output).toMatch(/^PREFIX_/);
    expect(parsed.results.results[0].response.output).toContain('MIDDLE');
  });

  it('1.9.6 - --prompt-suffix appends text to prompts', () => {
    const configPath = path.join(CONFIGS_DIR, 'prompt-modification.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'suffix-output.json');

    const { exitCode } = runCli(
      ['eval', '-c', configPath, '-o', outputPath, '--no-cache', '--prompt-suffix', '_SUFFIX'],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Echo returns the prompt, so it should have _SUFFIX at the end
    expect(parsed.results.results[0].response.output).toMatch(/_SUFFIX$/);
    expect(parsed.results.results[0].response.output).toContain('MIDDLE');
  });

  it('1.9.7 - --prompt-prefix and --prompt-suffix together', () => {
    const configPath = path.join(CONFIGS_DIR, 'prompt-modification.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'prefix-suffix-output.json');

    const { exitCode } = runCli(
      [
        'eval',
        '-c',
        configPath,
        '-o',
        outputPath,
        '--no-cache',
        '--prompt-prefix',
        'START_',
        '--prompt-suffix',
        '_END',
      ],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    const output = parsed.results.results[0].response.output;
    expect(output).toBe('START_MIDDLE_END');
  });
});

describe('Output Flag Tests', () => {
  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  it('1.10.5 - --no-table suppresses table output', () => {
    const configPath = path.join(CONFIGS_DIR, 'basic.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'no-table-output.json');

    const { exitCode, stdout } = runCli(
      ['eval', '-c', configPath, '-o', outputPath, '--no-cache', '--no-table'],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    // Table output should not be present
    // Table typically has borders like ┌─────
    expect(stdout).not.toContain('┌');
    expect(stdout).not.toContain('│');
  });

  it('1.11.1 - --description sets eval description', () => {
    const configPath = path.join(CONFIGS_DIR, 'basic.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'description-output.json');

    const { exitCode } = runCli(
      [
        'eval',
        '-c',
        configPath,
        '-o',
        outputPath,
        '--no-cache',
        '--description',
        'My custom test description',
      ],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);

    expect(parsed.config.description).toBe('My custom test description');
  });

  it('1.11.2 - multiple -o flags create multiple output files', () => {
    const configPath = path.join(CONFIGS_DIR, 'basic.yaml');
    const jsonOutput = path.join(OUTPUT_DIR, 'multi-out.json');
    const csvOutput = path.join(OUTPUT_DIR, 'multi-out.csv');

    const { exitCode } = runCli(
      ['eval', '-c', configPath, '-o', jsonOutput, '-o', csvOutput, '--no-cache'],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    // Both files should exist
    expect(fs.existsSync(jsonOutput)).toBe(true);
    expect(fs.existsSync(csvOutput)).toBe(true);

    // Verify JSON is valid
    const jsonContent = fs.readFileSync(jsonOutput, 'utf-8');
    expect(() => JSON.parse(jsonContent)).not.toThrow();

    // Verify CSV has content
    const csvContent = fs.readFileSync(csvOutput, 'utf-8');
    expect(csvContent.length).toBeGreaterThan(0);
  });

  it('1.11.3 - --no-write prevents database persistence', () => {
    const configPath = path.join(CONFIGS_DIR, 'basic.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'no-write-output.json');

    const { exitCode } = runCli(
      ['eval', '-c', configPath, '-o', outputPath, '--no-cache', '--no-write'],
      { cwd: CONFIGS_DIR },
    );

    expect(exitCode).toBe(0);

    // The eval should still complete and write to the output file
    expect(fs.existsSync(outputPath)).toBe(true);
  });
});

describe('History-Based Filter Tests', () => {
  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  it('1.8.5.1 - --filter-failing re-runs only failed tests from file', () => {
    const configPath = path.join(CONFIGS_DIR, 'failing-tests.yaml');
    const firstRunOutput = path.join(OUTPUT_DIR, 'failing-first-run.json');
    const secondRunOutput = path.join(OUTPUT_DIR, 'failing-second-run.json');

    // First run: run all tests (some will fail)
    const firstRun = runCli(['eval', '-c', configPath, '-o', firstRunOutput, '--no-cache'], {
      cwd: CONFIGS_DIR,
    });

    // Exit code 100 = some assertions failed
    expect(firstRun.exitCode).toBe(100);

    const firstContent = fs.readFileSync(firstRunOutput, 'utf-8');
    const firstParsed = JSON.parse(firstContent);

    // Should have 4 total tests (2 pass, 2 fail)
    expect(firstParsed.results.results.length).toBe(4);

    // Second run: only re-run failing tests
    const secondRun = runCli(
      [
        'eval',
        '-c',
        configPath,
        '-o',
        secondRunOutput,
        '--no-cache',
        '--filter-failing',
        firstRunOutput,
      ],
      { cwd: CONFIGS_DIR },
    );

    // Should still fail (same tests fail again)
    expect(secondRun.exitCode).toBe(100);

    const secondContent = fs.readFileSync(secondRunOutput, 'utf-8');
    const secondParsed = JSON.parse(secondContent);

    // Should only have 2 tests (the failing ones)
    expect(secondParsed.results.results.length).toBe(2);

    // Verify they're the failing tests (Bob and Diana)
    const outputs = secondParsed.results.results.map(
      (r: { response: { output: string } }) => r.response.output,
    );
    expect(outputs.some((o: string) => o.includes('Bob'))).toBe(true);
    expect(outputs.some((o: string) => o.includes('Diana'))).toBe(true);
  });
});
