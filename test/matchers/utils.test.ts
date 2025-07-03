import { getAndCheckProvider, getGradingProvider, renderLlmRubricPrompt } from '../../src/matchers';
import {
  DefaultEmbeddingProvider,
  DefaultGradingProvider,
} from '../../src/providers/openai/defaults';
import type { ApiProvider, ProviderTypeMap } from '../../src/types';

describe('getGradingProvider', () => {
  it('should return the correct provider when provider is a string', async () => {
    const provider = await getGradingProvider(
      'text',
      'openai:chat:gpt-4o-mini-foobar',
      DefaultGradingProvider,
    );
    // ok for this not to match exactly when the string is parsed
    expect(provider?.id()).toBe('openai:gpt-4o-mini-foobar');
  });

  it('should return the correct provider when provider is an ApiProvider', async () => {
    const provider = await getGradingProvider(
      'embedding',
      DefaultEmbeddingProvider,
      DefaultGradingProvider,
    );
    expect(provider).toBe(DefaultEmbeddingProvider);
  });

  it('should return the correct provider when provider is ProviderOptions', async () => {
    const providerOptions = {
      id: 'openai:chat:gpt-4o-mini-foobar',
      config: {
        apiKey: 'abc123',
        temperature: 3.1415926,
      },
    };
    const provider = await getGradingProvider('text', providerOptions, DefaultGradingProvider);
    expect(provider?.id()).toBe('openai:chat:gpt-4o-mini-foobar');
  });

  it('should return the default provider when provider is not provided', async () => {
    const provider = await getGradingProvider('text', undefined, DefaultGradingProvider);
    expect(provider).toBe(DefaultGradingProvider);
  });
});

describe('getAndCheckProvider', () => {
  it('should return the default provider when provider is not defined', async () => {
    await expect(
      getAndCheckProvider('text', undefined, DefaultGradingProvider, 'test check'),
    ).resolves.toBe(DefaultGradingProvider);
  });

  it('should return the default provider when provider does not support type', async () => {
    const provider = {
      id: () => 'test-provider',
      callApi: () => Promise.resolve({ output: 'test' }),
    };
    await expect(
      getAndCheckProvider('embedding', provider, DefaultEmbeddingProvider, 'test check'),
    ).resolves.toBe(DefaultEmbeddingProvider);
  });

  it('should return the provider if it implements the required method', async () => {
    const provider = {
      id: () => 'test-provider',
      callApi: () => Promise.resolve({ output: 'test' }),
      callEmbeddingApi: () => Promise.resolve({ embedding: [] }),
    };
    const result = await getAndCheckProvider(
      'embedding',
      provider,
      DefaultEmbeddingProvider,
      'test check',
    );
    expect(result).toBe(provider);
  });

  it('should return the default provider when no provider is specified', async () => {
    const provider = await getGradingProvider('text', undefined, DefaultGradingProvider);
    expect(provider).toBe(DefaultGradingProvider);
  });

  it('should return a specific provider when a provider id is specified', async () => {
    const provider = await getGradingProvider('text', 'openai:chat:foo', DefaultGradingProvider);
    // loadApiProvider removes `chat` from the id
    expect(provider?.id()).toBe('openai:foo');
  });

  it('should return a provider from ApiProvider when specified', async () => {
    const providerOptions: ApiProvider = {
      id: () => 'custom-provider',
      callApi: async () => ({}),
    };
    const provider = await getGradingProvider('text', providerOptions, DefaultGradingProvider);
    expect(provider?.id()).toBe('custom-provider');
  });

  it('should return a provider from ProviderTypeMap when specified', async () => {
    const providerTypeMap: ProviderTypeMap = {
      text: {
        id: 'openai:chat:foo',
      },
      embedding: {
        id: 'openai:embedding:bar',
      },
    };
    const provider = await getGradingProvider('text', providerTypeMap, DefaultGradingProvider);
    expect(provider?.id()).toBe('openai:chat:foo');
  });

  it('should return a provider from ProviderTypeMap with basic strings', async () => {
    const providerTypeMap: ProviderTypeMap = {
      text: 'openai:chat:foo',
      embedding: 'openai:embedding:bar',
    };
    const provider = await getGradingProvider('text', providerTypeMap, DefaultGradingProvider);
    expect(provider?.id()).toBe('openai:foo');
  });

  it('should throw an error when the provider does not match the type', async () => {
    const providerTypeMap: ProviderTypeMap = {
      embedding: {
        id: 'openai:embedding:foo',
      },
    };
    await expect(
      getGradingProvider('text', providerTypeMap, DefaultGradingProvider),
    ).rejects.toThrow(
      new Error(
        `Invalid provider definition for output type 'text': ${JSON.stringify(
          providerTypeMap,
          null,
          2,
        )}`,
      ),
    );
  });
});

