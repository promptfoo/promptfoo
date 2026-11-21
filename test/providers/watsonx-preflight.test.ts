import { WatsonXAI } from '@ibm-cloud/watsonx-ai';
import { BearerTokenAuthenticator, IamAuthenticator } from 'ibm-cloud-sdk-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnvString } from '../../src/envars';
import { WatsonXChatProvider, WatsonXProvider } from '../../src/providers/watsonx';
import { checkProviderApiKeys } from '../../src/util/provider';

vi.mock('@ibm-cloud/watsonx-ai', () => ({ WatsonXAI: { newInstance: vi.fn() } }));
vi.mock('ibm-cloud-sdk-core', () => ({
  BearerTokenAuthenticator: vi.fn(),
  IamAuthenticator: vi.fn(),
}));
vi.mock('../../src/envars', async (importOriginal) => ({
  ...(await importOriginal()),
  getEnvString: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  expect(WatsonXAI.newInstance).not.toHaveBeenCalled();
  vi.resetAllMocks();
});

describe.each([
  { name: 'generation', Provider: WatsonXProvider },
  { name: 'chat', Provider: WatsonXChatProvider },
])('$name credential preflight', ({ Provider }) => {
  it.each([
    {
      name: 'explicit bearer token',
      config: { apiBearerToken: 'explicit-token' },
      env: {},
      processEnv: {},
      expected: 'explicit-token',
    },
    {
      name: 'native environment token',
      config: {},
      env: {},
      processEnv: { WATSONX_AI_BEARER_TOKEN: 'process-token' },
      expected: 'process-token',
    },
    {
      name: 'environment override before process environment',
      config: {},
      env: { WATSONX_AI_BEARER_TOKEN: 'override-token' },
      processEnv: { WATSONX_AI_BEARER_TOKEN: 'process-token' },
      expected: 'override-token',
    },
    {
      name: 'custom token environment variable before native token',
      config: { apiBearerTokenEnvar: 'CUSTOM_WATSONX_TOKEN' },
      env: { WATSONX_AI_BEARER_TOKEN: 'native-token' },
      processEnv: { CUSTOM_WATSONX_TOKEN: 'custom-token' },
      expected: 'custom-token',
    },
    {
      name: 'explicit token before custom and native variables',
      config: { apiBearerToken: 'explicit-token', apiBearerTokenEnvar: 'CUSTOM_WATSONX_TOKEN' },
      env: { WATSONX_AI_BEARER_TOKEN: 'native-token' },
      processEnv: { CUSTOM_WATSONX_TOKEN: 'custom-token' },
      expected: 'explicit-token',
    },
    {
      name: 'bearer fallback when forced IAM has no key',
      config: { apiBearerToken: 'fallback-token' },
      env: { WATSONX_AI_AUTH_TYPE: 'iam' },
      processEnv: {},
      expected: 'fallback-token',
    },
  ])(
    'accepts $name without constructing an SDK client',
    async ({ config, env, processEnv, expected }) => {
      vi.mocked(getEnvString).mockImplementation(
        (key) => (processEnv as Record<string, string>)[key],
      );
      const instance = new Provider('account/custom-model', { config, env });

      expect(instance.requiresApiKey()).toBe(false);
      expect(checkProviderApiKeys([instance]).size).toBe(0);
      expect(BearerTokenAuthenticator).not.toHaveBeenCalled();
      expect(IamAuthenticator).not.toHaveBeenCalled();
      expect(instance.modelName).toBe('account/custom-model');

      await instance.getAuth();
      expect(BearerTokenAuthenticator).toHaveBeenCalledWith({ bearerToken: expected });
      expect(IamAuthenticator).not.toHaveBeenCalled();
    },
  );

  it.each([
    { authType: undefined, requiresKey: true, authenticator: 'iam' },
    { authType: 'iam', requiresKey: true, authenticator: 'iam' },
    { authType: 'bearertoken', requiresKey: false, authenticator: 'bearer' },
  ])(
    'preserves auth selection with both credentials and authType=$authType',
    async ({ authType, requiresKey, authenticator }) => {
      const instance = new Provider('account/custom-model', {
        config: { apiKey: 'fixture-iam-key', apiBearerToken: 'fixture-token' },
        env: { WATSONX_AI_AUTH_TYPE: authType },
      });
      expect(instance.requiresApiKey()).toBe(requiresKey);
      expect(checkProviderApiKeys([instance]).size).toBe(0);
      await instance.getAuth();
      if (authenticator === 'iam') {
        expect(IamAuthenticator).toHaveBeenCalledWith({ apikey: 'fixture-iam-key' });
        expect(BearerTokenAuthenticator).not.toHaveBeenCalled();
      } else {
        expect(BearerTokenAuthenticator).toHaveBeenCalledWith({ bearerToken: 'fixture-token' });
        expect(IamAuthenticator).not.toHaveBeenCalled();
      }
    },
  );

  it('recognizes a native IAM key without changing the configured model', () => {
    const processEnv: Record<string, string> = { WATSONX_AI_APIKEY: 'fixture-key' };
    vi.mocked(getEnvString).mockImplementation((key) => processEnv[key]);
    const instance = new Provider('account/custom-model', { config: {} });
    expect(instance.requiresApiKey()).toBe(true);
    expect(checkProviderApiKeys([instance]).size).toBe(0);
    expect(instance.modelName).toBe('account/custom-model');
    expect(IamAuthenticator).not.toHaveBeenCalled();
  });

  it.each([{}, { apiBearerToken: '' }, { apiKey: '', apiBearerToken: '' }])(
    'still reports missing authentication for %j',
    (config) => {
      const instance = new Provider('account/custom-model', { config });
      expect(instance.requiresApiKey()).toBe(true);
      expect([...checkProviderApiKeys([instance]).values()]).toEqual([[instance.id()]]);
      expect(BearerTokenAuthenticator).not.toHaveBeenCalled();
      expect(IamAuthenticator).not.toHaveBeenCalled();
    },
  );

  it('keeps the existing IAM fallback when forced bearer auth has no token', async () => {
    const instance = new Provider('account/custom-model', {
      config: { apiKey: 'fallback-key' },
      env: { WATSONX_AI_AUTH_TYPE: 'bearertoken' },
    });
    expect(instance.requiresApiKey()).toBe(true);
    expect(checkProviderApiKeys([instance]).size).toBe(0);
    await instance.getAuth();
    expect(IamAuthenticator).toHaveBeenCalledWith({ apikey: 'fallback-key' });
    expect(BearerTokenAuthenticator).not.toHaveBeenCalled();
  });
});
