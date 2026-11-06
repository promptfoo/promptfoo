import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { metamorphicCommand } from '../../src/commands/metamorphic';
import logger from '../../src/logger';
import { shouldSkipDefaultConfigLoading } from '../../src/mainUtils';

vi.mock('../../src/logger', () => ({ default: { info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn(), initialize: vi.fn() } }));
vi.mock('../../src/util/env', () => ({ setupEnv: vi.fn() }));
const directories: string[] = [];
let priorExit: typeof process.exitCode;
beforeEach(() => {
  priorExit = process.exitCode;
  vi.resetAllMocks();
});
afterEach(async () => {
  process.exitCode = priorExit;
  vi.resetAllMocks();
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'metamorphic-command-'));
  directories.push(dir);
  const planPath = path.join(dir, 'plan.json');
  const resultsPath = path.join(dir, 'results.json');
  await writeFile(
    planPath,
    JSON.stringify({
      version: 1,
      name: 'example',
      repetitions: 1,
      contexts: [{ id: 'c', promptIdx: 0, providerId: 'echo' }],
      families: [
        {
          id: 'f',
          variants: ['a', 'b'],
          relations: [
            {
              id: 'r',
              kind: 'equal',
              left: 'a',
              right: 'b',
              leftSelector: { source: 'output' },
              rightSelector: { source: 'output' },
            },
          ],
        },
      ],
    }),
  );
  const rows = ['a', 'b'].map((variantId) => ({
    promptIdx: 0,
    provider: { id: 'echo' },
    success: true,
    failureReason: 0,
    testCase: { metadata: { metamorphic: { familyId: 'f', variantId } } },
    response: { output: 'same' },
  }));
  await writeFile(resultsPath, JSON.stringify({ results: { version: 3, results: rows } }));
  return { dir, planPath, resultsPath, rows };
}
async function command(args: string[]) {
  const program = new Command().exitOverride();
  metamorphicCommand(program);
  await program.parseAsync(['metamorphic', ...args], { from: 'user' });
}
describe('metamorphic CLI', () => {
  it('writes a complete machine-readable report with a passing exit code', async () => {
    const f = await fixture();
    const output = path.join(f.dir, 'report.json');
    await command(['check', f.resultsPath, '--plan', f.planPath, '--format', 'json', '-o', output]);
    expect(process.exitCode).toBe(0);
    expect(JSON.parse(await readFile(output, 'utf8')).verdict).toBe('pass');
  });
  it('preserves fail and incomplete exit status when details are omitted', async () => {
    const f = await fixture();
    f.rows[1].response.output = 'different';
    await writeFile(f.resultsPath, JSON.stringify({ results: { version: 3, results: f.rows } }));
    await command(['check', f.resultsPath, '--plan', f.planPath, '--max-details', '0']);
    expect(process.exitCode).toBe(1);
    await writeFile(
      f.resultsPath,
      JSON.stringify({ results: { version: 3, results: [f.rows[0]] } }),
    );
    await command(['check', f.resultsPath, '--plan', f.planPath, '--max-details', '0']);
    expect(process.exitCode).toBe(2);
  });
  it.each(['-1', '1e3', '2.5', '100001'])('rejects invalid detail limit %s', async (value) => {
    const f = await fixture();
    await command(['check', f.resultsPath, '--plan', f.planPath, '--max-details', value]);
    expect(process.exitCode).toBe(1);
    expect(logger.error).toHaveBeenCalled();
  });
  it('requires JSON for explicit value inclusion', async () => {
    const f = await fixture();
    await command(['check', f.resultsPath, '--plan', f.planPath, '--include-values']);
    expect(process.exitCode).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('requires --format json'));
  });
  it('inspects identities and validates a plan without target execution', async () => {
    const f = await fixture();
    await command(['inspect', f.resultsPath, '--format', 'json']);
    expect(process.exitCode).toBe(0);
    expect(
      JSON.parse(vi.mocked(logger.info).mock.calls.at(-1)![0] as string).contexts,
    ).toHaveLength(1);
    await command(['validate-plan', f.planPath, '--format', 'json']);
    expect(
      JSON.parse(vi.mocked(logger.info).mock.calls.at(-1)![0] as string).expectedObservations,
    ).toBe(2);
  });
  it('skips default JS config after supported global options', () => {
    for (const args of [
      ['metamorphic', 'check'],
      ['--verbose', 'metamorphic', 'inspect'],
      ['--env-file', 'path.env', 'metamorphic', 'validate-plan'],
      ['--env-file=x', 'metamorphic', 'check'],
    ]) {
      expect(shouldSkipDefaultConfigLoading(args)).toBe(true);
    }
    expect(shouldSkipDefaultConfigLoading(['eval', '--config', 'metamorphic'])).toBe(false);
  });
});
