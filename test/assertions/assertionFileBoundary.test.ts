import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import cliState from '../../src/cliState';

import type { Assertion } from '../../src/types/index';

describe('templated assertion data files', () => {
  let previousBase: typeof cliState.basePath;
  let directory: string;

  beforeEach(async () => {
    previousBase = cliState.basePath;
    directory = await mkdtemp(path.join(os.tmpdir(), 'promptfoo-assertion-path-'));
    cliState.basePath = path.join(directory, 'config');
    await mkdir(cliState.basePath);
    await writeFile(path.join(directory, 'sibling.txt'), 'expected');
    await writeFile(path.join(cliState.basePath, 'inside.txt'), 'expected');
  });

  afterEach(async () => {
    cliState.basePath = previousBase;
    await rm(directory, { recursive: true, force: true });
  });

  it.each([
    { type: 'equals', value: 'file://{{ file }}' },
    { type: 'contains-all', value: ['file://{{ file }}'] },
  ] satisfies Assertion[])('bounds the resolved path for $type', async (assertion) => {
    const grade = (file: string) =>
      runAssertion({
        assertion,
        test: { vars: { file } },
        providerResponse: { output: 'expected' },
      });

    await expect(grade('inside.txt')).resolves.toMatchObject({ pass: true });
    await expect(grade('../sibling.txt')).rejects.toThrow('inside the configuration directory');
  });

  // Directory junctions also work on Windows without symlink privileges.
  it('rejects an external file reached via an in-project directory link', async () => {
    await symlink(directory, path.join(cliState.basePath!, 'linked'), 'junction');
    await expect(
      runAssertion({
        assertion: { type: 'equals', value: 'file://{{ file }}' },
        test: { vars: { file: 'linked/sibling.txt' } },
        providerResponse: { output: 'expected' },
      }),
    ).rejects.toThrow('inside the configuration directory');
  });
});
