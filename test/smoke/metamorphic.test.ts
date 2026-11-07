import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const cli = path.join(root, 'dist/src/entrypoint.js');
const example = path.join(root, 'examples/metamorphic-evaluation');
let directory: string;
let nativeFile: string;
function run(args: string[], cwd = root) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      NO_COLOR: '1',
      PROMPTFOO_DISABLE_UPDATE: 'true',
      PROMPTFOO_DISABLE_TELEMETRY: 'true',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_CONFIG_DIR: path.join(directory, 'state'),
      PROMPTFOO_CACHE_PATH: path.join(directory, 'cache'),
    },
  });
}
beforeAll(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'metamorphic-built-cli-'));
  nativeFile = path.join(directory, 'native.json');
  const evaluated = run([
    'eval',
    '-c',
    path.join(example, 'promptfooconfig.yaml'),
    '--repeat',
    '2',
    '--no-cache',
    '-o',
    nativeFile,
  ]);
  expect(evaluated.status, evaluated.stderr).toBe(0);
  const native = JSON.parse(readFileSync(nativeFile, 'utf8'));
  expect(native.results.results).toHaveLength(8);
  expect(native.results.results.every((row: { success: boolean }) => row.success)).toBe(true);
});
afterAll(() => {
  if (directory) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('built metamorphic CLI', () => {
  it('analyzes real exported repeats and never loads a local JS config', () => {
    writeFileSync(
      path.join(directory, 'promptfooconfig.js'),
      'throw new Error("CONFIG_MUST_NOT_EXECUTE");',
    );
    const output = path.join(directory, 'report.json');
    const result = run(
      [
        '--verbose',
        'metamorphic',
        'check',
        nativeFile,
        '--plan',
        path.join(example, 'plan.json'),
        '--format',
        'json',
        '-o',
        output,
      ],
      directory,
    );
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(readFileSync(output, 'utf8'));
    expect(report.verdict).toBe('pass');
    expect(report.totals).toEqual({ expected: 6, pass: 6, fail: 0, inconclusive: 0 });
    expect(report.identityCoverage.repeatGroupProvided).toBe(8);
    expect(report.familyRuns).toHaveLength(4);
  });
  it('returns nonzero and a failed JUnit summary for an empty declared panel', () => {
    const native = JSON.parse(readFileSync(nativeFile, 'utf8'));
    native.results.results = [];
    const empty = path.join(directory, 'empty.json');
    writeFileSync(empty, JSON.stringify(native));
    const output = path.join(directory, 'incomplete.xml');
    const result = run([
      'metamorphic',
      'check',
      empty,
      '--plan',
      path.join(example, 'plan.json'),
      '--format',
      'junit',
      '--max-details',
      '0',
      '-o',
      output,
    ]);
    expect(result.status, result.stderr).toBe(2);
    expect(readFileSync(output, 'utf8')).toContain('failures="1"');
  });
  it('inspects actual empty provider labels and validates plans without targets', () => {
    const inventoryFile = path.join(directory, 'inventory.json');
    const inspected = run(
      [
        'metamorphic',
        'inspect',
        nativeFile,
        '--include-context-selectors',
        '--format',
        'json',
        '-o',
        inventoryFile,
      ],
      directory,
    );
    expect(inspected.status, inspected.stderr).toBe(0);
    const inventory = JSON.parse(readFileSync(inventoryFile, 'utf8'));
    expect(inventory.contexts[0].selector).toEqual({
      promptIdx: 0,
      providerId: 'echo',
      providerLabel: '',
    });
    expect(inventory.diagnostics).toEqual([]);
    const summaryFile = path.join(directory, 'plan-summary.json');
    const validated = run(
      [
        'metamorphic',
        'validate-plan',
        path.join(example, 'plan.json'),
        '--format',
        'json',
        '-o',
        summaryFile,
      ],
      directory,
    );
    expect(validated.status, validated.stderr).toBe(0);
    expect(JSON.parse(readFileSync(summaryFile, 'utf8')).expectedObservations).toBe(8);
  });
});
