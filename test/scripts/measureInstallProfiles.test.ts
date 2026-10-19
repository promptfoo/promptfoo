import childProcess from 'node:child_process';
import fs from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  measureInstallProfiles,
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

describe('measurement environment preflight', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    ['HTTP_PROXY', 'http://user:fixture-secret@proxy.example:8080'],
    ['HTTPS_PROXY', 'http://:fixture-secret@proxy.example'],
    ['HTTP_PROXY', 'http:/user:fixture-secret@proxy.example'],
    ['HTTPS_PROXY', String.raw`http:\user:fixture-secret@proxy.example`],
    ['ALL_PROXY', 'socks5://user:fixture%2Dsecret@proxy.example'],
    ['http_proxy', 'user:fixture-secret@proxy.example:8080'],
    ['https_proxy', 'https://proxy.example/?token=fixture-secret'],
    ['all_proxy', 'http://proxy.example/#fixture-secret'],
  ])(
    'rejects credential-bearing %s before running commands or creating evidence',
    async (key, value) => {
      vi.stubGlobal('process', { ...process, platform: 'linux', env: { [key]: value } });
      const command = vi.spyOn(childProcess, 'execFileSync');
      const mkdir = vi.spyOn(fs, 'mkdirSync');
      await expect(
        measureInstallProfiles([
          '--tarball',
          '/unused.tgz',
          '--output',
          '/unused-output',
          '--registry',
          'https://registry.npmjs.org/',
        ]),
      ).rejects.toThrow(`${key} must be a credential-free proxy URL`);
      expect(command).not.toHaveBeenCalled();
      expect(mkdir).not.toHaveBeenCalled();
    },
  );

  it('bounds registry lookup and hides npm failure details', async () => {
    vi.stubGlobal('process', { ...process, platform: 'linux', env: {} });
    const command = vi.spyOn(childProcess, 'execFileSync').mockImplementation(() => {
      throw Object.assign(new Error('fixture registry credential'), { code: 'ETIMEDOUT' });
    });
    const mkdir = vi.spyOn(fs, 'mkdirSync');

    await expect(
      measureInstallProfiles(['--tarball', '/unused.tgz', '--output', '/unused-output']),
    ).rejects.toThrow(
      new Error('Unable to read npm registry; use --registry with a credential-free URL'),
    );
    expect(command).toHaveBeenCalledExactlyOnceWith(
      'npm',
      ['--workspaces=false', 'config', 'get', 'registry'],
      expect.objectContaining({ timeout: 10_000, killSignal: 'SIGKILL' }),
    );
    expect(mkdir).not.toHaveBeenCalled();
  });

  it('allows a plain proxy and NO_PROXY host list through to artifact validation', async () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'linux',
      env: {
        HTTP_PROXY: 'proxy.example:8080',
        HTTPS_PROXY: 'http://proxy.example:8080',
        NO_PROXY: 'localhost,127.0.0.1,.example.test',
      },
    });
    const stat = vi.spyOn(fs, 'statSync').mockImplementation(() => {
      throw new Error('fixture artifact validation');
    });
    await expect(
      measureInstallProfiles([
        '--tarball',
        '/unused.tgz',
        '--output',
        '/unused-output',
        '--registry',
        'https://registry.npmjs.org/',
      ]),
    ).rejects.toThrow('fixture artifact validation');
    expect(stat).toHaveBeenCalledTimes(1);
  });

  it('rejects Windows measurement before an uncontained process can run', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' });
    const command = vi.spyOn(childProcess, 'execFileSync');
    const mkdir = vi.spyOn(fs, 'mkdirSync');
    await expect(
      measureInstallProfiles(['--tarball', '/unused.tgz', '--output', '/unused-output']),
    ).rejects.toThrow('Install profile measurement requires POSIX process groups');
    expect(command).not.toHaveBeenCalled();
    expect(mkdir).not.toHaveBeenCalled();
  });
});
