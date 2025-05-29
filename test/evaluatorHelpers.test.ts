import * as fs from 'fs';
import { createRequire } from 'node:module';
import * as path from 'path';
import {
  renderPrompt,
  resolveVariables,
  runExtensionHook,
  extractTextFromPDF,
  collectFileMetadata,
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
  default: jest
    .fn()
    .mockImplementation((buffer) => Promise.resolve({ text: 'Extracted PDF text' })),
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

describe('renderPrompt', () => {
  beforeEach(() => {
    delete process.env.PROMPTFOO_DISABLE_TEMPLATING;
    delete process.env.PROMPTFOO_DISABLE_JSON_AUTOESCAPE;
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

  it('should handle complex variable substitutions in non-JSON prompts', async () => {
    const prompt = toPrompt('{{ var1[var2] }}');
    const renderedPrompt = await renderPrompt(
      prompt,
      {
        var1: { hello: 'world' },
        var2: 'hello',
      },
      {},
    );
    expect(renderedPrompt).toBe('world');
  });

  it('should render a JSON prompt', async () => {
    const prompt = toPrompt('[{"text": "Test prompt "}, {"text": "{{ var1 }}"}]');
    const renderedPrompt = await renderPrompt(prompt, { var1: 'value1' }, {});
    expect(renderedPrompt).toBe(
      JSON.stringify(JSON.parse('[{"text":"Test prompt "},{"text":"value1"}]'), null, 2),
    );
  });

  it('should render nested variables in JSON prompts', async () => {
    const prompt = toPrompt('{"text": "{{ outer[inner] }}"}');
    const renderedPrompt = await renderPrompt(
      prompt,
      { outer: { key1: 'value1' }, inner: 'key1' },
      {},
    );
    expect(renderedPrompt).toBe(JSON.stringify({ text: 'value1' }, null, 2));
  });

  it('should render environment variables in JSON prompts', async () => {
    process.env.TEST_ENV_VAR = 'env_value';
    const prompt = toPrompt('{"text": "{{ env.TEST_ENV_VAR }}"}');
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe(JSON.stringify({ text: 'env_value' }, null, 2));
    delete process.env.TEST_ENV_VAR;
  });

  it('should render environment variables in non-JSON prompts', async () => {
    process.env.TEST_ENV_VAR = 'env_value';
    const prompt = toPrompt('Test prompt {{ env.TEST_ENV_VAR }}');
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe('Test prompt env_value');
    delete process.env.TEST_ENV_VAR;
  });

  it('should handle complex variable substitutions in JSON prompts', async () => {
    const prompt = toPrompt('{"message": "{{ var1[var2] }}"}');
    const renderedPrompt = await renderPrompt(
      prompt,
      {
        var1: { hello: 'world' },
        var2: 'hello',
      },
      {},
    );
    expect(renderedPrompt).toBe(JSON.stringify({ message: 'world' }, null, 2));
  });

  it('should render a JSON prompt and escape the var string', async () => {
    const prompt = toPrompt('[{"text": "Test prompt "}, {"text": "{{ var1 }}"}]');
    const renderedPrompt = await renderPrompt(prompt, { var1: 'He said "hello world!"' }, {});
    expect(renderedPrompt).toBe(
      JSON.stringify(
        JSON.parse('[{"text":"Test prompt "},{"text":"He said \\"hello world!\\""}]'),
        null,
        2,
      ),
    );
  });

  it('should render a JSON prompt with nested JSON', async () => {
    const prompt = toPrompt('[{"text": "Test prompt "}, {"text": "{{ var1 }}"}]');
    const renderedPrompt = await renderPrompt(prompt, { var1: '{"nested": "value1"}' }, {});
    expect(renderedPrompt).toBe(
      JSON.stringify(
        JSON.parse('[{"text":"Test prompt "},{"text":"{\\"nested\\": \\"value1\\"}"}]'),
        null,
        2,
      ),
    );
  });

  it('should load external yaml files in renderPrompt', async () => {
    const prompt = toPrompt('Test prompt with {{ var1 }}');
    const vars = { var1: 'file://test.txt' };
    const evaluateOptions = {};

    jest.spyOn(fs, 'readFileSync').mockReturnValueOnce('loaded from file');

    const renderedPrompt = await renderPrompt(prompt, vars, evaluateOptions);

    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('test.txt'), 'utf8');
    expect(renderedPrompt).toBe('Test prompt with loaded from file');
  });

  it('should load external js files in renderPrompt and execute the exported function', async () => {
    const prompt = toPrompt('Test prompt with {{ var1 }} {{ var2 }} {{ var3 }}');
    const vars = {
      var1: 'file:///path/to/testFunction.js',
      var2: 'file:///path/to/testFunction.cjs',
      var3: 'file:///path/to/testFunction.mjs',
    };
    const evaluateOptions = {};

    jest.doMock(
      path.resolve('/path/to/testFunction.js'),
      () => (varName: any, prompt: any, vars: any) => ({ output: `Dynamic value for ${varName}` }),
      { virtual: true },
    );
    jest.doMock(
      path.resolve('/path/to/testFunction.cjs'),
      () => (varName: any, prompt: any, vars: any) => ({ output: `and ${varName}` }),
      { virtual: true },
    );
    jest.doMock(
      path.resolve('/path/to/testFunction.mjs'),
      () => (varName: any, prompt: any, vars: any) => ({ output: `and ${varName}` }),
      { virtual: true },
    );

    const renderedPrompt = await renderPrompt(prompt, vars, evaluateOptions);
    expect(renderedPrompt).toBe('Test prompt with Dynamic value for var1 and var2 and var3');
  });

  it('should load external js package in renderPrompt and execute the exported function', async () => {
    const prompt = toPrompt('Test prompt with {{ var1 }}');
    const vars = {
      var1: 'package:@promptfoo/fake:testFunction',
    };
    const evaluateOptions = {};

    const require = createRequire('');
    jest.spyOn(require, 'resolve').mockReturnValueOnce('/node_modules/@promptfoo/fake/index.js');

    jest.doMock(
      path.resolve('/node_modules/@promptfoo/fake/index.js'),
      () => ({
        testFunction: (varName: any, prompt: any, vars: any) => ({
          output: `Dynamic value for ${varName}`,
        }),
      }),
      { virtual: true },
    );

    const renderedPrompt = await renderPrompt(prompt, vars, evaluateOptions);
    expect(renderedPrompt).toBe('Test prompt with Dynamic value for var1');
  });

  it('should load external json files in renderPrompt and parse the JSON content', async () => {
    const prompt = toPrompt('Test prompt with {{ var1 }}');
    const vars = { var1: 'file:///path/to/testData.json' };
    const evaluateOptions = {};

    jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(JSON.stringify({ key: 'valueFromJson' }));

    const renderedPrompt = await renderPrompt(prompt, vars, evaluateOptions);

    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('testData.json'), 'utf8');
    expect(renderedPrompt).toBe('Test prompt with {"key":"valueFromJson"}');
  });

  it('should load external yaml files in renderPrompt and parse the YAML content', async () => {
    const prompt = toPrompt('Test prompt with {{ var1 }}');
    const vars = { var1: 'file:///path/to/testData.yaml' };
    const evaluateOptions = {};

    jest.spyOn(fs, 'readFileSync').mockReturnValueOnce('key: valueFromYaml');

    const renderedPrompt = await renderPrompt(prompt, vars, evaluateOptions);

    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('testData.yaml'), 'utf8');
    expect(renderedPrompt).toBe('Test prompt with {"key":"valueFromYaml"}');
  });

  describe('with PROMPTFOO_DISABLE_TEMPLATING', () => {
    beforeEach(() => {
      process.env.PROMPTFOO_DISABLE_TEMPLATING = 'true';
    });

    afterEach(() => {
      delete process.env.PROMPTFOO_DISABLE_TEMPLATING;
    });

    it('should return raw prompt when templating is disabled', async () => {
      const prompt = toPrompt('Test prompt {{ var1 }}');
      const renderedPrompt = await renderPrompt(prompt, { var1: 'value1' }, {});
      expect(renderedPrompt).toBe('Test prompt {{ var1 }}');
    });
  });

  it('should render normally when templating is enabled', async () => {
    process.env.PROMPTFOO_DISABLE_TEMPLATING = 'false';
    const prompt = toPrompt('Test prompt {{ var1 }}');
    const renderedPrompt = await renderPrompt(prompt, { var1: 'value1' }, {});
    expect(renderedPrompt).toBe('Test prompt value1');
    delete process.env.PROMPTFOO_DISABLE_TEMPLATING;
  });

  it('should respect Nunjucks raw tags when variable is provided as a string', async () => {
    const prompt = toPrompt('{% raw %}{{ var1 }}{% endraw %}');
    const renderedPrompt = await renderPrompt(prompt, { var1: 'value1' }, {});
    expect(renderedPrompt).toBe('{{ var1 }}');
  });

  it('should respect Nunjucks raw tags when no variables are provided', async () => {
    const prompt = toPrompt('{% raw %}{{ var1 }}{% endraw %}');
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe('{{ var1 }}');
  });

  it('should respect Nunjucks escaped strings when variable is provided as a string', async () => {
    const prompt = toPrompt(`{{ '{{ var1 }}' }}`);
    const renderedPrompt = await renderPrompt(prompt, { var1: 'value1' }, {});
    expect(renderedPrompt).toBe('{{ var1 }}');
  });

  it('should respect Nunjucks escaped strings when no variables are provided', async () => {
    const prompt = toPrompt(`{{ '{{ var1 }}' }}`);
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe('{{ var1 }}');
  });

  it('should render variables that are template strings', async () => {
    const prompt = toPrompt('{{ var1 }}');
    const renderedPrompt = await renderPrompt(prompt, { var1: '{{ var2 }}', var2: 'value2' }, {});
    expect(renderedPrompt).toBe('value2');
  });

  it('should auto-wrap prompts with partial Nunjucks tags in {% raw %}', async () => {
    const prompt = toPrompt('This is a partial tag: {%');
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe('This is a partial tag: {%');
  });

  it('should not double-wrap prompts already wrapped in {% raw %}', async () => {
    const prompt = toPrompt('{% raw %}This is a partial tag: {%{% endraw %}');
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe('This is a partial tag: {%');
  });

  it('should not wrap prompts with valid Nunjucks tags', async () => {
    const prompt = toPrompt('Hello {{ name }}!');
    const renderedPrompt = await renderPrompt(prompt, { name: 'Alice' }, {});
    expect(renderedPrompt).toBe('Hello Alice!');
    expect(renderedPrompt).not.toContain('{% raw %}');
  });

  it('should auto-wrap prompts with partial variable tags', async () => {
    const prompt = toPrompt('Unfinished variable: {{ name');
    const renderedPrompt = await renderPrompt(prompt, { name: 'Alice' }, {});
    expect(renderedPrompt).toBe('Unfinished variable: {{ name');
  });

  it('should auto-wrap prompts with partial comment tags', async () => {
    const prompt = toPrompt('Unfinished comment: {# comment');
    const renderedPrompt = await renderPrompt(prompt, {}, {});
    expect(renderedPrompt).toBe('Unfinished comment: {# comment');
  });
});

