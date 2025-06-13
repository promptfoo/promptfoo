import * as fs from 'fs';
import {
  renderPrompt,
  resolveVariables,
  runExtensionHook,
  extractTextFromPDF,
  collectFileMetadata,
  VARIABLE_LIMITS,
  createVariableSummary,
  performChunkedReplacement,
} from '../src/evaluatorHelpers';
import type { Prompt } from '../src/types';
import { transform } from '../src/util/transform';

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('node:module', () => {
  const mockRequire: NodeJS.Require = {
    resolve: jest.fn() as unknown as NodeJS.RequireResolve,
  } as unknown as NodeJS.Require;
  return {
    createRequire: jest.fn().mockReturnValue(mockRequire),
  };
});

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
  },
}));

jest.mock('pdf-parse', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => Promise.resolve({ text: 'Extracted PDF text' })),
}));

jest.mock('../src/esm');
jest.mock('../src/database', () => ({
  getDb: jest.fn(),
}));
jest.mock('../src/util/transform', () => ({
  transform: jest.fn(),
}));

function toPrompt(text: string): Prompt {
  return { raw: text, label: text };
}

describe('extractTextFromPDF', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should extract text from PDF successfully', async () => {
    const mockPDFText = 'Extracted PDF text';
    jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(Buffer.from('mock pdf content'));

    const result = await extractTextFromPDF('test.pdf');
    expect(result).toBe(mockPDFText);
  });

  it('should throw error when pdf-parse is not installed', async () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(Buffer.from('mock pdf content'));
    const mockPDFParse = jest.requireMock('pdf-parse');
    mockPDFParse.default.mockImplementationOnce(() => {
      throw new Error("Cannot find module 'pdf-parse'");
    });

    await expect(extractTextFromPDF('test.pdf')).rejects.toThrow(
      'pdf-parse is not installed. Please install it with: npm install pdf-parse',
    );
  });

  it('should handle PDF extraction errors', async () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(Buffer.from('mock pdf content'));
    const mockPDFParse = jest.requireMock('pdf-parse');
    mockPDFParse.default.mockRejectedValueOnce(new Error('PDF parsing failed'));

    await expect(extractTextFromPDF('test.pdf')).rejects.toThrow(
      'Failed to extract text from PDF test.pdf: PDF parsing failed',
    );
  });
});

describe('createVariableSummary', () => {
  it('should return full content when shorter than 2 * SUMMARY_LENGTH', () => {
    const content = 'Short content';
    const result = createVariableSummary(content, 'test');
    expect(result).toBe(`[test: ${content.length} chars]\n${content}`);
  });

  it('should create summary for long content', () => {
    const content = 'a'.repeat(VARIABLE_LIMITS.SUMMARY_LENGTH * 3);
    const result = createVariableSummary(content, 'test');
    expect(result).toContain(
      `[test: ${content.length} chars - showing first/last ${VARIABLE_LIMITS.SUMMARY_LENGTH} chars]`,
    );
    expect(result).toContain('START:');
    expect(result).toContain('END:');
    expect(result).toContain(
      `[${content.length - VARIABLE_LIMITS.SUMMARY_LENGTH * 2} chars omitted]`,
    );
  });
});

describe('performChunkedReplacement', () => {
  it('should perform direct replacement when content fits', () => {
    const template = 'Hello {{name}}!';
    const placeholder = '{{name}}';
    const replacement = 'World';
    const result = performChunkedReplacement(template, placeholder, replacement, 100);
    expect(result).toBe('Hello World!');
  });

  it('should truncate replacement when too large', () => {
    const template = 'Hello {{name}}!';
    const placeholder = '{{name}}';
    const replacement = 'a'.repeat(100);
    const maxSize = 20;
    const result = performChunkedReplacement(template, placeholder, replacement, maxSize);
    expect(result).toContain('Hello');
    expect(result).toContain('...[truncated to fit size limits]');
  });

  it('should handle template too large case', () => {
    const template = 'a'.repeat(1000);
    const result = performChunkedReplacement(template, '{{var}}', 'test', 50);
    expect(result).toBe(
      `[Template too large after variable replacement - ${template.length} chars]`,
    );
  });
});

