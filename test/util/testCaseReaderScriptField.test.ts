import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

import { dump as dumpYaml } from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadTestsFromGlob } from '../../src/util/testCaseReader';

describe('external test script fields', () => {
  let testDirectory: string;

  beforeEach(async () => {
    testDirectory = await mkdtemp(path.join(tmpdir(), 'promptfoo-script-fields-'));
  });

  afterEach(async () => {
    await rm(testDirectory, { recursive: true, force: true });
  });

  it.each([
    ['yaml', (testCase: object) => dumpYaml([testCase])],
    ['json', (testCase: object) => JSON.stringify([testCase])],
    ['jsonl', (testCase: object) => JSON.stringify(testCase)],
  ])('preserves script URLs loaded from %s tests', async (extension, serialize) => {
    const testCase = {
      assert: [
        {
          type: 'ruby',
          script: 'file://assertions/check.rb:Checks::check_value',
          value: 'call-site value',
        },
      ],
    };
    const testFile = path.join(testDirectory, `tests.${extension}`);
    await writeFile(testFile, serialize(testCase));

    const tests = await loadTestsFromGlob(testFile);

    expect(tests).toHaveLength(1);
    expect(tests[0].assert).toEqual(testCase.assert);
  });
});
