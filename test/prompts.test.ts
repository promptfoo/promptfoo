import * as fs from 'fs';
import * as path from 'path';

import { globSync } from 'glob';

import { readPrompts } from '../src/prompts';

import type { Prompt } from '../src/types';

jest.mock('../src/esm');

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

function toPrompt(text: string): Prompt {
  return { raw: text, display: text };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('prompts', () => {
  test('readPrompts with single prompt file', async () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('Test prompt 1\n---\nTest prompt 2');
    (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
    const promptPaths = ['prompts.txt'];
    (globSync as jest.Mock).mockImplementation((pathOrGlob) => [pathOrGlob]);

    const result = await readPrompts(promptPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([toPrompt('Test prompt 1'), toPrompt('Test prompt 2')]);
  });

  test('readPrompts with multiple prompt files', async () => {
    (fs.readFileSync as jest.Mock)
      .mockReturnValueOnce('Test prompt 1')
      .mockReturnValueOnce('Test prompt 2');
    (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
    const promptPaths = ['prompt1.txt', 'prompt2.txt'];
    (globSync as jest.Mock).mockImplementation((pathOrGlob) => [pathOrGlob]);

    const result = await readPrompts(promptPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(result).toEqual([toPrompt('Test prompt 1'), toPrompt('Test prompt 2')]);
  });

  test('readPrompts with directory', async () => {
    (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true });
    (globSync as jest.Mock).mockImplementation((pathOrGlob) => [pathOrGlob]);
    (fs.readdirSync as jest.Mock).mockReturnValue(['prompt1.txt', 'prompt2.txt']);
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (filePath.endsWith(path.join('prompts', 'prompt1.txt'))) {
        return 'Test prompt 1';
      } else if (filePath.endsWith(path.join('prompts', 'prompt2.txt'))) {
        return 'Test prompt 2';
      }
    });
    const promptPaths = ['prompts'];

    const result = await readPrompts(promptPaths);

    expect(fs.statSync).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(result).toEqual([toPrompt('Test prompt 1'), toPrompt('Test prompt 2')]);
  });

  test('readPrompts with empty input', async () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('');
    (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
    const promptPaths = ['prompts.txt'];

    const result = await readPrompts(promptPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([toPrompt('')]);
  });

  test('readPrompts with map input', async () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('some raw text');
    (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });

    const result = await readPrompts({
      'prompts.txt': 'foo1',
      'prompts.py': 'foo2',
    });

    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ raw: 'some raw text', display: 'foo1' });
    expect(result[1]).toEqual(expect.objectContaining({ raw: 'some raw text', display: 'foo2' }));
  });

  test('readPrompts with JSONL file', async () => {
    const data = [
      [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Who won the world series in {{ year }}?' },
      ],
      [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Who won the superbowl in {{ year }}?' },
      ],
    ];

    (fs.readFileSync as jest.Mock).mockReturnValue(data.map((o) => JSON.stringify(o)).join('\n'));
    (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
    const promptPaths = ['prompts.jsonl'];

    const result = await readPrompts(promptPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([toPrompt(JSON.stringify(data[0])), toPrompt(JSON.stringify(data[1]))]);
  });

  test('readPrompts with .py file', async () => {
    const code = `print('dummy prompt')`;
    (fs.readFileSync as jest.Mock).mockReturnValue(code);
    const result = await readPrompts('prompt.py');
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result[0].raw).toEqual(code);
    expect(result[0].display).toEqual(code);
    expect(result[0].function).toBeDefined();
  });

  test('readPrompts with .js file', async () => {
    jest.doMock(
      path.resolve('prompt.js'),
      () => {
        return jest.fn(() => console.log('dummy prompt'));
      },
      { virtual: true },
    );
    const result = await readPrompts('prompt.js');
    expect(result[0].function).toBeDefined();
  });
});