describe('tryParse and renderLlmRubricPrompt', () => {
  let tryParse: (content: string | null | undefined) => any;

  beforeAll(async () => {
    const context: { capturedFn: null | Function } = { capturedFn: null };

    await renderLlmRubricPrompt('{"test":"value"}', {
      __capture(fn: Function) {
        context.capturedFn = fn;
        return 'captured';
      },
    });

    tryParse = function (content: string | null | undefined) {
      try {
        if (content === null || content === undefined) {
          return content;
        }
        return JSON.parse(content);
      } catch {}
      return content;
    };
  });

  it('should parse valid JSON', () => {
    const input = '{"key": "value"}';
    expect(tryParse(input)).toEqual({ key: 'value' });
  });

  it('should return original string for invalid JSON', () => {
    const input = 'not json';
    expect(tryParse(input)).toBe('not json');
  });

  it('should handle empty string', () => {
    const input = '';
    expect(tryParse(input)).toBe('');
  });

  it('should handle null and undefined', () => {
    expect(tryParse(null)).toBeNull();
    expect(tryParse(undefined)).toBeUndefined();
  });

  it('should render strings inside JSON objects', async () => {
    const template = '{"role": "user", "content": "Hello {{name}}"}';
    const result = await renderLlmRubricPrompt(template, { name: 'World' });
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ role: 'user', content: 'Hello World' });
  });

  it('should preserve JSON structure while rendering only strings', async () => {
    const template = '{"nested": {"text": "{{var}}", "number": 42}}';
    const result = await renderLlmRubricPrompt(template, { var: 'test' });
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ nested: { text: 'test', number: 42 } });
  });

  it('should handle non-JSON templates with legacy rendering', async () => {
    const template = 'Hello {{name}}';
    const result = await renderLlmRubricPrompt(template, { name: 'World' });
    expect(result).toBe('Hello World');
  });

  it('should handle complex objects in context', async () => {
    const template = '{"text": "{{object}}"}';
    const complexObject = { foo: 'bar', baz: [1, 2, 3] };
    const result = await renderLlmRubricPrompt(template, { object: complexObject });
    const parsed = JSON.parse(result);
    expect(typeof parsed.text).toBe('string');
    // With our fix, this should now be stringified JSON instead of [object Object]
    expect(parsed.text).toBe(JSON.stringify(complexObject));
  });

  it('should properly stringify objects', async () => {
    const template = 'Source Text:\n{{input}}';
    // Create objects that would typically cause the [object Object] issue
    const objects = [
      { name: 'Object 1', properties: { color: 'red', size: 'large' } },
      { name: 'Object 2', properties: { color: 'blue', size: 'small' } },
    ];

    const result = await renderLlmRubricPrompt(template, { input: objects });

    // With our fix, this should properly stringify the objects
    expect(result).not.toContain('[object Object]');
    expect(result).toContain(JSON.stringify(objects[0]));
    expect(result).toContain(JSON.stringify(objects[1]));
  });

  it('should handle mixed arrays of objects and primitives', async () => {
    const template = 'Items: {{items}}';
    const mixedArray = ['string item', { name: 'Object item' }, 42, [1, 2, 3]];

    const result = await renderLlmRubricPrompt(template, { items: mixedArray });

    // Objects in array should be stringified
    expect(result).not.toContain('[object Object]');
    expect(result).toContain('string item');
    expect(result).toContain(JSON.stringify({ name: 'Object item' }));
    expect(result).toContain('42');
    expect(result).toContain(JSON.stringify([1, 2, 3]));
  });

  it('should render arrays of objects correctly', async () => {
    const template = '{"items": [{"name": "{{name1}}"}, {"name": "{{name2}}"}]}';
    const result = await renderLlmRubricPrompt(template, { name1: 'Alice', name2: 'Bob' });
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({
      items: [{ name: 'Alice' }, { name: 'Bob' }],
    });
  });

  it('should handle multiline strings', async () => {
    const template = `{"content": "Line 1\\nLine {{number}}\\nLine 3"}`;
    const result = await renderLlmRubricPrompt(template, { number: '2' });
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({
      content: 'Line 1\nLine 2\nLine 3',
    });
  });

  it('should handle nested templates', async () => {
    const template = '{"outer": "{{value1}}", "inner": {"value": "{{value2}}"}}';
    const result = await renderLlmRubricPrompt(template, {
      value1: 'outer value',
      value2: 'inner value',
    });
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({
      outer: 'outer value',
      inner: { value: 'inner value' },
    });
  });

  it('should handle escaping in JSON strings', async () => {
    const template = '{"content": "This needs \\"escaping\\" and {{var}} too"}';
    const result = await renderLlmRubricPrompt(template, { var: 'var with "quotes"' });
    const parsed = JSON.parse(result);
    expect(parsed.content).toBe('This needs "escaping" and var with "quotes" too');
  });

  it('should work with nested arrays and objects', async () => {
    const template = JSON.stringify({
      role: 'system',
      content: 'Process this: {{input}}',
      config: {
        options: [
          { id: 1, label: '{{option1}}' },
          { id: 2, label: '{{option2}}' },
        ],
      },
    });

    const evalResult = await renderLlmRubricPrompt(template, {
      input: 'test input',
      option1: 'First Option',
      option2: 'Second Option',
    });

    const parsed = JSON.parse(evalResult);
    expect(parsed.content).toBe('Process this: test input');
    expect(parsed.config.options[0].label).toBe('First Option');
    expect(parsed.config.options[1].label).toBe('Second Option');
  });

  it('should handle rendering statements with join filter', async () => {
    const statements = ['Statement 1', 'Statement 2', 'Statement 3'];
    const template = 'statements:\n{{statements|join("\\n")}}';
    const result = await renderLlmRubricPrompt(template, { statements });

    const expected = 'statements:\nStatement 1\nStatement 2\nStatement 3';
    expect(result).toBe(expected);
  });

  it('should stringify objects in arrays', async () => {
    const template = 'Items: {{items}}';
    const items = [{ name: 'Item 1', price: 10 }, 'string item', { name: 'Item 2', price: 20 }];

    const result = await renderLlmRubricPrompt(template, { items });

    expect(result).not.toContain('[object Object]');
    expect(result).toContain(JSON.stringify(items[0]));
    expect(result).toContain('string item');
    expect(result).toContain(JSON.stringify(items[2]));
  });

  it('should stringify deeply nested objects and arrays', async () => {
    const template = 'Complex data: {{data}}';
    const data = {
      products: [
        {
          name: 'Item 1',
          price: 10,
          details: {
            color: 'red',
            specs: { weight: '2kg', dimensions: { width: 10, height: 20 } },
          },
        },
        'string item',
        {
          name: 'Item 2',
          price: 20,
          nested: [{ a: 1 }, { b: 2 }],
          metadata: { tags: ['electronics', 'gadget'] },
        },
      ],
    };

    const result = await renderLlmRubricPrompt(template, { data });

    expect(result).not.toContain('[object Object]');
    expect(result).toContain('"specs":{"weight":"2kg"');
    expect(result).toContain('"dimensions":{"width":10,"height":20}');
    expect(result).toContain('[{"a":1},{"b":2}]');
    expect(result).toContain('"tags":["electronics","gadget"]');
    expect(result).toContain('string item');
  });
});

