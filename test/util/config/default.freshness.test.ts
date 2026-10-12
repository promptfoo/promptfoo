import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { dump } from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadDefaultConfig } from '../../../src/util/config/default';

describe.each(['yaml', 'yml', 'json'])('default .%s config freshness', (extension) => {
  let directory: string;
  let configPath: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-default-freshness-'));
    configPath = path.join(directory, `promptfooconfig.${extension}`);
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  async function writeConfig(description: string, target = configPath) {
    const config = { description, providers: ['echo'], prompts: ['Hello'] };
    await fs.writeFile(target, extension === 'json' ? JSON.stringify(config) : dump(config));
  }

  it('reads an edited config on the next operation', async () => {
    await writeConfig('first');
    expect((await loadDefaultConfig(directory)).defaultConfig.description).toBe('first');

    await writeConfig('second');
    expect((await loadDefaultConfig(directory)).defaultConfig.description).toBe('second');
  });

  it('discovers a config created after a previous missing result', async () => {
    expect(await loadDefaultConfig(directory)).toEqual({
      defaultConfig: {},
      defaultConfigPath: undefined,
    });

    await writeConfig('created');
    expect(await loadDefaultConfig(directory)).toMatchObject({
      defaultConfig: { description: 'created' },
      defaultConfigPath: configPath,
    });
  });

  it('stops returning a deleted config', async () => {
    await writeConfig('deleted');
    await loadDefaultConfig(directory);
    await fs.unlink(configPath);

    expect(await loadDefaultConfig(directory)).toEqual({
      defaultConfig: {},
      defaultConfigPath: undefined,
    });
  });

  it('does not retain caller mutations between operations', async () => {
    await writeConfig('on disk');
    const first = await loadDefaultConfig(directory);
    first.defaultConfig.description = 'changed by caller';
    (first.defaultConfig.prompts as string[]).push('injected');

    expect((await loadDefaultConfig(directory)).defaultConfig).toMatchObject({
      description: 'on disk',
      prompts: ['Hello'],
    });
  });

  it('loads changed named configs and directories independently', async () => {
    const secondDirectory = path.join(directory, 'nested');
    await fs.mkdir(secondDirectory);
    const namedPath = path.join(directory, `redteam.${extension}`);
    const secondPath = path.join(secondDirectory, `promptfooconfig.${extension}`);
    await writeConfig('default');
    await writeConfig('named', namedPath);
    await writeConfig('nested', secondPath);
    await loadDefaultConfig(directory);
    await loadDefaultConfig(directory, 'redteam');
    await loadDefaultConfig(secondDirectory);

    await writeConfig('named updated', namedPath);
    await writeConfig('nested updated', secondPath);
    expect((await loadDefaultConfig(directory)).defaultConfig.description).toBe('default');
    expect((await loadDefaultConfig(directory, 'redteam')).defaultConfig.description).toBe(
      'named updated',
    );
    expect((await loadDefaultConfig(secondDirectory)).defaultConfig.description).toBe(
      'nested updated',
    );
  });
});

describe.each(['cjs', 'mjs', 'js'])('executable .%s config lifecycle', (extension) => {
  let directory: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-default-module-'));
    await fs.writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('preserves native module caching after executable file edits', async () => {
    const configPath = path.join(directory, `promptfooconfig.${extension}`);
    const assignment = extension === 'cjs' ? 'module.exports =' : 'export default';
    const writeConfig = (description: string) =>
      fs.writeFile(
        configPath,
        `${assignment} { description: '${description}', providers: ['echo'], prompts: ['Hello'] };`,
      );
    await writeConfig('first');
    expect((await loadDefaultConfig(directory)).defaultConfig.description).toBe('first');

    await writeConfig('edited');
    expect((await loadDefaultConfig(directory)).defaultConfig.description).toBe('first');
  });

  it.each([false, true])('rediscovers config after deletion with fallback=%s', async (fallback) => {
    const configPath = path.join(directory, `promptfooconfig.${extension}`);
    const fallbackPath = path.join(directory, 'promptfooconfig.ts');
    const assignment = extension === 'mjs' ? 'export default' : 'module.exports =';
    await fs.writeFile(
      configPath,
      `${assignment} { description: 'removed', providers: ['echo'], prompts: ['Hello'] };`,
    );
    if (fallback) {
      await fs.writeFile(
        fallbackPath,
        "export default { description: 'fallback', providers: ['echo'], prompts: ['Hello'] };",
      );
    }
    expect((await loadDefaultConfig(directory)).defaultConfig.description).toBe('removed');
    await fs.unlink(configPath);

    expect(await loadDefaultConfig(directory)).toEqual(
      fallback
        ? {
            defaultConfig: { description: 'fallback', providers: ['echo'], prompts: ['Hello'] },
            defaultConfigPath: fallbackPath,
          }
        : { defaultConfig: {}, defaultConfigPath: undefined },
    );
  });
});

