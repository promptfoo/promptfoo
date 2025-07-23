import type { ProviderMetadata, ProviderType } from '../types/providers';

/**
 * Registry for provider metadata
 * Providers can register their metadata here to provide information about
 * authentication requirements, supported operations, and example configurations
 */
class ProviderMetadataRegistry {
  private metadata: Map<string, ProviderMetadata> = new Map();

  /**
   * Register provider metadata
   * @param providerId Provider ID pattern (e.g., 'openai', 'azure', 'anthropic:*')
   * @param metadata Provider metadata
   */
  register(providerId: string, metadata: ProviderMetadata) {
    this.metadata.set(providerId, metadata);
  }

  /**
   * Get metadata for a specific provider
   * @param providerId Full provider ID (e.g., 'openai:gpt-4', 'azure:deployment')
   * @returns Provider metadata if found
   */
  get(providerId: string): ProviderMetadata | undefined {
    // First try exact match
    if (this.metadata.has(providerId)) {
      return this.metadata.get(providerId);
    }

    // Then try prefix match (e.g., 'openai:gpt-4' matches 'openai')
    const prefix = providerId.split(':')[0];
    if (this.metadata.has(prefix)) {
      return this.metadata.get(prefix);
    }

    // Try wildcard patterns (e.g., 'anthropic:*' matches 'anthropic:claude-3')
    for (const [pattern, metadata] of this.metadata.entries()) {
      if (pattern.endsWith(':*')) {
        const patternPrefix = pattern.slice(0, -2);
        if (providerId.startsWith(patternPrefix + ':')) {
          return metadata;
        }
      }
    }

    return undefined;
  }

  /**
   * Get all registered metadata
   */
  getAll(): Map<string, ProviderMetadata> {
    return new Map(this.metadata);
  }

  /**
   * Find providers that support a specific operation
   * @param operation Operation type to search for
   * @returns Array of provider IDs that support the operation
   */
  findByOperation(operation: ProviderType): string[] {
    const providers: string[] = [];
    for (const [id, metadata] of this.metadata.entries()) {
      if (metadata.supportedOperations.includes(operation)) {
        providers.push(id);
      }
    }
    return providers;
  }

  /**
   * Get available credentials for alternative providers
   * @param excludeProvider Provider to exclude from suggestions
   * @param operation Operation type needed
   * @returns Map of provider ID to available environment variables
   */
  getAvailableAlternatives(
    excludeProvider: string,
    operation: ProviderType
  ): Map<string, string[]> {
    const alternatives = new Map<string, string[]>();
    
    for (const [id, metadata] of this.metadata.entries()) {
      // Skip the excluded provider and providers that don't support the operation
      if (id === excludeProvider || !metadata.supportedOperations.includes(operation)) {
        continue;
      }

      // Check if any required environment variables are set
      const availableEnvVars = metadata.authentication.envVars?.filter(envVar => 
        process.env[envVar] !== undefined
      ) || [];

      if (availableEnvVars.length > 0) {
        alternatives.set(id, availableEnvVars);
      }
    }

    return alternatives;
  }

  /**
   * Clear all registered metadata (useful for testing)
   */
  clear() {
    this.metadata.clear();
  }
}

// Export singleton instance
export const providerMetadataRegistry = new ProviderMetadataRegistry();

// Register built-in provider metadata
// This will be called when providers are loaded
export function registerBuiltInProviders() {
  // OpenAI
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
      moderation: 'openai:moderation:omni-moderation-latest',
    },
    documentation: {
      url: 'https://promptfoo.dev/docs/providers/openai/',
    },
  });

  // Azure OpenAI
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

  // Anthropic
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
      text: 'anthropic:claude-3-5-sonnet-20241022',
    },
    documentation: {
      url: 'https://promptfoo.dev/docs/providers/anthropic/',
    },
  });

  // Also register with claude prefix for compatibility
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
      text: 'claude-3-5-sonnet-20241022',
    },
    documentation: {
      url: 'https://promptfoo.dev/docs/providers/anthropic/',
    },
  });

  // Voyage
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
    documentation: {
      url: 'https://promptfoo.dev/docs/providers/voyage/',
    },
  });

  // Cohere
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
      text: 'cohere:command-r-plus',
    },
    documentation: {
      url: 'https://promptfoo.dev/docs/providers/cohere/',
    },
  });

  // Google Vertex
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
      embedding: 'vertex:embedding:text-embedding-005',
      text: 'vertex:gemini-2.0-flash-exp',
    },
    documentation: {
      url: 'https://promptfoo.dev/docs/providers/vertex/',
    },
  });

  // Add more providers as needed...
} 