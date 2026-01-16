import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock envars
vi.mock('../../../src/envars', () => ({
  getEnvString: vi.fn(),
}));

describe('providers', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getProviderStatus', () => {
    it('should return "local" for Ollama providers', async () => {
      const { getProviderStatus } = await import('../../../src/ui/init/utils/providers');
      expect(getProviderStatus('ollama:llama3')).toBe('local');
      expect(getProviderStatus('ollama:chat:llama3')).toBe('local');
    });

    it('should return "local" for file:// providers', async () => {
      const { getProviderStatus } = await import('../../../src/ui/init/utils/providers');
      expect(getProviderStatus('file://provider.py')).toBe('local');
      expect(getProviderStatus('file://provider.js')).toBe('local');
    });

    it('should return "local" for exec: providers', async () => {
      const { getProviderStatus } = await import('../../../src/ui/init/utils/providers');
      expect(getProviderStatus('exec:provider.sh')).toBe('local');
    });

    it('should return "local" for localhost URLs', async () => {
      const { getProviderStatus } = await import('../../../src/ui/init/utils/providers');
      expect(getProviderStatus('http://localhost:8080')).toBe('local');
      expect(getProviderStatus('https://localhost:3000')).toBe('local');
    });

    it('should return "ready" when API key is set', async () => {
      const { getEnvString } = await import('../../../src/envars');
      vi.mocked(getEnvString).mockReturnValue('sk-test-key');

      const { getProviderStatus } = await import('../../../src/ui/init/utils/providers');
      expect(getProviderStatus('openai:gpt-5')).toBe('ready');
    });

    it('should return "missing-key" when API key is not set', async () => {
      const { getEnvString } = await import('../../../src/envars');
      vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);

      const { getProviderStatus } = await import('../../../src/ui/init/utils/providers');
      expect(getProviderStatus('openai:gpt-5')).toBe('missing-key');
    });

    it('should return "ready" for unknown providers', async () => {
      const { getEnvString } = await import('../../../src/envars');
      vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);

      const { getProviderStatus } = await import('../../../src/ui/init/utils/providers');
      expect(getProviderStatus('unknown:provider')).toBe('ready');
    });
  });

  describe('getProviderEnvVar', () => {
    it('should return correct env var for OpenAI', async () => {
      const { getProviderEnvVar } = await import('../../../src/ui/init/utils/providers');
      expect(getProviderEnvVar('openai:gpt-5')).toBe('OPENAI_API_KEY');
    });

    it('should return correct env var for Anthropic', async () => {
      const { getProviderEnvVar } = await import('../../../src/ui/init/utils/providers');
      expect(getProviderEnvVar('anthropic:messages:claude-3')).toBe('ANTHROPIC_API_KEY');
    });

    it('should return undefined for unknown providers', async () => {
      const { getProviderEnvVar } = await import('../../../src/ui/init/utils/providers');
      expect(getProviderEnvVar('unknown:provider')).toBeUndefined();
    });
  });

  describe('getProviderChoices', () => {
    it('should return provider choices for "compare" use case', async () => {
      const { getProviderChoices } = await import('../../../src/ui/init/utils/providers');
      const choices = getProviderChoices('compare');
      expect(choices.length).toBeGreaterThan(0);
      expect(choices.some((c) => c.category === 'recommended')).toBe(true);
      expect(choices.some((c) => c.category === 'cloud')).toBe(true);
      expect(choices.some((c) => c.category === 'local')).toBe(true);
    });

    it('should return provider choices for "rag" use case', async () => {
      const { getProviderChoices } = await import('../../../src/ui/init/utils/providers');
      const choices = getProviderChoices('rag');
      expect(choices.length).toBeGreaterThan(0);
    });

    it('should return provider choices for "agent" use case', async () => {
      const { getProviderChoices } = await import('../../../src/ui/init/utils/providers');
      const choices = getProviderChoices('agent');
      expect(choices.length).toBeGreaterThan(0);

      // Agent use case should include OpenAI with tools configuration
      const openaiChoice = choices.find((c) => c.label.includes('OpenAI'));
      expect(openaiChoice).toBeDefined();
    });

    it('should include all expected categories', async () => {
      const { getProviderChoices } = await import('../../../src/ui/init/utils/providers');
      const choices = getProviderChoices('compare');
      const categories = new Set(choices.map((c) => c.category));
      expect(categories.has('recommended')).toBe(true);
      expect(categories.has('cloud')).toBe(true);
      expect(categories.has('local')).toBe(true);
      expect(categories.has('custom')).toBe(true);
    });
  });

  describe('getProviderPrefix', () => {
    it('should extract prefix from string provider', async () => {
      const { getProviderPrefix } = await import('../../../src/ui/init/utils/providers');
      expect(getProviderPrefix('openai:gpt-5')).toBe('openai');
      expect(getProviderPrefix('anthropic:messages:claude-3')).toBe('anthropic');
    });

    it('should extract prefix from ProviderOptions', async () => {
      const { getProviderPrefix } = await import('../../../src/ui/init/utils/providers');
      expect(getProviderPrefix({ id: 'openai:gpt-5' })).toBe('openai');
      expect(getProviderPrefix({ id: 'azure:chat:deployment' })).toBe('azure');
    });

    it('should return "unknown" for ProviderOptions without id', async () => {
      const { getProviderPrefix } = await import('../../../src/ui/init/utils/providers');
      expect(getProviderPrefix({})).toBe('unknown');
    });
  });

  describe('needsPythonProvider', () => {
    it('should return true for Python file providers', async () => {
      const { needsPythonProvider } = await import('../../../src/ui/init/utils/providers');
      expect(needsPythonProvider(['file://provider.py'])).toBe(true);
    });

    it('should return true for python: prefix providers', async () => {
      const { needsPythonProvider } = await import('../../../src/ui/init/utils/providers');
      expect(needsPythonProvider(['python:script.py'])).toBe(true);
    });

    it('should return false for non-Python providers', async () => {
      const { needsPythonProvider } = await import('../../../src/ui/init/utils/providers');
      expect(needsPythonProvider(['openai:gpt-5'])).toBe(false);
      expect(needsPythonProvider(['file://provider.js'])).toBe(false);
    });
  });

  describe('needsJavaScriptProvider', () => {
    it('should return true for JavaScript file providers', async () => {
      const { needsJavaScriptProvider } = await import('../../../src/ui/init/utils/providers');
      expect(needsJavaScriptProvider(['file://provider.js'])).toBe(true);
    });

    it('should return false for non-JavaScript providers', async () => {
      const { needsJavaScriptProvider } = await import('../../../src/ui/init/utils/providers');
      expect(needsJavaScriptProvider(['openai:gpt-5'])).toBe(false);
      expect(needsJavaScriptProvider(['file://provider.py'])).toBe(false);
    });
  });

  describe('needsExecProvider', () => {
    it('should return true for exec: providers', async () => {
      const { needsExecProvider } = await import('../../../src/ui/init/utils/providers');
      expect(needsExecProvider(['exec:provider.sh'])).toBe(true);
      expect(needsExecProvider(['exec:provider.bat'])).toBe(true);
    });

    it('should return false for non-exec providers', async () => {
      const { needsExecProvider } = await import('../../../src/ui/init/utils/providers');
      expect(needsExecProvider(['openai:gpt-5'])).toBe(false);
      expect(needsExecProvider(['file://provider.py'])).toBe(false);
    });
  });

  describe('reportProviderAPIKeyWarnings', () => {
    it('should return empty array when all API keys are set', async () => {
      const { getEnvString } = await import('../../../src/envars');
      vi.mocked(getEnvString).mockReturnValue('test-key');

      const { reportProviderAPIKeyWarnings } = await import(
        '../../../src/ui/init/utils/providers'
      );
      const warnings = reportProviderAPIKeyWarnings(['openai:gpt-5']);
      expect(warnings).toHaveLength(0);
    });

    it('should return warning when OpenAI API key is missing', async () => {
      const { getEnvString } = await import('../../../src/envars');
      vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);

      const { reportProviderAPIKeyWarnings } = await import(
        '../../../src/ui/init/utils/providers'
      );
      const warnings = reportProviderAPIKeyWarnings(['openai:gpt-5']);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('OPENAI_API_KEY');
    });

    it('should return warning when Anthropic API key is missing', async () => {
      const { getEnvString } = await import('../../../src/envars');
      vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);

      const { reportProviderAPIKeyWarnings } = await import(
        '../../../src/ui/init/utils/providers'
      );
      const warnings = reportProviderAPIKeyWarnings(['anthropic:messages:claude-3']);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('ANTHROPIC_API_KEY');
    });

    it('should return no warnings for local providers', async () => {
      const { getEnvString } = await import('../../../src/envars');
      vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);

      const { reportProviderAPIKeyWarnings } = await import(
        '../../../src/ui/init/utils/providers'
      );
      const warnings = reportProviderAPIKeyWarnings(['ollama:llama3']);
      expect(warnings).toHaveLength(0);
    });
  });
});
