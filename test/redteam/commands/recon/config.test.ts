import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applicationDefinitionToPurpose,
  buildApplicationDefinition,
  buildReconDetails,
  buildReconMetadata,
  buildRedteamConfig,
  filterValidPlugins,
  isValidPlugin,
  SUGGESTED_PLUGIN_LIST,
} from '../../../../src/redteam/commands/recon/config';
import { isValueMeaningful } from '../../../../src/validators/recon-constants';

import type { ReconResult } from '../../../../src/redteam/commands/recon/types';

// Mock logger to suppress expected warnings during tests
vi.mock('../../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('applicationDefinitionToPurpose', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should generate empty string for empty result', () => {
    const result = applicationDefinitionToPurpose({ purpose: '' });
    expect(result).toBe('');
  });

  it('should format purpose field correctly', () => {
    const result = applicationDefinitionToPurpose({
      purpose: 'Test application for demos',
    });
    expect(result).toBe('Application Purpose:\n```\nTest application for demos\n```');
  });

  it('should include all fields in correct order', () => {
    const result = applicationDefinitionToPurpose({
      purpose: 'Purpose text',
      features: 'Feature text',
      industry: 'Industry text',
    });

    expect(result).toContain('Application Purpose:');
    expect(result).toContain('Key Features and Capabilities:');
    expect(result).toContain('Industry/Domain:');

    // Verify order
    const purposeIndex = result.indexOf('Application Purpose:');
    const featuresIndex = result.indexOf('Key Features');
    const industryIndex = result.indexOf('Industry/Domain:');

    expect(purposeIndex).toBeLessThan(featuresIndex);
    expect(featuresIndex).toBeLessThan(industryIndex);
  });

  it('should include security-related fields', () => {
    const result = applicationDefinitionToPurpose({
      purpose: 'Test',
      hasAccessTo: 'Database, API',
      doesNotHaveAccessTo: 'Filesystem',
    });

    expect(result).toContain('Systems and Data the Application Has Access To:');
    expect(result).toContain('Database, API');
    expect(result).toContain('Systems and Data the Application Should NOT Have Access To:');
    expect(result).toContain('Filesystem');
  });

  it('should skip placeholder values like "not specified"', () => {
    const result = applicationDefinitionToPurpose({
      purpose: 'Test purpose',
      features: 'Not specified',
      industry: 'Healthcare',
      competitors: 'None mentioned',
      forbiddenTopics: 'Not applicable',
    });

    expect(result).toContain('Application Purpose:');
    expect(result).toContain('Industry/Domain:');
    // These should be skipped because they're placeholders
    expect(result).not.toContain('Key Features');
    expect(result).not.toContain('Competitors');
    expect(result).not.toContain('forbidden');
  });

  it('should skip undefined fields', () => {
    const result = applicationDefinitionToPurpose({
      purpose: 'Test',
      industry: 'Healthcare',
      // features is undefined
    });

    expect(result).toContain('Application Purpose:');
    expect(result).toContain('Industry/Domain:');
    expect(result).not.toContain('Key Features');
  });
});

