import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateIdFromPrompt } from '../../src/models/prompt';
import { readPrompts } from '../../src/prompts';
import { mockProcessEnv } from '../util/utils';

describe('prompt file configuration', () => {
  let directory: string;
  let restoreEnv: () => void;
  const config = Object.freeze({
    temperature: 0,
    response_format: Object.freeze({ type: 'json_object' }),
    literal: '{{env.NOT_A_REAL_SECRET}} {% if true %}literal{% endif %}',
  });

  beforeEach(async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_PROMPT_SEPARATOR: undefined });
    directory = await mkdtemp(path.join(os.tmpdir(), 'prompt-file-config-'));
    await Promise.all([
      writeFile(path.join(directory, 'one.md'), '# First prompt'),
      writeFile(path.join(directory, 'two.md'), '# Second prompt'),
      writeFile(path.join(directory, 'chunks.txt'), 'First chunk\n---\n\n---\nSecond chunk\n'),
      writeFile(
        path.join(directory, 'rows.csv'),
        'prompt,label\nFirst row,first\nSecond row,second\n',
      ),
      writeFile(path.join(directory, 'single.txt'), 'Single prompt'),
    ]);
  });

  afterEach(async () => {
    restoreEnv();
    await rm(directory, { recursive: true, force: true });
  });

  it.each([
    ['one.md', 1],
    ['single.txt', 1],
    ['chunks.txt', 2],
    ['*.md', 2],
    ['*.txt', 3],
    ['rows.csv', 2],
    ['*.csv', 2],
  ] as const)('preserves config for every output from %s', async (file, count) => {
    const descriptor = { id: `file://${path.join(directory, file)}`, label: 'Named prompt' };
    const withoutConfig = await readPrompts([descriptor]);
    const prompts = await readPrompts([{ ...descriptor, config }]);
    expect(prompts).toHaveLength(count);
    expect(prompts.map(({ config: _config, ...prompt }) => prompt)).toEqual(
      withoutConfig.map(({ config: _config, ...prompt }) => prompt),
    );
    for (const prompt of prompts) {
      expect(prompt.config).toBe(config);
    }
    expect(new Set(prompts.map(generateIdFromPrompt)).size).toBe(count);
  });

  it('preserves an explicit label for each globbed file', async () => {
    const prompts = await readPrompts([{ id: 'file://*.md', label: 'Named prompt' }], directory);

    expect(prompts).toHaveLength(2);
    expect(prompts.map((prompt) => prompt.label).sort()).toEqual([
      'Named prompt: one.md',
      'Named prompt: two.md',
    ]);
    expect(new Set(prompts.map(generateIdFromPrompt)).size).toBe(2);
  });

  it('preserves derived IDs through Markdown glob processing', async () => {
    const prompts = await readPrompts([{ id: 'file://*.md', label: 'Group' }], directory);
    expect(prompts.map((prompt) => prompt.id).sort()).toEqual([
      'file://*.md:one.md',
      'file://*.md:two.md',
    ]);
  });

  it('gives each text chunk in a glob a distinct stable ID', async () => {
    const prompts = await readPrompts([{ id: 'file://*.txt', label: 'Group' }], directory);
    expect(prompts.map((prompt) => prompt.id).sort()).toEqual([
      'file://*.txt:chunks.txt:1',
      'file://*.txt:chunks.txt:2',
      'file://*.txt:single.txt',
    ]);
  });

  it('gives each file and row in a CSV glob a distinct identity', async () => {
    await Promise.all([
      writeFile(path.join(directory, 'glob-one.csv'), 'prompt\nFirst row\nSecond row\n'),
      writeFile(path.join(directory, 'glob-two.csv'), 'prompt\nFirst row\nSecond row\n'),
    ]);

    const prompts = await readPrompts(
      [{ id: 'file://glob-*.csv', label: 'CSV prompt', config }],
      directory,
    );

    expect(prompts).toHaveLength(4);
    expect(prompts.map((prompt) => prompt.id).sort()).toEqual([
      'file://glob-*.csv:glob-one.csv:1',
      'file://glob-*.csv:glob-one.csv:2',
      'file://glob-*.csv:glob-two.csv:1',
      'file://glob-*.csv:glob-two.csv:2',
    ]);
    expect(new Set(prompts.map(generateIdFromPrompt)).size).toBe(4);
    expect(prompts.every((prompt) => prompt.config === config)).toBe(true);
    expect(prompts.every((prompt) => !prompt.label.includes(directory))).toBe(true);
  });

  it('preserves metadata on an unmatched glob fallback without reading the pattern', async () => {
    const descriptor = {
      id: `file://${path.join(directory, 'missing-*.md')}`,
      label: 'Missing files are literal',
      config,
    };
    expect(await readPrompts([descriptor])).toEqual([{ ...descriptor, raw: descriptor.id }]);
  });

  it('keeps the same config for custom-delimiter chunks and skips empty chunks', async () => {
    restoreEnv();
    restoreEnv = mockProcessEnv({ PROMPTFOO_PROMPT_SEPARATOR: '===' });
    await writeFile(path.join(directory, 'custom.txt'), '===\nFirst\r\n===\r\nSecond\r\n===\n');
    const prompts = await readPrompts([
      { raw: `file://${path.join(directory, 'custom.txt')}`, config },
    ]);
    expect(prompts.map(({ raw }) => raw)).toEqual(['First', 'Second']);
    expect(prompts.every((prompt) => prompt.config === config)).toBe(true);
  });
});
