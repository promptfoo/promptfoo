import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AzureCliCredential, ClientSecretCredential } from '@azure/identity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { AzureGenericProvider } from '../../src/providers/azure/generic';
import { AzureModerationProvider } from '../../src/providers/azure/moderation';
import { VertexChatProvider } from '../../src/providers/google/vertex';
import {
  readOpenClawConfig,
  resetConfigCache,
  resolveAuthSecret,
  resolveGatewayUrl,
} from '../../src/providers/openclaw/shared';
import { PortkeyChatCompletionProvider } from '../../src/providers/portkey';
import { WatsonXProvider } from '../../src/providers/watsonx';
import { mockProcessEnv } from '../util/utils';

const getToken = vi.hoisted(() => vi.fn());
vi.mock('@azure/identity', () => ({
  ClientSecretCredential: vi.fn(),
  AzureCliCredential: vi.fn(),
}));
let restoreEnv = () => {};
beforeEach(() => {
  restoreEnv = mockProcessEnv({
    OPENCLAW_CONFIG_PATH: '/host-fixture.json',
    OPENCLAW_GATEWAY_PORT: '22222',
    OPENCLAW_GATEWAY_TOKEN: 'host-token',
    CLAWDBOT_GATEWAY_TOKEN: undefined,
    OPENCLAW_GATEWAY_PASSWORD: undefined,
    CLAWDBOT_GATEWAY_PASSWORD: undefined,
    PORTKEY_API_KEY: 'host-portkey',
    OPENAI_API_KEY: 'host-openai',
    WATSONX_AI_AUTH_TYPE: 'iam',
    VERTEX_API_VERSION: 'host-version',
    VERTEX_PUBLISHER: 'host-publisher',
    AZURE_CONTENT_SAFETY_API_VERSION: 'host-version',
    AZURE_CLIENT_SECRET: 'host-secret',
    AZURE_CLIENT_ID: 'host-client',
    AZURE_TENANT_ID: 'host-tenant',
    AZURE_AUTHORITY_HOST: 'https://host.example.invalid',
    AZURE_TOKEN_SCOPE: 'host-scope',
  });
  vi.resetAllMocks();
  getToken.mockResolvedValue({ token: 'fixture-token', expiresOnTimestamp: Date.now() + 60000 });
  for (const ctor of [ClientSecretCredential, AzureCliCredential]) {
    vi.mocked(ctor).mockImplementation(function () {
      return { getToken };
    } as never);
  }
  resetConfigCache();
});
afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
  vi.resetAllMocks();
  resetConfigCache();
});

describe('remaining provider environment masks', () => {
  it.each(['AZURE_CLIENT_SECRET', 'AZURE_CLIENT_ID', 'AZURE_TENANT_ID'])(
    'does not restore a masked %s',
    async (key) => {
      const provider = new AzureGenericProvider('fixture', { env: { [key]: '' } });
      await provider.getAzureTokenCredential();
      expect(ClientSecretCredential).not.toHaveBeenCalled();
      expect(AzureCliCredential).toHaveBeenCalledOnce();
    },
  );
  it('uses Azure defaults after authority and token-scope masks', async () => {
    const provider = new AzureGenericProvider('fixture', {
      env: { AZURE_AUTHORITY_HOST: '', AZURE_TOKEN_SCOPE: '' },
    });
    await provider.getAccessToken();
    expect(ClientSecretCredential).toHaveBeenCalledWith(
      'host-tenant',
      'host-client',
      'host-secret',
      { authorityHost: 'https://login.microsoftonline.com' },
    );
    expect(getToken).toHaveBeenCalledWith('https://cognitiveservices.azure.com/.default');
  });
  it('masks the Azure moderation API version', () => {
    const provider = new AzureModerationProvider('text-content-safety', {
      config: { endpoint: 'https://fixture.example.invalid' },
      env: { AZURE_CONTENT_SAFETY_API_VERSION: '' },
    });
    expect(Reflect.get(provider, 'apiVersion')).toBe('2024-09-01');
  });
  it('masks Vertex request metadata', () => {
    const provider = new VertexChatProvider('fixture', {
      config: { vertexai: true },
      env: { VERTEX_API_VERSION: '', VERTEX_PUBLISHER: '' },
    });
    expect(Reflect.get(provider, 'getApiVersion').call(provider)).toBe('v1');
    expect(Reflect.get(provider, 'getPublisher').call(provider)).toBe('google');
  });
  it('masks both Portkey gateway and upstream credentials', () => {
    const provider = new PortkeyChatCompletionProvider('gpt-4.1-mini', {
      env: { PORTKEY_API_KEY: '', OPENAI_API_KEY: '' },
    });
    expect(provider.getApiKey()).toBeUndefined();
    const headers = Reflect.get(provider, 'getOpenAiRequestHeaders').call(provider);
    expect(headers['x-portkey-api-key']).toBeUndefined();
  });
  it('masks the forced WatsonX auth mode', () => {
    const provider = new WatsonXProvider('fixture', {
      config: {},
      env: { WATSONX_AI_AUTH_TYPE: '' },
    });
    expect(Reflect.get(provider, 'getAuthType').call(provider)).toBe('');
  });
  it('uses the default OpenClaw config path and port after masks', () => {
    const exists = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const env = { OPENCLAW_CONFIG_PATH: '', OPENCLAW_GATEWAY_PORT: '' };
    readOpenClawConfig(env);
    expect(exists).toHaveBeenCalledWith(path.join(os.homedir(), '.openclaw', 'openclaw.json'));
    expect(resolveGatewayUrl({}, env)).toBe('http://127.0.0.1:18789');
  });
  it('uses a provider password before a lower-scope token', () => {
    expect(resolveAuthSecret({}, { CLAWDBOT_GATEWAY_PASSWORD: 'provider-password' })).toEqual({
      kind: 'password',
      value: 'provider-password',
    });
  });
  it('masks one gateway token alias while retaining another', async () => {
    await cliState.withEnv(
      { OPENCLAW_GATEWAY_TOKEN: 'suite-token', CLAWDBOT_GATEWAY_TOKEN: 'suite-alias' },
      () => {
        expect(resolveAuthSecret({}, { OPENCLAW_GATEWAY_TOKEN: '' })).toEqual({
          kind: 'token',
          value: 'suite-alias',
        });
      },
    );
  });
});
