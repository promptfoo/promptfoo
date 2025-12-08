import { vi } from 'vitest';
import {
  applicationDefinitionToPurpose,
  buildRedteamConfig,
  isValidPlugin,
  filterValidPlugins,
  SUGGESTED_PLUGIN_LIST,
} from '../../../../src/redteam/commands/recon/config';
import type { ReconResult } from '../../../../src/redteam/commands/recon/types';

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

    expect(config.redteam?.plugins).toContain('pii:direct');
    expect(config.redteam?.plugins).toContain('sql-injection');
  });

  it('should add PII plugins when sensitive data detected', () => {
    const result: ReconResult = {
      purpose: 'Test',
      sensitiveDataTypes: 'SSN, credit card numbers',
    };
    const config = buildRedteamConfig(result);

    expect(config.redteam?.plugins).toContain('pii:direct');
    expect(config.redteam?.plugins).toContain('pii:session');
  });

  it('should add SQL injection plugin when database detected', () => {
    const result: ReconResult = {
      purpose: 'Test',
      connectedSystems: 'PostgreSQL database',
    };
    const config = buildRedteamConfig(result);

    expect(config.redteam?.plugins).toContain('sql-injection');
  });

  it('should add SSRF plugin when HTTP calls detected', () => {
    const result: ReconResult = {
      purpose: 'Test',
      connectedSystems: 'External API, webhook service',
    };
    const config = buildRedteamConfig(result);

    expect(config.redteam?.plugins).toContain('ssrf');
  });

  it('should add RBAC plugins when admin users detected', () => {
    const result: ReconResult = {
      purpose: 'Test',
      userTypes: 'Admin users and regular users',
    };
    const config = buildRedteamConfig(result);

    expect(config.redteam?.plugins).toContain('rbac');
    expect(config.redteam?.plugins).toContain('bola');
    expect(config.redteam?.plugins).toContain('bfla');
  });

  it('should add excessive-agency when tools discovered', () => {
    const result: ReconResult = {
      purpose: 'Test',
      discoveredTools: [{ name: 'search', description: 'Search function' }],
    };
    const config = buildRedteamConfig(result);

    expect(config.redteam?.plugins).toContain('excessive-agency');
    expect(config.redteam?.plugins).toContain('tool-discovery');
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

    expect(config.redteam?.plugins).toContain('harmful:violent-crime');
    expect(config.redteam?.plugins).toContain('harmful:illegal-activities');
  });

  it('should include only single-turn strategies for stateless apps', () => {
    const result: ReconResult = { purpose: 'Test', stateful: false };
    const config = buildRedteamConfig(result);

    expect(config.redteam?.strategies).toContain('basic');
    const strategies = config.redteam?.strategies as Array<
      string | { id: string; config?: unknown }
    >;
    const metaStrategy = strategies.find((s) => typeof s === 'object' && s.id === 'jailbreak:meta');
    const compositeStrategy = strategies.find(
      (s) => typeof s === 'object' && s.id === 'jailbreak:composite',
    );
    // Multi-turn strategies should NOT be included for stateless apps
    const hydraStrategy = strategies.find(
      (s) => typeof s === 'object' && s.id === 'jailbreak:hydra',
    );
    const crescendoStrategy = strategies.find((s) => typeof s === 'object' && s.id === 'crescendo');

    expect(metaStrategy).toBeDefined();
    expect(compositeStrategy).toBeDefined();
    expect(hydraStrategy).toBeUndefined();
    expect(crescendoStrategy).toBeUndefined();
  });

  it('should include multi-turn strategies for stateful apps', () => {
    const result: ReconResult = { purpose: 'Test', stateful: true };
    const config = buildRedteamConfig(result);

    expect(config.redteam?.strategies).toContain('basic');
    const strategies = config.redteam?.strategies as Array<
      string | { id: string; config?: unknown }
    >;
    // Single-turn strategies should be included
    const metaStrategy = strategies.find((s) => typeof s === 'object' && s.id === 'jailbreak:meta');
    const compositeStrategy = strategies.find(
      (s) => typeof s === 'object' && s.id === 'jailbreak:composite',
    );
    // Multi-turn strategies should be included for stateful apps
    const hydraStrategy = strategies.find(
      (s) => typeof s === 'object' && s.id === 'jailbreak:hydra',
    );
    const crescendoStrategy = strategies.find((s) => typeof s === 'object' && s.id === 'crescendo');
    const goatStrategy = strategies.find((s) => typeof s === 'object' && s.id === 'goat');

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

    const strategies = config.redteam?.strategies as Array<
      string | { id: string; config?: unknown }
    >;
    const hydraStrategy = strategies.find(
      (s) => typeof s === 'object' && s.id === 'jailbreak:hydra',
    );

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
    expect(config.redteam?.plugins).toContain('pii:direct');
    expect(config.redteam?.plugins).toContain('sql-injection');
    // prompt-injection is a strategy, not a plugin - should be filtered
    expect(config.redteam?.plugins).not.toContain('prompt-injection');
    // Invalid plugins should be filtered
    expect(config.redteam?.plugins).not.toContain('invalid-plugin');
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

  it('should use simple string for prompt-extraction when no systemPrompt', () => {
    const result: ReconResult = {
      purpose: 'Test',
      // systemPrompt not provided
    };
    const config = buildRedteamConfig(result);

    // prompt-extraction should be a simple string, not an object
    expect(config.redteam?.plugins).toContain('prompt-extraction');
    // Verify it's not an object
    const plugins = config.redteam?.plugins as Array<string | { id: string; config?: unknown }>;
    const promptExtractionObject = plugins.find(
      (p) => typeof p === 'object' && p.id === 'prompt-extraction',
    );
    expect(promptExtractionObject).toBeUndefined();
  });

  it('should skip prompt-extraction config for placeholder systemPrompt', () => {
    const result: ReconResult = {
      purpose: 'Test',
      // Placeholder systemPrompt that should not be used
      systemPrompt:
        'Not provided; the example relies on whatever default instructions the target model already uses.',
    };
    const config = buildRedteamConfig(result);

    // prompt-extraction should be a simple string, not configured with the placeholder
    expect(config.redteam?.plugins).toContain('prompt-extraction');
    const plugins = config.redteam?.plugins as Array<string | { id: string; config?: unknown }>;
    const promptExtractionObject = plugins.find(
      (p) => typeof p === 'object' && p.id === 'prompt-extraction',
    );
    expect(promptExtractionObject).toBeUndefined();
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
    expect(config.redteam?.plugins).toContain('rbac');
    expect(config.redteam?.plugins).toContain('bola');
    expect(config.redteam?.plugins).toContain('bfla');
    // Should infer PII plugins from payment mention
    expect(config.redteam?.plugins).toContain('pii:api-db');
    // Should infer cross-session from session mention
    expect(config.redteam?.plugins).toContain('cross-session-leak');
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
