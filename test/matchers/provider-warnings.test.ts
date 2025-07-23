import { getApiKeyErrorHelp } from '../../src/matchers';
import { getEnvString } from '../../src/envars';
import { providerMetadataRegistry } from '../../src/providers/providerMetadataRegistry';

jest.mock('../../src/envars');

describe('Provider Warning System - getApiKeyErrorHelp', () => {
  let mockGetEnvString: jest.MockedFunction<typeof getEnvString>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEnvString = getEnvString as jest.MockedFunction<typeof getEnvString>;
    mockGetEnvString.mockReturnValue('');  // Return empty string instead of undefined
    
    // Save original env
    originalEnv = process.env;
    
    // Clear and re-register providers for testing
    providerMetadataRegistry.clear();
    
    // Register test providers
    providerMetadataRegistry.register('openai', {
      id: 'openai',
      name: 'OpenAI',
      supportedOperations: ['text', 'embedding', 'moderation'],
      authentication: {
        required: true,
        envVars: ['OPENAI_API_KEY'],
        helpText: 'To use OpenAI providers, set your API key:\n  export OPENAI_API_KEY=your-api-key\n\nOr add it to your provider config:\n  apiKey: your-api-key',
      },
      exampleConfigs: {
        embedding: 'openai:embedding:text-embedding-3-large',
        text: 'openai:gpt-4o',
      },
      documentation: {
        url: 'https://promptfoo.dev/docs/providers/openai/',
      },
    });

    providerMetadataRegistry.register('azure', {
      id: 'azure',
      name: 'Azure OpenAI',
      supportedOperations: ['text', 'embedding', 'moderation'],
      authentication: {
        required: true,
        envVars: ['AZURE_API_KEY', 'AZURE_CLIENT_ID'],
        alternativeAuth: ['Azure CLI', 'Client credentials'],
        helpText: 'To use Azure OpenAI:\n\nOption 1: Set API Key\n  export AZURE_API_KEY=your-api-key\n  export AZURE_API_HOST=https://your-resource.openai.azure.com\n\nOption 2: Use client credentials\n  export AZURE_CLIENT_ID=your-client-id\n  export AZURE_CLIENT_SECRET=your-client-secret\n  export AZURE_TENANT_ID=your-tenant-id\n\nOption 3: Use Azure CLI\n  az login',
      },
      exampleConfigs: {
        embedding: 'azure:embedding:<your-deployment-name>',
        text: 'azure:chat:<your-deployment-name>',
      },
      documentation: {
        url: 'https://promptfoo.dev/docs/providers/azure/',
        notes: 'Also ensure your deployment name and apiHost are correct in the provider config.',
      },
    });

    providerMetadataRegistry.register('voyage', {
      id: 'voyage',
      name: 'Voyage AI',
      supportedOperations: ['embedding'],
      authentication: {
        required: true,
        envVars: ['VOYAGE_API_KEY'],
        helpText: 'To use Voyage embeddings, set your API key:\n  export VOYAGE_API_KEY=your-api-key',
      },
      exampleConfigs: {
        embedding: 'voyage:voyage-3',
      },
    });

    providerMetadataRegistry.register('cohere', {
      id: 'cohere',
      name: 'Cohere',
      supportedOperations: ['text', 'embedding'],
      authentication: {
        required: true,
        envVars: ['COHERE_API_KEY'],
        helpText: 'To use Cohere providers, set your API key:\n  export COHERE_API_KEY=your-api-key',
      },
      exampleConfigs: {
        embedding: 'cohere:embed-english-v3.0',
      },
    });

    providerMetadataRegistry.register('anthropic', {
      id: 'anthropic',
      name: 'Anthropic',
      supportedOperations: ['text'],
      authentication: {
        required: true,
        envVars: ['ANTHROPIC_API_KEY'],
        helpText: 'To use Anthropic providers, set your API key:\n  export ANTHROPIC_API_KEY=your-api-key',
      },
      exampleConfigs: {
        text: 'anthropic:claude-3-opus',
      },
    });

    providerMetadataRegistry.register('vertex', {
      id: 'vertex',
      name: 'Google Vertex AI',
      supportedOperations: ['text', 'embedding'],
      authentication: {
        required: true,
        envVars: ['VERTEX_PROJECT_ID', 'GOOGLE_APPLICATION_CREDENTIALS'],
        alternativeAuth: ['Google Cloud SDK'],
        helpText: 'To use Vertex AI:\n\n1. Set up Google Cloud authentication:\n  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json\n  export VERTEX_PROJECT_ID=your-project-id\n  export VERTEX_REGION=us-central1  # optional\n\n2. Or use Google Cloud SDK:\n  gcloud auth application-default login',
      },
      exampleConfigs: {
        embedding: 'vertex:embedding:text-embedding',
      },
    });
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
    providerMetadataRegistry.clear();
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
      // Mock process.env directly for the registry check
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        AZURE_API_KEY: 'azure-key',
        VOYAGE_API_KEY: 'voyage-key',
      };

      const help = getApiKeyErrorHelp(
        'openai:embedding:text-embedding-3-large',
        'embedding',
        'Error: OpenAI API key must be set',
        false
      );

      expect(help).toContain('It looks like you have credentials for: Azure OpenAI, Voyage AI');
      expect(help).toContain('azure:embedding:<your-deployment-name>');
      expect(help).toContain('voyage:voyage-3');

      // Restore original env
      process.env = originalEnv;
    });

    it('should not suggest alternatives when none are available', () => {
      // Clear all env vars for this test
      process.env = {};
      mockGetEnvString.mockReturnValue('');  // Return empty string instead of undefined

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
      // Mock process.env for registry check
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        AZURE_API_KEY: 'azure-key',
        ANTHROPIC_API_KEY: 'anthropic-key',
        VOYAGE_API_KEY: 'voyage-key',
        COHERE_API_KEY: 'cohere-key',
      };

      const help = getApiKeyErrorHelp(
        'openai:embedding:text-embedding-3-large',
        'embedding',
        'Error: OpenAI API key must be set',
        false
      );

      expect(help).toContain('Azure OpenAI');
      expect(help).toContain('Voyage AI');
      expect(help).toContain('Cohere');

      // Restore original env
      process.env = originalEnv;
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
        'azure:deployment',
        'text',
        'Error: API key required',
        true
      );

      expect(help).toContain('To use Azure OpenAI');
      expect(help).not.toContain('To use OpenAI embeddings');
    });

    it('should handle providers with multiple name patterns', () => {
      // Clear env vars for this test
      process.env = {};
      
      // Register claude alias
      providerMetadataRegistry.register('claude', {
        id: 'claude',
        name: 'Anthropic Claude',
        supportedOperations: ['text'],
        authentication: {
          required: true,
          envVars: ['ANTHROPIC_API_KEY'],
          helpText: 'To use Claude models, set your Anthropic API key:\n  export ANTHROPIC_API_KEY=your-api-key',
        },
        exampleConfigs: {
          text: 'claude-3-opus',
        },
      });

      // Test registered provider
      const help1 = getApiKeyErrorHelp(
        'anthropic:claude-3',
        'text',
        'Error: API key required',
        true  // This should be explicitly configured
      );

      // Test registered alias
      const help2 = getApiKeyErrorHelp(
        'claude:claude-3-opus',
        'text',
        'Error: API key required',
        true  // This should be explicitly configured
      );

      // Test unregistered provider (should get generic help)
      const help3 = getApiKeyErrorHelp(
        'unknown-provider',
        'text',
        'Error: API key required',
        true
      );

      expect(help1).toContain('ANTHROPIC_API_KEY');
      expect(help2).toContain('ANTHROPIC_API_KEY');
      expect(help3).toContain('Please check your provider configuration');
      expect(help3).not.toContain('ANTHROPIC_API_KEY');
    });
  });
}); 