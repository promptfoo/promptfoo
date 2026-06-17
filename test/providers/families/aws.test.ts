import { afterEach, describe, expect, it } from 'vitest';
import { BedrockAnthropicMessagesProvider } from '../../../src/providers/bedrock/anthropicMessages';
import { AwsBedrockConverseProvider } from '../../../src/providers/bedrock/converse';
import { AwsBedrockCompletionProvider } from '../../../src/providers/bedrock/index';
import { awsProviderFactories } from '../../../src/providers/families/aws';
import { OpenAiResponsesProvider } from '../../../src/providers/openai/responses';
import { mockProcessEnv } from '../../util/utils';

const bedrockFactory = awsProviderFactories.find((f) => f.test('bedrock:openai.gpt-5.5'))!;

// The aws factories ignore the context argument; an empty object satisfies the type.
const ctx = {} as any;

describe('aws bedrock provider factory routing', () => {
  let restoreEnv: (() => void) | undefined;

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = undefined;
  });

  it('routes frontier gpt-5.x ids to the OpenAI Responses provider on the mantle endpoint', async () => {
    const provider = await bedrockFactory.create(
      'bedrock:openai.gpt-5.5',
      { config: { region: 'us-east-2', apiKey: 'bedrock-key' } },
      ctx,
    );
    expect(provider).toBeInstanceOf(OpenAiResponsesProvider);
    expect((provider as any).config.apiBaseUrl).toBe(
      'https://bedrock-mantle.us-east-2.api.aws/openai/v1',
    );
    expect(provider.id()).toBe('bedrock:openai.gpt-5.5');
  });

  it('routes xai.grok ids to the Responses provider on the us-west-2 mantle endpoint', async () => {
    const provider = await bedrockFactory.create(
      'bedrock:xai.grok-4.3',
      { config: { apiKey: 'bedrock-key' } },
      ctx,
    );
    expect(provider).toBeInstanceOf(OpenAiResponsesProvider);
    expect((provider as any).config.apiBaseUrl).toBe(
      'https://bedrock-mantle.us-west-2.api.aws/openai/v1',
    );
    expect(provider.id()).toBe('bedrock:xai.grok-4.3');
  });

  it.each([
    'bedrock:converse:xai.grok-4.3',
    'bedrock:completion:xai.grok-4.3',
  ])('routes the explicit %s form to the Grok mantle Responses provider', async (id) => {
    const provider = await bedrockFactory.create(id, { config: { apiKey: 'bedrock-key' } }, ctx);
    expect(provider).toBeInstanceOf(OpenAiResponsesProvider);
    expect((provider as any).config.apiBaseUrl).toBe(
      'https://bedrock-mantle.us-west-2.api.aws/openai/v1',
    );
  });

  it('routes gpt-oss ids to the InvokeModel completion provider', async () => {
    const provider = await bedrockFactory.create(
      'bedrock:openai.gpt-oss-120b-1:0',
      { config: { region: 'us-east-2' } },
      ctx,
    );
    expect(provider).toBeInstanceOf(AwsBedrockCompletionProvider);
  });

  it('keeps the bare Fable model on the Bedrock Runtime provider', async () => {
    const provider = await bedrockFactory.create(
      'bedrock:anthropic.claude-fable-5',
      { config: { region: 'us-east-1' } },
      ctx,
    );
    expect(provider).toBeInstanceOf(AwsBedrockCompletionProvider);
  });

  it('routes bare Mythos to the Bedrock Anthropic Messages endpoint', async () => {
    const provider = await bedrockFactory.create(
      'bedrock:anthropic.claude-mythos-5',
      { config: { region: 'us-east-1', apiKey: 'bedrock-key' } },
      ctx,
    );
    expect(provider).toBeInstanceOf(BedrockAnthropicMessagesProvider);
    expect((provider as any).getApiBaseUrl()).toBe(
      'https://bedrock-mantle.us-east-1.api.aws/anthropic',
    );
    expect(provider.id()).toBe('bedrock:anthropic.claude-mythos-5');
  });

  it('supports the explicit messages form for Bedrock Fable', async () => {
    const provider = await bedrockFactory.create(
      'bedrock:messages:anthropic.claude-fable-5',
      { config: { apiKey: 'bedrock-key' } },
      ctx,
    );
    expect(provider).toBeInstanceOf(BedrockAnthropicMessagesProvider);
  });

  it('supports the explicit messages form for Bedrock Mythos', async () => {
    const provider = await bedrockFactory.create(
      'bedrock:messages:anthropic.claude-mythos-5',
      { config: { apiKey: 'bedrock-key', region: 'us-east-1' } },
      ctx,
    );
    expect(provider).toBeInstanceOf(BedrockAnthropicMessagesProvider);
  });

  it.each([
    'converse',
    'completion',
  ])('rejects the legacy %s API for Bedrock Mythos with a clear error', async (modelType) => {
    await expect(
      bedrockFactory.create(
        `bedrock:${modelType}:anthropic.claude-mythos-5`,
        { config: { apiKey: 'bedrock-key' } },
        ctx,
      ),
    ).rejects.toThrow(/Anthropic Messages API/);
  });

  it('routes the converse: form of Bedrock Fable to the Converse provider', async () => {
    // Unlike Mythos, Fable does not require the Anthropic Messages endpoint, so the
    // explicit converse: form keeps resolving to the native Converse provider.
    const provider = await bedrockFactory.create(
      'bedrock:converse:anthropic.claude-fable-5',
      { config: { region: 'us-east-1' } },
      ctx,
    );
    expect(provider).toBeInstanceOf(AwsBedrockConverseProvider);
  });

  it.each([
    'bedrock:us.anthropic.claude-mythos-5',
    'bedrock:converse:global.anthropic.claude-mythos-5',
    'bedrock:completion:us.anthropic.claude-mythos-5',
  ])('rejects unsupported prefixed Mythos ID %s', async (providerPath) => {
    await expect(
      bedrockFactory.create(providerPath, { config: { apiKey: 'bedrock-key' } }, ctx),
    ).rejects.toThrow(/does not support geo or global inference IDs/);
  });

  it('rejects unknown Anthropic Messages models instead of falling through to InvokeModel', async () => {
    await expect(
      bedrockFactory.create(
        'bedrock:messages:anthropic.claude-opus-4-8',
        { config: { apiKey: 'bedrock-key' } },
        ctx,
      ),
    ).rejects.toThrow(/not supported by the Anthropic Messages provider/);
  });

  it('throws a helpful error for frontier ids without a Bedrock API key', async () => {
    restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
    await expect(
      bedrockFactory.create('bedrock:openai.gpt-5.5', { config: { region: 'us-east-2' } }, ctx),
    ).rejects.toThrow(/AWS_BEARER_TOKEN_BEDROCK/);
  });

  it('routes the converse: form of a frontier id to the Responses provider on the mantle endpoint', async () => {
    const provider = await bedrockFactory.create(
      'bedrock:converse:openai.gpt-5.5',
      { config: { region: 'us-east-2', apiKey: 'bedrock-key' } },
      ctx,
    );
    expect(provider).toBeInstanceOf(OpenAiResponsesProvider);
    expect((provider as any).config.apiBaseUrl).toBe(
      'https://bedrock-mantle.us-east-2.api.aws/openai/v1',
    );
  });

  it('routes the completion: form of a frontier id to the Responses provider on the mantle endpoint', async () => {
    const provider = await bedrockFactory.create(
      'bedrock:completion:openai.gpt-5.4',
      { config: { region: 'us-west-2', apiKey: 'bedrock-key' } },
      ctx,
    );
    expect(provider).toBeInstanceOf(OpenAiResponsesProvider);
    expect((provider as any).config.apiBaseUrl).toBe(
      'https://bedrock-mantle.us-west-2.api.aws/openai/v1',
    );
  });

  it('routes the completion: form of a gpt-oss id to the InvokeModel completion provider (not Responses)', async () => {
    const provider = await bedrockFactory.create(
      'bedrock:completion:openai.gpt-oss-120b-1:0',
      { config: { region: 'us-east-2' } },
      ctx,
    );
    expect(provider).toBeInstanceOf(AwsBedrockCompletionProvider);
    expect(provider).not.toBeInstanceOf(OpenAiResponsesProvider);
  });

  // The frontier check must not hijack sub-typed forms whose model segment merely contains
  // "openai." — they must reach their own handlers (kb / embeddings / agents), not Responses.
  it.each([
    ['bedrock:kb:openai.gpt-5.5', 'AwsBedrockKnowledgeBaseProvider'],
    ['bedrock:knowledge-base:openai.gpt-5.5', 'AwsBedrockKnowledgeBaseProvider'],
    ['bedrock:embeddings:openai.embed-foo', 'AwsBedrockEmbeddingProvider'],
    ['bedrock:embedding:openai.embed-foo', 'AwsBedrockEmbeddingProvider'],
    ['bedrock:agents:my-openai.agent', 'AwsBedrockAgentsProvider'],
  ])('does not hijack %s to the Responses provider', async (providerPath, expectedClass) => {
    restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
    const provider = await bedrockFactory.create(
      providerPath,
      { config: { region: 'us-east-2', knowledgeBaseId: 'KB123', apiKey: 'bedrock-key' } },
      ctx,
    );
    expect(provider).not.toBeInstanceOf(OpenAiResponsesProvider);
    expect(provider.constructor.name).toBe(expectedClass);
  });

  it.each([
    'bedrock:us.openai.gpt-5.5',
    'bedrock:eu.openai.gpt-5.4',
    'bedrock:global.openai.gpt-5.5',
  ])('rejects region/geo-prefixed frontier id %s with a clear error pointing at the bare id', async (providerPath) => {
    // AWS does not offer Geo/Global inference profiles for the frontier models, so these are
    // not real Bedrock ids. They must not be routed to the mantle endpoint; instead the
    // InvokeModel fallback throws an actionable error suggesting the supported bare id.
    restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
    const provider = await bedrockFactory.create(providerPath, { config: {} }, ctx);
    expect(provider).not.toBeInstanceOf(OpenAiResponsesProvider);
    await expect(provider.callApi('hi')).rejects.toThrow(/Responses API.*bedrock:openai\.gpt-5\./s);
  });
});
