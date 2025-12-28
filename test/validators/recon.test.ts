import { describe, it, expect } from 'vitest';
import {
  DiscoveredToolSchema,
  ApplicationDefinitionSchema,
  ReconResultSchema,
  ReconContextSchema,
  PendingReconMetadataSchema,
  PendingReconConfigSchema,
  GetPendingReconResponseSchema,
  DeletePendingReconResponseSchema,
  ReconErrorResponseSchema,
  type DiscoveredTool,
  type ApplicationDefinition,
  type ReconResult,
  type ReconContext,
  type PendingReconConfig,
  type GetPendingReconResponse,
  type DeletePendingReconResponse,
  type ReconErrorResponse,
} from '../../src/validators/recon';

describe('DiscoveredToolSchema', () => {
  it('should validate a complete tool', () => {
    const tool: DiscoveredTool = {
      name: 'searchDatabase',
      description: 'Searches the user database',
      file: 'src/tools/database.ts',
      parameters: '{ query: string, limit?: number }',
    };
    const result = DiscoveredToolSchema.safeParse(tool);
    expect(result.success).toBe(true);
  });

  it('should validate a minimal tool', () => {
    const tool = {
      name: 'getTool',
      description: 'Gets something',
    };
    const result = DiscoveredToolSchema.safeParse(tool);
    expect(result.success).toBe(true);
  });

  it('should reject tool without name', () => {
    const tool = {
      description: 'Does something',
    };
    const result = DiscoveredToolSchema.safeParse(tool);
    expect(result.success).toBe(false);
  });

  it('should reject tool with empty name', () => {
    const tool = {
      name: '',
      description: 'Does something',
    };
    const result = DiscoveredToolSchema.safeParse(tool);
    expect(result.success).toBe(false);
  });
});

describe('ApplicationDefinitionSchema', () => {
  it('should validate complete application definition', () => {
    const appDef: ApplicationDefinition = {
      purpose: 'Customer support chatbot',
      features: 'Order tracking, refund processing, FAQ handling',
      industry: 'E-commerce',
      systemPrompt: 'You are a helpful customer support agent...',
      hasAccessTo: 'Order database, user profiles',
      doesNotHaveAccessTo: 'Payment details, admin functions',
      userTypes: 'Customers, support agents',
      securityRequirements: 'PCI-DSS compliance',
      sensitiveDataTypes: 'Email, phone numbers',
      exampleIdentifiers: 'order_123, user@example.com',
      criticalActions: 'Process refunds, cancel orders',
      forbiddenTopics: 'Competitor products, internal policies',
      attackConstraints: 'No financial advice',
      competitors: 'CompanyX, CompanyY',
      connectedSystems: 'Shopify, Stripe',
      redteamUser: 'Disgruntled customer',
    };
    const result = ApplicationDefinitionSchema.safeParse(appDef);
    expect(result.success).toBe(true);
  });

  it('should validate minimal application definition', () => {
    const appDef = {
      purpose: 'General AI assistant',
    };
    const result = ApplicationDefinitionSchema.safeParse(appDef);
    expect(result.success).toBe(true);
  });

  it('should accept application definition without purpose (optional field)', () => {
    const appDef = {
      features: 'Some features',
    };
    const result = ApplicationDefinitionSchema.safeParse(appDef);
    expect(result.success).toBe(true);
  });

  it('should accept empty application definition (all fields optional)', () => {
    const appDef = {};
    const result = ApplicationDefinitionSchema.safeParse(appDef);
    expect(result.success).toBe(true);
  });

  it('should validate UI-specific fields', () => {
    const appDef: ApplicationDefinition = {
      purpose: 'Test app',
      accessToData: 'User profiles, order history',
      forbiddenData: 'Payment card numbers',
      accessToActions: 'View orders, update profile',
      forbiddenActions: 'Delete accounts, modify billing',
    };
    const result = ApplicationDefinitionSchema.safeParse(appDef);
    expect(result.success).toBe(true);
  });
});

