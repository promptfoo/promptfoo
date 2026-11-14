import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  readStandaloneTestsFile,
  readTestConfigs,
  readTests,
  resolveTestsWatchPaths,
} from '../../src/util/testCaseReader';

describe('test data file extension matching', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-test-data-case-'));
    directory = path.join(directory, 'DataDirectory');
    fs.mkdirSync(directory);
  });

  afterEach(() => {
    fs.rmSync(path.dirname(directory), { recursive: true, force: true });
  });

  const loaders = {
    standalone: readStandaloneTestsFile,
    scalar: readTests,
    array: (file: string, base: string) => readTests([file], base),
    'config-array': (file: string, base: string) => readTestConfigs([file], base),
  };
  const formats = ['csv', 'json', 'jsonl', 'yaml', 'yml'] as const;
  const values = [{ value: 'first' }, { value: 'second' }];
  const tests = values.map((vars) => ({ vars }));

  for (const [loader, read] of Object.entries(loaders)) {
    for (const format of formats) {
      it.each([format, format.toUpperCase(), format[0].toUpperCase() + format.slice(1)])(
        'loads ' + loader + ' data with a %s extension',
        async (extension) => {
          const filename = 'ExampleData.' + extension;
          const yamlRows = loader === 'standalone' ? values : tests;
          const content =
            format === 'csv'
              ? 'value\nfirst\nsecond\n'
              : format === 'jsonl'
                ? tests.map((test) => JSON.stringify(test)).join('\n')
                : JSON.stringify(format === 'yaml' || format === 'yml' ? yamlRows : tests);
          fs.writeFileSync(path.join(directory, filename), content);

          const result = await read(filename, directory);
          expect(result.map((test) => test.vars)).toEqual(values);
        },
      );
    }
  }

  it.each(['xlsx', 'XLSX', 'XlSx'])(
    'loads Excel data with a %s extension and sheet selector',
    async (extension) => {
      const filename = 'ExampleData.' + extension;
      fs.copyFileSync(
        path.resolve(__dirname, '../../examples/simple-csv/tests.xlsx'),
        path.join(directory, filename),
      );

      for (const reference of [filename, filename + '#1']) {
        const results = [
          await readStandaloneTestsFile(reference, directory),
          await readTests(reference, directory),
          await readTests([reference], directory),
          await readTestConfigs([reference], directory),
        ];
        for (const result of results) {
          expect(result).toHaveLength(4);
          expect(result.find((test) => test.vars?.language === 'French')?.vars?.body).toBe(
            'Hello world',
          );
        }
      }
    },
  );

  it.each(['yaml', 'YAML', 'yml', 'YmL'])(
    'watches the variables loaded by a nested %s test file',
    async (extension) => {
      const nested = path.join(directory, 'NestedData');
      fs.mkdirSync(nested);
      fs.writeFileSync(path.join(directory, 'Values.yaml'), 'value: wrong-directory');
      fs.writeFileSync(path.join(nested, 'Values.yaml'), 'value: expected-directory');
      const reference = path.join('NestedData', 'Cases.' + extension);
      fs.writeFileSync(path.join(directory, reference), JSON.stringify([{ vars: 'Values.yaml' }]));

      expect(resolveTestsWatchPaths(reference, directory)).toEqual([
        path.join(directory, reference),
        path.join(nested, 'Values.yaml'),
      ]);
      const result = await readTests(reference, directory);
      expect(result.map((test) => test.vars)).toEqual([{ value: 'expected-directory' }]);
    },
  );

  it.each(['.yaml', '.yml', '.json', '.jsonl'])(
    'preserves loading %s dotfiles',
    async (filename) => {
      const content =
        filename === '.jsonl'
          ? tests.map((test) => JSON.stringify(test)).join('\n')
          : JSON.stringify(tests);
      fs.writeFileSync(path.join(directory, filename), content);
      expect((await readTests([filename], directory)).map((test) => test.vars)).toEqual(values);
      expect((await readTestConfigs([filename], directory)).map((test) => test.vars)).toEqual(
        values,
      );
      if (filename === '.yaml' || filename === '.yml') {
        expect((await readTests(filename, directory)).map((test) => test.vars)).toEqual(values);
      }
    },
  );

  it.each([
    ['cases.notYAML', false],
    ['cases.notYML', false],
    ['cases.notYaml', false],
    ['cases.notYml', false],
    ['casesnotYAML', false],
    ['casesnotYML', false],
    ['cases.notyaml', true],
    ['cases.notyml', true],
    ['casesnotyaml', true],
    ['casesnotyml', true],
  ] as const)('preserves legacy routing for %s', async (filename, scalarThrows) => {
    fs.writeFileSync(path.join(directory, filename), JSON.stringify(tests));
    await expect(readStandaloneTestsFile(filename, directory)).resolves.toEqual([]);
    for (const read of [readTests, readTestConfigs]) {
      if (scalarThrows) {
        await expect(read(filename, directory)).rejects.toThrow(
          'Unsupported file type for test file:',
        );
      } else {
        await expect(read(filename, directory)).resolves.toEqual([]);
      }
      await expect(read([filename], directory)).rejects.toThrow(
        'Unsupported file type for test file:',
      );
    }
    expect(resolveTestsWatchPaths(filename, directory)).toEqual([path.join(directory, filename)]);
  });

  it.each(['.YAML', '.YML'])(
    'loads the %s dotfile through both scalar readers and watches its vars file',
    async (filename) => {
      fs.writeFileSync(path.join(directory, filename), JSON.stringify([{ vars: 'Values.yaml' }]));
      fs.writeFileSync(path.join(directory, 'Values.yaml'), 'value: from-vars-file');
      for (const read of [readTests, readTestConfigs]) {
        expect((await read(filename, directory)).map((test) => test.vars)).toEqual([
          { value: 'from-vars-file' },
        ]);
      }
      expect(resolveTestsWatchPaths(filename, directory)).toEqual([
        path.join(directory, filename),
        path.join(directory, 'Values.yaml'),
      ]);
    },
  );

  it.each(['Cases.YAML\n', 'Cases.YAML\r\n', 'Cases.YML\n', 'Cases.YML\r\n'])(
    'does not recognize a YAML suffix before trailing line terminators: %j',
    async (filename) => {
      await expect(readTests(filename, directory)).resolves.toEqual([]);
      await expect(readTestConfigs(filename, directory)).resolves.toEqual([]);
      expect(resolveTestsWatchPaths(filename, directory)).toEqual([path.join(directory, filename)]);
    },
  );

  it.each([
    'suite.XLSX#archive',
    'suite.XlS#archive',
    'suite.xlsx#archive',
    'suite.xls#archive',
    'plain',
  ])('does not infer the data format from the parent directory %s', async (folder) => {
    const nested = path.join(directory, folder);
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(nested, 'vars.yaml'), 'value: child');
    fs.writeFileSync(path.join(nested, 'cases.yaml'), JSON.stringify([{ vars: 'vars.yaml' }]));
    const reference = path.join(folder, 'cases.yaml');
    for (const read of [readTests, readTestConfigs]) {
      expect((await read(reference, directory)).map((test) => test.vars)).toEqual([
        { value: 'child' },
      ]);
      expect((await read([reference], directory)).map((test) => test.vars)).toEqual([
        { value: 'child' },
      ]);
    }
    expect(resolveTestsWatchPaths(reference, directory)).toEqual([
      path.join(nested, 'cases.yaml'),
      path.join(nested, 'vars.yaml'),
    ]);
  });

  it.each(['suite.XLSX#archive', 'suite.XlS#archive'])(
    'keeps unknown extension routing below the parent directory %s',
    async (folder) => {
      const nested = path.join(directory, folder);
      fs.mkdirSync(nested);
      fs.writeFileSync(path.join(nested, 'cases.unknown'), JSON.stringify(tests));
      const reference = path.join(folder, 'cases.unknown');
      for (const read of [readTests, readTestConfigs]) {
        await expect(read(reference, directory)).resolves.toEqual([]);
        await expect(read([reference], directory)).rejects.toThrow(
          'Unsupported file type for test file:',
        );
      }
    },
  );

  for (const prefix of ['', 'file://']) {
    it.each(['rows.YAML', 'rows.YmL', 'make_YAML', 'rows.yaml'])(
      `preserves the data-looking suffix in a function selector ${prefix}%s`,
      async (functionName) => {
        const nested = path.join(directory, 'Generator');
        fs.mkdirSync(nested);
        fs.writeFileSync(path.join(directory, 'vars.yaml'), 'value: config-directory');
        fs.writeFileSync(path.join(nested, 'vars.yaml'), 'value: generator-directory');
        fs.writeFileSync(
          path.join(nested, 'cases.cjs'),
          `exports[${JSON.stringify(functionName)}] = () => [{ vars: 'vars.yaml' }];`,
        );
        const reference = `${prefix}Generator/cases.cjs:${functionName}`;

        for (const read of [readTests, readTestConfigs]) {
          const scalarValue =
            functionName === 'rows.yaml' ? 'generator-directory' : 'config-directory';
          expect((await read(reference, directory)).map((test) => test.vars)).toEqual([
            { value: scalarValue },
          ]);
          for (const input of [[reference], { path: reference }]) {
            expect((await read(input, directory)).map((test) => test.vars)).toEqual([
              { value: 'config-directory' },
            ]);
          }
        }
        expect(resolveTestsWatchPaths(reference, directory)).toEqual([
          path.join(nested, 'cases.cjs'),
        ]);
      },
    );

    it.each(['Rows.YAML', 'Rows.YmL', 'ordinary', 'Legacy.yaml'])(
      `preserves the data-looking suffix in a sheet selector ${prefix}%s`,
      async (sheet) => {
        const filename = 'Cases.xlsx';
        fs.copyFileSync(
          path.resolve(__dirname, '../fixtures/test-data-extension-selectors.xlsx'),
          path.join(directory, filename),
        );
        const reference = `${prefix}${filename}#${sheet}`;
        const expected = [{ value: 'first' }, { value: 'second' }];

        for (const read of [readTests, readTestConfigs]) {
          if (sheet === 'Legacy.yaml') {
            await expect(read(reference, directory)).rejects.toThrow(
              'No test files found for path:',
            );
          } else {
            expect((await read(reference, directory)).map((test) => test.vars)).toEqual(expected);
          }
          for (const input of [[reference], { path: reference }]) {
            expect((await read(input, directory)).map((test) => test.vars)).toEqual(expected);
          }
        }
        expect(resolveTestsWatchPaths(reference, directory)).toEqual([
          path.join(directory, filename),
        ]);
      },
    );
  }

  it('keeps the existing behavior for unknown data extensions', async () => {
    fs.writeFileSync(path.join(directory, 'ExampleData.unknown'), JSON.stringify(tests));
    await expect(readStandaloneTestsFile('ExampleData.unknown', directory)).resolves.toEqual([]);
    await expect(readTests('ExampleData.unknown', directory)).resolves.toEqual([]);
    await expect(readTests(['ExampleData.unknown'], directory)).rejects.toThrow(
      'Unsupported file type for test file:',
    );
  });
});