describe('buildRedteamConfig', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should generate valid config with minimal result', () => {
    const result: ReconResult = { purpose: 'Test application' };
    const config = buildRedteamConfig(result);

    expect(config.description).toContain('Test application');
    expect(config.redteam?.purpose).toContain('Application Purpose:');
    expect(config.providers).toBeDefined();
    expect(config.prompts).toEqual(['{{prompt}}']);
  });

  it('should include suggested plugins', () => {
    const result: ReconResult = {
      purpose: 'Test',
      suggestedPlugins: ['pii:direct', 'sql-injection'],
    };
    const config = buildRedteamConfig(result);

    expect(config.redteam?.plugins).toContainEqual({ id: 'pii:direct' });
    expect(config.redteam?.plugins).toContainEqual({ id: 'sql-injection' });
  });

  it('should add PII plugins when sensitive data detected', () => {
    const result: ReconResult = {
      purpose: 'Test',
      sensitiveDataTypes: 'SSN, credit card numbers',
    };
    const config = buildRedteamConfig(result);

    expect(config.redteam?.plugins).toContainEqual({ id: 'pii:direct' });
    expect(config.redteam?.plugins).toContainEqual({ id: 'pii:session' });
  });

  it('should add SQL injection plugin when database detected', () => {
    const result: ReconResult = {
      purpose: 'Test',
      connectedSystems: 'PostgreSQL database',
    };
    const config = buildRedteamConfig(result);

    expect(config.redteam?.plugins).toContainEqual({ id: 'sql-injection' });
  });

  it('should add SSRF plugin when HTTP calls detected', () => {
    const result: ReconResult = {
      purpose: 'Test',
      connectedSystems: 'External API, webhook service',
    };
    const config = buildRedteamConfig(result);

    expect(config.redteam?.plugins).toContainEqual({ id: 'ssrf' });
  });

  it('should add RBAC plugins when admin users detected', () => {
    const result: ReconResult = {
      purpose: 'Test',
      userTypes: 'Admin users and regular users',
    };
    const config = buildRedteamConfig(result);

    expect(config.redteam?.plugins).toContainEqual({ id: 'rbac' });
    expect(config.redteam?.plugins).toContainEqual({ id: 'bola' });
    expect(config.redteam?.plugins).toContainEqual({ id: 'bfla' });
  });

  it('should add excessive-agency when tools discovered', () => {
    const result: ReconResult = {
      purpose: 'Test',
      discoveredTools: [{ name: 'search', description: 'Search function' }],
    };
    const config = buildRedteamConfig(result);

    expect(config.redteam?.plugins).toContainEqual({ id: 'excessive-agency' });
    expect(config.redteam?.plugins).toContainEqual({ id: 'tool-discovery' });
  });

  it('should include entities when provided', () => {
    const result: ReconResult = {
      purpose: 'Test',
      entities: ['Acme Corp', 'ProductX'],
    };
    const config = buildRedteamConfig(result);

    expect(config.redteam?.entities).toEqual(['Acme Corp', 'ProductX']);
  });

  it('should truncate long description', () => {
    const longPurpose = 'A'.repeat(150);
    const result: ReconResult = { purpose: longPurpose };
    const config = buildRedteamConfig(result);

    expect(config.description!.length).toBeLessThan(150);
    expect(config.description).toContain('...');
  });

  it('should always include harmful content plugins', () => {
    const result: ReconResult = { purpose: 'Test' };
    const config = buildRedteamConfig(result);

    expect(config.redteam?.plugins).toContainEqual({ id: 'harmful:violent-crime' });
    expect(config.redteam?.plugins).toContainEqual({ id: 'harmful:illegal-activities' });
  });

  it('should include only single-turn strategies for stateless apps', () => {
    const result: ReconResult = { purpose: 'Test', stateful: false };
    const config = buildRedteamConfig(result);

    expect(config.redteam?.strategies).toContainEqual({ id: 'basic' });
    const strategies = config.redteam?.strategies as Array<{ id: string; config?: unknown }>;
    const metaStrategy = strategies.find((s) => s.id === 'jailbreak:meta');
    const compositeStrategy = strategies.find((s) => s.id === 'jailbreak:composite');
    // Multi-turn strategies should NOT be included for stateless apps
    const hydraStrategy = strategies.find((s) => s.id === 'jailbreak:hydra');
    const crescendoStrategy = strategies.find((s) => s.id === 'crescendo');

    expect(metaStrategy).toBeDefined();
    expect(compositeStrategy).toBeDefined();
    expect(hydraStrategy).toBeUndefined();
    expect(crescendoStrategy).toBeUndefined();
  });

  it('should include multi-turn strategies for stateful apps', () => {
    const result: ReconResult = { purpose: 'Test', stateful: true };
    const config = buildRedteamConfig(result);

    expect(config.redteam?.strategies).toContainEqual({ id: 'basic' });
    const strategies = config.redteam?.strategies as Array<{ id: string; config?: unknown }>;
    // Single-turn strategies should be included
    const metaStrategy = strategies.find((s) => s.id === 'jailbreak:meta');
    const compositeStrategy = strategies.find((s) => s.id === 'jailbreak:composite');
    // Multi-turn strategies should be included for stateful apps
    const hydraStrategy = strategies.find((s) => s.id === 'jailbreak:hydra');
    const crescendoStrategy = strategies.find((s) => s.id === 'crescendo');
    const goatStrategy = strategies.find((s) => s.id === 'goat');

    expect(metaStrategy).toBeDefined();
    expect(compositeStrategy).toBeDefined();
    expect(hydraStrategy).toBeDefined();
    expect(crescendoStrategy).toBeDefined();
    expect(goatStrategy).toBeDefined();
    expect((hydraStrategy as { config: { maxTurns: number } }).config.maxTurns).toBe(5);
    expect((crescendoStrategy as { config: { maxTurns: number } }).config.maxTurns).toBe(10);
  });

  it('should default to single-turn strategies when stateful is undefined', () => {
    const result: ReconResult = { purpose: 'Test' }; // stateful not set
    const config = buildRedteamConfig(result);

    const strategies = config.redteam?.strategies as Array<{ id: string; config?: unknown }>;
    const hydraStrategy = strategies.find((s) => s.id === 'jailbreak:hydra');

    // Should default to stateless (no multi-turn strategies)
    expect(hydraStrategy).toBeUndefined();
  });

  it('should filter out invalid plugins from suggestions', () => {
    const result: ReconResult = {
      purpose: 'Test',
      suggestedPlugins: ['pii:direct', 'prompt-injection', 'invalid-plugin', 'sql-injection'],
    };
    const config = buildRedteamConfig(result);

    // Valid plugins should be included
    expect(config.redteam?.plugins).toContainEqual({ id: 'pii:direct' });
    expect(config.redteam?.plugins).toContainEqual({ id: 'sql-injection' });
    // prompt-injection is a strategy, not a plugin - should be filtered
    expect(config.redteam?.plugins).not.toContainEqual({ id: 'prompt-injection' });
    // Invalid plugins should be filtered
    expect(config.redteam?.plugins).not.toContainEqual({ id: 'invalid-plugin' });
  });

  it('should configure prompt-extraction with systemPrompt when discovered', () => {
    const result: ReconResult = {
      purpose: 'Test',
      systemPrompt: 'You are a helpful car dealership assistant.',
    };
    const config = buildRedteamConfig(result);

    // Find the prompt-extraction plugin
    const plugins = config.redteam?.plugins as Array<string | { id: string; config?: unknown }>;
    const promptExtractionPlugin = plugins.find(
      (p) => typeof p === 'object' && p.id === 'prompt-extraction',
    );

    expect(promptExtractionPlugin).toBeDefined();
    expect(
      (promptExtractionPlugin as { config: { systemPrompt: string } }).config.systemPrompt,
    ).toBe('You are a helpful car dealership assistant.');
  });

  it('should use object without config for prompt-extraction when no systemPrompt', () => {
    const result: ReconResult = {
      purpose: 'Test',
      // systemPrompt not provided
    };
    const config = buildRedteamConfig(result);

    // prompt-extraction should be an object without config
    const plugins = config.redteam?.plugins as Array<{ id: string; config?: unknown }>;
    const promptExtractionPlugin = plugins.find((p) => p.id === 'prompt-extraction');
    expect(promptExtractionPlugin).toBeDefined();
    // Should not have systemPrompt config
    expect(promptExtractionPlugin?.config).toBeUndefined();
  });

  it('should skip prompt-extraction config for placeholder systemPrompt', () => {
    const result: ReconResult = {
      purpose: 'Test',
      // Placeholder systemPrompt that should not be used
      systemPrompt:
        'Not provided; the example relies on whatever default instructions the target model already uses.',
    };
    const config = buildRedteamConfig(result);

    // prompt-extraction should not be configured with the placeholder
    const plugins = config.redteam?.plugins as Array<{ id: string; config?: unknown }>;
    const promptExtractionPlugin = plugins.find((p) => p.id === 'prompt-extraction');
    expect(promptExtractionPlugin).toBeDefined();
    // Should not have systemPrompt config (placeholder was ignored)
    expect(promptExtractionPlugin?.config).toBeUndefined();
  });

  it('should infer plugins from security notes', () => {
    const result: ReconResult = {
      purpose: 'Test',
      securityNotes: [
        'Authentication uses plaintext credentials',
        'Payment processing stores card data',
        'Session history persists across turns',
      ],
    };
    const config = buildRedteamConfig(result);

    // Should infer auth-related plugins
    expect(config.redteam?.plugins).toContainEqual({ id: 'rbac' });
    expect(config.redteam?.plugins).toContainEqual({ id: 'bola' });
    expect(config.redteam?.plugins).toContainEqual({ id: 'bfla' });
    // Should infer PII plugins from payment mention
    expect(config.redteam?.plugins).toContainEqual({ id: 'pii:api-db' });
    // Should infer cross-session from session mention
    expect(config.redteam?.plugins).toContainEqual({ id: 'cross-session-leak' });
  });
});