describe('ReconResultSchema', () => {
  it('should validate complete recon result', () => {
    const result: ReconResult = {
      purpose: 'AI assistant for financial planning',
      features: 'Budget tracking, investment advice',
      industry: 'FinTech',
      entities: ['Acme Corp', 'Product X'],
      discoveredTools: [
        { name: 'getBalance', description: 'Gets account balance' },
        { name: 'transferFunds', description: 'Transfers money', file: 'src/banking.ts' },
      ],
      suggestedPlugins: ['pii', 'excessive-agency', 'ssrf'],
      securityNotes: ['Handles PII data', 'Makes HTTP calls to external APIs'],
      keyFiles: ['src/main.ts', 'src/api/banking.ts'],
      stateful: true,
    };
    const parsed = ReconResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('should validate minimal recon result', () => {
    const result = {
      purpose: 'Simple chatbot',
    };
    const parsed = ReconResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('should validate recon result with stateful false', () => {
    const result = {
      purpose: 'Stateless API helper',
      stateful: false,
    };
    const parsed = ReconResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});

describe('ReconContextSchema', () => {
  it('should validate recon-cli context', () => {
    const context: ReconContext = {
      source: 'recon-cli',
      timestamp: Date.now(),
      codebaseDirectory: '/Users/test/projects/my-app',
      filesAnalyzed: 42,
      fieldsPopulated: 8,
    };
    const result = ReconContextSchema.safeParse(context);
    expect(result.success).toBe(true);
  });

  it('should validate in-app-recon context', () => {
    const context: ReconContext = {
      source: 'in-app-recon',
      timestamp: Date.now(),
    };
    const result = ReconContextSchema.safeParse(context);
    expect(result.success).toBe(true);
  });

  it('should reject invalid source', () => {
    const context = {
      source: 'unknown-source',
      timestamp: Date.now(),
    };
    const result = ReconContextSchema.safeParse(context);
    expect(result.success).toBe(false);
  });

  it('should reject negative timestamp', () => {
    const context = {
      source: 'recon-cli',
      timestamp: -1,
    };
    const result = ReconContextSchema.safeParse(context);
    expect(result.success).toBe(false);
  });

  it('should reject negative filesAnalyzed', () => {
    const context = {
      source: 'recon-cli',
      timestamp: Date.now(),
      filesAnalyzed: -5,
    };
    const result = ReconContextSchema.safeParse(context);
    expect(result.success).toBe(false);
  });
});

describe('PendingReconMetadataSchema', () => {
  it('should validate complete metadata', () => {
    const metadata = {
      source: 'recon-cli' as const,
      timestamp: Date.now(),
      codebaseDirectory: '/path/to/project',
      filesAnalyzed: 100,
      applicationDefinition: {
        purpose: 'Test app',
        features: 'Feature 1, Feature 2',
      },
      reconContext: {
        stateful: true,
        entities: ['Entity1'],
        discoveredTools: [{ name: 'tool1', description: 'A tool' }],
        securityNotes: ['Note 1'],
        keyFiles: ['file1.ts'],
        suggestedPlugins: ['plugin1'],
      },
    };
    const result = PendingReconMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('should validate minimal metadata', () => {
    const metadata = {
      source: 'recon-cli' as const,
      timestamp: Date.now(),
    };
    const result = PendingReconMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('should reject non-recon-cli source', () => {
    const metadata = {
      source: 'in-app-recon',
      timestamp: Date.now(),
    };
    const result = PendingReconMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(false);
  });
});

describe('PendingReconConfigSchema', () => {
  it('should validate complete pending config', () => {
    const config: PendingReconConfig = {
      config: {
        description: 'Red team configuration for my app',
        redteam: {
          purpose: 'Testing customer support bot',
          plugins: ['pii', 'excessive-agency', { id: 'custom-plugin', config: {} }],
          strategies: ['jailbreak', 'prompt-injection'],
          entities: ['Acme Corp'],
          numTests: 5,
        },
      },
      metadata: {
        source: 'recon-cli',
        timestamp: Date.now(),
        codebaseDirectory: '/path/to/app',
        filesAnalyzed: 50,
      },
      reconResult: {
        purpose: 'Customer support bot',
        stateful: true,
        suggestedPlugins: ['pii'],
      },
    };
    const result = PendingReconConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should validate minimal pending config', () => {
    const config = {
      config: {},
      metadata: {
        source: 'recon-cli' as const,
        timestamp: Date.now(),
      },
    };
    const result = PendingReconConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should reject config without metadata', () => {
    const config = {
      config: {},
    };
    const result = PendingReconConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe('GetPendingReconResponseSchema', () => {
  it('should validate as alias for PendingReconConfigSchema', () => {
    const response: GetPendingReconResponse = {
      config: {
        description: 'Test config',
      },
      metadata: {
        source: 'recon-cli',
        timestamp: Date.now(),
      },
    };
    const result = GetPendingReconResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });
});

describe('DeletePendingReconResponseSchema', () => {
  it('should validate success response', () => {
    const response: DeletePendingReconResponse = {
      success: true,
    };
    const result = DeletePendingReconResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it('should reject response with success: false', () => {
    const response = {
      success: false,
    };
    const result = DeletePendingReconResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });
});

describe('ReconErrorResponseSchema', () => {
  it('should validate error with details', () => {
    const error: ReconErrorResponse = {
      error: 'Something went wrong',
      details: 'Additional information about the error',
    };
    const result = ReconErrorResponseSchema.safeParse(error);
    expect(result.success).toBe(true);
  });

  it('should validate error without details', () => {
    const error: ReconErrorResponse = {
      error: 'Simple error message',
    };
    const result = ReconErrorResponseSchema.safeParse(error);
    expect(result.success).toBe(true);
  });

  it('should reject response without error field', () => {
    const error = {
      details: 'Only details, no error',
    };
    const result = ReconErrorResponseSchema.safeParse(error);
    expect(result.success).toBe(false);
  });
});

describe('Type inference', () => {
  it('should correctly infer DiscoveredTool type', () => {
    const tool: DiscoveredTool = {
      name: 'test',
      description: 'test description',
    };
    // TypeScript compilation is the test - if it compiles, types are correct
    expect(tool.name).toBe('test');
  });

  it('should correctly infer ApplicationDefinition type', () => {
    const appDef: ApplicationDefinition = {
      purpose: 'test purpose',
    };
    expect(appDef.purpose).toBe('test purpose');
  });

  it('should correctly infer ReconResult type', () => {
    const result: ReconResult = {
      purpose: 'test',
      stateful: true,
      entities: ['entity1'],
    };
    expect(result.stateful).toBe(true);
  });

  it('should correctly infer ReconContext type', () => {
    const context: ReconContext = {
      source: 'recon-cli',
      timestamp: 12345,
    };
    expect(context.source).toBe('recon-cli');
  });

  it('should correctly infer PendingReconConfig type', () => {
    const config: PendingReconConfig = {
      config: {},
      metadata: {
        source: 'recon-cli',
        timestamp: Date.now(),
      },
    };
    expect(config.metadata.source).toBe('recon-cli');
  });
});

describe('Edge cases', () => {
  it('should handle empty arrays in ReconResult', () => {
    const result: ReconResult = {
      purpose: 'test',
      entities: [],
      discoveredTools: [],
      suggestedPlugins: [],
      securityNotes: [],
      keyFiles: [],
    };
    const parsed = ReconResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('should handle very long strings', () => {
    const longString = 'a'.repeat(10000);
    const result = {
      purpose: longString,
    };
    const parsed = ApplicationDefinitionSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('should handle special characters in strings', () => {
    const result = {
      purpose: 'Test with special chars: <>&"\'\\n\\t',
      features: 'Unicode: 日本語 🎉 émojis',
    };
    const parsed = ApplicationDefinitionSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('should handle null values where undefined is expected', () => {
    const result = {
      purpose: 'test',
      features: null,
    };
    // Zod treats null and undefined differently
    const parsed = ApplicationDefinitionSchema.safeParse(result);
    expect(parsed.success).toBe(false);
  });

  it('should passthrough extra fields in config block', () => {
    const config = {
      config: {
        description: 'Test',
        customField: 'custom value',
        anotherField: { nested: true },
      },
      metadata: {
        source: 'recon-cli' as const,
        timestamp: Date.now(),
      },
    };
    const parsed = PendingReconConfigSchema.safeParse(config);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data.config as any).customField).toBe('custom value');
    }
  });
});
