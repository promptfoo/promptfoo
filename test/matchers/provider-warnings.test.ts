import { getApiKeyErrorHelp } from '../../src/matchers';
import { getEnvString } from '../../src/envars';

jest.mock('../../src/envars');

describe('Provider Warning System - getApiKeyErrorHelp', () => {
  let mockGetEnvString: jest.MockedFunction<typeof getEnvString>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEnvString = getEnvString as jest.MockedFunction<typeof getEnvString>;
    mockGetEnvString.mockReturnValue(undefined);
  });

  describe('when provider is explicitly configured', () => {
    it('should provide specific help for configured OpenAI provider', () => {
      const help = getApiKeyErrorHelp(
        'openai:embedding:text-embedding-3-large',
        'embedding',
        'Error: OpenAI API key must be set',
        true
      );

      expect(help).toContain('Your configured embedding provider');
      expect(help).toContain('export OPENAI_API_KEY=');
      expect(help).toContain('Or add it to your provider config');
    });

    it('should provide specific help for configured Azure provider', () => {
      const help = getApiKeyErrorHelp(
        'azure:embedding:deployment',
        'embedding',
        'Error: Azure API key must be set',
        true
      );

      expect(help).toContain('Option 1: Set API Key');
      expect(help).toContain('export AZURE_API_KEY=');
      expect(help).toContain('Option 2: Use client credentials');
      expect(help).toContain('Also ensure your deployment name and apiHost are correct');
    });

    it('should handle Voyage provider', () => {
      const help = getApiKeyErrorHelp(
        'voyage:voyage-3',
        'embedding',
        'Error: Voyage API key must be set',
        true
      );

      expect(help).toContain('export VOYAGE_API_KEY=');
    });

    it('should handle Cohere provider', () => {
      const help = getApiKeyErrorHelp(
        'cohere:embed-english-v3.0',
        'embedding',
        'Error: Cohere API key must be set',
        true
      );

      expect(help).toContain('export COHERE_API_KEY=');
    });

    it('should handle Vertex provider', () => {
      const help = getApiKeyErrorHelp(
        'vertex:embedding:text-embedding',
        'embedding',
        'Error: Authentication required',
        true
      );

      expect(help).toContain('Google Cloud authentication');
      expect(help).toContain('export VERTEX_PROJECT_ID=');
    });

    it('should handle Anthropic provider', () => {
      const help = getApiKeyErrorHelp(
        'anthropic:claude-3-opus',
        'text',
        'Error: Anthropic API key must be set',
        true
      );

      expect(help).toContain('export ANTHROPIC_API_KEY=');
    });
  });

  describe('when using default provider', () => {
    it('should provide alternatives when credentials are available', () => {
      mockGetEnvString.mockImplementation((key) => {
        if (key === 'AZURE_API_KEY') return 'azure-key';
        if (key === 'VOYAGE_API_KEY') return 'voyage-key';
        return undefined;
      });

      const help = getApiKeyErrorHelp(
        'openai:embedding:text-embedding-3-large',
        'embedding',
        'Error: OpenAI API key must be set',
        false
      );

      expect(help).toContain('It looks like you have credentials for: Azure OpenAI, Voyage');
      expect(help).toContain('azure:embedding:<your-deployment-name>');
      expect(help).toContain('voyage:voyage-3');
    });

    it('should not suggest alternatives when none are available', () => {
      mockGetEnvString.mockReturnValue(undefined);

      const help = getApiKeyErrorHelp(
        'openai:embedding:text-embedding-3-large',
        'embedding',
        'Error: OpenAI API key must be set',
        false
      );

      expect(help).not.toContain('It looks like you have credentials for:');
      expect(help).toContain('Available embedding providers:');
    });

    it('should handle multiple available credentials', () => {
      mockGetEnvString.mockImplementation((key) => {
        if (key === 'AZURE_API_KEY') return 'azure-key';
        if (key === 'ANTHROPIC_API_KEY') return 'anthropic-key';
        if (key === 'VOYAGE_API_KEY') return 'voyage-key';
        if (key === 'COHERE_API_KEY') return 'cohere-key';
        return undefined;
      });

      const help = getApiKeyErrorHelp(
        'openai:embedding:text-embedding-3-large',
        'embedding',
        'Error: OpenAI API key must be set',
        false
      );

      expect(help).toContain('Azure OpenAI, Anthropic, Voyage, Cohere');
    });
  });

  describe('provider detection', () => {
    it('should correctly identify OpenAI providers', () => {
      const help = getApiKeyErrorHelp(
        'openai:gpt-4',
        'text',
        'Error: API key required',
        true
      );

      expect(help).toContain('To use OpenAI');
      expect(help).not.toContain('To use Azure');
    });

    it('should correctly identify Azure OpenAI providers', () => {
      const help = getApiKeyErrorHelp(
        'azureopenai:deployment',
        'text',
        'Error: API key required',
        true
      );

      expect(help).toContain('To use Azure OpenAI');
      expect(help).not.toContain('To use OpenAI embeddings');
    });

    it('should handle providers with multiple name patterns', () => {
      const help1 = getApiKeyErrorHelp(
        'anthropic:claude-3',
        'text',
        'Error: API key required',
        true
      );

      const help2 = getApiKeyErrorHelp(
        'claude-3-opus',
        'text',
        'Error: API key required',
        true
      );

      expect(help1).toContain('ANTHROPIC_API_KEY');
      expect(help2).toContain('ANTHROPIC_API_KEY');
    });
  });
}); 