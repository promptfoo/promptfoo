import * as fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { processTxtFile } from '../../../src/prompts/processors/text';
import { mockProcessEnv } from '../../util/utils';

vi.mock('fs');

describe('processTxtFile', () => {
  const mockReadFileSync = vi.mocked(fs.readFileSync);
  let originalConfig: typeof cliState.config;
  let restoreEnv: () => void;

  beforeEach(() => {
    mockReadFileSync.mockReset();
    originalConfig = cliState.config;
    cliState.config = undefined;
    restoreEnv = mockProcessEnv({ PROMPTFOO_PROMPT_SEPARATOR: undefined });
  });

  afterEach(() => {
    cliState.config = originalConfig;
    restoreEnv();
  });

  it('should process a text file with single prompt and no label', () => {
    const filePath = 'file.txt';
    const fileContent = 'This is a prompt';
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processTxtFile(filePath, {})).toEqual([
      {
        raw: 'This is a prompt',
        label: 'file.txt: This is a prompt',
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should process a text file with single prompt and a label', () => {
    const filePath = 'file.txt';
    const fileContent = 'This is a prompt';
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processTxtFile(filePath, { label: 'prompt 1' })).toEqual([
      {
        raw: 'This is a prompt',
        label: 'prompt 1: file.txt: This is a prompt',
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should process a text file with multiple prompts and a label', () => {
    const fileContent = 'Prompt 1\n---\nPrompt 2\n---\nPrompt 3';
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processTxtFile('file.txt', { label: 'Label' })).toEqual([
      {
        raw: 'Prompt 1',
        label: `Label: file.txt: Prompt 1`,
      },
      {
        raw: 'Prompt 2',
        label: `Label: file.txt: Prompt 2`,
      },
      {
        raw: 'Prompt 3',
        label: `Label: file.txt: Prompt 3`,
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith('file.txt', 'utf-8');
  });

  it('should handle text file with leading and trailing delimiters', () => {
    const filePath = 'file.txt';
    const fileContent = '---\nPrompt 1\n---\nPrompt 2\n---';
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processTxtFile(filePath, {})).toEqual([
      {
        raw: 'Prompt 1',
        label: `${filePath}: Prompt 1`,
      },
      {
        raw: 'Prompt 2',
        label: `${filePath}: Prompt 2`,
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should return an empty array for a file with only delimiters', () => {
    const filePath = 'file.txt';
    const fileContent = '---\n---';
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processTxtFile(filePath, {})).toEqual([]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should return an empty array for an empty file', () => {
    const filePath = 'file.txt';
    const fileContent = '';
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processTxtFile(filePath, {})).toEqual([]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should not split on lines that contain repeated hyphens', () => {
    const filePath = 'file.txt';
    const fileContent = 'Line 1\n-----------------------------------\nLine 2';
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processTxtFile(filePath, {})).toEqual([
      {
        raw: 'Line 1\n-----------------------------------\nLine 2',
        label: `${filePath}: Line 1\n-----------------------------------\nLine 2`,
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  const rawPrompts = (fileContent: string) => {
    mockReadFileSync.mockReturnValue(fileContent);
    return processTxtFile('file.txt', {}).map((prompt) => prompt.raw);
  };

  it('splits on a separator set after the module is imported', () => {
    mockProcessEnv({ PROMPTFOO_PROMPT_SEPARATOR: '%%%' });

    expect(rawPrompts('Prompt 1\n%%%\nPrompt 2')).toEqual(['Prompt 1', 'Prompt 2']);
  });

  it('splits on a separator from the config env block', () => {
    cliState.config = { env: { PROMPTFOO_PROMPT_SEPARATOR: '%%%' } };

    expect(rawPrompts('Prompt 1\n%%%\nPrompt 2')).toEqual(['Prompt 1', 'Prompt 2']);
  });

  it('keeps the default separator inside a prompt once a custom one is set', () => {
    mockProcessEnv({ PROMPTFOO_PROMPT_SEPARATOR: '%%%' });

    expect(rawPrompts('Front matter\n---\nBody')).toEqual(['Front matter\n---\nBody']);
  });

  it.each(['process', 'config'])('uses the default separator for an empty %s value', (source) => {
    if (source === 'process') {
      mockProcessEnv({ PROMPTFOO_PROMPT_SEPARATOR: '' });
    } else {
      mockProcessEnv({ PROMPTFOO_PROMPT_SEPARATOR: '%%%' });
      cliState.config = { env: { PROMPTFOO_PROMPT_SEPARATOR: '' } };
    }

    expect(rawPrompts('Prompt 1\n---\nPrompt 2')).toEqual(['Prompt 1', 'Prompt 2']);
  });

  it('isolates concurrent suite and file separators and restores the outer value', async () => {
    mockProcessEnv({ PROMPTFOO_PROMPT_SEPARATOR: '---' });
    const content = 'Prompt 1\n%%%\nPrompt 2';

    await cliState.withEnvFileOverrides({ PROMPTFOO_PROMPT_SEPARATOR: '%%%' }, async () => {
      const results = await Promise.all([
        cliState.withEnv({ PROMPTFOO_PROMPT_SEPARATOR: '---' }, async () => {
          await Promise.resolve();
          return rawPrompts(content);
        }),
        cliState.withEnv({}, async () => {
          await Promise.resolve();
          return rawPrompts(content);
        }),
      ]);

      expect(results).toEqual([[content], ['Prompt 1', 'Prompt 2']]);
      expect(rawPrompts(content)).toEqual(['Prompt 1', 'Prompt 2']);
    });

    expect(rawPrompts(content)).toEqual([content]);
  });
});
