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
      const selection = createTestCaseSelection(tests, [1, 0]);
      expect(restoreTestCaseSelection(tests, selection)).toEqual([1, 0]);
      fs.writeFileSync(file, 'other');
      expect(() => restoreTestCaseSelection(tests, selection)).toThrow();
      expect(JSON.stringify(selection)).not.toContain('first');
    },
  );
});
