import { afterEach, describe, expect, it } from 'vitest';
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

  it('routes gpt-oss ids to the InvokeModel completion provider', async () => {
    const provider = await bedrockFactory.create(
      'bedrock:openai.gpt-oss-120b-1:0',
      { config: { region: 'us-east-2' } },
      ctx,
    );
    expect(provider).toBeInstanceOf(AwsBedrockCompletionProvider);
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