describe('isValidPlugin', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return true for valid base plugins', () => {
    expect(isValidPlugin('contracts')).toBe(true);
    expect(isValidPlugin('hallucination')).toBe(true);
    expect(isValidPlugin('hijacking')).toBe(true);
  });

  it('should return true for valid PII plugins', () => {
    expect(isValidPlugin('pii:direct')).toBe(true);
    expect(isValidPlugin('pii:session')).toBe(true);
    expect(isValidPlugin('pii:api-db')).toBe(true);
  });

  it('should return true for valid harmful plugins', () => {
    expect(isValidPlugin('harmful:violent-crime')).toBe(true);
    expect(isValidPlugin('harmful:hate')).toBe(true);
    expect(isValidPlugin('harmful:self-harm')).toBe(true);
  });

  it('should return true for valid injection plugins', () => {
    expect(isValidPlugin('sql-injection')).toBe(true);
    expect(isValidPlugin('shell-injection')).toBe(true);
    expect(isValidPlugin('ssrf')).toBe(true);
  });

  it('should return false for strategies mistaken as plugins', () => {
    // These are strategies, NOT plugins
    expect(isValidPlugin('prompt-injection')).toBe(false);
    expect(isValidPlugin('jailbreak')).toBe(false);
    expect(isValidPlugin('basic')).toBe(false);
  });

  it('should return false for invalid plugin names', () => {
    expect(isValidPlugin('invalid-plugin')).toBe(false);
    expect(isValidPlugin('made-up-plugin')).toBe(false);
    expect(isValidPlugin('')).toBe(false);
  });
});

