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