describe('resolveVariables with size limits', () => {
  it('should handle variables under small threshold normally', () => {
    const variables = {
      result: 'Hello {{name}}',
      name: 'a'.repeat(VARIABLE_LIMITS.SMALL_VARIABLE_THRESHOLD - 1),
    };
    const result = resolveVariables(variables);
    expect(result.result).toBe(`Hello ${'a'.repeat(VARIABLE_LIMITS.SMALL_VARIABLE_THRESHOLD - 1)}`);
  });

  it('should create summary for variables exceeding MAX_VARIABLE_SIZE', () => {
    const largeValue = 'a'.repeat(VARIABLE_LIMITS.MAX_VARIABLE_SIZE + 1000);
    const variables = {
      result: 'Content: {{content}}',
      content: largeValue,
    };
    const result = resolveVariables(variables);
    expect(result.result).toContain('[content:');
    expect(result.result).toContain('chars - showing first/last');
  });

  it('should handle chunked replacement for large results', () => {
    const variables = {
      result: 'Content: {{content}}',
      content: 'a'.repeat(VARIABLE_LIMITS.MAX_RESULT_SIZE - 1000),
    };
    const result = resolveVariables(variables);
    expect(typeof result.result).toBe('string');
    expect((result.result as string).startsWith('Content:')).toBe(true);
    expect((result.result as string).length).toBeLessThanOrEqual(VARIABLE_LIMITS.MAX_RESULT_SIZE);
  });

  it('should handle RangeError gracefully', () => {
    const variables = {
      result: '{{content}}',
      content: {
        toString: () => {
          throw new RangeError('Invalid string length');
        },
      },
    };
    const result = resolveVariables(variables);
    expect(result.result).toBe('[result: content too large for processing]');
  });

  it('should break on reaching iteration limit', () => {
    const variables = {
      a: '{{b}}',
      b: '{{c}}',
      c: '{{c}}',
    };
    const result = resolveVariables(variables);
    expect(result).toEqual({
      a: '{{c}}',
      b: '{{c}}',
      c: '{{c}}',
    });
  });

  it('should handle non-string variables', () => {
    const variables = {
      result: '{{obj}}',
      obj: { foo: 'bar' },
    };
    const result = resolveVariables(variables);
    expect(result).toEqual(variables);
  });

  it('should handle undefined variables', () => {
    const variables = {
      result: '{{missing}}',
    };
    const result = resolveVariables(variables);
    expect(result.result).toBe('{{missing}}');
  });
});

describe('renderPrompt', () => {
  it('should render simple prompts', async () => {
    const prompt = toPrompt('Hello {{name}}!');
    const vars = { name: 'World' };
    const result = await renderPrompt(prompt, vars);
    expect(result).toBe('Hello World!');
  });

  it('should handle nested variables', async () => {
    const prompt = toPrompt('{{greeting}} {{name}}!');
    const vars = { greeting: 'Hello', name: '{{person}}', person: 'World' };
    const result = await renderPrompt(prompt, vars);
    expect(result).toBe('Hello World!');
  });

  it('should handle JSON prompts', async () => {
    const prompt = toPrompt('{"message": "Hello {{name}}!"}');
    const vars = { name: 'World' };
    const result = await renderPrompt(prompt, vars);
    expect(JSON.parse(result)).toEqual({ message: 'Hello World!' });
  });
});

describe('collectFileMetadata', () => {
  it('should collect metadata for file variables', () => {
    const vars = {
      image: 'file://test.jpg',
      video: 'file://test.mp4',
      audio: 'file://test.mp3',
      text: 'file://test.txt',
    };

    const metadata = collectFileMetadata(vars);

    expect(metadata).toEqual({
      image: { path: 'file://test.jpg', type: 'image', format: 'jpg' },
      video: { path: 'file://test.mp4', type: 'video', format: 'mp4' },
      audio: { path: 'file://test.mp3', type: 'audio', format: 'mp3' },
    });
  });
});

describe('runExtensionHook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not run hooks when no extensions provided', async () => {
    await runExtensionHook(null, 'test', {});
    expect(transform).not.toHaveBeenCalled();
  });

  it('should run hooks for each extension', async () => {
    const extensions = ['ext1', 'ext2'];
    const context = { data: 'test' };
    await runExtensionHook(extensions, 'hookName', context);

    expect(transform).toHaveBeenCalledTimes(2);
    expect(transform).toHaveBeenCalledWith('ext1', 'hookName', context, false);
    expect(transform).toHaveBeenCalledWith('ext2', 'hookName', context, false);
  });
});
