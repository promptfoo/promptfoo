import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { npmInvocation } from '../../scripts/installProfileProcess';
import {
  parseRegistryUrl,
  summarizeSamples,
  validateEvalCommand,
  validateEvalOutput,
} from '../../scripts/measureInstallProfiles';

const sample = (elapsedMs: number, code: number | null = 0, timedOut = false) => ({
  elapsedMs,
  code,
  timedOut,
  signal: null,
  stdout: 'stdout.log',
  stderr: 'stderr.log',
  iteration: 0,
});

const output = (overrides = {}) => ({
  results: {
    results: [
      {
        success: true,
        score: 1,
        failureReason: 0,
        gradingResult: {
          pass: true,
          componentResults: [
            { pass: true, assertion: { type: 'equals', value: 'install profile fixture' } },
          ],
        },
        response: { output: 'install profile fixture' },
        ...overrides,
      },
    ],
  },
});

describe('install profile measurements', () => {
  it.each([
    'https://registry.example/?token=fixture-secret',
    'https://registry.example/#fixture-secret',
    'https://user:fixture-secret@registry.example/',
  ])('rejects credential-bearing registry URLs before recording them', (registry) => {
    expect(() => parseRegistryUrl(registry)).toThrow(
      'Registry URL must not contain credentials, query strings, or fragments',
    );
  });

  it('retains registry paths and rejects non-HTTP registry protocols', () => {
    expect(parseRegistryUrl('https://registry.example/api/npm/').href).toBe(
      'https://registry.example/api/npm/',
    );
    expect(() => parseRegistryUrl('file:///registry')).toThrow('Registry must use http(s)');
  });

  it.each([true, false])(
    'rejects timed-out evals even with the expected exit code: %s',
    (success) => {
      const code = success ? 0 : 100;
      expect(() => validateEvalCommand({ code, timedOut: true }, success)).toThrow('timed out');
      expect(() => validateEvalCommand({ code, timedOut: false }, success)).not.toThrow();
      expect(() => validateEvalCommand({ code: 1, timedOut: false }, success)).toThrow('exit code');
    },
  );

  it('keeps raw failures and first-process timing separate from successful sample statistics', () => {
    const samples = [sample(20, 1), sample(4), sample(100, null, true), sample(2), sample(3)];
    expect(summarizeSamples(samples)).toEqual({
      successful: 3,
      failed: 2,
      firstMs: null,
      medianMs: 3,
      minMs: 2,
      maxMs: 4,
      samples,
    });
  });

  it('averages the middle samples and does not pretend failed probes have timings', () => {
    expect(summarizeSamples([sample(2), sample(4)]).medianMs).toBe(3);
    expect(summarizeSamples([sample(30, 1)]).medianMs).toBeNull();
    expect(summarizeSamples([]).firstMs).toBeNull();
  });

  it('accepts exact passing and intentional assertion-failure exports', () => {
    expect(validateEvalOutput(output(), true)).toHaveLength(1);
    expect(
      validateEvalOutput(
        output({
          success: false,
          score: 0,
          failureReason: 1,
          error: 'Expected mismatch',
          gradingResult: {
            pass: false,
            componentResults: [
              { pass: false, assertion: { type: 'equals', value: 'intentional mismatch' } },
            ],
          },
        }),
        false,
      ),
    ).toHaveLength(1);
  });

  it.each([
    undefined,
    {},
    { results: { results: [] } },
    output({ success: false }),
    output({ score: 0 }),
    output({ error: 'unexpected error' }),
    output({ response: { error: 'transport failure', output: 'install profile fixture' } }),
    output({ response: { output: 'wrong' } }),
  ])('rejects missing or misleading success evidence: %j', (value) => {
    expect(() => validateEvalOutput(value, true)).toThrow();
  });

  it('rejects grading exceptions even when the echo provider succeeded', () => {
    expect(() =>
      validateEvalOutput(
        output({ success: false, score: 0, failureReason: 2, error: 'Assertion grading failed' }),
        false,
      ),
    ).toThrow();
  });

  it('requires assertion failure evidence instead of accepting any failed provider', () => {
    expect(() => validateEvalOutput(output({ success: false, score: 0 }), false)).toThrow();
    expect(() =>
      validateEvalOutput(
        output({ success: false, score: 0, error: 'transport', response: { error: 'transport' } }),
        false,
      ),
    ).toThrow();
  });
});

it('keeps consumer lockfiles inside TMPDIR when an ancestor declares npm workspaces', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'install-profile-workspace-'));
  try {
    const workspace = path.join(root, 'host');
    const temporary = path.join(workspace, 'packages');
    const fixture = path.join(root, 'fixture');
    fs.mkdirSync(temporary, { recursive: true });
    fs.mkdirSync(fixture);
    fs.writeFileSync(
      path.join(workspace, 'package.json'),
      JSON.stringify({
        name: 'untouched-host',
        private: true,
        workspaces: ['packages/**'],
      }),
    );
    fs.writeFileSync(
      path.join(fixture, 'package.json'),
      JSON.stringify({
        name: 'promptfoo',
        version: '0.0.0-fixture',
      }),
    );
    const env = { ...process.env, npm_config_cache: path.join(root, 'cache') };
    const npm = npmInvocation();
    const packed = JSON.parse(
      execFileSync(
        npm.command,
        [...npm.prefix, 'pack', '--ignore-scripts', '--workspaces=false', '--offline', '--json'],
        { cwd: fixture, env, encoding: 'utf8', timeout: 10_000 },
      ),
    );
    const output = path.join(root, 'report');
    const checkout = fileURLToPath(new URL('../../', import.meta.url));
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'scripts/measureInstallProfiles.ts',
        '--tarball',
        path.join(fixture, packed[0].filename),
        '--output',
        output,
        '--runs',
        '2',
        '--profiles',
        'default',
        '--registry',
        'http://127.0.0.1:1',
      ],
      {
        cwd: checkout,
        env: { ...env, TMPDIR: temporary, TEMP: temporary, TMP: temporary },
        encoding: 'utf8',
        timeout: 15_000,
      },
    );
    expect(result.error).toBeUndefined();
    // The deliberately empty package fails probes; lockfile resolution must still be isolated.
    expect(result.status).toBe(1);
    const report = JSON.parse(fs.readFileSync(path.join(output, 'report.json'), 'utf8'));
    expect(report.resolution.code).toBe(0);
    expect(fs.existsSync(path.join(workspace, 'package-lock.json'))).toBe(false);
    expect(
      fs.existsSync(path.join(report.conditions.work, 'resolution', 'package-lock.json')),
    ).toBe(true);
    expect(report.profiles[0].install.code).toBe(0);
    expect(report.profiles[0].dependencyTree.code).toBe(0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
