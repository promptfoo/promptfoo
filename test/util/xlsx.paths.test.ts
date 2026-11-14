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

  for (const folder of [
    'plain',
    'suite#archive',
    'outer#one/inner#two',
    'outer#one/suite.xlsx#archive/deeper',
  ]) {
    for (const relative of [false, true]) {
      it.each([
        ['', 'primary'],
        ['#', 'primary'],
        ['#2', 'other'],
        ['#Other', 'other'],
      ])(
        'loads ' + folder + ' (relative=' + relative + ') with selector %s',
        async (selector, value) => {
          const filename = path.join(directory, folder, 'cases.xlsx');
          fs.mkdirSync(path.dirname(filename), { recursive: true });
          fs.copyFileSync(fixture, filename);
          const source = relative ? path.relative(process.cwd(), filename) : filename;
          const reference = source + selector;
          const expected = [{ value: value + '-a' }, { value: value + '-b' }];

          expect(await parseXlsxFile(reference)).toEqual(expected);
          const fileReference = 'file://' + reference;
          for (const read of [readStandaloneTestsFile, readTests, readTestConfigs]) {
            expect((await read(fileReference, process.cwd())).map((test) => test.vars)).toEqual(
              expected,
            );
          }
          for (const read of [readTests, readTestConfigs]) {
            expect(
              (await read({ path: fileReference }, process.cwd())).map((test) => test.vars),
            ).toEqual(expected);
          }
        },
      );
    }
  }

  it.each([
    ['#0', 'Sheet index 0 is out of range.'],
    ['#Missing', 'Sheet "Missing" not found.'],
  ])('validates %s after opening the workbook below a hash directory', async (selector, error) => {
    const filename = path.join(directory, 'suite#archive', 'cases.xlsx');
    fs.mkdirSync(path.dirname(filename));
    fs.copyFileSync(fixture, filename);

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
