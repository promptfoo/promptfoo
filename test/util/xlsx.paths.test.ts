import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readStandaloneTestsFile, readTestConfigs, readTests } from '../../src/util/testCaseReader';
import { parseXlsxFile } from '../../src/util/xlsx';

describe('workbooks below directories containing hashes', () => {
  let directory: string;
  const fixture = path.resolve(__dirname, '../fixtures/xlsx-parent-hashes.xlsx');

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-xlsx-path-'));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function workbook(folder: string): string {
    const filename = path.join(directory, folder, 'cases.xlsx');
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.copyFileSync(fixture, filename);
    return filename;
  }

  it.each([
    ['plain', '', 'primary', true],
    ['suite#archive', '#', 'primary', false],
    ['outer#one/inner#two', '#2', 'other', true],
    ['outer#one/suite.xlsx#archive/deeper', '#Other', 'other', false],
  ] as const)('loads %s with selector %s', async (folder, selector, sheet, relative) => {
    const file = workbook(folder);
    const source = relative ? path.relative(process.cwd(), file) : file;
    expect(await parseXlsxFile(source + selector)).toEqual([
      { value: sheet + '-a' },
      { value: sheet + '-b' },
    ]);
  });

  it('routes a workbook with a hash in its directory through each test reader', async () => {
    const reference = 'file://' + workbook('suite#archive') + '#Other';
    const expected = [{ value: 'other-a' }, { value: 'other-b' }];
    for (const read of [readStandaloneTestsFile, readTests, readTestConfigs]) {
      expect((await read(reference, process.cwd())).map((test) => test.vars)).toEqual(expected);
    }
    for (const read of [readTests, readTestConfigs]) {
      expect((await read({ path: reference }, process.cwd())).map((test) => test.vars)).toEqual(
        expected,
      );
    }
  });

  it.each([
    ['#0', 'Sheet index 0 is out of range.'],
    ['#Missing', 'Sheet "Missing" not found.'],
  ])('validates %s after opening the workbook below a hash directory', async (selector, error) => {
    const filename = workbook('suite#archive');

    await expect(parseXlsxFile(filename + selector)).rejects.toThrow(error);
    await expect(readTests('file://' + filename + selector)).rejects.toThrow(error);
  });

  it.each(['', '#Other'])(
    'reports the complete missing workbook path with selector %s',
    async (selector) => {
      const filename = path.join(directory, 'suite#archive', 'missing.xlsx');
      await expect(parseXlsxFile(filename + selector)).rejects.toThrow(
        'File not found: ' + filename,
      );
    },
  );
});
