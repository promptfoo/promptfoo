import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import cliState from '../../../src/cliState';
import { createTestCaseSelection, restoreTestCaseSelection } from '../../../src/evaluator';
import { GolangProvider } from '../../../src/providers/golangCompletion';
import { loadApiProvider } from '../../../src/providers/index';
import { PythonProvider } from '../../../src/providers/pythonCompletion';
import { RubyProvider } from '../../../src/providers/rubyCompletion';
import { ScriptCompletionProvider } from '../../../src/providers/scriptCompletion';
import {
  applyProviderSelection,
  createProviderSelection,
} from '../../../src/util/eval/providerSelection';

import type { ApiProvider } from '../../../src/types/providers';

describe('file-backed replay provenance', () => {
  const directories: string[] = [];
  const originalBasePath = cliState.basePath;
  const directory = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-file-provenance-'));
    directories.push(dir);
    return dir;
  };

  afterEach(() => {
    cliState.basePath = originalBasePath;
    for (const dir of directories.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(['edit', 'add', 'remove'])(
    'tracks file globs across %s changes without rejecting unchanged selections',
    (change) => {
      const basePath = directory();
      fs.writeFileSync(path.join(basePath, 'a.txt'), 'first');
      fs.writeFileSync(path.join(basePath, 'b.txt'), 'second');
      const tests = [{ vars: { input: 'file://*.txt' } }];
      const selection = createTestCaseSelection(tests, [0], { basePath });
      expect(restoreTestCaseSelection(tests, selection, { basePath })).toEqual([0]);
      if (change === 'edit') {
        fs.writeFileSync(path.join(basePath, 'a.txt'), 'other');
      }
      if (change === 'add') {
        fs.writeFileSync(path.join(basePath, 'c.txt'), 'third');
      }
      if (change === 'remove') {
        fs.unlinkSync(path.join(basePath, 'b.txt'));
      }
      expect(() => restoreTestCaseSelection(tests, selection, { basePath })).toThrow('no longer');
    },
  );

  it('preserves identities when serialization omits undefined options', () => {
    const tests = [{ vars: { input: 'same' } }];
    const defaultTest = { options: { prefix: undefined, provider: 'echo' } };
    const selection = createTestCaseSelection(tests, [0], { defaultTest });
    expect(
      restoreTestCaseSelection(tests, selection, {
        defaultTest: JSON.parse(JSON.stringify(defaultTest)),
      }),
    ).toEqual([0]);
  });

  it('rejects circular provider configuration before replay', () => {
    const basePath = directory();
    fs.writeFileSync(path.join(basePath, 'grader.yaml'), 'id: file://grader.yaml');
    expect(() =>
      createTestCaseSelection([{ options: { provider: 'file://grader.yaml' } }], [0], { basePath }),
    ).toThrow('Circular provider config');
  });

  it.each(['assertion', 'default'])(
    'tracks provider config implementations in %s graders',
    (scope) => {
      const basePath = directory();
      fs.writeFileSync(path.join(basePath, 'grader.yaml'), 'id: python:grader.py');
      fs.writeFileSync(path.join(basePath, 'grader.py'), 'first');
      const grader = { assert: [{ type: 'llm-rubric', provider: 'file://grader.yaml' }] };
      const tests = [scope === 'assertion' ? grader : {}];
      const context = { basePath, ...(scope === 'default' ? { defaultTest: grader } : {}) };
      const selection = createTestCaseSelection(tests, [0], context);
      expect(restoreTestCaseSelection(tests, selection, context)).toEqual([0]);
      fs.writeFileSync(path.join(basePath, 'grader.py'), 'other');
      expect(() => restoreTestCaseSelection(tests, selection, context)).toThrow('no longer');
    },
  );

  it.each([
    ['python', 'provider.py', PythonProvider],
    ['golang', 'provider.go', GolangProvider],
    ['ruby', 'provider.rb', RubyProvider],
    ['exec', 'provider.cjs', ScriptCompletionProvider],
  ] as const)(
    'rejects edited %s implementations on reused and reloaded providers',
    (kind, filename, Provider) => {
      const dir = directory();
      const file = path.join(dir, filename);
      fs.writeFileSync(file, 'first');
      const runPath =
        kind === 'exec' ? `"${process.execPath}" ${filename}` : `${filename}:call_api`;
      const options = { id: 'same-provider', config: { basePath: dir } };
      const provider: ApiProvider = new Provider(runPath, options);
      const source = { id: `${kind}:${runPath}`, config: { basePath: dir } };
      const selection = createProviderSelection([provider], [source], [provider]);
      expect(applyProviderSelection([provider], [source], selection).providers).toEqual([provider]);
      fs.writeFileSync(file, 'other');
      const candidates: ApiProvider[] = [provider, new Provider(runPath, options)];
      for (const candidate of candidates) {
        expect(() => applyProviderSelection([candidate], [source], selection)).toThrow(
          'no longer matches',
        );
      }
      expect(JSON.stringify(selection)).not.toContain('first');
    },
  );

  it('fingerprints custom JavaScript module bytes behind an unchanged callApi method', async () => {
    const dir = directory();
    const file = path.join(dir, 'provider.cjs');
    const source =
      "const result='first';module.exports=class{id(){return 'custom'}async callApi(){return {output:result}}};";
    fs.writeFileSync(file, source);
    const ref = `file://${file}`;
    const provider = await loadApiProvider(ref);
    const selection = createProviderSelection([provider], [ref], [provider]);
    expect(applyProviderSelection([provider], [ref], selection).providers).toEqual([provider]);
    fs.writeFileSync(file, source.replace('first', 'other'));
    expect(() => applyProviderSelection([provider], [ref], selection)).toThrow('no longer matches');
  });

  it.each(['javascript', 'python', 'ruby'])(
    'rejects edited %s assertion files, including nested named callbacks',
    (type) => {
      const dir = directory();
      const subdir = process.platform === 'win32' ? 'callbacks' : 'callbacks:owned';
      fs.mkdirSync(path.join(dir, subdir));
      const ext = { javascript: 'js', python: 'py', ruby: 'rb' }[type];
      const relative = path.join(subdir, `check.${ext}`);
      const file = path.join(dir, relative);
      cliState.basePath = dir;
      fs.writeFileSync(file, 'first');
      const tests = [
        { assert: [{ type, value: `file://${relative}:grade` }] },
        { assert: [{ type: 'assert-set', assert: [{ type, value: `file://${file}:grade` }] }] },
      ];
      const selection = createTestCaseSelection(tests, [1, 0], { basePath: dir });
      expect(restoreTestCaseSelection(tests, selection, { basePath: dir })).toEqual([1, 0]);
      fs.writeFileSync(file, 'other');
      expect(() => restoreTestCaseSelection(tests, selection, { basePath: dir })).toThrow();
      expect(JSON.stringify(selection)).not.toContain('first');
    },
  );
  it.each([
    ['scoring callback', { assertScoringFunction: 'file://source.js:score' }],
    [
      'assertion array',
      { assert: [{ type: 'contains-any', value: ['literal', 'file://source.js'] }] },
    ],
    ['output transform', { options: { transform: 'file://source.js:transform' } }],
    ['variable transform', { options: { transformVars: 'file://source.js:vars' } }],
    [
      'assertion transform',
      { assert: [{ type: 'equals', value: 'ok', transform: 'file://source.js:transform' }] },
    ],
    [
      'assertion grader',
      { assert: [{ type: 'llm-rubric', value: 'ok', provider: 'file://source.js' }] },
    ],
    [
      'named Python grader',
      { assert: [{ type: 'llm-rubric', value: 'ok', provider: 'python:source.js:grade' }] },
    ],
    ['provider map grader', { options: { provider: { 'file://source.js': { temperature: 0 } } } }],
  ])('rejects edited %s while another invocation changes the global base path', (_name, test) => {
    const basePath = directory();
    const elsewhere = directory();
    fs.writeFileSync(path.join(basePath, 'source.js'), 'first');
    fs.writeFileSync(path.join(elsewhere, 'source.js'), 'unchanged');
    const tests = [test];
    const context = { basePath };
    cliState.basePath = elsewhere;
    const selection = createTestCaseSelection(tests, [0], context);
    expect(restoreTestCaseSelection(tests, selection, context)).toEqual([0]);
    fs.writeFileSync(path.join(basePath, 'source.js'), 'other');
    expect(() => restoreTestCaseSelection(tests, selection, context)).toThrow();
  });

  it.each([
    { assert: [{ type: 'equals' as const, value: 'first' }] },
    { options: { transform: 'output + "first"' } },
    { options: { provider: 'openai:first' } },
    { assertScoringFunction: 'first' },
  ])('rejects changed inherited defaults: %j', (defaultTest) => {
    const tests = [{ vars: { input: 'same' } }];
    const selection = createTestCaseSelection(tests, [0], { defaultTest });
    expect(restoreTestCaseSelection(tests, selection, { defaultTest })).toEqual([0]);
    const changed = JSON.parse(JSON.stringify(defaultTest).replaceAll('first', 'other'));
    expect(() => restoreTestCaseSelection(tests, selection, { defaultTest: changed })).toThrow();
  });
});