describe('renderPrompt with prompt functions', () => {
  it('should handle string returns from prompt functions', async () => {
    const promptObj = {
      ...toPrompt('test'),
      function: async () => 'Hello, world!',
    };
    const result = await renderPrompt(promptObj, {});
    expect(result).toBe('Hello, world!');
  });

  it('should handle object/array returns from prompt functions', async () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
    ];
    const promptObj = {
      ...toPrompt('test'),
      function: async () => messages,
    };
    const result = await renderPrompt(promptObj, {});
    expect(JSON.parse(result)).toEqual(messages);
  });

  it('should handle PromptFunctionResult returns from prompt functions', async () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
    ];
    const promptObj = {
      ...toPrompt('test'),
      function: async () => ({
        prompt: messages,
        config: { max_tokens: 10 },
      }),
      config: {},
    };
    const result = await renderPrompt(promptObj, {});
    expect(JSON.parse(result)).toEqual(messages);
    expect(promptObj.config).toEqual({ max_tokens: 10 });
  });

  it('should set config from prompt function when initial config is undefined', async () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
    ];

    const promptObj = {
      ...toPrompt('test'),
      config: undefined,
      function: async () => ({
        prompt: messages,
        config: { max_tokens: 10 },
      }),
    };

    expect(promptObj.config).toBeUndefined();

    const result = await renderPrompt(promptObj, {});

    expect(promptObj.config).toEqual({ max_tokens: 10 });
    expect(JSON.parse(result)).toEqual(messages);
  });

  it('should replace existing config with function config', async () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
    ];
    const promptObj = {
      ...toPrompt('test'),
      function: async () => ({
        prompt: messages,
        config: {
          temperature: 0.8,
          max_tokens: 20,
        },
      }),
      config: {
        temperature: 0.2,
        top_p: 0.9,
      },
    };
    const result = await renderPrompt(promptObj, {});
    expect(JSON.parse(result)).toEqual(messages);
    expect(promptObj.config).toEqual({
      temperature: 0.8,
      max_tokens: 20,
      top_p: 0.9,
    });
  });
});