describe('filterValidPlugins', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return only valid plugins', () => {
    const input = ['pii:direct', 'invalid', 'sql-injection', 'harmful:hate'];
    const result = filterValidPlugins(input);

    expect(result).toContain('pii:direct');
    expect(result).toContain('sql-injection');
    expect(result).toContain('harmful:hate');
    expect(result).not.toContain('invalid');
  });

  it('should skip strategies commonly confused as plugins', () => {
    const input = ['prompt-injection', 'jailbreak', 'basic', 'crescendo', 'goat', 'pii:direct'];
    const result = filterValidPlugins(input);

    expect(result).toEqual(['pii:direct']);
  });

  it('should return empty array for all invalid inputs', () => {
    const input = ['invalid1', 'invalid2', 'prompt-injection'];
    const result = filterValidPlugins(input);

    expect(result).toEqual([]);
  });
});

describe('SUGGESTED_PLUGIN_LIST', () => {
  it('should include major plugin categories', () => {
    expect(SUGGESTED_PLUGIN_LIST).toContain('PII & Privacy');
    expect(SUGGESTED_PLUGIN_LIST).toContain('Injection Attacks');
    expect(SUGGESTED_PLUGIN_LIST).toContain('Prompt Security');
    expect(SUGGESTED_PLUGIN_LIST).toContain('Harmful Content');
  });

  it('should include commonly used plugins', () => {
    expect(SUGGESTED_PLUGIN_LIST).toContain('pii:direct');
    expect(SUGGESTED_PLUGIN_LIST).toContain('sql-injection');
    expect(SUGGESTED_PLUGIN_LIST).toContain('prompt-extraction');
    expect(SUGGESTED_PLUGIN_LIST).toContain('harmful:violent-crime');
  });
});

describe('isValueMeaningful', () => {
  it('should return false for undefined', () => {
    expect(isValueMeaningful(undefined)).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isValueMeaningful('')).toBe(false);
    expect(isValueMeaningful('   ')).toBe(false);
  });

  it('should return false for placeholder values', () => {
    expect(isValueMeaningful('none')).toBe(false);
    expect(isValueMeaningful('N/A')).toBe(false);
    expect(isValueMeaningful('NA')).toBe(false);
    expect(isValueMeaningful('Not specified')).toBe(false);
    expect(isValueMeaningful('not mentioned')).toBe(false);
    expect(isValueMeaningful('None mentioned')).toBe(false);
    expect(isValueMeaningful('No formal policies')).toBe(false);
  });

  it('should return true for meaningful values', () => {
    expect(isValueMeaningful('Healthcare')).toBe(true);
    expect(isValueMeaningful('Patient data, SSN, medical records')).toBe(true);
    expect(isValueMeaningful('A medical assistant application')).toBe(true);
  });
});

