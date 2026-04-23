import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MlflowGatewayChatCompletionProvider } from '../../src/providers/mlflow-gateway';
import { mockProcessEnv } from '../util/utils';

describe('MlflowGatewayChatCompletionProvider', () => {
  // Capture a reset closure before each test so tests see a clean env (no
  // MLFLOW_*/OPENAI_* leakage from the shell or prior tests) and the original
  // env is restored after.
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = mockProcessEnv(
      {
        MLFLOW_GATEWAY_URL: undefined,
        MLFLOW_GATEWAY_API_KEY: undefined,
        OPENAI_API_KEY: undefined,
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
    expect(provider.config.apiBaseUrl).toBe('http://localhost:5000/gateway/openai/v1');
  });

  it('should construct with MLFLOW_GATEWAY_URL env var', () => {
    mockProcessEnv({ MLFLOW_GATEWAY_URL: 'http://gateway.example.com' });
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: {},
    });
    expect(provider.config.apiBaseUrl).toBe('http://gateway.example.com/gateway/openai/v1');
  });

  it('should strip trailing slash from gateway URL', () => {
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000/' },
    });
    expect(provider.config.apiBaseUrl).toBe('http://localhost:5000/gateway/openai/v1');
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
    expect(provider.config.apiBaseUrl).toBe('http://from-config.com/gateway/openai/v1');
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

  it('should NOT fall back to OPENAI_API_KEY when MLFLOW_GATEWAY_API_KEY is unset', () => {
    // Regression test: forwarding a user's OPENAI_API_KEY as a Bearer token to
    // an MLflow gateway URL would leak their cloud OpenAI credentials.
    mockProcessEnv({ OPENAI_API_KEY: 'sk-openai-secret' });
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000' },
    });
    expect(provider.getApiKey()).toBeUndefined();
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
});
