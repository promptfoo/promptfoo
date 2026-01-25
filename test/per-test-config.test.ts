import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildConversationKey, runEval } from '../src/evaluator';
import { createEmptyTokenUsage } from '../src/util/tokenUsageUtils';

import type { ApiProvider, AtomicTestCase, Prompt, TestCase } from '../src/types/index';

describe('Per-test configuration merging', () => {
  let mockProvider: ApiProvider;
  let mockPrompt: Prompt;
  const buildTestConcurrencyKey = (test: TestCase, repeatIndex = 0) =>
    buildConversationKey(mockProvider, mockPrompt, test as AtomicTestCase, repeatIndex);

  afterEach(() => {
    vi.resetAllMocks();
  });

  beforeEach(() => {
    vi.resetAllMocks();

    // Mock provider that captures the config it receives
    mockProvider = {
      id: vi.fn(() => 'test-provider'),
      label: 'Test Provider',
      config: {
        temperature: 0.5,
        provider_field: 'provider_value',
      },
      callApi: vi.fn(async (_prompt, context) => {
        // Return the config so we can verify it was merged correctly
        return {
          output: JSON.stringify({ received_config: context?.prompt?.config }),
          tokenUsage: createEmptyTokenUsage(),
        };
      }),
    };

    mockPrompt = {
      id: 'test-prompt',
      raw: 'Test prompt: {{input}}',
      label: 'Test Prompt',
      config: {
        prompt_field: 'prompt_value',
        temperature: 0.7, // Override provider
      },
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should merge test.options into prompt.config', async () => {
    const test: TestCase = {
      vars: { input: 'test' },
      options: {
        test_field: 'test_value',
      },
    };

    const _result = await runEval({
      provider: mockProvider,
      prompt: mockPrompt,
      test,
      delay: 0,
      testIdx: 0,
      promptIdx: 0,
      repeatIndex: 0,
      isRedteam: false,
      concurrencyKey: buildTestConcurrencyKey(test),
    });

    expect(mockProvider.callApi).toHaveBeenCalled();
    const callArgs = (mockProvider.callApi as ReturnType<typeof vi.fn>).mock.calls[0];
    const context = callArgs[1];

    // Verify config merge
    expect(context.prompt.config).toMatchObject({
      prompt_field: 'prompt_value',
      temperature: 0.7,
      test_field: 'test_value', // Added from test.options
    });
  });

  it('should allow test.options to override prompt.config', async () => {
    const test: TestCase = {
      vars: { input: 'test' },
      options: {
        temperature: 1.0, // Override prompt's temperature
        response_format: { type: 'json_object' },
      },
    };

    const _result = await runEval({
      provider: mockProvider,
      prompt: mockPrompt,
      test,
      delay: 0,
      testIdx: 0,
      promptIdx: 0,
      repeatIndex: 0,
      isRedteam: false,
      concurrencyKey: buildTestConcurrencyKey(test),
    });

    const callArgs = (mockProvider.callApi as ReturnType<typeof vi.fn>).mock.calls[0];
    const context = callArgs[1];

    // Test options should override prompt config
    expect(context.prompt.config.temperature).toBe(1.0);
    expect(context.prompt.config.response_format).toEqual({ type: 'json_object' });
    // Prompt field should still be there
    expect(context.prompt.config.prompt_field).toBe('prompt_value');
  });

  it('should do shallow merge (replace nested objects)', async () => {
    mockPrompt.config = {
      nested: {
        field1: 'value1',
        field2: 'value2',
      },
    };

    const test: TestCase = {
      vars: { input: 'test' },
      options: {
        nested: {
          field2: 'override', // Only field2
        },
      },
    };

    const _result = await runEval({
      provider: mockProvider,
      prompt: mockPrompt,
      test,
      delay: 0,
      testIdx: 0,
      promptIdx: 0,
      repeatIndex: 0,
      isRedteam: false,
      concurrencyKey: buildTestConcurrencyKey(test),
    });

    const callArgs = (mockProvider.callApi as ReturnType<typeof vi.fn>).mock.calls[0];
    const context = callArgs[1];

    // Shallow merge: nested object is completely replaced
    expect(context.prompt.config.nested).toEqual({
      field2: 'override',
    });
    // field1 is lost (not deep merged)
    expect(context.prompt.config.nested.field1).toBeUndefined();
  });

  it('should handle undefined test.options', async () => {
    const test: TestCase = {
      vars: { input: 'test' },
      // No options
    };

    const _result = await runEval({
      provider: mockProvider,
      prompt: mockPrompt,
      test,
      delay: 0,
      testIdx: 0,
      promptIdx: 0,
      repeatIndex: 0,
      isRedteam: false,
      concurrencyKey: buildTestConcurrencyKey(test),
    });

    const callArgs = (mockProvider.callApi as ReturnType<typeof vi.fn>).mock.calls[0];
    const context = callArgs[1];

    // Should use prompt config as-is
    expect(context.prompt.config).toMatchObject({
      prompt_field: 'prompt_value',
      temperature: 0.7,
    });
  });

  it('should handle empty test.options object', async () => {
    const test: TestCase = {
      vars: { input: 'test' },
      options: {},
    };

    const _result = await runEval({
      provider: mockProvider,
      prompt: mockPrompt,
      test,
      delay: 0,
      testIdx: 0,
      promptIdx: 0,
      repeatIndex: 0,
      isRedteam: false,
      concurrencyKey: buildTestConcurrencyKey(test),
    });

    const callArgs = (mockProvider.callApi as ReturnType<typeof vi.fn>).mock.calls[0];
    const context = callArgs[1];

    // Should use prompt config as-is
    expect(context.prompt.config).toMatchObject({
      prompt_field: 'prompt_value',
      temperature: 0.7,
    });
  });

  it('should preserve non-overlapping fields from both configs', async () => {
    mockPrompt.config = {
      temperature: 0.5,
      max_tokens: 100,
    };

    const test: TestCase = {
      vars: { input: 'test' },
      options: {
        response_format: { type: 'json_object' },
        top_p: 0.9,
      },
    };

    const _result = await runEval({
      provider: mockProvider,
      prompt: mockPrompt,
      test,
      delay: 0,
      testIdx: 0,
      promptIdx: 0,
      repeatIndex: 0,
      isRedteam: false,
      concurrencyKey: buildTestConcurrencyKey(test),
    });

    const callArgs = (mockProvider.callApi as ReturnType<typeof vi.fn>).mock.calls[0];
    const context = callArgs[1];

    // All fields should be present
    expect(context.prompt.config).toMatchObject({
      temperature: 0.5,
      max_tokens: 100,
      response_format: { type: 'json_object' },
      top_p: 0.9,
    });
  });

  it('should support provider-specific fields in test.options', async () => {
    const test: TestCase = {
      vars: { input: 'test' },
      options: {
        // OpenAI-specific field
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'test_schema',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                answer: { type: 'string' },
              },
              required: ['answer'],
              additionalProperties: false,
            },
          },
        },
      },
    };

    const _result = await runEval({
      provider: mockProvider,
      prompt: mockPrompt,
      test,
      delay: 0,
      testIdx: 0,
      promptIdx: 0,
      repeatIndex: 0,
      isRedteam: false,
      concurrencyKey: buildTestConcurrencyKey(test),
    });

    const callArgs = (mockProvider.callApi as ReturnType<typeof vi.fn>).mock.calls[0];
    const context = callArgs[1];

    // Provider-specific field should be passed through
    expect(context.prompt.config.response_format).toBeDefined();
    expect(context.prompt.config.response_format.type).toBe('json_schema');
    expect(context.prompt.config.response_format.json_schema).toBeDefined();
  });

  it('should support Google Vertex responseSchema in test.options', async () => {
    const test: TestCase = {
      vars: { input: 'test' },
      options: {
        // Google-specific field
        responseSchema: {
          type: 'OBJECT',
          properties: {
            answer: { type: 'STRING' },
            confidence: { type: 'NUMBER' },
          },
          required: ['answer'],
        },
      },
    };

    const _result = await runEval({
      provider: mockProvider,
      prompt: mockPrompt,
      test,
      delay: 0,
      testIdx: 0,
      promptIdx: 0,
      repeatIndex: 0,
      isRedteam: false,
      concurrencyKey: buildTestConcurrencyKey(test),
    });

    const callArgs = (mockProvider.callApi as ReturnType<typeof vi.fn>).mock.calls[0];
    const context = callArgs[1];

    // Google-specific field should be passed through
    expect(context.prompt.config.responseSchema).toBeDefined();
    expect(context.prompt.config.responseSchema.type).toBe('OBJECT');
    expect(context.prompt.config.responseSchema.properties.answer.type).toBe('STRING');
  });

  it('should preserve existing test.options behavior (transform, storeOutputAs)', async () => {
    const test: TestCase = {
      vars: { input: 'test' },
      options: {
        transform: 'output.toUpperCase()',
        storeOutputAs: 'result',
        response_format: { type: 'json_object' },
      },
    };

    // These fields should still be accessible in test.options AND in prompt.config
    const _result = await runEval({
      provider: mockProvider,
      prompt: mockPrompt,
      test,
      delay: 0,
      testIdx: 0,
      promptIdx: 0,
      repeatIndex: 0,
      isRedteam: false,
      concurrencyKey: buildTestConcurrencyKey(test),
    });

    const callArgs = (mockProvider.callApi as ReturnType<typeof vi.fn>).mock.calls[0];
    const context = callArgs[1];

    // Fields should be in prompt.config
    expect(context.prompt.config.transform).toBe('output.toUpperCase()');
    expect(context.prompt.config.storeOutputAs).toBe('result');
    expect(context.prompt.config.response_format).toEqual({ type: 'json_object' });
  });

  it('should handle multiple test.options fields simultaneously', async () => {
    const test: TestCase = {
      vars: { input: 'test' },
      options: {
        response_format: { type: 'json_object' },
        temperature: 0.9,
        max_tokens: 500,
        top_p: 0.95,
        custom_field: 'custom_value',
      },
    };

    const _result = await runEval({
      provider: mockProvider,
      prompt: mockPrompt,
      test,
      delay: 0,
      testIdx: 0,
      promptIdx: 0,
      repeatIndex: 0,
      isRedteam: false,
      concurrencyKey: buildTestConcurrencyKey(test),
    });

    const callArgs = (mockProvider.callApi as ReturnType<typeof vi.fn>).mock.calls[0];
    const context = callArgs[1];

    // All fields should be in merged config
    expect(context.prompt.config).toMatchObject({
      response_format: { type: 'json_object' },
      temperature: 0.9,
      max_tokens: 500,
      top_p: 0.95,
      custom_field: 'custom_value',
      prompt_field: 'prompt_value', // From prompt
    });
  });
});
