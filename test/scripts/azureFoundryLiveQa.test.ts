import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../util/utils';

const mocks = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock('node:child_process', () => ({
  execFile: mocks.execFile,
  execFileSync: vi.fn(() => 'fixture-head'),
}));

describe('Azure Foundry live QA', () => {
  let directory: string;
  let originalArgv: string[];
  let originalExitCode: typeof process.exitCode;
  const completed = { success: true, score: 1, response: { output: 'FOUNDRY_QA_OK' } };

  beforeEach(() => {
    vi.resetModules();
    mocks.execFile.mockReset();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-export-test-'));
    originalArgv = process.argv;
    originalExitCode = process.exitCode;
    process.argv = [
      'node',
      'azureFoundryLiveQa.ts',
      '--live',
      '--endpoint',
      'https://fixture.services.ai.azure.com/api/projects/test',
      '--agent',
      'fixture-agent',
      '--output',
      path.join(directory, 'output'),
    ];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it.each([
    'https://fixture.invalid/api/projects/test',
    'https://fixture.services.ai.azure.com.invalid/api/projects/test',
    'https://fixture-services.ai.azure.com/api/projects/test',
    'https://services.ai.azure.com/api/projects/test',
    'https://nested.fixture.services.ai.azure.com/api/projects/test',
    'https://localhost/api/projects/test',
    'https://127.0.0.1/api/projects/test',
    'https://[::1]/api/projects/test',
    'https://fixture.services.ai.azure.com:8443/api/projects/test',
    'http://fixture.services.ai.azure.com/api/projects/test',
    'https://user:password@fixture.services.ai.azure.com/api/projects/test',
    'https://fixture.services.ai.azure.com/api/projects/test?extra=value',
    'https://fixture.services.ai.azure.com/api/projects/test#fragment',
    'https://fixture.services.ai.azure.com/api/projects/test/extra',
  ])(
    'rejects an unsupported endpoint before files or SDK-capable child execution: %s',
    async (url) => {
      process.argv[process.argv.indexOf('--endpoint') + 1] = url;
      mocks.execFile.mockImplementation(() => {
        throw new Error('Unexpected SDK-capable eval subprocess');
      });
      await expect(import('../../scripts/azureFoundryLiveQa')).rejects.toThrow(
        'Use an HTTPS Foundry project endpoint',
      );
      expect(mocks.execFile).not.toHaveBeenCalled();
      expect(fs.existsSync(path.join(directory, 'output'))).toBe(false);
    },
  );

  it.each([
    'https://fixture.services.ai.azure.com/api/projects/test',
    'https://fixture.services.ai.azure.us/api/projects/test',
    'https://FIXTURE.services.ai.azure.com/api/projects/test',
    'https://fixture.services.ai.azure.com:443/api/projects/test',
    'https://fixture.services.ai.azure.us/api/projects/test/',
  ])('accepts a documented project endpoint without SDK calls in dry-run mode: %s', async (url) => {
    process.argv[process.argv.indexOf('--endpoint') + 1] = url;
    process.argv[process.argv.indexOf('--live')] = '--dry-run';
    await import('../../scripts/azureFoundryLiveQa');
    expect(mocks.execFile).not.toHaveBeenCalled();
    const output = path.join(directory, 'output');
    const metadata = JSON.parse(fs.readFileSync(path.join(output, 'metadata.json'), 'utf8'));
    expect(metadata.endpoint).toBe(new URL(url).toString());
    expect(metadata.live).toBe(false);
    for (const name of ['text', 'structured', 'tool']) {
      expect(fs.existsSync(path.join(output, `${name}.json`))).toBe(true);
    }
  });

  it.each(['inherited environment', '.env'])(
    'keeps child logs isolated from a directory configured through %s',
    async (source) => {
      const externalLogs = path.join(directory, 'external-logs');
      fs.mkdirSync(externalLogs);
      // Exceed logger retention so an escaped directory also exposes unwanted pruning.
      const sentinels = Array.from({ length: 60 }, (_, i) => `promptfoo-debug-sentinel-${i}.log`);
      for (const name of sentinels) {
        fs.writeFileSync(path.join(externalLogs, name), 'preserve existing logs');
      }
      fs.writeFileSync(path.join(directory, '.env'), `PROMPTFOO_LOG_DIR=${externalLogs}\n`);
      const restoreEnv = mockProcessEnv({
        PROMPTFOO_LOG_DIR: source === 'inherited environment' ? externalLogs : undefined,
      });
      try {
        mocks.execFile.mockImplementation((_file, args, _options, callback) => {
          fs.writeFileSync(
            args[args.indexOf('-o') + 1],
            JSON.stringify({ results: { results: [completed] } }),
          );
          fs.appendFileSync(path.join(directory, 'output', 'callbacks.jsonl'), '{}\n');
          callback(null, '', '');
        });
        await import('../../scripts/azureFoundryLiveQa');

        const { execFileSync } =
          await vi.importActual<typeof import('node:child_process')>('node:child_process');
        const options = mocks.execFile.mock.calls[0][2];
        execFileSync(
          process.execPath,
          [
            '--import',
            'tsx',
            '--input-type=module',
            '--eval',
            `import { setupEnv } from ${JSON.stringify(new URL('../../src/util/env.ts', import.meta.url).href)};
             import logger, { initializeRunLogging, closeLogger } from ${JSON.stringify(new URL('../../src/logger.ts', import.meta.url).href)};
             process.chdir(${JSON.stringify(directory)});
             setupEnv(undefined, { refreshConfigDirectory: true });
             initializeRunLogging();
             logger.error('isolated Foundry QA fixture');
             await closeLogger();`,
          ],
          {
            cwd: options.cwd,
            env: {
              ...options.env,
              PROMPTFOO_DISABLE_DEBUG_LOG: 'false',
              PROMPTFOO_DISABLE_ERROR_LOG: 'false',
            },
            stdio: 'pipe',
          },
        );

        expect(fs.readdirSync(externalLogs).sort()).toEqual(sentinels.sort());
        const isolatedLogs = path.join(directory, 'output', 'promptfoo', 'logs');
        expect(fs.readdirSync(isolatedLogs)).toHaveLength(2);
        for (const name of fs.readdirSync(isolatedLogs)) {
          expect(fs.readFileSync(path.join(isolatedLogs, name), 'utf8')).toContain(
            'isolated Foundry QA fixture',
          );
        }
        expect(mocks.execFile).toHaveBeenCalledTimes(3);
        for (const [, , childOptions] of mocks.execFile.mock.calls) {
          expect(childOptions.env.PROMPTFOO_LOG_DIR).toBe(isolatedLogs);
        }
      } finally {
        restoreEnv();
      }
    },
  );

  it.each([
    ['truncated JSON', '{"results":', false],
    ['killed partial export', '{"results":', true],
    ['missing envelope', '{}', false],
    ['non-array rows', '{"results":{"results":{}}}', false],
    ['null row', '{"results":{"results":[null]}}', false],
    ['invalid success', '{"results":{"results":[{"success":"true","score":1}]}}', false],
    ['invalid score', '{"results":{"results":[{"success":true,"score":"1"}]}}', false],
    [
      'invalid response',
      '{"results":{"results":[{"success":true,"score":1,"response":42}]}}',
      false,
    ],
  ] as const)(
    'retains completed evidence and stops after %s',
    async (_name, invalidExport, killed) => {
      let runs = 0;
      mocks.execFile.mockImplementation((_file, args, _options, callback) => {
        runs += 1;
        const output = args[args.indexOf('-o') + 1];
        fs.writeFileSync(
          output,
          runs === 1 ? JSON.stringify({ results: { results: [completed] } }) : invalidExport,
        );
        callback(
          runs === 2 && killed
            ? Object.assign(new Error('Fixture child killed'), { killed: true, signal: 'SIGKILL' })
            : null,
          '',
          '',
        );
      });

      await import('../../scripts/azureFoundryLiveQa');

      const output = path.join(directory, 'output');
      const summary = JSON.parse(fs.readFileSync(path.join(output, 'summary.json'), 'utf8'));
      expect(process.exitCode).toBe(1);
      expect(runs).toBe(2);
      expect(summary).toHaveLength(2);
      expect(summary[0]).toMatchObject({
        case: 'text',
        exitCode: 0,
        results: [{ success: true, score: 1, output: 'FOUNDRY_QA_OK' }],
      });
      expect(summary[1]).toMatchObject({
        case: 'structured',
        error: expect.stringContaining('invalid or incomplete results'),
      });
      expect(summary[1].error).not.toContain(invalidExport);
      if (killed) {
        expect(summary[1].error).toContain('CLI terminated before completion');
      }
      expect(fs.readFileSync(path.join(output, 'structured-results.json'), 'utf8')).toBe(
        invalidExport,
      );
      expect(fs.existsSync(path.join(output, 'tool.json'))).toBe(false);
    },
  );
});
