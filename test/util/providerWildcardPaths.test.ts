import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GolangProvider } from '../../src/providers/golangCompletion';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import { doesProviderRefMatch, isProviderAllowed } from '../../src/util/provider';
import { canonicalizeProviderId } from '../../src/util/providerRef';
import { validateTestProviderReferences } from '../../src/util/validateTestProviderReferences';
import { createMockProvider } from '../factories/provider';

describe('wildcards for basename script provider IDs', () => {
  let directory: string;

  beforeAll(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-provider-wildcards-'));
    for (const folder of ['first', 'second']) {
      fs.mkdirSync(path.join(directory, folder));
      for (const extension of ['py', 'go']) {
        fs.writeFileSync(path.join(directory, folder, `model.${extension}`), '');
      }
    }
  });

  afterAll(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  describe.each([
    { prefix: 'python', extension: 'py', Provider: PythonProvider },
    { prefix: 'golang', extension: 'go', Provider: GolangProvider },
  ])('$prefix', ({ prefix, extension, Provider }) => {
    it('matches the basename ID emitted by the real constructor', () => {
      const basePath = path.join(directory, 'first');
      const provider = new Provider(`./model.${extension}`, { config: { basePath } });
      const originalId = `${prefix}:model.${extension}:default`;
      expect(provider.id()).toBe(originalId);
      expect(doesProviderRefMatch(`${prefix}:./*`, provider)).toBe(true);
      expect(isProviderAllowed(provider, [`${prefix}:./mod*`])).toBe(true);
      expect(() =>
        validateTestProviderReferences([{ providers: [`${prefix}:./*`] }], [provider]),
      ).not.toThrow();
      expect(provider.id()).toBe(originalId);
      expect(canonicalizeProviderId(originalId)).toBe(originalId);
    });

    it('keeps the selected function in wildcard comparisons', () => {
      const provider = new Provider(`./model.${extension}:custom`, {
        config: { basePath: path.join(directory, 'first') },
      });
      expect(provider.id()).toBe(`${prefix}:model.${extension}:custom`);
      expect(doesProviderRefMatch(`${prefix}:./model.${extension}:cus*`, provider)).toBe(true);
      expect(doesProviderRefMatch(`${prefix}:./model.${extension}:other*`, provider)).toBe(false);
      expect(doesProviderRefMatch(`${prefix}:./model-other*`, provider)).toBe(false);
    });

    it('respects different base paths for providers with the same emitted ID', () => {
      const firstBase = path.join(directory, 'first');
      const secondBase = path.join(directory, 'second');
      const first = new Provider(`./model.${extension}`, { config: { basePath: firstBase } });
      const second = new Provider(`./model.${extension}`, { config: { basePath: secondBase } });
      const firstRef = `${prefix}:${path.join(firstBase, 'model*')}`;
      const secondRef = `${prefix}:${path.join(secondBase, 'model*')}`;
      expect(first.id()).toBe(second.id());
      expect(doesProviderRefMatch(firstRef, first)).toBe(true);
      expect(doesProviderRefMatch(firstRef, second)).toBe(false);
      expect(doesProviderRefMatch(secondRef, second)).toBe(true);
      expect(doesProviderRefMatch(`${prefix}:${path.join(process.cwd(), 'model*')}`, second)).toBe(
        false,
      );
      expect(doesProviderRefMatch(`${prefix}:../first/model*`, first)).toBe(true);
      expect(doesProviderRefMatch(`${prefix}:../first/model*`, second)).toBe(false);
    });

    it.each(['forward-slashes', 'dot-segment', 'forward-dot'])(
      'normalizes %s in absolute wildcard paths',
      (format) => {
        const basePath = path.join(directory, 'first');
        const provider = new Provider(`./model.${extension}`, { config: { basePath } });
        let refPath =
          format === 'forward-slashes'
            ? path.join(basePath, 'model*')
            : `${basePath}${path.sep}.${path.sep}model*`;
        if (format !== 'dot-segment') {
          refPath = refPath.split(path.sep).join('/');
        }
        expect(doesProviderRefMatch(`${prefix}:${refPath}`, provider)).toBe(true);
      },
    );
  });

  it.each([
    ['python:space model.py:default', 'python:./space *'],
    ['python:模型.py:custom', 'python:./模型.py:cus*'],
    ['python:.hidden.py:default', 'python:./.hidden*'],
    ['python:model.PY:default', 'python:./model.PY:*'],
    ['golang:space model.go:default', 'golang:./space *'],
    ['golang:模型.go:custom', 'golang:./模型.go:cus*'],
    ['golang:model.GO', 'golang:./model.GO*'],
  ])('matches the script-shaped ID %s without an explicit base path', (id, ref) => {
    expect(doesProviderRefMatch(ref, createMockProvider({ id }))).toBe(true);
  });

  it.each([
    ['python:named', 'python:./*'],
    ['python:model.go:default', 'python:./*'],
    ['golang:model.py:default', 'golang:./*'],
    ['golang:my-binary', 'golang:./*'],
    ['exec:model.py', 'exec:./*'],
    ['exec:python model.py', 'exec:./*'],
    ['custom:model.py', 'custom:./*'],
    ['Python:model.py', 'Python:./*'],
    ['python:model.py.backup', 'python:./*'],
    ['python:model.py:custom:extra', 'python:./*'],
    ['python:C:model.py:default', 'python:./*'],
    ['golang:C:model.go:default', 'golang:./*'],
    ['python:model.py:custom', 'golang:./*'],
    ['python:model.py:custom', 'python:./model.py:other*'],
    ['python:model.py:default', 'python:./model.py:default'],
  ])('preserves a nonmatch for %s with %s', (id, ref) => {
    expect(doesProviderRefMatch(ref, createMockProvider({ id }))).toBe(false);
  });

  it('retains exact and raw label matches for script-shaped identifiers', () => {
    const id = 'python:model.py:default';
    const provider = createMockProvider({ id, label: 'python:./named-model' });
    expect(doesProviderRefMatch(id, provider)).toBe(true);
    expect(doesProviderRefMatch('python:./named-*', provider)).toBe(true);
    expect(doesProviderRefMatch('python:*', provider)).toBe(true);
    expect(doesProviderRefMatch('*', provider)).toBe(true);
  });

  it.each([undefined, null, 42])('uses cwd when basePath is not a string: %s', (basePath) => {
    const provider = createMockProvider({ id: 'python:model.py:default', config: { basePath } });
    expect(doesProviderRefMatch('python:./mod*', provider)).toBe(true);
    expect(doesProviderRefMatch(`python:${path.join(process.cwd(), 'model*')}`, provider)).toBe(
      true,
    );
  });
});