describe('resolveVariables', () => {
  it('should replace placeholders with corresponding variable values', () => {
    const variables = { final: '{{ my_greeting }}, {{name}}!', my_greeting: 'Hello', name: 'John' };
    const expected = { final: 'Hello, John!', my_greeting: 'Hello', name: 'John' };
    expect(resolveVariables(variables)).toEqual(expected);
  });

  it('should handle nested variable substitutions', () => {
    const variables = { first: '{{second}}', second: '{{third}}', third: 'value' };
    const expected = { first: 'value', second: 'value', third: 'value' };
    expect(resolveVariables(variables)).toEqual(expected);
  });

  it('should not modify variables without placeholders', () => {
    const variables = { greeting: 'Hello, world!', name: 'John' };
    const expected = { greeting: 'Hello, world!', name: 'John' };
    expect(resolveVariables(variables)).toEqual(expected);
  });

  it('should not fail if a variable is not found', () => {
    const variables = { greeting: 'Hello, {{name}}!' };
    expect(resolveVariables(variables)).toEqual({ greeting: 'Hello, {{name}}!' });
  });

  it('should not fail for unresolved placeholders', () => {
    const variables = { greeting: 'Hello, {{name}}!', name: '{{unknown}}' };
    expect(resolveVariables(variables)).toEqual({
      greeting: 'Hello, {{unknown}}!',
      name: '{{unknown}}',
    });
  });
});