describe('buildApplicationDefinition', () => {
  it('should copy meaningful fields from ReconResult', () => {
    const result: ReconResult = {
      purpose: 'Test app',
      features: 'Feature A, Feature B',
      industry: 'Healthcare',
    };
    const def = buildApplicationDefinition(result);

    expect(def.purpose).toBe('Test app');
    expect(def.features).toBe('Feature A, Feature B');
    expect(def.industry).toBe('Healthcare');
  });

  it('should skip placeholder values', () => {
    const result: ReconResult = {
      purpose: 'Test app',
      features: 'Not specified',
      industry: 'None mentioned',
    };
    const def = buildApplicationDefinition(result);

    expect(def.purpose).toBe('Test app');
    expect(def.features).toBeUndefined();
    expect(def.industry).toBeUndefined();
  });

  it('should generate hasAccessTo from discoveredTools when missing', () => {
    const result: ReconResult = {
      purpose: 'Test app',
      discoveredTools: [
        { name: 'searchUsers', description: 'Search for users' },
        { name: 'getProfile', description: 'Get user profile' },
      ],
    };
    const def = buildApplicationDefinition(result);

    expect(def.hasAccessTo).toContain('searchUsers');
    expect(def.hasAccessTo).toContain('getProfile');
  });

  it('should not override existing hasAccessTo with discoveredTools', () => {
    const result: ReconResult = {
      purpose: 'Test app',
      hasAccessTo: 'Custom database access',
      discoveredTools: [{ name: 'searchUsers', description: 'Search for users' }],
    };
    const def = buildApplicationDefinition(result);

    expect(def.hasAccessTo).toBe('Custom database access');
    expect(def.hasAccessTo).not.toContain('searchUsers');
  });

  it('should include all applicationDefinition fields when present', () => {
    const result: ReconResult = {
      purpose: 'Medical assistant',
      features: 'Patient lookup, appointment scheduling',
      industry: 'Healthcare',
      systemPrompt: 'You are a medical assistant.',
      hasAccessTo: 'Patient records database',
      doesNotHaveAccessTo: 'Billing system',
      userTypes: 'Doctors, nurses, patients',
      sensitiveDataTypes: 'PHI, SSN, medical history',
      criticalActions: 'Prescribe medication',
      forbiddenTopics: 'Legal advice',
      connectedSystems: 'Epic EHR, lab systems',
    };
    const def = buildApplicationDefinition(result);

    expect(def.purpose).toBe('Medical assistant');
    expect(def.features).toBe('Patient lookup, appointment scheduling');
    expect(def.industry).toBe('Healthcare');
    expect(def.systemPrompt).toBe('You are a medical assistant.');
    expect(def.hasAccessTo).toBe('Patient records database');
    expect(def.doesNotHaveAccessTo).toBe('Billing system');
    expect(def.userTypes).toBe('Doctors, nurses, patients');
    expect(def.sensitiveDataTypes).toBe('PHI, SSN, medical history');
    expect(def.criticalActions).toBe('Prescribe medication');
    expect(def.forbiddenTopics).toBe('Legal advice');
    expect(def.connectedSystems).toBe('Epic EHR, lab systems');
  });
});

