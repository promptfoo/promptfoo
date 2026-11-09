import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readTestConfigs, readTests, resolveTestsWatchPaths } from '../../src/util/testCaseReader';

describe('workbook test file globs', () => {
  let directory: string;
  const expectedRows = [{ value: 'first' }, { value: 'second' }];

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-workbook-glob-'));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function writeWorkbook(filename: string) {
    const destination = path.join(directory, filename);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(
      path.resolve(__dirname, '../fixtures/test-data-extension-selectors.xlsx'),
      destination,
    );
    return destination;
  }

  for (const prefix of ['', 'file://']) {
    it.each(['xlsx', 'XLSX', 'XlSx', 'xls', 'XLS', 'XlS'])(
      'expands ' + prefix + 'workbook globs with a %s extension',
      async (extension) => {
        const files = ['one', 'two'].map((name) =>
          writeWorkbook('Cases/' + name + '.' + extension),
        );
        const reference = prefix + 'Cases/*.' + extension;

        for (const read of [readTests, readTestConfigs]) {
          for (const input of [reference, [reference]]) {
            expect((await read(input, directory)).map((test) => test.vars)).toEqual([
              ...expectedRows,
              ...expectedRows,
            ]);
          }
        }
        expect(resolveTestsWatchPaths(reference, directory).sort()).toEqual(files.sort());
      },
    );
  }

  it.each(['xlsx', 'XLSX'])(
    'expands a brace workbook glob below a literal bracket directory: %s',
    async (extension) => {
      const files = ['one', 'two'].map((name) =>
        writeWorkbook('Cases[1]/' + name + '.' + extension),
      );
      const basePath = path.join(directory, 'Cases[1]');
      const reference = 'file://{one,two}.' + extension;

      for (const read of [readTests, readTestConfigs]) {
        for (const input of [reference, [reference]]) {
          expect((await read(input, basePath)).map((test) => test.vars)).toEqual([
            ...expectedRows,
            ...expectedRows,
          ]);
        }
      }
      expect(resolveTestsWatchPaths(reference, basePath).sort()).toEqual(files.sort());
    },
  );

  it.each(['xlsx', 'XLSX'])(
    'returns no rows for an unmatched workbook glob: %s',
    async (extension) => {
      const reference = 'file://missing/*.' + extension;
      for (const read of [readTests, readTestConfigs]) {
        await expect(read(reference, directory)).resolves.toEqual([]);
        await expect(read([reference], directory)).resolves.toEqual([]);
      }
    },
  );

  it.each([
    ['xlsx', '#ordinary'],
    ['XLSX', '#ordinary'],
    ['xls', '#1'],
    ['XLS', '#1'],
  ])('rejects workbook globs with a sheet selector: %s%s', async (extension, selector) => {
    writeWorkbook('Cases/one.' + extension);
    const reference = 'file://Cases/*.' + extension + selector;

    for (const read of [readTests, readTestConfigs]) {
      for (const input of [reference, [reference], { path: reference }]) {
        await expect(read(input, directory)).rejects.toThrow('File not found:');
      }
    }
  });

  it.each([
    ['Cases[1].xlsx', 'Cases1.xlsx', ''],
    ['Cases[1].XLSX', 'Cases1.XLSX', '#ordinary'],
    ['Data[1]/Cases.xlsx', 'Data1/Cases.xlsx', '#1'],
    ['Cases.xlsx', 'unused.xlsx', '#Data{a,b}'],
    ['Cases[1].xlsx', 'Cases1.xlsx', '#Data{a,b}'],
  ])('preserves literal %s with decoy %s and selector %s', async (filename, decoy, selector) => {
    const workbook = writeWorkbook(filename);
    fs.mkdirSync(path.dirname(path.join(directory, decoy)), { recursive: true });
    fs.writeFileSync(path.join(directory, decoy), 'Not an Excel workbook');
    const reference = 'file://' + filename + selector;

    for (const read of [readTests, readTestConfigs]) {
      for (const input of [reference, [reference], { path: reference }]) {
        expect((await read(input, directory)).map((test) => test.vars)).toEqual(expectedRows);
      }
    }
    expect(resolveTestsWatchPaths(reference, directory)).toEqual([workbook]);
  });

  it.each(['YAML', 'YmL'])(
    'keeps a workbook selector ending in %s on the Excel loader',
    async (extension) => {
      const workbook = writeWorkbook('C# fixtures/Cases#2.XLSX');
      const reference = 'file://C# fixtures/Cases#2.XLSX#missing.' + extension;

      for (const read of [readTests, readTestConfigs]) {
        for (const input of [reference, [reference], { path: reference }]) {
          await expect(read(input, directory)).rejects.toThrow(
            'Sheet "missing.' + extension + '" not found',
          );
        }
      }
      expect(resolveTestsWatchPaths(reference, directory)).toEqual([workbook]);
    },
  );
});