describe('runExtensionHook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not call transform if extensions array is empty', async () => {
    await runExtensionHook([], 'testHook', { data: 'test' });
    expect(transform).not.toHaveBeenCalled();
  });

  it('should not call transform if extensions is undefined', async () => {
    await runExtensionHook(undefined, 'testHook', { data: 'test' });
    expect(transform).not.toHaveBeenCalled();
  });

  it('should not call transform if extensions is null', async () => {
    await runExtensionHook(null, 'testHook', { data: 'test' });
    expect(transform).not.toHaveBeenCalled();
  });

  it('should call transform for each extension', async () => {
    const extensions = ['ext1', 'ext2', 'ext3'];
    const hookName = 'testHook';
    const context = { data: 'test' };

    await runExtensionHook(extensions, hookName, context);

    expect(transform).toHaveBeenCalledTimes(3);
    expect(transform).toHaveBeenNthCalledWith(1, 'ext1', hookName, context, false);
    expect(transform).toHaveBeenNthCalledWith(2, 'ext2', hookName, context, false);
    expect(transform).toHaveBeenNthCalledWith(3, 'ext3', hookName, context, false);
  });

  it('should throw an error if an extension is not a string', async () => {
    const extensions = ['ext1', 123, 'ext3'] as unknown as string[];
    const hookName = 'testHook';
    const context = { data: 'test' };

    await expect(runExtensionHook(extensions, hookName, context)).rejects.toThrow(
      'extension must be a string',
    );
  });
});

describe('collectFileMetadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(path, 'resolve').mockImplementation((...paths) => {
      return paths[paths.length - 1];
    });
  });

  it('should identify image files correctly', () => {
    const vars = {
      image1: 'file://path/to/image.jpg',
      image2: 'file://path/to/image.png',
      image3: 'file://path/to/image.webp',
      text: 'This is not a file',
      otherFile: 'file://path/to/document.txt',
    };

    const metadata = collectFileMetadata(vars);

    expect(metadata).toEqual({
      image1: {
        path: 'file://path/to/image.jpg',
        type: 'image',
        format: 'jpg',
      },
      image2: {
        path: 'file://path/to/image.png',
        type: 'image',
        format: 'png',
      },
      image3: {
        path: 'file://path/to/image.webp',
        type: 'image',
        format: 'webp',
      },
    });
  });

  it('should identify video files correctly', () => {
    const vars = {
      video1: 'file://path/to/video.mp4',
      video2: 'file://path/to/video.webm',
      video3: 'file://path/to/video.mkv',
      text: 'This is not a file',
    };

    const metadata = collectFileMetadata(vars);

    expect(metadata).toEqual({
      video1: {
        path: 'file://path/to/video.mp4',
        type: 'video',
        format: 'mp4',
      },
      video2: {
        path: 'file://path/to/video.webm',
        type: 'video',
        format: 'webm',
      },
      video3: {
        path: 'file://path/to/video.mkv',
        type: 'video',
        format: 'mkv',
      },
    });
  });

  it('should identify audio files correctly', () => {
    const vars = {
      audio1: 'file://path/to/audio.mp3',
      audio2: 'file://path/to/audio.wav',
      text: 'This is not a file',
    };

    const metadata = collectFileMetadata(vars);

    expect(metadata).toEqual({
      audio1: {
        path: 'file://path/to/audio.mp3',
        type: 'audio',
        format: 'mp3',
      },
      audio2: {
        path: 'file://path/to/audio.wav',
        type: 'audio',
        format: 'wav',
      },
    });
  });

  it('should return an empty object when no media files are found', () => {
    const vars = {
      text1: 'This is not a file',
      text2: 'file://path/to/document.txt',
      text3: 'file://path/to/document.pdf',
    };

    const metadata = collectFileMetadata(vars);

    expect(metadata).toEqual({});
  });

  it('should handle non-string values correctly', () => {
    const vars = {
      text: 'file://path/to/image.jpg',
      object: { key: 'value' },
      array: ['file://path/to/video.mp4'],
      number: 42 as unknown as string,
    };

    const metadata = collectFileMetadata(vars);

    expect(metadata).toEqual({
      text: {
        path: 'file://path/to/image.jpg',
        type: 'image',
        format: 'jpg',
      },
    });
  });
});