describe('PROMPTFOO_DISABLE_OBJECT_STRINGIFY environment variable', () => {
  afterEach(() => {
    // Clean up environment variable after each test
    delete process.env.PROMPTFOO_DISABLE_OBJECT_STRINGIFY;
  });

  describe('Default behavior (PROMPTFOO_DISABLE_OBJECT_STRINGIFY=false)', () => {
    beforeEach(() => {
      process.env.PROMPTFOO_DISABLE_OBJECT_STRINGIFY = 'false';
    });

    it('should stringify objects to prevent [object Object] issues', async () => {
      const template = 'Product: {{product}}';
      const product = { name: 'Headphones', price: 99.99 };

      const result = await renderLlmRubricPrompt(template, { product });

      expect(result).not.toContain('[object Object]');
      expect(result).toBe(`Product: ${JSON.stringify(product)}`);
    });

    it('should stringify objects in arrays', async () => {
      const template = 'Items: {{items}}';
      const items = [{ name: 'Item 1', price: 10 }, 'string item', { name: 'Item 2', price: 20 }];

      const result = await renderLlmRubricPrompt(template, { items });

      expect(result).not.toContain('[object Object]');
      expect(result).toContain(JSON.stringify(items[0]));
      expect(result).toContain('string item');
      expect(result).toContain(JSON.stringify(items[2]));
    });
  });

  describe('Object access enabled (PROMPTFOO_DISABLE_OBJECT_STRINGIFY=true)', () => {
    beforeEach(() => {
      process.env.PROMPTFOO_DISABLE_OBJECT_STRINGIFY = 'true';
    });

    it('should allow direct object property access', async () => {
      const template = 'Product: {{product.name}} - ${{product.price}}';
      const product = { name: 'Headphones', price: 99.99 };

      const result = await renderLlmRubricPrompt(template, { product });

      expect(result).toBe('Product: Headphones - $99.99');
    });

    it('should allow array indexing and property access', async () => {
      const template = 'First item: {{items[0].name}}';
      const items = [
        { name: 'First Item', price: 10 },
        { name: 'Second Item', price: 20 },
      ];

      const result = await renderLlmRubricPrompt(template, { items });

      expect(result).toBe('First item: First Item');
    });
  });
});
