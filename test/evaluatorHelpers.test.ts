import * as fs from 'fs';
import {
  renderPrompt,
  resolveVariables,
  extractTextFromPDF,
  runExtensionHook,
} from '../src/evaluatorHelpers';
import type { Prompt, ApiProvider, TestSuite } from '../src/types';
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

jest.mock('../src/integrations/langfuse', () => ({
  getPrompt: jest
    .fn()
    .mockImplementation((helper, vars, promptType, version, label) =>
      Promise.resolve(`Mocked Langfuse response for ${helper} ${version || ''} ${label || ''}`),
    ),
}));

const _mockApiProvider: ApiProvider = {
  id: function id() {
    return 'test-provider';
  },
  callApi: jest.fn().mockResolvedValue({
    output: 'Test output',
    tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
  }),
};

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

describe('renderPrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PROMPTFOO_DISABLE_TEMPLATING;
    delete process.env.PROMPTFOO_DISABLE_JSON_AUTOESCAPE;
  });

  it('should handle label-based Langfuse prompt syntax', async () => {
    const prompt = toPrompt('langfuse://my-prompt@production');
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe('Mocked Langfuse response for my-prompt  production');
  });

  it('should handle label-based Langfuse prompt syntax with type', async () => {
    const prompt = toPrompt('langfuse://my-prompt@production:chat');
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe('Mocked Langfuse response for my-prompt  production');
  });

  it('should handle Langfuse prompt IDs containing @ characters', async () => {
    const prompt = toPrompt('langfuse://user@domain.com/my-prompt@production');
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe(
      'Mocked Langfuse response for user@domain.com/my-prompt  production',
    );
  });

  it('should handle undefined version in Langfuse prompts', async () => {
    const prompt = toPrompt('langfuse://my-prompt');
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe('Mocked Langfuse response for my-prompt  ');
  });

  it('should throw error for invalid Langfuse prompt type', async () => {
    const prompt = toPrompt('langfuse://my-prompt@production:invalid');
    await expect(renderPrompt(prompt, {}, {})).rejects.toThrow(
      "Invalid Langfuse prompt type: invalid. Must be 'text' or 'chat'.",
    );
  });

  it('should handle version-based Langfuse prompt syntax', async () => {
    const prompt = toPrompt('langfuse://my-prompt:1');
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe('Mocked Langfuse response for my-prompt 1 ');
  });

  it('should handle version-based Langfuse prompt syntax with type', async () => {
    const prompt = toPrompt('langfuse://my-prompt:1:chat');
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe('Mocked Langfuse response for my-prompt 1 ');
  });

  it('should handle "latest" version in Langfuse prompts', async () => {
    const prompt = toPrompt('langfuse://my-prompt:latest');
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe('Mocked Langfuse response for my-prompt  ');
  });

  it('should render a prompt with a single variable', async () => {
    const prompt = toPrompt('Test prompt {{ var1 }}');
    const renderedPrompt = await renderPrompt(prompt, { var1: 'value1' }, {});
    expect(renderedPrompt).toBe('Test prompt value1');
  });

  it('should render nested variables in non-JSON prompts', async () => {
    const prompt = toPrompt('Test {{ outer[inner] }}');
    const renderedPrompt = await renderPrompt(
      prompt,
      { outer: { key1: 'value1' }, inner: 'key1' },
      {},
    );
    expect(renderedPrompt).toBe('Test value1');
  });
});

describe('resolveVariables', () => {
  it('should replace placeholders with corresponding variable values', () => {
    const variables = { final: '{{ my_greeting }}, {{name}}!', my_greeting: 'Hello', name: 'John' };
    const expected = { final: 'Hello, John!', my_greeting: 'Hello', name: 'John' };
    expect(resolveVariables(variables)).toEqual(expected);
  });

  it('should handle nested variable references', () => {
    const variables = {
      greeting: '{{ hello }}',
      hello: '{{ hi }}',
      hi: 'Hello',
      final: '{{ greeting }}, {{ name }}!',
      name: 'World',
    };
    const expected = {
      greeting: 'Hello',
      hello: 'Hello',
      hi: 'Hello',
      final: 'Hello, World!',
      name: 'World',
    };
    expect(resolveVariables(variables)).toEqual(expected);
  });
});

describe('runExtensionHook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(transform).mockResolvedValue(undefined);
  });

  it('should return original context if no extensions provided', async () => {
    const context = {
      suite: {
        tests: [],
        providers: [],
        prompts: [],
      } as unknown as TestSuite,
    };
    const result = await runExtensionHook(null, 'beforeAll', context);
    expect(result).toEqual(context);
  });

  it('should call transform for each extension', async () => {
    const extensions = ['ext1', 'ext2'];
    const context = {
      suite: {
        tests: [],
        providers: [],
        prompts: [],
      } as unknown as TestSuite,
    };
    await runExtensionHook(extensions, 'beforeAll', context);
    expect(transform).toHaveBeenCalledTimes(2);
  });
});
