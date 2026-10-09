import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  readTestConfigs,
  readTestFiles,
  resolveTestsWatchPaths,
} from '../../src/util/testCaseReader';

import type { TestSuiteConfig } from '../../src/types/index';

/**
 * These cover the paths watch mode needs to observe. The watcher previously duplicated
 * the loader's resolution rules and drifted from them, so each case here pins one rule
 * that the loader already applies in readTests()/loadTestsFromGlob().
 */
describe('resolveTestsWatchPaths', () => {
  let base: string;

  beforeAll(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-watch-'));
    fs.mkdirSync(path.join(base, 'tests'));
    fs.mkdirSync(path.join(base, 'nested'));
    fs.mkdirSync(path.join(base, 'fixtures'));
    for (const rel of [
      'cases.yaml',
      'tests/a.yaml',
      'tests/b.yaml',
      'gen.py',
      'dataset.yaml',
      'vars.csv',
      'book.xlsx',
      'fixtures/a:b.txt',
    ]) {
      fs.writeFileSync(path.join(base, rel), '');
    }
  });

  afterAll(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  const resolve = (tests: TestSuiteConfig['tests']) => resolveTestsWatchPaths(tests, base);

  it('resolves a scalar file reference', () => {
    expect(resolve('file://cases.yaml' as TestSuiteConfig['tests'])).toEqual([
      path.join(base, 'cases.yaml'),
    ]);
  });

  it('expands a glob, because chokidar v5 does not', () => {
    // Exactly the matches, and nothing else: glob order is not guaranteed.
    const watched = resolve('file://tests/*.yaml' as TestSuiteConfig['tests']);
    expect([...watched].sort()).toEqual([
      path.join(base, 'tests/a.yaml'),
      path.join(base, 'tests/b.yaml'),
    ]);
  });

  it('preserves directory patterns in relative test references', async () => {
    for (const name of ['a', 'b', '[ab]']) {
      const directory = path.join(base, 'sets', name);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(
        path.join(directory, 'cases-1.yaml'),
        `- vars:\n    doc: ${JSON.stringify(name)}\n`,
      );
    }
    const reference = 'sets/[ab]/cases-*.yaml';

    const loaded = await readTestConfigs(reference, base, {});
    expect(loaded.map((row) => row.vars?.doc).sort()).toEqual(['a', 'b']);
    expect(resolve(reference).sort()).toEqual([
      path.join(base, 'sets', 'a', 'cases-1.yaml'),
      path.join(base, 'sets', 'b', 'cases-1.yaml'),
    ]);
  });

  it('expands test globs beneath a directory containing brackets', () => {
    const root = path.join(base, 'suite[blue]');
    fs.mkdirSync(root);
    const testsPath = path.join(root, 'cases.yaml');
    fs.writeFileSync(testsPath, '- description: case');
    expect(resolveTestsWatchPaths('file://*.yaml', root)).toEqual([testsPath]);
  });

  it('expands a --tests glob from a bracketed directory when the config is elsewhere', () => {
    // --tests uses its working directory for lookup, separately from the config directory
    // used for dependencies inside rows.
    const root = path.join(base, 'work [acme]');
    fs.mkdirSync(path.join(root, 'set-1'), { recursive: true });
    fs.mkdirSync(path.join(root, 'set-2'));
    fs.writeFileSync(path.join(root, 'set-1', 'cases.yaml'), '- description: case');
    fs.writeFileSync(path.join(root, 'set-2', 'cases.yaml'), '- description: case');
    // What the pattern matches when the brackets are taken for a set of characters.
    fs.mkdirSync(path.join(base, 'work a', 'set-1'), { recursive: true });
    fs.writeFileSync(path.join(base, 'work a', 'set-1', 'cases.yaml'), '- description: other');

    const watched = resolveTestsWatchPaths(
      path.join(root, 'set-*', 'cases.yaml') as TestSuiteConfig['tests'],
      root,
      path.join(base, 'nested'),
    );

    expect([...watched].sort()).toEqual([
      path.join(root, 'set-1', 'cases.yaml'),
      path.join(root, 'set-2', 'cases.yaml'),
    ]);
  });

  it("never watches a glob's parent directory", () => {
    // chokidar watches a directory recursively, and doEval reruns the whole evaluation
    // on any `change` beneath it. Watching the parent would therefore rerun on every
    // unrelated edit in the tree -- including the run writing its own output file,
    // which reruns forever. It also buys nothing: a newly added file emits `add`, and
    // the watcher only handles `change`.
    expect(resolve('file://tests/*.yaml' as TestSuiteConfig['tests'])).not.toContain(
      path.join(base, 'tests'),
    );
    // The worst shape: a pattern anchored at the config directory itself.
    expect(resolve('file://*.yaml' as TestSuiteConfig['tests'])).not.toContain(base);
    expect(resolve('file://**/*.yaml' as TestSuiteConfig['tests'])).not.toContain(base);
  });

  it('strips a generator function suffix from a script reference', () => {
    expect(resolve('file://gen.py:make_tests' as TestSuiteConfig['tests'])).toEqual([
      path.join(base, 'gen.py'),
    ]);
  });

  it('keeps colons that are part of an ordinary vars filename', () => {
    // Only script references carry a :functionName suffix. A vars file may legally
    // contain a colon, and stripping it would watch a file that does not exist.
    const watched = resolve([
      { vars: { body: 'file://fixtures/a:b.txt' } },
    ] as TestSuiteConfig['tests']);
    expect(watched).toEqual([path.join(base, 'fixtures/a:b.txt')]);
  });

  it('strips an Excel sheet selector', () => {
    // The Excel loader splits off #Sheet, so watching the literal name would watch
    // a file that does not exist.
    expect(resolve('file://book.xlsx#DataSheet' as TestSuiteConfig['tests'])).toEqual([
      path.join(base, 'book.xlsx'),
    ]);
  });

  it('keeps a # that is not an Excel sheet selector', () => {
    const watched = resolve('file://cases.yaml#frag' as TestSuiteConfig['tests']);
    expect(watched).toEqual([path.join(base, 'cases.yaml#frag')]);
  });

  it('watches files referenced by a generator config', () => {
    // readStandaloneTestsFile resolves file:// references inside `config` before
    // invoking the generator, so editing them changes the generated cases.
    const watched = resolve({
      path: 'file://gen.py:make',
      config: { data: 'file://dataset.yaml' },
    } as unknown as TestSuiteConfig['tests']);
    expect(watched).toContain(path.join(base, 'gen.py'));
    expect(watched).toContain(path.join(base, 'dataset.yaml'));
  });

  it('handles the array form with mixed entries', () => {
    const watched = resolve([
      'file://cases.yaml',
      { path: 'file://gen.py:make' },
      { vars: { data: 'file://vars.csv' } },
      { vars: { inline: 'not a file' } },
    ] as TestSuiteConfig['tests']);
    expect(watched).toContain(path.join(base, 'cases.yaml'));
    expect(watched).toContain(path.join(base, 'gen.py'));
    expect(watched).toContain(path.join(base, 'vars.csv'));
    expect(watched).not.toContain(path.join(base, 'not a file'));
  });

  it('returns the literal path when a reference matches nothing yet', () => {
    // Creating the file later should still trigger a rerun.
    expect(resolve('file://not-created-yet.yaml' as TestSuiteConfig['tests'])).toEqual([
      path.join(base, 'not-created-yet.yaml'),
    ]);
  });

  it('falls back to the literal path when a glob matches nothing', () => {
    // A reference may be a literal filename that happens to contain a glob
    // metacharacter, so an unmatched pattern is still watched as written.
    fs.writeFileSync(path.join(base, 'report[1].csv'), '');
    expect(resolve('file://report[1].csv' as TestSuiteConfig['tests'])).toEqual([
      path.join(base, 'report[1].csv'),
    ]);
  });

  it('watches an existing literal var file instead of matching sibling filenames', () => {
    const literalPath = path.join(base, 'doc[12].txt');
    const matchedPath = path.join(base, 'doc1.txt');
    fs.writeFileSync(literalPath, 'literal');
    fs.writeFileSync(matchedPath, 'glob match');

    expect(resolve([{ vars: { doc: 'file://doc[12].txt' } }])).toEqual([literalPath]);
  });

  it('watches file references nested inside a tests file', () => {
    // cases.yaml holds a case whose vars point at another file; the loader reads it,
    // so editing it changes the evaluation and has to trigger a rerun.
    fs.writeFileSync(path.join(base, 'nested/cases.yaml'), '- vars:\n    data: file://vars.csv\n');
    const watched = resolve('file://nested/cases.yaml' as TestSuiteConfig['tests']);
    expect(watched).toContain(path.join(base, 'nested/cases.yaml'));
    expect(watched).toContain(path.join(base, 'vars.csv'));
  });

  it('resolves inline file vars of a --tests file from the config directory', () => {
    // --tests is located from the working directory, but the vars in its rows are read
    // from the config directory, so that is the copy to watch.
    const configDirectory = path.join(base, 'nested');
    fs.writeFileSync(path.join(base, 'cli-tests.yaml'), '- vars:\n    doc: file://doc.txt\n');

    expect(
      resolveTestsWatchPaths('cli-tests.yaml' as TestSuiteConfig['tests'], base, configDirectory),
    ).toEqual([path.join(base, 'cli-tests.yaml'), path.join(configDirectory, 'doc.txt')]);
    expect(resolve('cli-tests.yaml' as TestSuiteConfig['tests'])).toEqual([
      path.join(base, 'cli-tests.yaml'),
      path.join(base, 'doc.txt'),
    ]);
  });

  it.each(['json', 'jsonl'])(
    'watches standalone --tests %s dependencies from the directory the loader uses',
    async (extension) => {
      const configDirectory = path.join(base, 'nested');
      const source = `cli-dependencies.${extension}`;
      const row = { vars: 'cli-vars.yaml', provider: 'file://cli-provider.js' };
      fs.writeFileSync(path.join(base, source), JSON.stringify(extension === 'json' ? [row] : row));
      fs.writeFileSync(path.join(base, 'cli-vars.yaml'), 'doc: wrong working-directory copy\n');
      fs.writeFileSync(path.join(configDirectory, 'cli-vars.yaml'), 'doc: config-directory copy\n');

      const [loaded] = await readTestConfigs(path.join(base, source), configDirectory, {});
      expect(loaded.vars).toEqual({ doc: 'config-directory copy' });
      expect(loaded.provider).toBe(`file://${path.join(configDirectory, 'cli-provider.js')}`);
      const watched = resolveTestsWatchPaths(source, base, configDirectory);
      expect(watched).toEqual(
        expect.arrayContaining([
          path.join(base, source),
          path.join(configDirectory, 'cli-vars.yaml'),
          path.join(configDirectory, 'cli-provider.js'),
        ]),
      );
      expect(watched).not.toContain(path.join(base, 'cli-vars.yaml'));
      expect(watched).not.toContain(path.join(base, 'cli-provider.js'));
    },
  );

  it('watches file references nested inside a .jsonl tests file', () => {
    fs.writeFileSync(
      path.join(base, 'nested/cases.jsonl'),
      '{"vars":{"data":"file://vars.csv"}}\n',
    );
    const watched = resolve('file://nested/cases.jsonl' as TestSuiteConfig['tests']);
    expect(watched).toContain(path.join(base, 'nested/cases.jsonl'));
    expect(watched).toContain(path.join(base, 'vars.csv'));
  });

  it.each(['yaml', 'json', 'jsonl'])(
    'watches bare vars files from nested %s rows using the loader base',
    (extension) => {
      const file = path.join(base, `nested/vars-cases.${extension}`);
      const row = { vars: ['one.yaml', 'two.yaml'], provider: 'file://provider.yaml' };
      fs.writeFileSync(
        file,
        extension === 'yaml'
          ? '- vars: [one.yaml, two.yaml]\n  provider: file://provider.yaml\n'
          : JSON.stringify(extension === 'json' ? [row] : row),
      );
      const source = `nested/vars-cases.${extension}`;
      const arrayPaths = resolve([source]);
      expect(arrayPaths).toEqual(
        expect.arrayContaining([
          file,
          path.join(base, 'nested/one.yaml'),
          path.join(base, 'nested/two.yaml'),
          path.join(base, 'provider.yaml'),
        ]),
      );
      expect(arrayPaths).not.toContain(path.join(base, 'nested/provider.yaml'));
      const scalarBase = extension === 'yaml' ? path.join(base, 'nested') : base;
      expect(resolve(source)).toContain(path.join(scalarBase, 'one.yaml'));
      expect(resolve(`nested/vars-cases*.${extension}`)).toContain(
        path.join(base, 'nested/one.yaml'),
      );
    },
  );

  it.each(['yaml', 'json', 'jsonl'])(
    'watches row-provider scripts beside %s tests without moving vars or provider config files',
    (extension) => {
      const file = path.join(base, `nested/provider-cases.${extension}`);
      const rows = [
        { vars: { doc: 'file://provider.py:call_api' }, provider: 'file://provider.py:call_api' },
        { vars: {}, provider: { id: 'file://other.py:call_api' } },
        { vars: {}, provider: 'file://provider.yaml' },
      ];
      fs.writeFileSync(
        file,
        extension === 'jsonl'
          ? rows.map((row) => JSON.stringify(row)).join('\n')
          : JSON.stringify(rows),
      );
      const source = `nested/provider-cases.${extension}`;
      const watched = resolve([source]);
      expect(watched).toEqual(
        expect.arrayContaining([
          file,
          path.join(base, 'provider.py'),
          path.join(base, 'nested/provider.py'),
          path.join(base, 'nested/other.py'),
          path.join(base, 'provider.yaml'),
        ]),
      );
      expect(watched).not.toContain(path.join(base, 'other.py'));
      expect(watched).not.toContain(path.join(base, 'nested/provider.yaml'));
      const scalarBase = extension === 'yaml' ? path.join(base, 'nested') : base;
      expect(resolve(source)).toContain(path.join(scalarBase, 'other.py'));
    },
  );

  it('tolerates a self-referential generator config', () => {
    // A YAML anchor produces a cyclic object, which naive recursion would follow until
    // the stack overflows -- crashing a run that had already evaluated successfully.
    const cyclic: Record<string, unknown> = { data: 'file://dataset.yaml' };
    cyclic.self = cyclic;
    const watched = resolveTestsWatchPaths(
      { path: 'file://gen.py:make', config: cyclic } as unknown as TestSuiteConfig['tests'],
      base,
    );
    expect(watched).toContain(path.join(base, 'dataset.yaml'));
  });

  it('tolerates an unreadable or malformed tests file', () => {
    fs.writeFileSync(path.join(base, 'broken.yaml'), 'this: [unclosed\n');
    expect(() => resolve('file://broken.yaml' as TestSuiteConfig['tests'])).not.toThrow();
  });

  it('watches a scalar vars file reference', () => {
    // `{ vars: 'vars/*.yaml' }` is a supported form: loadTestWithVars() hands the
    // string to readTestFiles(), so the matched files feed the evaluation. Note it
    // carries no file:// scheme.
    fs.mkdirSync(path.join(base, 'varsdir'), { recursive: true });
    fs.writeFileSync(path.join(base, 'varsdir/one.yaml'), '');
    const watched = resolve([{ vars: 'varsdir/*.yaml' }] as unknown as TestSuiteConfig['tests']);
    expect(watched).toContain(path.join(base, 'varsdir/one.yaml'));
  });

  it('matches the bare-vars loader glob precedence when a literal sibling exists', async () => {
    fs.writeFileSync(path.join(base, 'vars[12].yaml'), 'doc: literal\n');
    fs.writeFileSync(path.join(base, 'vars1.yaml'), 'doc: glob match\n');

    expect(await readTestFiles('vars[12].yaml', base)).toEqual({ doc: 'glob match' });
    expect(resolve([{ vars: 'vars[12].yaml' }] as unknown as TestSuiteConfig['tests'])).toEqual([
      path.join(base, 'vars1.yaml'),
    ]);
  });

  it('resolves every entry of a vars-file array', () => {
    fs.mkdirSync(path.join(base, 'va'), { recursive: true });
    fs.writeFileSync(path.join(base, 'va/common.yaml'), '');
    fs.writeFileSync(path.join(base, 'va/case.yaml'), '');
    const watched = resolve([
      { vars: ['va/common.yaml', 'va/case.yaml'] },
    ] as unknown as TestSuiteConfig['tests']);
    expect(watched).toContain(path.join(base, 'va/common.yaml'));
    expect(watched).toContain(path.join(base, 'va/case.yaml'));
  });

  it('still handles the vars mapping form', () => {
    const watched = resolve([{ vars: { data: 'file://vars.csv' } }] as TestSuiteConfig['tests']);
    expect(watched).toEqual([path.join(base, 'vars.csv')]);
  });

  it('ignores remote references', () => {
    expect(
      resolve('https://docs.google.com/spreadsheets/d/abc' as TestSuiteConfig['tests']),
    ).toEqual([]);
    expect(resolve('az://container/tests.csv' as TestSuiteConfig['tests'])).toEqual([]);
  });

  it('deduplicates and tolerates an absent tests field', () => {
    expect(resolve(undefined)).toEqual([]);
    expect(resolve(['file://cases.yaml', 'file://cases.yaml'] as TestSuiteConfig['tests'])).toEqual(
      [path.join(base, 'cases.yaml')],
    );
  });
});
