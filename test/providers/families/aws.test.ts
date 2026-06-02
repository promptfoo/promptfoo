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
});
