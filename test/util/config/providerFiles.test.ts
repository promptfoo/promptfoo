import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import cliState from '../../../src/cliState';
import { combineConfigs, resolveConfigs } from '../../../src/util/config/load';

describe('provider config files across config sources', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-provider-files-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeConfig(directory: string, providers: unknown, basePath?: string) {
    const configPath = path.join(tempDir, directory, 'config.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify({ prompts: ['hello'], providers, tests: [], basePath }),
    );
    return configPath;
  }

  function writeProvider(directory: string, filename: string, label: string) {
    const providerPath = path.join(tempDir, directory, filename);
    fs.mkdirSync(path.dirname(providerPath), { recursive: true });
    fs.writeFileSync(
      providerPath,
      filename.endsWith('.json')
        ? JSON.stringify({ id: 'echo', label })
        : `id: echo\nlabel: ${label}\n`,
    );
    return `file://${providerPath}`;
  }

  function resolve(config: string[]) {
    return cliState.withBasePath(undefined, () =>
      cliState.withConfig(undefined, () => resolveConfigs({ config }, {})),
    );
  }

  describe.each(['yaml', 'yml', 'json'])('%s files', (extension) => {
    it.each(['scalar', 'array'])(
      'resolves the %s provider from its source directory',
      async (form) => {
        const reference = `file://provider.${extension}`;
        const first = writeConfig('a', ['echo']);
        const second = writeConfig('b', form === 'scalar' ? reference : [reference]);
        const absoluteReference = writeProvider('b', `provider.${extension}`, 'B');
        const original = fs.readFileSync(second, 'utf8');

        expect((await combineConfigs([first, second])).providers).toEqual([
          'echo',
          absoluteReference,
        ]);
        const { testSuite } = await resolve([first, second]);
        expect(testSuite.providers.map((provider) => provider.label)).toEqual(['', 'B']);
        expect(fs.readFileSync(second, 'utf8')).toBe(original);
      },
    );
  });

  it('retains same-named relative files from different source directories', async () => {
    const first = writeConfig('a', ['file://provider.yaml']);
    const second = writeConfig('b', ['file://provider.yaml']);
    const firstReference = writeProvider('a', 'provider.yaml', 'A');
    const secondReference = writeProvider('b', 'provider.yaml', 'B');

    expect((await combineConfigs([first, second])).providers).toEqual([
      firstReference,
      secondReference,
    ]);
    const { testSuite } = await resolve([first, second]);
    expect(testSuite.providers.map((provider) => provider.label)).toEqual(['A', 'B']);
  });

  it('deduplicates relative and absolute references to the same file', async () => {
    const absoluteReference = writeProvider('shared', 'provider.yaml', 'Shared');
    const first = writeConfig('a', ['file://../shared/provider.yaml']);
    const second = writeConfig('b', [absoluteReference, absoluteReference]);

    expect((await combineConfigs([first, second])).providers).toEqual([absoluteReference]);
    const { testSuite } = await resolve([first, second]);
    expect(testSuite.providers.map((provider) => provider.label)).toEqual(['Shared']);
  });

  it.each(['relative', 'absolute'])('honors each source %s basePath override', async (form) => {
    const first = writeConfig('a', ['echo']);
    const basePath = form === 'relative' ? 'assets' : path.join(tempDir, 'b', 'assets');
    const second = writeConfig('b', ['file://provider.yaml'], basePath);
    const absoluteReference = writeProvider('b/assets', 'provider.yaml', 'B-assets');

    expect((await combineConfigs([first, second])).providers).toEqual(['echo', absoluteReference]);
    const { testSuite } = await resolve([first, second]);
    expect(testSuite.providers.map((provider) => provider.label)).toEqual(['', 'B-assets']);
  });

  it('preserves a single source relative reference', async () => {
    const config = writeConfig('b', ['file://provider.yaml']);
    writeProvider('b', 'provider.yaml', 'B');

    expect((await combineConfigs([config])).providers).toEqual(['file://provider.yaml']);
    const { testSuite } = await resolve([config]);
    expect(testSuite.providers.map((provider) => provider.label)).toEqual(['B']);
  });

  it('preserves non-file providers and does not mutate executable config inputs', async () => {
    const first = path.join(tempDir, 'config.mjs');
    fs.writeFileSync(
      first,
      `export const provider = async () => ({ output: 'hello' });
      export default {
        prompts: ['hello'],
        providers: [
          'echo', 'file://custom.js', 'file://custom.ts', 'python:custom.py',
          { id: 'echo', config: { reference: 'file://nested.yaml' } }, provider,
        ],
        tests: [],
      };`,
    );
    const second = writeConfig('b', ['echo']);
    const { default: input } = await import(pathToFileURL(first).href);
    const originalProviders = [...input.providers];
    const originalObject = structuredClone(input.providers[4]);

    const combined = await combineConfigs([first, second]);
    if (!Array.isArray(combined.providers)) {
      throw new Error('Expected combined providers to be an array');
    }
    expect(combined.providers).toEqual(originalProviders);
    expect(combined.providers[5]).toBe(originalProviders[5]);
    expect(input.providers).toEqual(originalProviders);
    expect(input.providers[4]).toEqual(originalObject);
  });
});
