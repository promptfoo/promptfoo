import { expect, it } from 'vitest';
import { createRequiredTestSchema } from '../../factories/literalFixtures';

import type { AzureChatCompletionProvider } from '../../../src/providers/azure/chat';

export function registerAzureConfigTests(
  getProvider: () => AzureChatCompletionProvider,
  explicitUndefined = false,
) {
  const verifyAzureProviderConfig = async () => {
    const context = {
      prompt: { label: 'test prompt', raw: 'test prompt' },
      vars: {},
    };
    const { body } = await getProvider().getOpenAiBody('test prompt', context);
    expect(body).toMatchObject({
      functions: [{ name: 'provider_func', parameters: {} }],
      max_tokens: 100,
      temperature: 0.5,
    });
  };
  it('should use provider config when no prompt config exists', verifyAzureProviderConfig);

  it('should merge prompt config with provider config', async () => {
    const context = {
      prompt: {
        config: {
          functions: [{ name: 'prompt_func', parameters: {} }],
          temperature: 0.7,
        },
        label: 'test prompt',
        raw: 'test prompt',
      },
      vars: {},
    };
    const { body } = await getProvider().getOpenAiBody('test prompt', context);
    expect(body).toMatchObject({
      functions: [{ name: 'prompt_func', parameters: {} }],
      max_tokens: 100,
      temperature: 0.7,
    });
  });

  it(
    'should handle undefined prompt config',
    explicitUndefined
      ? async () => {
          const context = {
            prompt: { config: undefined, label: 'test prompt', raw: 'test prompt' },
            vars: {},
          };
          const { body } = await getProvider().getOpenAiBody('test prompt', context);
          expect(body).toMatchObject({
            functions: [{ name: 'provider_func', parameters: {} }],
            max_tokens: 100,
            temperature: 0.5,
          });
        }
      : verifyAzureProviderConfig,
  );

  it('should handle empty prompt config', async () => {
    const context = {
      prompt: { config: {}, label: 'test prompt', raw: 'test prompt' },
      vars: {},
    };
    const { body } = await getProvider().getOpenAiBody('test prompt', context);
    expect(body).toMatchObject({
      functions: [{ name: 'provider_func', parameters: {} }],
      max_tokens: 100,
      temperature: 0.5,
    });
  });

  it('should handle complex nested config merging', async () => {
    const context = {
      prompt: {
        config: {
          response_format: { type: 'json_object' },
          tool_choice: { function: { name: 'test' }, type: 'function' },
        },
        label: 'test prompt',
        raw: 'test prompt',
      },
      vars: {},
    };
    const { body } = await getProvider().getOpenAiBody('test prompt', context);
    expect(body).toMatchObject({
      functions: [{ name: 'provider_func', parameters: {} }],
      max_tokens: 100,
      response_format: { type: 'json_object' },
      temperature: 0.5,
      tool_choice: { function: { name: 'test' }, type: 'function' },
    });
  });

  it('should handle json_schema response format', async () => {
    const context = {
      prompt: {
        config: {
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'test_schema',
              strict: true,
              schema: createRequiredTestSchema(),
            },
          },
        },
        label: 'test prompt',
        raw: 'test prompt',
      },
      vars: {},
    };
    const { body } = await getProvider().getOpenAiBody('test prompt', context);
    expect(body.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: {
        name: 'test_schema',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            test: { type: 'string' },
          },
          required: ['test'],
          additionalProperties: false,
        },
      },
    });
  });

  it('should render variables in response format', async () => {
    const context = {
      prompt: {
        config: {
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: '{{schemaName}}',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  test: { type: 'string' },
                },
              },
            },
          },
        },
        label: 'test prompt',
        raw: 'test prompt',
      },
      vars: {
        schemaName: 'dynamic_schema',
      },
    };
    const { body } = await getProvider().getOpenAiBody('test prompt', context);
    expect(body.response_format.json_schema.name).toBe('dynamic_schema');
  });
}
