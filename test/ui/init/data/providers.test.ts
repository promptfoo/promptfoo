import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getDefaultModels,
  getMissingApiKeys,
  getProviderFamily,
  isApiKeySet,
  PROVIDER_CATALOG,
} from '../../../../src/ui/init/data/providers';

describe('PROVIDER_CATALOG', () => {
  it('should have provider families', () => {
    expect(PROVIDER_CATALOG.length).toBeGreaterThan(0);
  });

  it('should have required fields for each family', () => {
    for (const family of PROVIDER_CATALOG) {
      expect(family.id).toBeDefined();
      expect(family.name).toBeDefined();
      expect(family.description).toBeDefined();
      expect(Array.isArray(family.models)).toBe(true);
    }
  });

  it('should include OpenAI provider', () => {
    const openai = PROVIDER_CATALOG.find((p) => p.id === 'openai');
    expect(openai).toBeDefined();
    expect(openai?.name).toContain('OpenAI');
    expect(openai?.models.length).toBeGreaterThan(0);
  });

  it('should include Anthropic provider', () => {
    const anthropic = PROVIDER_CATALOG.find((p) => p.id === 'anthropic');
    expect(anthropic).toBeDefined();
    expect(anthropic?.name).toContain('Anthropic');
    expect(anthropic?.models.length).toBeGreaterThan(0);
  });

  it('should have models with required fields', () => {
    for (const family of PROVIDER_CATALOG) {
      for (const model of family.models) {
        expect(model.id).toBeDefined();
        expect(model.name).toBeDefined();
        expect(model.description).toBeDefined();
      }
    }
  });

  it('should have unique family IDs', () => {
    const ids = PROVIDER_CATALOG.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have unique model IDs within each family', () => {
    for (const family of PROVIDER_CATALOG) {
      const modelIds = family.models.map((m) => m.id);
      const uniqueModelIds = new Set(modelIds);
      expect(uniqueModelIds.size).toBe(modelIds.length);
    }
  });

  it('should have API key environment variables for cloud providers', () => {
    const cloudProviders = PROVIDER_CATALOG.filter(
      (p) => !p.id.startsWith('custom') && p.id !== 'ollama',
    );

    for (const provider of cloudProviders) {
      expect(provider.apiKeyEnv).toBeDefined();
    }
  });
});

describe('getProviderFamily', () => {
  it('should return provider family by ID', () => {
    const openai = getProviderFamily('openai');
    expect(openai).toBeDefined();
    expect(openai?.id).toBe('openai');
  });

  it('should return undefined for unknown provider', () => {
    const unknown = getProviderFamily('nonexistent');
    expect(unknown).toBeUndefined();
  });
});

describe('getDefaultModels', () => {
  it('should return model IDs marked as default for a family', () => {
    const openaiDefaults = getDefaultModels('openai');
    expect(Array.isArray(openaiDefaults)).toBe(true);
    expect(openaiDefaults.length).toBeGreaterThan(0);
  });

  it('should return model IDs that contain the family name', () => {
    const openaiDefaults = getDefaultModels('openai');
    for (const modelId of openaiDefaults) {
      expect(modelId).toContain('openai');
    }
  });

  it('should return empty array for unknown family', () => {
    const result = getDefaultModels('nonexistent');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('should return correct defaults for anthropic', () => {
    const anthropicDefaults = getDefaultModels('anthropic');
    expect(anthropicDefaults.length).toBeGreaterThan(0);
    for (const modelId of anthropicDefaults) {
      expect(modelId).toContain('anthropic');
    }
  });
});

describe('isApiKeySet', () => {
  beforeEach(() => {
    // Clear any env vars that might affect tests
    vi.unstubAllEnvs();
  });

  it('should return true for providers without API key requirement', () => {
    const ollama = getProviderFamily('ollama');
    expect(ollama).toBeDefined();
    expect(isApiKeySet(ollama!)).toBe(true);
  });

  it('should return false when API key is not set', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const openai = getProviderFamily('openai');
    expect(openai).toBeDefined();
    expect(isApiKeySet(openai!)).toBe(false);
  });

  it('should return true when API key is set', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test123');
    const openai = getProviderFamily('openai');
    expect(openai).toBeDefined();
    expect(isApiKeySet(openai!)).toBe(true);
  });
});

describe('getMissingApiKeys', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return empty array when no API keys are missing', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test123');
    const missing = getMissingApiKeys(['openai']);
    expect(missing).toEqual([]);
  });

  it('should return missing API keys', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const missing = getMissingApiKeys(['openai']);
    expect(missing.length).toBe(1);
    expect(missing[0].envVar).toBe('OPENAI_API_KEY');
    expect(missing[0].family).toBe('OpenAI');
  });

  it('should handle multiple providers', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const missing = getMissingApiKeys(['openai', 'anthropic']);
    expect(missing.length).toBe(2);
  });

  it('should not include providers without API key requirements', () => {
    const missing = getMissingApiKeys(['ollama']);
    expect(missing.length).toBe(0);
  });
});
