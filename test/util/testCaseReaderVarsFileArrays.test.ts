import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { readTestFiles } from '../../src/util/testCaseReader';

// Real files on purpose: string arrays in a vars file used to go through the eager
// loader, which rendered templated paths and expanded globs. These pin that behaviour.
describe('readTestFiles string array vars', () => {
  let base: string;
  const originalBasePath = cliState.basePath;

  beforeAll(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-vars-arrays-'));
    fs.mkdirSync(path.join(base, 'reports'));
    fs.writeFileSync(path.join(base, 'reports', 'a.txt'), 'alpha');
    fs.writeFileSync(path.join(base, 'reports', 'b.txt'), 'beta');
  });

  afterEach(() => {
    cliState.basePath = originalBasePath;
    vi.unstubAllEnvs();
  });

  afterAll(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  const read = async (yaml: string) => {
    fs.writeFileSync(path.join(base, 'vars.yaml'), yaml);
    cliState.basePath = base;
    return readTestFiles('vars.yaml', base);
  };

  it('loads a glob entry in place instead of leaving the pattern for the per-value loader', async () => {
    const vars = await read('docs:\n  - file://reports/*.txt\n');
    expect(vars.docs).toEqual([expect.arrayContaining(['alpha', 'beta'])]);
    expect((vars.docs as string[][])[0]).toHaveLength(2);
  });

  it('marks a glob-expanded array key as loaded and leaves nested file:// paths literal', async () => {
    fs.writeFileSync(
      path.join(base, 'reports', 'payload.json'),
      JSON.stringify({ path: 'file:///private/canary.txt' }),
    );
    const keys = new Set<string>();
    fs.writeFileSync(path.join(base, 'vars.yaml'), 'docs:\n  - file://reports/*.json\n');
    cliState.basePath = base;
    const vars = await readTestFiles('vars.yaml', base, keys);
    expect(keys.has('docs')).toBe(true);
    expect(vars.docs).toEqual([[{ path: 'file:///private/canary.txt' }]]);
  });

  it('renders templated paths and leaves plain entries as references', async () => {
    vi.stubEnv('PF_TEST_REPORTS_DIR', 'reports');
    const vars = await read(
      'docs:\n  - file://{{ env.PF_TEST_REPORTS_DIR }}/a.txt\n  - file://reports/b.txt\n  - plain\n',
    );
    expect(vars.docs).toEqual(['file://reports/a.txt', 'file://reports/b.txt', 'plain']);
  });
});
