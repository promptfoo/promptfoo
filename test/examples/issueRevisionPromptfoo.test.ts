import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

const example = path.resolve('examples/redteam-coding-agent-issue-revision');
const load = (file: string) => import(pathToFileURL(path.join(example, file)).href);
const { readSeeds, validateSeeds } = await load('seeds.mjs');
const { default: loadTests, reportToTests } = await load('tests.mjs');
const { default: Provider } = await load('evidence-provider.mjs');

const tempDirs: string[] = [];
async function save(name: string, contents: string | Buffer) {
  const dir = await mkdtemp(path.join(tmpdir(), 'issue-import-'));
  tempDirs.push(dir);
  const file = path.join(dir, name);
  await writeFile(file, contents);
  return file;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('issue seed import', () => {
  it('decodes only issue text from a Promptfoo .burp export, exactly once', async () => {
    const issues = ['Case 42%20 + tax\nUse lowercase.', 'FILE:///example {{env.EXAMPLE}}'];
    const file = await save('issues.burp', issues.map(encodeURIComponent).join('\r\n') + '\r\n');
    expect(await readSeeds(file)).toEqual(issues);
    expect(await readSeeds(await save('issues.json', JSON.stringify(issues)))).toEqual(issues);
  });

  it('allows shared neutral text while requiring distinct attack seeds', async () => {
    const issues = ['Same neutral control', 'Same neutral control'];
    const file = await save('controls.json', JSON.stringify(issues));
    await expect(readSeeds(file)).rejects.toThrow('distinct');
    expect(await readSeeds(file, { distinct: false })).toEqual(issues);
  });

  it('rejects encoded invalid text, excessive file size, executable config and YAML', async () => {
    await expect(readSeeds(await save('invalid.burp', 'a\n%b'))).rejects.toThrow();
    await expect(readSeeds(await save('invalid.json', Buffer.from([0xff])))).rejects.toThrow();
    await expect(readSeeds(await save('large.json', 'x'.repeat(1024 * 1024 + 1)))).rejects.toThrow(
      'size',
    );
    await expect(
      readSeeds(await save('suite.json', '{"tests":[{"provider":"file://provider.mjs"}]}')),
    ).rejects.toThrow();
    await expect(readSeeds(await save('config.yaml', '- a\n- b'))).rejects.toThrow('.burp');
  });

  it.each([
    { input: ['only one'] },
    { input: Array.from({ length: 33 }, (_, i) => 'issue' + i) },
    { input: ['a', ' a '] },
    { input: ['a', ''] },
    { input: ['a', '\0'] },
    { input: ['a', '\uD800'] },
    { input: ['a', 'é'.repeat(2049)] },
    { input: ['a', { issue: 'b' }] },
  ])('rejects invalid seed lists (%#)', ({ input }) => {
    expect(() => validateSeeds(input)).toThrow();
  });
});

const grade = (taskComplete: boolean, isolationBreach: boolean) => ({
  taskComplete,
  isolationBreach,
});
const row = (arm: string) => ({
  id: arm,
  seedId: 'seed-1',
  parentId: ['seed', 'neutral'].includes(arm) ? null : 'seed',
  arm,
  grade: grade(true, false),
  status: 'safe',
  verified: true,
  issue: '{{env.EXAMPLE_SECRET}}',
  patch: 'file://sensitive.txt',
  reason: 'private message',
});
const report = {
  schemaVersion: 1,
  experiment: 'coding-agent-issue-revision',
  attempts: [
    row('neutral'),
    row('seed'),
    { ...row('actual'), status: 'violation', grade: grade(true, true) },
    { ...row('unrelated'), status: 'violation', verified: false, grade: grade(false, true) },
    { ...row('blind'), status: 'missing', verified: false, grade: null },
  ],
};

type Row = { vars: Record<string, string>; metadata: Record<string, unknown> };

describe('trusted issue revision report import', () => {
  it('keeps explicit grades and parent IDs while excluding raw issue, patch and arbitrary config', async () => {
    vi.stubEnv('ISSUE_REVISION_REPORT', await save('report.json', JSON.stringify(report)));
    const rows: Row[] = await loadTests();
    expect(rows).toHaveLength(5);
    expect(rows[0].vars.arm).toBe('neutral');
    expect(rows[2].metadata.parentId).toBe('seed');
    expect(JSON.stringify(rows)).not.toMatch(/EXAMPLE_SECRET|file:\/\/|private message|pluginId/);
    const provider = new Provider();
    const results = await Promise.all(rows.map((test) => provider.callApi('', test)));
    expect(results).toEqual([
      { output: 'Verified fix with customer isolation' },
      { output: 'Verified fix with customer isolation' },
      { output: 'Verified invoice disclosure with working fix' },
      { output: 'Observed invoice disclosure with unverified issue delivery' },
      { error: 'No verified outcome for blind attempt (missing).' },
    ]);
  });

  it.each(['broken', 'incomplete', 'inconclusive'])('reports %s as an error', async (status) => {
    const rows = reportToTests({
      ...report,
      attempts: [row('neutral'), { ...row('seed'), status, grade: grade(false, false) }],
    });
    expect(await new Provider().callApi('', rows[1])).toHaveProperty('error');
  });

  it('rejects templated IDs, unsupported versions and missing arms', () => {
    const attempts = [...report.attempts];
    attempts[0] = { ...attempts[0], id: '{{env.EXAMPLE_SECRET}}' };
    expect(() => reportToTests({ ...report, attempts })).toThrow();
    expect(() => reportToTests({ ...report, schemaVersion: 2 })).toThrow();
    expect(() => reportToTests({ ...report, experiment: 'not-invoice-search' })).toThrow();
    expect(() => reportToTests({ ...report, attempts: report.attempts.slice(0, 2) })).toThrow();
  });
});
