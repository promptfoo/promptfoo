import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCache, disableCache, enableCache } from '../../../src/cache';
import { setEnvOverridesProvider } from '../../../src/envOverrides';
import {
  BedrockAnthropicMessagesProvider,
  createBedrockAnthropicMessagesProvider,
  getBedrockAnthropicBaseUrl,
  isBedrockAnthropicMessagesModel,
} from '../../../src/providers/bedrock/anthropicMessages';
import { mockProcessEnv } from '../../util/utils';
import type Anthropic from '@anthropic-ai/sdk';

describe('Bedrock Anthropic Messages provider', () => {
  it.each([
    { region: 'us-gov-west-1', apiBaseUrl: undefined, expected: 0.0717 },
    { region: 'us-east-1', apiBaseUrl: undefined, expected: 0.065725 },
    {
      region: 'us-east-1',
      apiBaseUrl: 'https://bedrock-mantle.us-gov-west-1.api.aws/anthropic',
      expected: 0.0717,
    },
    {
      region: 'us-gov-west-1',
      apiBaseUrl: 'https://bedrock-mantle.us-east-1.api.aws/anthropic',
      expected: 0.065725,
    },
    { region: 'us-gov-west-1', apiBaseUrl: 'https://proxy.example/anthropic', expected: 0.0717 },
    {
      region: 'us-gov-west-1',
      apiBaseUrl: 'https://proxy.example/anthropic',
      overrideModel: 'global.anthropic.claude-opus-4-8',
      expected: 0.05975,
    },
    {
      region: 'us-gov-west-1',
      apiBaseUrl: 'https://proxy.example/anthropic',
      overrideModel: 'claude-opus-4-8',
      expected: 0.05975,
    },
  ])(
    'uses the Opus 4.8 Messages hosting rate and cache TTLs in $region',
    async ({ region, apiBaseUrl, expected, overrideModel }) => {
      enableCache();
      const provider = createBedrockAnthropicMessagesProvider('anthropic.claude-opus-4-8', {
        env: { AWS_REGION: region },
        config: {
          apiKey: 'bedrock-key',
          ...(apiBaseUrl && { apiBaseUrl }),
          ...(overrideModel && { extra_body: { model: overrideModel } }),
        },
      });
      const create = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        id: 'msg-opus48-hosting',
        type: 'message',
        role: 'assistant',
        model: 'anthropic.claude-opus-4-8',
        content: [{ type: 'text', text: 'ok' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 1000,
          output_tokens: 1000,
          cache_read_input_tokens: 2000,
          cache_creation_input_tokens: 4000,
          cache_creation: { ephemeral_5m_input_tokens: 3000, ephemeral_1h_input_tokens: 1000 },
        },
      } as Anthropic.Messages.Message);
      const first = await provider.callApi('hosting cost');
      const cached = await provider.callApi('hosting cost');
      expect(first.error).toBeUndefined();
      expect(first.cost).toBeCloseTo(expected, 12);
      expect(cached.cost).toBeCloseTo(expected, 12);
      expect(cached.cached).toBe(true);
      expect(create).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0]?.[0].model).toBe(overrideModel ?? 'anthropic.claude-opus-4-8');
      const zero = await provider.callApi('explicit pricing', {
        vars: {},
        prompt: {
          raw: 'explicit pricing',
          label: 'zero',
          config: { cost: 0 },
        },
      });
      expect(zero.cost).toBe(0);
      const perTokenZero = await provider.callApi('explicit per-token pricing', {
        vars: {},
        prompt: {
          raw: 'explicit per-token pricing',
          label: 'zero rates',
          config: { inputCost: 0, outputCost: 0 },
        },
      });
      expect(perTokenZero.cost).toBe(0);
    },
  );

  let restoreEnv: (() => void) | undefined;

  afterEach(async () => {
    restoreEnv?.();
    restoreEnv = undefined;
    setEnvOverridesProvider(undefined);
    vi.restoreAllMocks();
    await clearCache();
  });

  it('recognizes only the Anthropic models served by the Bedrock Messages endpoint', () => {
    expect(isBedrockAnthropicMessagesModel('anthropic.claude-fable-5')).toBe(true);
    expect(isBedrockAnthropicMessagesModel('anthropic.claude-mythos-5')).toBe(true);
    expect(isBedrockAnthropicMessagesModel('anthropic.claude-mythos-preview')).toBe(true);
    expect(isBedrockAnthropicMessagesModel('anthropic.claude-opus-4-7')).toBe(true);
    expect(isBedrockAnthropicMessagesModel('anthropic.claude-opus-4-8')).toBe(true);
    expect(isBedrockAnthropicMessagesModel('anthropic.claude-opus-5')).toBe(true);
    expect(isBedrockAnthropicMessagesModel('anthropic.claude-sonnet-4-6')).toBe(false);
    expect(isBedrockAnthropicMessagesModel('anthropic.claude-fable-5-1')).toBe(true);
    expect(isBedrockAnthropicMessagesModel('global.anthropic.claude-mythos-5-1')).toBe(true);
    expect(isBedrockAnthropicMessagesModel('us.anthropic.claude-fable-5-1')).toBe(true);
    expect(isBedrockAnthropicMessagesModel('anthropic.claude-mythos-5-1')).toBe(false);
  });

  it('builds and validates the regional Anthropic endpoint', () => {
    expect(getBedrockAnthropicBaseUrl('us-east-1')).toBe(
      'https://bedrock-mantle.us-east-1.api.aws/anthropic',
    );
    expect(() => getBedrockAnthropicBaseUrl('evil.example/x')).toThrow(/Invalid AWS region/);
    expect(getBedrockAnthropicBaseUrl('us-west-2', true)).toBe(
      'https://bedrock-runtime.us-west-2.amazonaws.com/anthropic',
    );
    expect(() => getBedrockAnthropicBaseUrl('evil.example/x', true)).toThrow(/Invalid AWS region/);
  });

  it('requires a Bedrock API key', () => {
    restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
    expect(() =>
      createBedrockAnthropicMessagesProvider('anthropic.claude-fable-5', {
        config: { region: 'us-east-1' },
      }),
    ).toThrow(/AWS_BEARER_TOKEN_BEDROCK/);
  });

  it('restricts Mythos to us-east-1', () => {
    expect(() =>
      createBedrockAnthropicMessagesProvider('anthropic.claude-mythos-5', {
        config: { region: 'us-west-2', apiKey: 'bedrock-key' },
      }),
    ).toThrow(/only available in us-east-1/);
  });

  it('supports Mythos Preview only in its two published Bedrock Mantle regions', () => {
    expect(() =>
      createBedrockAnthropicMessagesProvider('anthropic.claude-mythos-preview', {
        config: { region: 'us-west-2', apiKey: 'bedrock-key' },
      }),
    ).toThrow(/only available in us-east-1 and ap-southeast-4/);

    expect(
      createBedrockAnthropicMessagesProvider('anthropic.claude-mythos-preview', {
        config: { region: 'ap-southeast-4', apiKey: 'bedrock-key' },
      }),
    ).toBeInstanceOf(BedrockAnthropicMessagesProvider);
  });

  it('restricts Fable Messages requests to its two in-region endpoints', () => {
    expect(() =>
      createBedrockAnthropicMessagesProvider('anthropic.claude-fable-5', {
        config: { region: 'us-west-2', apiKey: 'bedrock-key' },
      }),
    ).toThrow(/only in us-east-1 and eu-north-1/);
  });

  it('rejects a Fable 5.1 Mantle ID outside GovCloud West', () => {
    expect(() =>
      createBedrockAnthropicMessagesProvider('anthropic.claude-fable-5-1', {
        config: { region: 'us-west-2', apiKey: 'bedrock-key' },
      }),
    ).toThrow(/uses Mantle only in us-gov-west-1/);
  });

  it('uses Mantle for the Fable 5.1 GovCloud West deployment', () => {
    const provider = createBedrockAnthropicMessagesProvider('anthropic.claude-fable-5-1', {
      config: { region: 'us-gov-west-1', apiKey: 'bedrock-key' },
    });
    expect(provider.getApiBaseUrl()).toBe('https://bedrock-mantle.us-gov-west-1.api.aws/anthropic');
  });

  it.each([
    'global.anthropic.claude-fable-5-1',
    'us.anthropic.claude-fable-5-1',
    'global.anthropic.claude-mythos-5-1',
    'us.anthropic.claude-mythos-5-1',
  ])('uses the requested Runtime region for %s', (model) => {
    const provider = createBedrockAnthropicMessagesProvider(model, {
      config: { region: 'us-west-2', apiKey: 'bedrock-key' },
    });
    expect(provider.getApiBaseUrl()).toBe(
      'https://bedrock-runtime.us-west-2.amazonaws.com/anthropic',
    );
  });

  it('allows a provisioned Fable 5.1 endpoint to override the default region restriction', () => {
    const provider = createBedrockAnthropicMessagesProvider('anthropic.claude-fable-5-1', {
      config: {
        region: 'us-west-2',
        apiKey: 'bedrock-key',
        apiBaseUrl: 'https://provisioned.example/anthropic',
      },
    });
    expect(provider.getApiBaseUrl()).toBe('https://provisioned.example/anthropic');
  });

  it('uses promptfoo env overrides for the key and region', async () => {
    restoreEnv = mockProcessEnv({
      AWS_BEARER_TOKEN_BEDROCK: undefined,
      AWS_BEDROCK_REGION: undefined,
      AWS_REGION: undefined,
      AWS_DEFAULT_REGION: undefined,
    });
    const provider = createBedrockAnthropicMessagesProvider('anthropic.claude-fable-5', {
      env: { AWS_BEARER_TOKEN_BEDROCK: 'override-key', AWS_REGION: 'eu-north-1' },
    });

    expect(provider).toBeInstanceOf(BedrockAnthropicMessagesProvider);
    expect(provider['getGenAISystem']()).toBe('bedrock');
    expect(provider.apiKey).toBe('override-key');
    expect(provider.anthropic.apiKey).toBe('override-key');
    expect(provider.anthropic.authToken).toBeNull();
    expect(provider.getApiBaseUrl()).toBe('https://bedrock-mantle.eu-north-1.api.aws/anthropic');

    const { req } = await (
      provider.anthropic as unknown as {
        buildRequest(options: {
          method: string;
          path: string;
          body: Record<string, unknown>;
        }): Promise<{ req: Request }>;
      }
    ).buildRequest({
      method: 'post',
      path: '/v1/messages',
      body: { model: 'anthropic.claude-fable-5', max_tokens: 1, messages: [] },
    });
    expect(req.headers.get('x-api-key')).toBe('override-key');
    expect(req.headers.get('authorization')).toBeNull();
  });

  it.each(['process', 'provider'] as const)(
    'does not forward %s-scoped Anthropic custom headers to Bedrock',
    async (scope) => {
      const customHeaders =
        'Authorization: Bearer anthropic-proxy-secret\nX-Api-Key: wrong-key\nX-Proxy-Secret: tenant-secret';
      if (scope === 'process') {
        restoreEnv = mockProcessEnv({ ANTHROPIC_CUSTOM_HEADERS: customHeaders });
      }
      const provider = createBedrockAnthropicMessagesProvider('anthropic.claude-fable-5', {
        config: { apiKey: 'bedrock-key', region: 'us-east-1' },
        ...(scope === 'provider' ? { env: { ANTHROPIC_CUSTOM_HEADERS: customHeaders } } : {}),
      });

      const { req } = await (
        provider.anthropic as unknown as {
          buildRequest(options: {
            method: string;
            path: string;
            body: Record<string, unknown>;
          }): Promise<{ req: Request }>;
        }
      ).buildRequest({
        method: 'post',
        path: '/v1/messages',
        body: { model: 'anthropic.claude-fable-5', max_tokens: 1, messages: [] },
      });

      expect(req.headers.get('x-api-key')).toBe('bedrock-key');
      expect(req.headers.get('authorization')).toBeNull();
      expect(req.headers.get('x-proxy-secret')).toBeNull();
    },
  );

  it('preserves Bedrock API-key auth when ambient and scoped Anthropic headers differ only by casing', async () => {
    restoreEnv = mockProcessEnv({ ANTHROPIC_CUSTOM_HEADERS: 'X-Api-Key: ambient-wrong-key' });
    const provider = createBedrockAnthropicMessagesProvider('anthropic.claude-fable-5', {
      config: { apiKey: 'bedrock-key', region: 'us-east-1' },
      env: { ANTHROPIC_CUSTOM_HEADERS: 'x-api-key: scoped-wrong-key' },
    });
    const { req } = await (
      provider.anthropic as unknown as {
        buildRequest: (request: Record<string, unknown>) => Promise<{ req: Request }>;
      }
    ).buildRequest({
      method: 'post',
      path: '/v1/messages',
      body: { model: 'anthropic.claude-fable-5', max_tokens: 1, messages: [] },
    });

    expect(req.headers.get('x-api-key')).toBe('bedrock-key');
  });

  it('suppresses every duplicate-case Anthropic header before calling Bedrock', async () => {
    restoreEnv = mockProcessEnv({
      ANTHROPIC_CUSTOM_HEADERS:
        'x-api-key: first-wrong-key\nX-Api-Key: second-wrong-key\nX-Proxy-Secret: first-proxy\nx-proxy-secret: second-proxy',
    });
    const provider = createBedrockAnthropicMessagesProvider('anthropic.claude-fable-5', {
      config: { apiKey: 'bedrock-key', region: 'us-east-1' },
    });
    const { req } = await (provider.anthropic as any).buildRequest({
      method: 'post',
      path: '/v1/messages',
      body: { model: 'anthropic.claude-fable-5', max_tokens: 1, messages: [] },
    });

    expect(req.headers.get('x-api-key')).toBe('bedrock-key');
    expect(req.headers.get('x-proxy-secret')).toBeNull();
  });

  it('keeps response caching enabled when Anthropic custom headers are suppressed', async () => {
    restoreEnv = mockProcessEnv({ ANTHROPIC_CUSTOM_HEADERS: 'X-Proxy-Secret: do-not-forward' });
    enableCache();
    const provider = createBedrockAnthropicMessagesProvider('anthropic.claude-fable-5', {
      config: { apiKey: 'bedrock-key', region: 'us-east-1', stream: false },
    });
    const create = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
      content: [{ type: 'text', text: 'cached response' }],
      model: 'anthropic.claude-fable-5',
      id: 'msg-cache',
      role: 'assistant',
      stop_reason: 'end_turn',
      stop_details: null,
      stop_sequence: null,
      type: 'message',
      usage: { input_tokens: 2, output_tokens: 1 },
    } as Anthropic.Messages.Message);

    const first = await provider.callApi('Cache this prompt');
    const second = await provider.callApi('Cache this prompt');

    expect(first.cached).not.toBe(true);
    expect(second.cached).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each([
    'anthropic.claude-fable-5',
    'anthropic.claude-mythos-5',
    'us.anthropic.claude-fable-5-1',
    'us.anthropic.claude-mythos-5-1',
  ])('sends %s while reusing Anthropic compatibility and billing logic', async (bedrockModel) => {
    disableCache();
    const provider = createBedrockAnthropicMessagesProvider(bedrockModel, {
      id: `bedrock:${bedrockModel}`,
      config: {
        region: 'us-east-1',
        apiKey: 'bedrock-key',
        max_tokens: 4096,
        temperature: 0.5,
        top_p: 0.9,
        top_k: 40,
        thinking: { type: 'disabled' },
      },
    });
    const response = {
      content: [{ type: 'text', text: 'ok' }],
      model: bedrockModel,
      id: 'msg-1',
      role: 'assistant',
      stop_reason: 'end_turn',
      stop_details: null,
      stop_sequence: null,
      type: 'message',
      usage: { input_tokens: 5, output_tokens: 1 },
    } as Anthropic.Messages.Message;
    const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(response);

    const result = await provider.callApi('hello');

    const params = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(provider.id()).toBe(`bedrock:${bedrockModel}`);
    expect(provider['getGenAISystem']()).toBe('bedrock');
    expect(params.model).toBe(bedrockModel);
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('top_p');
    expect(params).not.toHaveProperty('top_k');
    expect(params).not.toHaveProperty('thinking');
    expect(result.output).toBe('ok');
    expect(result.cost).toBeCloseTo(0.00011, 8);
  });

  it('does not forward Anthropic custom headers to the Bedrock Messages endpoint', async () => {
    restoreEnv = mockProcessEnv({
      ANTHROPIC_CUSTOM_HEADERS:
        'Authorization: Bearer anthropic-proxy-secret\n' +
        'X-Proxy-Secret: hunter2\n' +
        'X-Api-Key: anthropic-wrong-key\n' +
        'Anthropic-Version: wrong-version',
    });
    const provider = createBedrockAnthropicMessagesProvider('anthropic.claude-opus-5', {
      config: { region: 'us-east-1', apiKey: 'bedrock-key' },
    });

    const { req } = await (
      provider.anthropic as unknown as {
        buildRequest(options: {
          method: string;
          path: string;
          body: Record<string, unknown>;
        }): Promise<{ req: Request }>;
      }
    ).buildRequest({
      method: 'post',
      path: '/v1/messages',
      body: { model: 'anthropic.claude-opus-5', max_tokens: 1, messages: [] },
    });

    expect(req.headers.get('x-api-key')).toBe('bedrock-key');
    expect(req.headers.get('authorization')).toBeNull();
    expect(req.headers.get('x-proxy-secret')).toBeNull();
    expect(req.headers.get('anthropic-version')).toBeNull();
  });

  it('does not persist bearer-token-derived identifiers in the disk cache', async () => {
    const cachePath = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-bedrock-cache-'));
    const apiKey = 'bedrock-bearer-token-for-cache-regression';
    const restoreDiskCacheEnv = mockProcessEnv({
      PROMPTFOO_CACHE_ENABLED: 'true',
      PROMPTFOO_CACHE_PATH: cachePath,
      PROMPTFOO_CACHE_TYPE: 'disk',
    });

    try {
      vi.resetModules();
      const [
        { enableCache, clearCache: clearDiskCache },
        { createBedrockAnthropicMessagesProvider: createDiskCacheProvider },
      ] = await Promise.all([
        import('../../../src/cache'),
        import('../../../src/providers/bedrock/anthropicMessages'),
      ]);
      enableCache();

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            content: [{ type: 'text', text: 'uncached' }],
            model: 'anthropic.claude-opus-5',
            id: 'msg-disk-cache',
            role: 'assistant',
            stop_reason: 'end_turn',
            stop_sequence: null,
            type: 'message',
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const provider = createDiskCacheProvider('anthropic.claude-opus-5', {
        config: { region: 'us-east-1', apiKey },
      });

      await provider.callApi('hello');
      await provider.callApi('hello');

      const cacheFile = path.join(cachePath, 'cache.json');
      const persistedCache = fs.existsSync(cacheFile) ? fs.readFileSync(cacheFile, 'utf8') : '';
      expect(persistedCache).not.toContain(apiKey);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      await clearDiskCache();
    } finally {
      restoreDiskCacheEnv();
      fs.rmSync(cachePath, { force: true, recursive: true });
      vi.resetModules();
    }
  });

  it('suppresses both configured and process-level Anthropic custom headers', async () => {
    restoreEnv = mockProcessEnv({
      ANTHROPIC_CUSTOM_HEADERS:
        'Authorization: Bearer process-secret\n' +
        'X-Process-Secret: process-only\n' +
        'Anthropic-Version: process-wrong-version',
    });
    setEnvOverridesProvider(() => ({
      ANTHROPIC_CUSTOM_HEADERS:
        'Authorization: Bearer configured-secret\nX-Configured-Secret: configured-only',
    }));
    const provider = createBedrockAnthropicMessagesProvider('anthropic.claude-opus-5', {
      config: { region: 'us-east-1', apiKey: 'bedrock-key' },
    });

    const { req } = await (
      provider.anthropic as unknown as {
        buildRequest(options: {
          method: string;
          path: string;
          body: Record<string, unknown>;
        }): Promise<{ req: Request }>;
      }
    ).buildRequest({
      method: 'post',
      path: '/v1/messages',
      body: { model: 'anthropic.claude-opus-5', max_tokens: 1, messages: [] },
    });

    expect(req.headers.get('x-api-key')).toBe('bedrock-key');
    expect(req.headers.get('authorization')).toBeNull();
    expect(req.headers.get('x-process-secret')).toBeNull();
    expect(req.headers.get('x-configured-secret')).toBeNull();
    expect(req.headers.get('anthropic-version')).toBeNull();
  });

  it.each(['provider', 'prompt'] as const)(
    'filters protected Bedrock headers from %s config',
    async (configSource) => {
      disableCache();
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            content: [{ type: 'text', text: 'ok' }],
            model: 'anthropic.claude-opus-5',
            id: 'msg-filtered-headers',
            role: 'assistant',
            stop_reason: 'end_turn',
            stop_sequence: null,
            type: 'message',
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const hostileHeaders = {
        Authorization: 'Bearer anthropic-secret',
        'X-Api-Key': 'anthropic-wrong-key',
        'aNtHrOpIc-VeRsIoN': 'wrong-version',
        'X-Tenant': 'safe-tenant',
      };
      const provider = createBedrockAnthropicMessagesProvider('anthropic.claude-opus-5', {
        config: {
          region: 'us-east-1',
          apiKey: 'bedrock-key',
          ...(configSource === 'provider' ? { headers: hostileHeaders } : {}),
        },
      });

      await provider.callApi(
        'hello',
        configSource === 'prompt'
          ? ({ prompt: { config: { headers: hostileHeaders } }, vars: {} } as any)
          : undefined,
      );

      const headers = new Headers(fetchSpy.mock.calls[0][1]?.headers);
      expect(headers.get('x-api-key')).toBe('bedrock-key');
      expect(headers.get('authorization')).toBeNull();
      expect(headers.get('x-tenant')).toBe('safe-tenant');
      expect(headers.get('anthropic-version')).toBe('2023-06-01');
    },
  );

  it.each([
    {
      name: 'provider Authorization',
      apiBaseUrl: 'https://proxy.example/anthropic',
      headerName: 'Authorization',
      promptHeaders: false,
    },
    {
      name: 'prompt mixed-case authorization',
      apiBaseUrl: 'https://proxy.example/anthropic',
      headerName: 'aUtHoRiZaTiOn',
      promptHeaders: true,
    },
    {
      name: 'an AWS API Gateway proxy',
      apiBaseUrl: 'https://gateway.execute-api.us-east-1.amazonaws.com/anthropic',
      headerName: 'Authorization',
      promptHeaders: false,
    },
  ])(
    'preserves explicit proxy authorization from $name while isolating Anthropic credentials',
    async ({ apiBaseUrl, headerName, promptHeaders }) => {
      disableCache();
      restoreEnv = mockProcessEnv({
        ANTHROPIC_AUTH_TOKEN: 'ambient-anthropic-token',
        ANTHROPIC_CUSTOM_HEADERS:
          'Authorization: Bearer ambient-token\nX-Ambient-Secret: ambient-only',
      });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            content: [{ type: 'text', text: 'ok' }],
            model: 'anthropic.claude-fable-5',
            id: 'msg-proxy-authorization',
            role: 'assistant',
            stop_reason: 'end_turn',
            stop_sequence: null,
            type: 'message',
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const explicitHeaders = {
        [headerName]: 'Bearer explicit-proxy-token',
        'X-Api-Key': 'wrong-api-key',
        'Anthropic-Version': 'wrong-version',
        'X-Tenant': 'configured-tenant',
      };
      const provider = createBedrockAnthropicMessagesProvider('anthropic.claude-fable-5', {
        config: {
          region: 'us-east-1',
          apiKey: 'bedrock-key',
          apiBaseUrl,
          ...(promptHeaders ? {} : { headers: explicitHeaders }),
        },
        env: {
          ANTHROPIC_CUSTOM_HEADERS:
            'Authorization: Bearer scoped-token\nX-Scoped-Secret: scoped-only',
        },
      });

      const result = await provider.callApi(
        'hello',
        promptHeaders
          ? ({ prompt: { config: { headers: explicitHeaders } }, vars: {} } as any)
          : undefined,
      );

      expect(result.error).toBeUndefined();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(String(fetchSpy.mock.calls[0][0])).toBe(`${apiBaseUrl}/v1/messages`);
      const headers = new Headers(fetchSpy.mock.calls[0][1]?.headers);
      expect(headers.get('authorization')).toBe('Bearer explicit-proxy-token');
      expect(headers.get('x-api-key')).toBe('bedrock-key');
      expect(headers.get('anthropic-version')).toBe('2023-06-01');
      expect(headers.get('x-tenant')).toBe('configured-tenant');
      expect(headers.get('x-ambient-secret')).toBeNull();
      expect(headers.get('x-scoped-secret')).toBeNull();
      expect(provider.anthropic.authToken).toBeNull();
    },
  );

  it.each([
    'https://bedrock-mantle.us-east-1.api.aws/anthropic',
    'https://bedrock-mantle.us-gov-west-1.api.aws/anthropic',
    'https://bedrock-runtime.us-east-1.amazonaws.com/anthropic',
    'https://bedrock-runtime.us-east-1.api.aws/anthropic',
    'https://bedrock-runtime-fips.us-gov-west-1.amazonaws.com/anthropic',
    'https://bedrock-runtime.cn-north-1.amazonaws.com.cn/anthropic',
    'https://vpce-example.bedrock-runtime.us-east-1.vpce.amazonaws.com/anthropic',
    'https://BEDROCK-MANTLE.US-EAST-1.API.AWS.:443/anthropic',
  ])('protects native Bedrock credentials with explicit apiBaseUrl %s', async (apiBaseUrl) => {
    disableCache();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'ok' }],
          model: 'anthropic.claude-fable-5',
          id: 'msg-native-header-isolation',
          role: 'assistant',
          stop_reason: 'end_turn',
          stop_sequence: null,
          type: 'message',
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const provider = createBedrockAnthropicMessagesProvider('anthropic.claude-fable-5', {
      config: {
        region: 'us-east-1',
        apiKey: 'bedrock-key',
        apiBaseUrl,
        headers: {
          aUtHoRiZaTiOn: 'Bearer unrelated-token',
          'X-Api-Key': 'wrong-api-key',
          'Anthropic-Version': 'wrong-version',
        },
      },
    });

    const result = await provider.callApi('hello');

    expect(result.error).toBeUndefined();
    const headers = new Headers(fetchSpy.mock.calls[0][1]?.headers);
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('x-api-key')).toBe('bedrock-key');
    expect(headers.get('anthropic-version')).toBe('2023-06-01');
  });

  it('normalizes Mythos Preview manual thinking while preserving supported sampling controls', async () => {
    disableCache();
    const model = 'anthropic.claude-mythos-preview';
    const provider = createBedrockAnthropicMessagesProvider(model, {
      config: {
        region: 'us-east-1',
        apiKey: 'bedrock-key',
        max_tokens: 4096,
        temperature: 0.5,
        top_k: 40,
        thinking: { type: 'enabled', budget_tokens: 2048, display: 'summarized' },
      },
    });
    const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      model,
      id: 'msg-mythos-preview-manual-thinking',
      role: 'assistant',
      stop_reason: 'end_turn',
      stop_sequence: null,
      type: 'message',
      usage: { input_tokens: 5, output_tokens: 1 },
    } as Anthropic.Messages.Message);

    await provider.callApi('hello');

    expect(createSpy.mock.calls[0][0]).toMatchObject({
      model,
      max_tokens: 4096,
      temperature: 0.5,
      top_k: 40,
      thinking: { type: 'adaptive', display: 'summarized' },
    });
  });

  it('omits disabled thinking and reserves default output headroom for Mythos Preview', async () => {
    disableCache();
    const model = 'anthropic.claude-mythos-preview';
    const provider = createBedrockAnthropicMessagesProvider(model, {
      config: {
        region: 'us-east-1',
        apiKey: 'bedrock-key',
        top_p: 0.7,
        thinking: { type: 'disabled' },
      },
    });
    const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      model,
      id: 'msg-mythos-preview-disabled-thinking',
      role: 'assistant',
      stop_reason: 'end_turn',
      stop_sequence: null,
      type: 'message',
      usage: { input_tokens: 5, output_tokens: 1 },
    } as Anthropic.Messages.Message);

    await provider.callApi('hello');

    const params = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(params).toMatchObject({ model, max_tokens: 2048, top_p: 0.7 });
    expect(params).not.toHaveProperty('thinking');
  });

  it('sends a bare Opus 5 request through Bedrock Messages with usage and cost', async () => {
    disableCache();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'Opus response' }],
          model: 'anthropic.claude-opus-5',
          id: 'msg-opus-5',
          role: 'assistant',
          stop_reason: 'end_turn',
          stop_sequence: null,
          type: 'message',
          usage: {
            input_tokens: 1_000,
            output_tokens: 500,
            cache_read_input_tokens: 200,
            cache_creation_input_tokens: 100,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const provider = createBedrockAnthropicMessagesProvider('anthropic.claude-opus-5', {
      id: 'bedrock:anthropic.claude-opus-5',
      config: { region: 'us-east-1', apiKey: 'bedrock-key', max_tokens: 4096 },
    });

    const result = await provider.callApi('hello');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [requestUrl, requestInit] = fetchSpy.mock.calls[0];
    expect(String(requestUrl)).toBe(
      'https://bedrock-mantle.us-east-1.api.aws/anthropic/v1/messages',
    );
    const headers = new Headers(requestInit?.headers);
    expect(headers.get('x-api-key')).toBe('bedrock-key');
    expect(headers.get('authorization')).toBeNull();
    expect(JSON.parse(String(requestInit?.body))).toMatchObject({
      model: 'anthropic.claude-opus-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    });
    expect(result.output).toBe('Opus response');
    expect(result.tokenUsage).toEqual({
      total: 1_800,
      prompt: 1_300,
      completion: 500,
      completionDetails: {
        cacheReadInputTokens: 200,
        cacheCreationInputTokens: 100,
      },
    });
    expect(result.cost).toBeCloseTo(0.0200475, 10);
  });

  it('returns a Bedrock Messages API error for a rejected bare Opus 5 request', async () => {
    disableCache();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          type: 'error',
          error: { type: 'invalid_request_error', message: 'Opus request rejected' },
        }),
        {
          status: 400,
          statusText: 'Bad Request',
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    const provider = createBedrockAnthropicMessagesProvider('anthropic.claude-opus-5', {
      config: { region: 'us-east-1', apiKey: 'bedrock-key' },
    });

    const result = await provider.callApi('hello');

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result).toEqual({
      error: 'API call error: Opus request rejected, status 400, type invalid_request_error',
    });
  });
});
