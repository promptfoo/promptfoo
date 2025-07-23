import { getApiKeyErrorHelp } from '../../src/matchers';
import { getEnvString } from '../../src/envars';

jest.mock('../../src/envars');

describe('Provider Warning System - getApiKeyErrorHelp', () => {
  let mockGetEnvString: jest.MockedFunction<typeof getEnvString>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEnvString = getEnvString as jest.MockedFunction<typeof getEnvString>;
    mockGetEnvString.mockReturnValue(''); // Return empty string instead of undefined

    // Save original env
    originalEnv = process.env;
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  // Helper to safely set environment variables for testing
  function withEnvVars(vars: Record<string, string>, testFn: () => void) {
    const backup: Record<string, string | undefined> = {};

    // Backup existing values
    for (const key of Object.keys(vars)) {
      backup[key] = process.env[key];
    }

    try {
      // Set test values
      for (const [key, value] of Object.entries(vars)) {
        process.env[key] = value;
      }

      // Mock getEnvString based on the test env vars
      mockGetEnvString.mockImplementation((key: string) => {
        return process.env[key] || '';
      });

      // Run test
      testFn();
    } finally {
      // Restore original values
      for (const [key, value] of Object.entries(backup)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  }

  describe('when provider is explicitly configured', () => {
    it('should provide specific help for configured OpenAI provider', () => {
      const help = getApiKeyErrorHelp(
        'openai:embedding:text-embedding-3-large',
        'embedding',
        'Error: OpenAI API key must be set',
        true,
      );

      expect(help).toContain(
        'Your configured embedding provider "openai:embedding:text-embedding-3-large" requires authentication',
      );
      expect(help).toContain('To use OpenAI models, set your API key:');
      expect(help).toContain('export OPENAI_API_KEY=your-api-key');
    });

    it('should provide specific help for configured Azure provider', () => {
      const help = getApiKeyErrorHelp(
        'azure:embedding:text-embedding-ada-002',
        'embedding',
        'Error: Azure API key required',
        true,
      );

      expect(help).toContain(
        'Your configured embedding provider "azure:embedding:text-embedding-ada-002" requires authentication',
      );
      expect(help).toContain('For Azure OpenAI, you need to set:');
      expect(help).toContain('export AZURE_API_KEY=your-api-key');
      expect(help).toContain('export AZURE_API_BASE=https://your-resource.openai.azure.com');
    });

    it('should provide generic help for unknown configured provider', () => {
      const help = getApiKeyErrorHelp(
        'custom-provider:model',
        'text',
        'Error: Authentication failed',
        true,
      );

      expect(help).toContain(
        'Your configured text provider "custom-provider:model" requires authentication',
      );
      expect(help).toContain(
        'Please check your provider configuration and ensure the necessary API keys or credentials are set',
      );
      expect(help).toContain('For more information on providers');
    });
  });

  describe('when using default provider', () => {
    it('should provide alternatives when credentials are available', () => {
      withEnvVars(
        {
          AZURE_API_KEY: 'azure-key',
          VOYAGE_API_KEY: 'voyage-key',
        },
        () => {
          const help = getApiKeyErrorHelp(
            'openai:embedding:text-embedding-3-large',
            'embedding',
            'Error: OpenAI API key must be set',
            false,
          );

          expect(help).toContain('It looks like you have credentials for: Azure OpenAI, Voyage AI');
          expect(help).toContain('azure:embedding:<your-deployment-name>');
          expect(help).toContain('voyage:voyage-3');
        },
      );
    });

    it('should not suggest alternatives when none are available', () => {
      // Mock getEnvString to always return empty string
      mockGetEnvString.mockReturnValue('');

      const help = getApiKeyErrorHelp(
        'openai:embedding:text-embedding-3-large',
        'embedding',
        'Error: OpenAI API key must be set',
        false,
      );

      expect(help).not.toContain('It looks like you have credentials for:');
      expect(help).toContain('Available embedding providers:');
    });

    it('should handle multiple available credentials', () => {
      withEnvVars(
        {
          AZURE_API_KEY: 'azure-key',
          ANTHROPIC_API_KEY: 'anthropic-key',
          VOYAGE_API_KEY: 'voyage-key',
          COHERE_API_KEY: 'cohere-key',
        },
        () => {
          const help = getApiKeyErrorHelp(
            'openai:embedding:text-embedding-3-large',
            'embedding',
            'Error: OpenAI API key must be set',
            false,
          );

          expect(help).toContain('Azure OpenAI');
          expect(help).toContain('Voyage AI');
          expect(help).toContain('Cohere');
        },
      );
    });
  });

  describe('provider detection', () => {
    it('should correctly identify OpenAI providers', () => {
      const help = getApiKeyErrorHelp('openai:gpt-4', 'text', 'Error: API key required', true);

      expect(help).toContain('To use OpenAI');
      expect(help).not.toContain('To use Azure');
    });

    it('should correctly identify Azure OpenAI providers', () => {
      const help = getApiKeyErrorHelp('azure:deployment', 'text', 'Error: API key required', true);

      expect(help).toContain('For Azure OpenAI');
      expect(help).toContain('AZURE_API_KEY');
      expect(help).toContain('AZURE_API_BASE');
    });

    it('should handle anthropic provider', () => {
      const help = getApiKeyErrorHelp(
        'anthropic:claude-3',
        'text',
        'Error: API key required',
        true,
      );

      expect(help).toContain('To use Anthropic models');
      expect(help).toContain('ANTHROPIC_API_KEY');
    });

    it('should provide generic help for unknown providers', () => {
      const help = getApiKeyErrorHelp('unknown-provider', 'text', 'Error: API key required', true);

      expect(help).toContain('Please check your provider configuration');
      expect(help).not.toContain('ANTHROPIC_API_KEY');
      expect(help).not.toContain('OPENAI_API_KEY');
    });
  });
});
