import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculateEmpirioLabsCost,
  createEmpirioLabsProvider,
  EMPIRIOLABS_CHAT_MODELS,
} from '../../src/providers/empiriolabs';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';

describe('calculateEmpirioLabsCost', () => {
  it('should calculate cost for deepseek-v4-pro', () => {
    const cost = calculateEmpirioLabsCost('deepseek-v4-pro', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(2.75); // (0.55 + 2.2)
  });

  it('should calculate cost for deepseek-v4-flash', () => {
    const cost = calculateEmpirioLabsCost('deepseek-v4-flash', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(0.42); // (0.14 + 0.28)
  });

  it('should calculate cost for kimi-k2-7-code', () => {
    const cost = calculateEmpirioLabsCost('kimi-k2-7-code', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(4.95); // (0.95 + 4.0)
  });

  it('should return undefined if promptTokens is missing', () => {
    const cost = calculateEmpirioLabsCost('deepseek-v4-pro', {}, undefined, 1000000);
    expect(cost).toBeUndefined();
  });

  it('should return undefined if completionTokens is missing', () => {
    const cost = calculateEmpirioLabsCost('deepseek-v4-pro', {}, 1000000, undefined);
    expect(cost).toBeUndefined();
  });

  it('should use custom cost from config', () => {
    const config = { cost: 1.0 / 1e6 };
    const cost = calculateEmpirioLabsCost('deepseek-v4-pro', config, 1000000, 1000000);
    expect(cost).toBeCloseTo(2.0); // (1.0 + 1.0) from config override
  });

  it('should use separate custom input and output costs from config', () => {
    const config = { inputCost: 1.0 / 1e6, outputCost: 3.0 / 1e6 };
    const cost = calculateEmpirioLabsCost('deepseek-v4-pro', config, 1000000, 1000000);
    expect(cost).toBeCloseTo(4.0);
  });

  it('should prefer separate custom costs over custom cost', () => {
    const config = { cost: 5.0 / 1e6, inputCost: 1.0 / 1e6, outputCost: 3.0 / 1e6 };
    const cost = calculateEmpirioLabsCost('deepseek-v4-pro', config, 1000000, 1000000);
    expect(cost).toBeCloseTo(4.0);
  });

  it('should return undefined when an unknown model has no pricing', () => {
    const cost = calculateEmpirioLabsCost('unknown-model', {}, 1000000, 1000000);
    expect(cost).toBeUndefined();
  });
});

describe('EMPIRIOLABS_CHAT_MODELS', () => {
  it('should have correct pricing for deepseek-v4-pro', () => {
    const model = EMPIRIOLABS_CHAT_MODELS.find((m) => m.id === 'deepseek-v4-pro');
    expect(model).toBeDefined();
    expect(model!.cost.input).toBeCloseTo(0.55 / 1e6);
    expect(model!.cost.output).toBeCloseTo(2.2 / 1e6);
  });

  it('should have correct pricing for kimi-k2-7-code', () => {
    const model = EMPIRIOLABS_CHAT_MODELS.find((m) => m.id === 'kimi-k2-7-code');
    expect(model).toBeDefined();
    expect(model!.cost.input).toBeCloseTo(0.95 / 1e6);
    expect(model!.cost.output).toBeCloseTo(4.0 / 1e6);
  });
});

describe('createEmpirioLabsProvider', () => {
  it('should create a provider with the given model id', () => {
    expect(createEmpirioLabsProvider('empiriolabs:qwen3-7-plus').id()).toBe(
      'empiriolabs:qwen3-7-plus',
    );
  });

  it('should preserve colons in model ids', () => {
    expect(createEmpirioLabsProvider('empiriolabs:deepseek-v4-flash:variant1').id()).toBe(
      'empiriolabs:deepseek-v4-flash:variant1',
    );
  });

  it('should default options to an empty object when none are provided', () => {
    const provider = createEmpirioLabsProvider('empiriolabs:deepseek-v4-pro');
    expect(provider.id()).toBe('empiriolabs:deepseek-v4-pro');
  });
});

describe('EmpirioLabsProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return the correct string representation', () => {
    const provider = createEmpirioLabsProvider('empiriolabs:deepseek-v4-pro');
    expect(provider.toString()).toBe('[EmpirioLabs Provider deepseek-v4-pro]');
  });

  it('should point at the EmpirioLabs API base URL and env var', () => {
    const provider = createEmpirioLabsProvider('empiriolabs:deepseek-v4-pro');
    const json = (provider as any).toJSON();
    expect(json.provider).toBe('empiriolabs');
    expect(json.model).toBe('deepseek-v4-pro');
    expect(json.config.apiBaseUrl).toBe('https://api.empiriolabs.ai/v1');
    expect(json.config.apiKeyEnvar).toBe('EMPIRIOLABS_API_KEY');
  });

  it('should merge the nested config overrides into the provider config', () => {
    const provider = createEmpirioLabsProvider('empiriolabs:deepseek-v4-pro', {
      config: {
        config: {
          temperature: 0.7,
          max_tokens: 100,
        },
      },
    });
    const json = (provider as any).toJSON();
    expect(json.config.temperature).toBe(0.7);
    expect(json.config.max_tokens).toBe(100);
  });

  it('should not expose the apiKey in JSON serialization', () => {
    const provider = createEmpirioLabsProvider('empiriolabs:deepseek-v4-pro', {
      config: {
        config: {
          apiKey: 'secret-empiriolabs-key',
        },
      },
    });
    const json = (provider as any).toJSON();
    expect('apiKey' in json.config).toBe(true);
    expect(json.config.apiKey).toBeUndefined();
  });

  it('should keep the apiKey absent from JSON when none is configured', () => {
    const provider = createEmpirioLabsProvider('empiriolabs:deepseek-v4-pro');
    const json = (provider as any).toJSON();
    expect(json.config.apiKey).toBeUndefined();
  });

  it('should attach a calculated cost for a known model response', async () => {
    vi.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi').mockResolvedValueOnce({
      output: 'EmpirioLabs response',
      tokenUsage: {
        total: 150,
        prompt: 100,
        completion: 50,
      },
    });

    const provider = createEmpirioLabsProvider('empiriolabs:deepseek-v4-pro');
    const result = await provider.callApi('Test prompt');

    expect(result.output).toBe('EmpirioLabs response');
    expect(result.cost).toBe(calculateEmpirioLabsCost('deepseek-v4-pro', {}, 100, 50));
  });

  it('should leave cost undefined for an unknown model without published pricing', async () => {
    vi.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi').mockResolvedValueOnce({
      output: 'unknown model response',
      tokenUsage: {
        total: 150,
        prompt: 100,
        completion: 50,
      },
    });

    const provider = createEmpirioLabsProvider('empiriolabs:some-other-model');
    const result = await provider.callApi('Test prompt');

    expect(result.cost).toBeUndefined();
  });

  it('should not recalculate cost for cached responses', async () => {
    vi.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi').mockResolvedValueOnce({
      output: 'Cached EmpirioLabs response',
      tokenUsage: {
        total: 150,
        prompt: 100,
        completion: 50,
      },
      cached: true,
    });

    const provider = createEmpirioLabsProvider('empiriolabs:deepseek-v4-pro');
    const result = await provider.callApi('Test prompt');

    expect(result.cached).toBe(true);
    expect(result.cost).toBeUndefined();
  });

  it('should not attach cost when the parent response has no token usage', async () => {
    vi.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi').mockResolvedValueOnce({
      output: 'response without usage',
    });

    const provider = createEmpirioLabsProvider('empiriolabs:deepseek-v4-pro');
    const result = await provider.callApi('Test prompt');

    expect(result.cost).toBeUndefined();
  });

  it('should pass through empty and error parent responses unchanged', async () => {
    const callApi = vi.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi');
    callApi.mockResolvedValueOnce(undefined as any);
    callApi.mockResolvedValueOnce({ error: 'API error' });

    const provider = createEmpirioLabsProvider('empiriolabs:deepseek-v4-pro');

    await expect(provider.callApi('Empty response')).resolves.toBeUndefined();
    await expect(provider.callApi('Error response')).resolves.toEqual({ error: 'API error' });
  });
});
