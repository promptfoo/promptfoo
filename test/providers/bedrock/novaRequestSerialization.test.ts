import { BedrockRuntime } from '@aws-sdk/client-bedrock-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AwsBedrockCompletionProvider } from '../../../src/providers/bedrock/index';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  isCacheEnabled: () => false,
}));

let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = mockProcessEnv({}, { clearPrefixes: ['AWS_BEDROCK_'] });
});

afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
});

describe('Nova v1 sampling request serialization', () => {
  it.each([
    ['canonical options', { topP: 0.9, topK: 50 }, { topP: 0.9, topK: 50 }],
    ['legacy aliases', { top_p: 0.9, top_k: 50 }, { topP: 0.9, topK: 50 }],
    ['conflicting aliases', { topP: 0.8, top_p: 0.2, topK: 32, top_k: 5 }, { topP: 0.8, topK: 32 }],
    ['canonical zero values', { topP: 0, top_p: 0.9, topK: 0, top_k: 50 }, { topP: 0, topK: 0 }],
    ['legacy zero values', { top_p: 0, top_k: 0 }, { topP: 0, topK: 0 }],
    ['missing options', {}, {}],
  ] as const)('serializes %s using only canonical fields', async (_name, sampling, expected) => {
    const interfaceConfig = { maxTokens: 256, ...sampling };
    const original = structuredClone(interfaceConfig);
    const handle = vi.fn(async (_request: { body?: unknown }) => ({
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: new TextEncoder().encode(
          JSON.stringify({
            output: {
              message: { role: 'assistant', content: [{ text: 'Local fixture response' }] },
            },
          }),
        ),
      },
    }));
    const client = new BedrockRuntime({
      region: 'us-east-1',
      credentials: { accessKeyId: 'LOCAL_FIXTURE', secretAccessKey: 'LOCAL_FIXTURE' },
      maxAttempts: 1,
      requestHandler: { handle },
    });
    const config = { region: 'us-east-1', interfaceConfig };
    const provider = new AwsBedrockCompletionProvider('amazon.nova-lite-v1:0', { config });
    vi.spyOn(provider, 'getBedrockInstance').mockResolvedValue(client);
    try {
      const response = await provider.callApi('Describe a quiet garden');
      expect(response.error).toBeUndefined();
      expect(response.output).toBe('Local fixture response');
      expect(handle).toHaveBeenCalledTimes(1);
      const body = JSON.parse(String(handle.mock.calls[0][0].body));
      expect(body.inferenceConfig).toEqual({ maxTokens: 256, temperature: 0, ...expected });
      expect(body.inferenceConfig).not.toHaveProperty('top_p');
      expect(body.inferenceConfig).not.toHaveProperty('top_k');
      expect(interfaceConfig).toEqual(original);
    } finally {
      client.destroy();
    }
  });
});
