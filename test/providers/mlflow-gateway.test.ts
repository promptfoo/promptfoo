import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { MlflowGatewayChatCompletionProvider } from '../../src/providers/mlflow-gateway';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

describe('MlflowGatewayChatCompletionProvider', () => {
  // Capture a reset closure before each test so tests see a clean env (no
  // MLFLOW_*/OPENAI_* leakage from the shell or prior tests) and the original
  // env is restored after.
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.mocked(fetchWithCache).mockReset();
    restoreEnv = mockProcessEnv(
      {
        MLFLOW_GATEWAY_URL: undefined,
        MLFLOW_GATEWAY_API_KEY: undefined,
        OPENAI_API_KEY: undefined,
        OPENAI_ORGANIZATION: undefined,
        OPENAI_API_HOST: undefined,
        OPENAI_API_BASE_URL: undefined,
        OPENAI_BASE_URL: undefined,
      },
      { clear: false },
    );
  });

  afterEach(() => {
    restoreEnv();
  });

  it('should construct with explicit gatewayUrl', () => {
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000' },
    });
    expect(provider.config.apiBaseUrl).toBe('http://localhost:5000/gateway/mlflow/v1');
  });

  it('should construct with MLFLOW_GATEWAY_URL env var', () => {
    mockProcessEnv({ MLFLOW_GATEWAY_URL: 'http://gateway.example.com' });
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: {},
    });
    expect(provider.config.apiBaseUrl).toBe('http://gateway.example.com/gateway/mlflow/v1');
  });

  it('should construct with provider env MLFLOW_GATEWAY_URL', () => {
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: {},
      env: { MLFLOW_GATEWAY_URL: 'http://provider-env.example.com' },
    });
    expect(provider.config.apiBaseUrl).toBe('http://provider-env.example.com/gateway/mlflow/v1');
  });

  it('should prefer provider env gateway URL over process env', () => {
    mockProcessEnv({ MLFLOW_GATEWAY_URL: 'http://process-env.example.com' });
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: {},
      env: { MLFLOW_GATEWAY_URL: 'http://provider-env.example.com' },
    });
    expect(provider.config.apiBaseUrl).toBe('http://provider-env.example.com/gateway/mlflow/v1');
  });

  it('should strip trailing slash from gateway URL', () => {
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: ' http://localhost:5000/// ' },
    });
    expect(provider.config.apiBaseUrl).toBe('http://localhost:5000/gateway/mlflow/v1');
  });

  it('should throw if no gateway URL is provided', () => {
    mockProcessEnv({ MLFLOW_GATEWAY_URL: '' });
    expect(
      () =>
        new MlflowGatewayChatCompletionProvider('my-endpoint', {
          config: {},
        }),
    ).toThrow('MLflow Gateway URL is required');
  });

  it('should throw if endpoint name is empty', () => {
    expect(
      () =>
        new MlflowGatewayChatCompletionProvider('', {
          config: { gatewayUrl: 'http://localhost:5000' },
        }),
    ).toThrow('MLflow Gateway endpoint name is required');
  });

  it('should throw if endpoint name is whitespace', () => {
    expect(
      () =>
        new MlflowGatewayChatCompletionProvider('   ', {
          config: { gatewayUrl: 'http://localhost:5000' },
        }),
    ).toThrow('MLflow Gateway endpoint name is required');
  });

  it('should default apiKeyEnvar to MLFLOW_GATEWAY_API_KEY', () => {
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000' },
    });
    expect(provider.config.apiKeyEnvar).toBe('MLFLOW_GATEWAY_API_KEY');
  });

  it('should allow custom apiKeyEnvar', () => {
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000', apiKeyEnvar: 'MY_CUSTOM_KEY' },
    });
    expect(provider.config.apiKeyEnvar).toBe('MY_CUSTOM_KEY');
  });

  it('should default apiKeyRequired to false', () => {
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000' },
    });
    expect(provider.config.apiKeyRequired).toBe(false);
  });

  it('should honor explicit apiKeyRequired true', () => {
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000', apiKeyRequired: true },
    });
    expect(provider.config.apiKeyRequired).toBe(true);
  });

  it('should preserve the model name', () => {
    const provider = new MlflowGatewayChatCompletionProvider('my-chat-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000' },
    });
    expect(provider.modelName).toBe('my-chat-endpoint');
  });

  it('should use namespaced provider id by default', () => {
    const provider = new MlflowGatewayChatCompletionProvider('my-chat-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000' },
    });
    expect(provider.id()).toBe('mlflow-gateway:my-chat-endpoint');
  });

  it('should honor explicit provider id', () => {
    const provider = new MlflowGatewayChatCompletionProvider('my-chat-endpoint', {
      id: 'custom-id',
      config: { gatewayUrl: 'http://localhost:5000' },
    });
    expect(provider.id()).toBe('custom-id');
  });

  it('should prefer explicit config over env var', () => {
    mockProcessEnv({ MLFLOW_GATEWAY_URL: 'http://from-env.com' });
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: 'http://from-config.com' },
    });
    expect(provider.config.apiBaseUrl).toBe('http://from-config.com/gateway/mlflow/v1');
  });

  it('should read the API key from MLFLOW_GATEWAY_API_KEY', () => {
    mockProcessEnv({ MLFLOW_GATEWAY_API_KEY: 'mlflow-token' });
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000' },
    });
    expect(provider.getApiKey()).toBe('mlflow-token');
  });

  it('should prefer explicit config.apiKey over env var', () => {
    mockProcessEnv({ MLFLOW_GATEWAY_API_KEY: 'from-env' });
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000', apiKey: 'from-config' },
    });
    expect(provider.getApiKey()).toBe('from-config');
  });

  it('should prefer provider env API key over process env', () => {
    mockProcessEnv({ MLFLOW_GATEWAY_API_KEY: 'from-process-env' });
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000' },
      env: { MLFLOW_GATEWAY_API_KEY: 'from-provider-env' },
    });
    expect(provider.getApiKey()).toBe('from-provider-env');
  });

  it('should allow provider env to clear the process env API key', () => {
    mockProcessEnv({ MLFLOW_GATEWAY_API_KEY: 'from-process-env' });
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000' },
      env: { MLFLOW_GATEWAY_API_KEY: '' },
    });
    expect(provider.getApiKey()).toBe('');
  });

  it('should NOT fall back to OPENAI_API_KEY when MLFLOW_GATEWAY_API_KEY is unset', () => {
    // Regression test: forwarding a user's OPENAI_API_KEY as a Bearer token to
    // an MLflow gateway URL would leak their cloud OpenAI credentials.
    mockProcessEnv({ OPENAI_API_KEY: 'sk-openai-secret' });
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000' },
    });
    expect(provider.getApiKey()).toBeUndefined();
  });

  it('should NOT forward OPENAI_ORGANIZATION to MLflow Gateway', () => {
    mockProcessEnv({ OPENAI_ORGANIZATION: 'org-openai-secret' });
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000' },
    });
    expect(provider.getOrganization()).toBeUndefined();
  });

  it('should NOT require an API key by default', () => {
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000' },
    });
    expect(provider.requiresApiKey()).toBe(false);
  });

  it('should use MLflow-specific missing-key message when apiKey is required', () => {
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000', apiKeyRequired: true },
    });
    expect(provider['getMissingApiKeyErrorMessage']()).toContain('MLFLOW_GATEWAY_API_KEY');
    expect(provider['getMissingApiKeyErrorMessage']()).not.toContain('OPENAI_API_KEY');
  });

  it('should NOT route to OPENAI_API_HOST when set in env', () => {
    // Regression test: OpenAiGenericProvider.getApiUrl() prioritizes
    // OPENAI_API_HOST over apiBaseUrl. We must not inherit that fallback,
    // or mlflow-gateway:* requests would silently go to the wrong service.
    mockProcessEnv({ OPENAI_API_HOST: 'evil.example.com' });
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000' },
    });
    expect(provider.getApiUrl()).toBe('http://localhost:5000/gateway/mlflow/v1');
  });

  it('should NOT route to OPENAI_API_BASE_URL when set in env', () => {
    mockProcessEnv({ OPENAI_API_BASE_URL: 'http://other-service.example.com/v1' });
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000' },
    });
    expect(provider.getApiUrl()).toBe('http://localhost:5000/gateway/mlflow/v1');
  });

  it('should NOT route to OPENAI_BASE_URL when set in env', () => {
    mockProcessEnv({ OPENAI_BASE_URL: 'http://other-service.example.com/v1' });
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000' },
    });
    expect(provider.getApiUrl()).toBe('http://localhost:5000/gateway/mlflow/v1');
  });

  it('should call the OpenAI-compatible gateway endpoint without leaking OpenAI headers', async () => {
    mockProcessEnv({
      OPENAI_API_KEY: 'sk-openai-secret',
      OPENAI_ORGANIZATION: 'org-openai-secret',
      OPENAI_API_HOST: 'evil.example.com',
    });
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        choices: [{ message: { content: 'gateway output' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new MlflowGatewayChatCompletionProvider('my-chat-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000' },
    });
    const result = await provider.callApi('Hello gateway');

    expect(fetchWithCache).toHaveBeenCalledWith(
      'http://localhost:5000/gateway/mlflow/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
      expect.any(Number),
      'json',
      undefined,
      undefined,
    );
    const request = vi.mocked(fetchWithCache).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({ model: 'my-chat-endpoint' });
    expect(result.output).toBe('gateway output');
    expect(result.tokenUsage).toEqual({ total: 7, prompt: 4, completion: 3, numRequests: 1 });
  });

  it('should send explicitly configured authorization headers to secured gateways', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { choices: [{ message: { content: 'authenticated output' } }] },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new MlflowGatewayChatCompletionProvider('my-chat-endpoint', {
      config: {
        gatewayUrl: 'http://localhost:5000',
        headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      },
    });
    await provider.callApi('Hello gateway');

    expect(vi.mocked(fetchWithCache).mock.calls[0][1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Basic dXNlcjpwYXNz' }),
      }),
    );
  });

  it('should return gateway HTTP errors from the configured endpoint', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { error: { message: 'unauthorized' } },
      cached: false,
      status: 401,
      statusText: 'Unauthorized',
    } as never);

    const provider = new MlflowGatewayChatCompletionProvider('my-chat-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000' },
    });
    const result = await provider.callApi('Hello gateway');

    expect(result.error).toContain('API error: 401 Unauthorized');
  });

  it('should fail before requesting when an explicitly required Bearer token is missing', async () => {
    const provider = new MlflowGatewayChatCompletionProvider('my-chat-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000', apiKeyRequired: true },
    });

    await expect(provider.callApi('Hello gateway')).rejects.toThrow(
      'MLflow Gateway Bearer token is not set',
    );
    expect(fetchWithCache).not.toHaveBeenCalled();
  });
});
