import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTestsWatchPaths } from '../../src/util/testCaseReader';

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
    const watched = resolve('file://tests/*.yaml' as TestSuiteConfig['tests']);
    expect(watched).toContain(path.join(base, 'tests/a.yaml'));
    expect(watched).toContain(path.join(base, 'tests/b.yaml'));
    expect(watched).not.toContain(path.join(base, 'tests/*.yaml'));
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

  it('watches the stable parent of a glob so later additions are seen', () => {
    // Resolving a glob only to its current matches means a file added afterwards is
    // never watched, even though the loader would include it on the next run.
    const watched = resolve('file://tests/*.yaml' as TestSuiteConfig['tests']);
    expect(watched).toContain(path.join(base, 'tests'));
  });

  it('watches the stable parent when a glob matches nothing yet', () => {
    const watched = resolve('file://tests/new-*.yaml' as TestSuiteConfig['tests']);
    expect(watched).toEqual([path.join(base, 'tests')]);
  });

  it('watches file references nested inside a tests file', () => {
    // cases.yaml holds a case whose vars point at another file; the loader reads it,
    // so editing it changes the evaluation and has to trigger a rerun.
    fs.writeFileSync(path.join(base, 'nested.yaml'), '- vars:\n    data: file://vars.csv\n');
    const watched = resolve('file://nested.yaml' as TestSuiteConfig['tests']);
    expect(watched).toContain(path.join(base, 'nested.yaml'));
    expect(watched).toContain(path.join(base, 'vars.csv'));
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
