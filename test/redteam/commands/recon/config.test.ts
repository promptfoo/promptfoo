import {
  applicationDefinitionToPurpose,
  buildRedteamConfig,
} from '../../../../src/redteam/commands/recon/config';
import type { ReconResult } from '../../../../src/redteam/commands/recon/types';

describe('applicationDefinitionToPurpose', () => {
  afterEach(() => {
    jest.resetAllMocks();
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
      securityRequirements: 'HIPAA compliance',
    });

    expect(result).toContain('Systems and Data the Application Has Access To:');
    expect(result).toContain('Database, API');
    expect(result).toContain('Systems and Data the Application Should NOT Have Access To:');
    expect(result).toContain('Filesystem');
    expect(result).toContain('Security and Compliance Requirements:');
    expect(result).toContain('HIPAA compliance');
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
    jest.resetAllMocks();
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

  it('should add prompt-injection when tools discovered', () => {
    const result: ReconResult = {
      purpose: 'Test',
      discoveredTools: [{ name: 'search', description: 'Search function' }],
    };
    const config = buildRedteamConfig(result);

    expect(config.redteam?.plugins).toContain('prompt-injection');
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

  it('should include default strategies', () => {
    const result: ReconResult = { purpose: 'Test' };
    const config = buildRedteamConfig(result);

    expect(config.redteam?.strategies).toContain('basic');
    expect(config.redteam?.strategies).toContain('jailbreak');
    expect(config.redteam?.strategies).toContain('prompt-injection');
  });
});