it('preserves VM fallback singleton and retry behavior in native Node', async () => {
  // Vitest transforms CommonJS .js files itself, so exercise the real fallback in a child process.
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-default-native-cjs-'));
  try {
    await fs.writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
    const configPath = path.join(directory, 'promptfooconfig.js');
    const effectPath = path.join(directory, 'initializations.txt');
    const retryPath = path.join(directory, 'retry.js');
    const script = `
      import assert from 'node:assert/strict';
      import fs from 'node:fs/promises';
      import { loadDefaultConfig } from './src/util/config/default.ts';
      import { clearCjsModuleCache, importModule } from './src/esm.ts';
      const configPath = ${JSON.stringify(configPath)};
      const directory = ${JSON.stringify(directory)};
      const effectPath = ${JSON.stringify(effectPath)};
      const retryPath = ${JSON.stringify(retryPath)};
      await fs.writeFile(configPath, 'const fs = require("node:fs"); fs.appendFileSync(' + JSON.stringify(effectPath) + ', "initialized"); module.exports = { description: "first", providers: ["echo"], prompts: ["Hello"], value: {} };');
      assert.equal((await loadDefaultConfig(directory)).defaultConfig.description, 'first');
      assert.equal((await loadDefaultConfig(directory)).defaultConfig.description, 'first');
      const [first, second] = await Promise.all([importModule(configPath, undefined, { cacheCjsFallback: true }), importModule(configPath, undefined, { cacheCjsFallback: true })]);
      assert.equal(first, second);
      assert.equal(await importModule(configPath, 'value', { cacheCjsFallback: true }), first.value);
      await fs.writeFile(configPath, 'module.exports = { description: "edited" };');
      assert.equal((await loadDefaultConfig(directory)).defaultConfig.description, 'first');
      assert.equal(await fs.readFile(effectPath, 'utf-8'), 'initialized');
      // Explicit modules and providers retain their existing uncached fallback behavior.
      assert.equal((await importModule(configPath)).description, 'edited');
      assert.equal((await loadDefaultConfig(directory)).defaultConfig.description, 'first');
      // Watch invalidation reloads the default config without changing native module caches.
      clearCjsModuleCache();
      assert.equal((await loadDefaultConfig(directory)).defaultConfig.description, 'edited');
      await fs.writeFile(retryPath, 'require("node:fs"); module.exports = {}; throw new Error("initialization failed");');
      await assert.rejects(importModule(retryPath, undefined, { cacheCjsFallback: true }), /initialization failed/);
      await fs.writeFile(retryPath, 'module.exports = { value: "recovered" };');
      assert.equal((await importModule(retryPath, undefined, { cacheCjsFallback: true })).value, 'recovered');
      const invalidConfigPath = ${JSON.stringify(path.join(directory, 'invalid.js'))};
      await fs.writeFile(invalidConfigPath, 'require("node:fs"); module.exports = { providers: ["echo"], prompts: ["Hello"], commandLineOptions: { filterSampleSeed: "bad" } };');
      await assert.rejects(loadDefaultConfig(directory, 'invalid'), /filterSampleSeed/);
      await fs.writeFile(invalidConfigPath, 'module.exports = { description: "repaired", providers: ["echo"], prompts: ["Hello"], commandLineOptions: { filterSampleSeed: 123 } };');
      await fs.writeFile(configPath, 'module.exports = { description: "should remain cached" };');
      assert.equal((await loadDefaultConfig(directory, 'invalid')).defaultConfig.description, 'repaired');
      assert.equal((await loadDefaultConfig(directory)).defaultConfig.description, 'edited');
      // Stale invalidation cannot remove a newer successful module at the same path.
      clearCjsModuleCache({ path: configPath, exports: first });
      assert.equal((await loadDefaultConfig(directory)).defaultConfig.description, 'edited');
      const writeAsyncConfig = async (name, expression) => {
        const filename = directory + '/' + name + '.js';
        await fs.writeFile(filename, 'require("node:fs"); module.exports = ' + expression + ';');
        return filename;
      };
      const validAsyncConfig = '{ description: "async", providers: ["echo"], prompts: ["Hello"], value: {} }';
      const asyncPath = await writeAsyncConfig('async', 'Promise.resolve(' + validAsyncConfig + ')');
      const [asyncFirst, asyncSecond] = await Promise.all([
        importModule(asyncPath, undefined, { cacheCjsFallback: true }),
        importModule(asyncPath, undefined, { cacheCjsFallback: true }),
      ]);
      assert.equal(asyncFirst, asyncSecond);
      assert.equal(await importModule(asyncPath, 'value', { cacheCjsFallback: true }), asyncFirst.value);
      await writeAsyncConfig('thenable', '{ then(resolve) { resolve(' + validAsyncConfig + '); } }');
      assert.equal((await loadDefaultConfig(directory, 'thenable')).defaultConfig.description, 'async');
      for (const [name, expression, failure] of [
        ['async-reject', 'Promise.reject(new Error("async initialization failed"))', /async initialization failed/],
        ['async-invalid', 'Promise.resolve({ commandLineOptions: { filterSampleSeed: "bad" } })', /filterSampleSeed/],
      ]) {
        await writeAsyncConfig(name, expression);
        await assert.rejects(loadDefaultConfig(directory, name), failure);
        await writeAsyncConfig(name, 'Promise.resolve(' + validAsyncConfig + ')');
        assert.equal((await loadDefaultConfig(directory, name)).defaultConfig.description, 'async');
      }
      for (const settlement of ['resolve', 'reject', 'invalid']) {
        const name = 'pending-' + settlement;
        let settle;
        const started = new Promise((resolve) => {
          globalThis.startPendingConfig = (fulfill, reject) => {
            settle = { fulfill, reject };
            resolve();
          };
        });
        await writeAsyncConfig(name, 'new Promise((resolve, reject) => globalThis.startPendingConfig(resolve, reject))');
        const previous = loadDefaultConfig(directory, name).then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
        await Promise.race([started, previous.then(() => { throw new Error('initializer did not start'); })]);
        clearCjsModuleCache();
        await writeAsyncConfig(name, 'Promise.resolve(' + validAsyncConfig + ')');
        assert.equal((await loadDefaultConfig(directory, name)).defaultConfig.description, 'async');
        if (settlement === 'reject') {
          settle.reject(new Error('late initialization failure'));
        } else {
          settle.fulfill(settlement === 'invalid'
            ? { commandLineOptions: { filterSampleSeed: 'bad' } }
            : { description: 'old', providers: ['echo'], prompts: ['Hello'] });
        }
        const oldResult = await previous;
        if (settlement === 'resolve') {
          assert.equal(oldResult.value.defaultConfig.description, 'old');
        } else {
          assert.match(oldResult.error.message, settlement === 'reject' ? /late initialization failure/ : /filterSampleSeed/);
        }
        assert.equal((await loadDefaultConfig(directory, name)).defaultConfig.description, 'async');
        delete globalThis.startPendingConfig;
      }
    `;
    execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
      cwd: path.resolve(__dirname, '../../..'),
      env: {
        ...process.env,
        NODE_OPTIONS: '',
        PROMPTFOO_CONFIG_DIR: path.join(directory, 'state'),
      },
      stdio: 'pipe',
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
