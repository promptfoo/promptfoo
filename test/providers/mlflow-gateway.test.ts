import { afterEach, describe, expect, it } from 'vitest';
import { MlflowGatewayChatCompletionProvider } from '../../src/providers/mlflow-gateway';
import { mockProcessEnv } from '../util/utils';

describe('MlflowGatewayChatCompletionProvider', () => {
  afterEach(() => {
    mockProcessEnv({});
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
    expect(
      () =>
        new MlflowGatewayChatCompletionProvider('my-endpoint', {
          config: {},
        }),
    ).toThrow('MLflow Gateway URL is required');
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

  it('should preserve the model name', () => {
    const provider = new MlflowGatewayChatCompletionProvider('my-chat-endpoint', {
      config: { gatewayUrl: 'http://localhost:5000' },
    });
    expect(provider.modelName).toBe('my-chat-endpoint');
  });

  it('should prefer explicit config over env var', () => {
    mockProcessEnv({ MLFLOW_GATEWAY_URL: 'http://from-env.com' });
    const provider = new MlflowGatewayChatCompletionProvider('my-endpoint', {
      config: { gatewayUrl: 'http://from-config.com' },
    });
    expect(provider.config.apiBaseUrl).toBe('http://from-config.com/gateway/openai/v1');
  });
});
