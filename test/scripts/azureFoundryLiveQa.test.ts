import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock('node:child_process', () => ({
  execFile: mocks.execFile,
  execFileSync: vi.fn(() => 'fixture-head'),
}));

describe('Azure Foundry live QA export failures', () => {
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
      'https://fixture.invalid/api/projects/test',
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