describe('buildReconDetails', () => {
  it('should include stateful flag when defined', () => {
    const result: ReconResult = { purpose: 'Test', stateful: true };
    const context = buildReconDetails(result);
    expect(context.stateful).toBe(true);
  });

  it('should include discoveredTools', () => {
    const result: ReconResult = {
      purpose: 'Test',
      discoveredTools: [
        { name: 'search', description: 'Search docs', parameters: '{query: string}' },
        { name: 'fetch', description: 'Fetch data' },
      ],
    };
    const context = buildReconDetails(result);

    expect(context.discoveredTools).toHaveLength(2);
    expect(context.discoveredTools![0]).toEqual({
      name: 'search',
      description: 'Search docs',
      parameters: '{query: string}',
    });
    expect(context.discoveredTools![1]).toEqual({
      name: 'fetch',
      description: 'Fetch data',
      parameters: undefined,
    });
  });

  it('should include securityNotes', () => {
    const result: ReconResult = {
      purpose: 'Test',
      securityNotes: ['Uses plaintext credentials', 'No rate limiting'],
    };
    const context = buildReconDetails(result);

    expect(context.securityNotes).toEqual(['Uses plaintext credentials', 'No rate limiting']);
  });

  it('should include keyFiles', () => {
    const result: ReconResult = {
      purpose: 'Test',
      keyFiles: ['src/agent.ts', 'src/tools.ts'],
    };
    const context = buildReconDetails(result);

    expect(context.keyFiles).toEqual(['src/agent.ts', 'src/tools.ts']);
  });

  it('should include suggestedPlugins', () => {
    const result: ReconResult = {
      purpose: 'Test',
      suggestedPlugins: ['pii:direct', 'sql-injection'],
    };
    const context = buildReconDetails(result);

    expect(context.suggestedPlugins).toEqual(['pii:direct', 'sql-injection']);
  });

  it('should include entities', () => {
    const result: ReconResult = {
      purpose: 'Test',
      entities: ['Acme Corp', 'ProductX'],
    };
    const context = buildReconDetails(result);

    expect(context.entities).toEqual(['Acme Corp', 'ProductX']);
  });

  it('should return empty context for minimal result', () => {
    const result: ReconResult = { purpose: 'Test' };
    const context = buildReconDetails(result);

    expect(context.stateful).toBeUndefined();
    expect(context.discoveredTools).toBeUndefined();
    expect(context.securityNotes).toBeUndefined();
    expect(context.keyFiles).toBeUndefined();
    expect(context.suggestedPlugins).toBeUndefined();
    expect(context.entities).toBeUndefined();
  });
});

describe('buildReconMetadata', () => {
  it('should include version and source', () => {
    const result: ReconResult = { purpose: 'Test' };
    const meta = buildReconMetadata(result, '/path/to/code');

    expect(meta.version).toBe(1);
    expect(meta.source).toBe('recon-cli');
  });

  it('should include scannedDirectory', () => {
    const result: ReconResult = { purpose: 'Test' };
    const meta = buildReconMetadata(result, '/path/to/code');

    expect(meta.scannedDirectory).toBe('/path/to/code');
  });

  it('should include timestamp in ISO format', () => {
    const result: ReconResult = { purpose: 'Test' };
    const meta = buildReconMetadata(result, '/path');

    expect(meta.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should include applicationDefinition', () => {
    const result: ReconResult = {
      purpose: 'Medical app',
      industry: 'Healthcare',
    };
    const meta = buildReconMetadata(result, '/path');

    expect(meta.applicationDefinition.purpose).toBe('Medical app');
    expect(meta.applicationDefinition.industry).toBe('Healthcare');
  });

  it('should include reconDetails', () => {
    const result: ReconResult = {
      purpose: 'Test',
      stateful: true,
      entities: ['Acme'],
    };
    const meta = buildReconMetadata(result, '/path');

    expect(meta.reconDetails.stateful).toBe(true);
    expect(meta.reconDetails.entities).toEqual(['Acme']);
  });
});

describe('buildRedteamConfig with metadata', () => {
  it('should include metadata when scannedDirectory is provided', () => {
    const result: ReconResult = { purpose: 'Test app' };
    const config = buildRedteamConfig(result, '/path/to/code');

    expect(config.metadata).toBeDefined();
    expect(config.metadata?.version).toBe(1);
    expect(config.metadata?.source).toBe('recon-cli');
    expect(config.metadata?.scannedDirectory).toBe('/path/to/code');
    expect(config.metadata?.applicationDefinition?.purpose).toBe('Test app');
  });

  it('should not include metadata when scannedDirectory is not provided', () => {
    const result: ReconResult = { purpose: 'Test app' };
    const config = buildRedteamConfig(result);

    expect(config.metadata).toBeUndefined();
  });

  it('should preserve all existing config functionality with metadata', () => {
    const result: ReconResult = {
      purpose: 'Test app',
      entities: ['Entity1'],
      stateful: true,
    };
    const config = buildRedteamConfig(result, '/path');

    // Verify existing functionality works
    expect(config.description).toContain('Test app');
    expect(config.redteam?.entities).toEqual(['Entity1']);
    expect(config.providers).toBeDefined();
    expect(config.prompts).toEqual(['{{prompt}}']);

    // And metadata is included
    expect(config.metadata).toBeDefined();
    expect(config.metadata?.reconDetails?.stateful).toBe(true);
  });
});
