import { NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AwsBedrockNativeApiProvider } from '../../../src/providers/bedrock/nativeApi';
import { createProviderRateLimitOptions } from '../../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../../src/scheduler/rateLimitRegistry';
import { isProviderResponseRateLimited } from '../../../src/scheduler/types';
import { mockProcessEnv } from '../../util/utils';

const config = { region: 'us-east-1', accessKeyId: 'synthetic', secretAccessKey: 'synthetic' };
const countRequest = JSON.stringify({
  modelId: 'test.model',
  input: { converse: { messages: [{ role: 'user', content: [{ text: 'hello' }] }] } },
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('native Bedrock retry ownership', () => {
  it.each([
    [429, 'ThrottlingException', true],
    [403, 'AccessDeniedException', false],
    [400, 'ValidationException', false],
  ] as const)(
    'preserves HTTP %s failure metadata for scheduling',
    async (status, name, limited) => {
      const handle = vi.spyOn(NodeHttpHandler.prototype, 'handle').mockResolvedValue({
        response: {
          statusCode: status,
          headers: { 'content-type': 'application/json', 'x-amzn-requestid': 'native-request' },
          body: Buffer.from(
            JSON.stringify({
              __type: name,
              message: 'Too many tokens, please wait before trying again.',
            }),
          ),
        },
      });
      const provider = new AwsBedrockNativeApiProvider('CountTokens', {
        config: { ...config, maxRetries: 0 },
      });
      try {
        const result = await provider.callApi(countRequest);
        expect(result.error).toContain(name);
        expect(result.metadata).toMatchObject({
          operation: 'CountTokens',
          http: { status },
          aws: { httpStatusCode: status, requestId: 'native-request', attempts: 1 },
        });
        expect(isProviderResponseRateLimited(result, undefined)).toBe(limited);
        expect(handle).toHaveBeenCalledOnce();
      } finally {
        await provider.cleanup();
      }
    },
  );

  it.each(['CountTokens', 'Retrieve'])(
    'applies explicit retry counts to the %s SDK client',
    async (operation) => {
      for (const maxRetries of [0, '0', 2] as const) {
        const provider = new AwsBedrockNativeApiProvider(operation, {
          config: { ...config, maxRetries },
        });
        try {
          const client =
            operation === 'CountTokens'
              ? await provider.getBedrockInstance()
              : await provider.getAgentRuntimeClient();
          expect(await client.config.maxAttempts()).toBe(Number(maxRetries) + 1);
        } finally {
          await provider.cleanup();
        }
      }
    },
  );

  it('retains the existing AWS retry environment fallback', async () => {
    const restore = mockProcessEnv({ AWS_BEDROCK_MAX_RETRIES: '4' });
    const provider = new AwsBedrockNativeApiProvider('CountTokens', { config });
    try {
      expect(await (await provider.getBedrockInstance()).config.maxAttempts()).toBe(4);
    } finally {
      await provider.cleanup();
      restore();
    }
  });

  it('does not attach HTTP metadata to local validation errors', async () => {
    const provider = new AwsBedrockNativeApiProvider('CountTokens', { config });
    const result = await provider.callApi('not JSON');
    expect(result.error).toBeTruthy();
    expect(result.metadata?.http).toBeUndefined();
    expect(isProviderResponseRateLimited(result, undefined)).toBe(false);
  });

  it.each([
    [
      'StartFlowExecution',
      { flowIdentifier: 'FLOW123456', flowAliasIdentifier: 'TSTALIASID', inputs: [] },
    ],
    ['InvokeFlow', { flowIdentifier: 'FLOW123456', flowAliasIdentifier: 'TSTALIASID', inputs: [] }],
    [
      'InvokeAgent',
      {
        agentId: 'AGENT12345',
        agentAliasId: 'TSTALIASID',
        sessionId: 'session',
        inputText: 'hello',
      },
    ],
    [
      'InvokeInlineAgent',
      {
        sessionId: 'session',
        foundationModel: 'test.model',
        instruction: 'Answer the user',
        inputText: 'hello',
      },
    ],
  ] as const)('does not replay %s after a lost response', async (operation, input) => {
    const handle = vi
      .spyOn(NodeHttpHandler.prototype, 'handle')
      .mockRejectedValueOnce(
        Object.assign(new Error('connection reset after acceptance'), { code: 'ECONNRESET' }),
      )
      .mockResolvedValue({
        response: {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from('{}'),
        },
      });
    const provider = new AwsBedrockNativeApiProvider(operation, {
      config: { ...config, maxRetries: 3 },
    });
    try {
      const result = await provider.callApi(JSON.stringify(input));
      expect(result.error).toContain('connection reset after acceptance');
      expect(handle).toHaveBeenCalledOnce();
      expect(await (await provider.getAgentRuntimeClient()).config.maxAttempts()).toBe(1);
    } finally {
      await provider.cleanup();
    }
  });

  it('retries idempotent async submissions with a stable request token', async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(async (request) => {
      bodies.push(JSON.parse(Buffer.from(request.body).toString('utf8')));
      if (bodies.length === 1) {
        throw Object.assign(new Error('connection reset after acceptance'), { code: 'ECONNRESET' });
      }
      return {
        response: {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from('{"invocationArn":"fixture-invocation"}'),
        },
      };
    });
    const provider = new AwsBedrockNativeApiProvider('StartAsyncInvoke', {
      config: { ...config, maxRetries: 1 },
    });
    try {
      const result = await provider.callApi(
        JSON.stringify({
          modelId: 'test.model',
          modelInput: { prompt: 'hello' },
          outputDataConfig: { s3OutputDataConfig: { s3Uri: 's3://fixture-bucket/results' } },
        }),
      );
      expect(result.error).toBeUndefined();
      expect(bodies).toHaveLength(2);
      expect(bodies[0].clientRequestToken).toEqual(expect.any(String));
      expect(String(bodies[0].clientRequestToken).length).toBeGreaterThan(0);
      expect(bodies[1].clientRequestToken).toBe(bodies[0].clientRequestToken);
    } finally {
      await provider.cleanup();
    }
  });

  it.each(['returned', 'thrown'] as const)(
    'does not replay a partial flow with a %s throttle through the scheduler',
    async (mode) => {
      vi.useFakeTimers();
      const restore = mockProcessEnv({ PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false' });
      const registry = new RateLimitRegistry({ maxConcurrency: 4, queueTimeoutMs: 0 });
      const invoke = vi.fn(async () => ({
        $metadata: { requestId: 'stream-request', httpStatusCode: 200 },
        responseStream: (async function* () {
          yield { flowOutputEvent: { content: { document: 'action completed' } } };
          if (mode === 'thrown') {
            throw Object.assign(new Error('Too many tokens, please wait before trying again.'), {
              name: 'ThrottlingException',
            });
          }
          yield {
            throttlingException: { message: 'Too many tokens, please wait before trying again.' },
          };
        })(),
      }));
      const provider = new AwsBedrockNativeApiProvider('InvokeFlow', {
        config: { ...config, maxRetries: 2 },
      });
      vi.spyOn(provider, 'getAgentRuntimeClient').mockResolvedValue({ invokeFlow: invoke } as any);
      try {
        const pending = registry.execute(
          provider,
          () => provider.callApi('{}'),
          createProviderRateLimitOptions(),
        );
        await vi.runAllTimersAsync();
        const result = await pending;
        expect(result.error?.toLowerCase()).toContain('throttlingexception');
        expect(result.output).toBeUndefined();
        expect(result.metadata).toMatchObject({ aws: { requestId: 'stream-request' } });
        expect(invoke).toHaveBeenCalledOnce();
        expect(Object.values(registry.getMetrics())[0]).toMatchObject({
          rateLimitHits: 1,
          retriedRequests: 0,
          failedRequests: 1,
          completedRequests: 0,
          maxConcurrency: 2,
        });
      } finally {
        registry.dispose();
        restore();
      }
    },
  );
});
