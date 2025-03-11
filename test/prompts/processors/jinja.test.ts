import * as fs from 'fs';
import { processJinjaFile } from '../../../src/prompts/processors/jinja';
import type { Prompt } from '../../../src/types';

jest.mock('fs');

describe('processJinjaFile', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should process a Jinja file and return a prompt array', () => {
    const mockContent = 'Hello {{ name }}!';
    const filePath = 'test.jinja';
    const prompt: Partial<Prompt> = {
      label: 'Test Label',
      config: { foo: 'bar' },
    };

    jest.mocked(fs.readFileSync).mockReturnValue(mockContent);

    const result = processJinjaFile(filePath, prompt);

    expect(fs.readFileSync).toHaveBeenCalledWith(filePath, 'utf8');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      raw: mockContent,
      label: 'Test Label',
      config: { foo: 'bar' },
    });
  });

  it('should generate label from file path and content when no label provided', () => {
    const mockContent = 'A very long template content that should be truncated';
    const filePath = 'templates/greeting.jinja';
    const prompt: Partial<Prompt> = {
      config: { foo: 'bar' },
    };

    jest.mocked(fs.readFileSync).mockReturnValue(mockContent);

    const result = processJinjaFile(filePath, prompt);

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe(
      'templates/greeting.jinja: A very long template content that should be trunca...',
    );
  });

  it('should handle empty content', () => {
    const mockContent = '';
    const filePath = 'empty.jinja';
    const prompt: Partial<Prompt> = {};

    jest.mocked(fs.readFileSync).mockReturnValue(mockContent);

    const result = processJinjaFile(filePath, prompt);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      raw: '',
      label: 'empty.jinja: ...',
      config: undefined,
    });
  });

  it('should handle file read errors', () => {
    const filePath = 'nonexistent.jinja';
    const prompt: Partial<Prompt> = {};

    jest.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File not found');
    });

    expect(() => processJinjaFile(filePath, prompt)).toThrow('File not found');
  });

  it('should handle undefined prompt config', () => {
    const mockContent = 'Some content';
    const filePath = 'test.jinja';
    const prompt: Partial<Prompt> = {};

    jest.mocked(fs.readFileSync).mockReturnValue(mockContent);

    const result = processJinjaFile(filePath, prompt);

    expect(result).toHaveLength(1);
    expect(result[0].config).toBeUndefined();
  });
});
