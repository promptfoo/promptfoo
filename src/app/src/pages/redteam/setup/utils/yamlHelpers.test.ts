import { describe, it, expect } from 'vitest';
import { generateOrderedYaml } from './yamlHelpers';
import type { Config } from '../types';

describe('generateOrderedYaml', () => {
  const baseConfig: Config = {
    description: 'Test Config',
    prompts: ['{{prompt}}'],
    target: {
      id: 'http',
      config: {
        url: 'https://example.com',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { message: '{{prompt}}' },
      },
    },
    plugins: ['pii'],
    strategies: ['basic'],
    applicationDefinition: {
      purpose: 'Test purpose',
    },
    entities: [],
    numTests: 5,
  };

  it('removes empty string values from the YAML output', () => {
    const config: Config = {
      ...baseConfig,
      purpose: 'Test purpose',
      applicationDefinition: {
        purpose: 'Test purpose',
        features: '', // Empty - should be removed
        redteamUser: '', // Empty - should be removed
      },
    };

    const yaml = generateOrderedYaml(config);

    // Should have purpose
    expect(yaml).toContain('purpose:');
    // Should NOT have empty strings serialized
    expect(yaml).not.toContain("features: ''");
    expect(yaml).not.toContain('features:');
    expect(yaml).not.toContain("redteamUser: ''");
  });

  it('removes empty arrays from the YAML output', () => {
    const config: Config = {
      ...baseConfig,
      purpose: 'Test purpose',
      entities: [], // Empty array - should be removed
      extensions: [], // Empty array - should be removed
    };

    const yaml = generateOrderedYaml(config);

    // Should NOT have empty arrays
    expect(yaml).not.toContain('entities: []');
    expect(yaml).not.toContain('extensions: []');
  });

  it('removes empty objects from the YAML output', () => {
    const config: Config = {
      ...baseConfig,
      purpose: 'Test purpose',
      defaultTest: {
        vars: {}, // Empty object - should be removed
      },
    };

    const yaml = generateOrderedYaml(config);

    // Should NOT have empty vars object as a standalone empty object
    expect(yaml).not.toContain('vars: {}');
  });

  it('preserves non-empty values', () => {
    const config: Config = {
      ...baseConfig,
      purpose: 'Test purpose with content',
      entities: ['entity1', 'entity2'],
    };

    const yaml = generateOrderedYaml(config);

    expect(yaml).toContain('purpose:');
    expect(yaml).toContain('Test purpose with content');
    expect(yaml).toContain('entities:');
    expect(yaml).toContain('entity1');
    expect(yaml).toContain('entity2');
  });

  it('preserves meaningful falsy values like 0 and false', () => {
    const config: Config = {
      ...baseConfig,
      purpose: 'Test',
      numTests: 0, // Should be preserved
      maxConcurrency: 0, // Should be preserved
    };

    const yaml = generateOrderedYaml(config);

    // 0 values should be preserved
    expect(yaml).toContain('numTests: 0');
  });

  it('handles nested empty values correctly', () => {
    const config: Config = {
      ...baseConfig,
      purpose: 'Test',
      target: {
        id: 'http',
        config: {
          url: 'https://example.com',
          method: 'POST',
          headers: {}, // Empty - should be removed
          body: { message: '{{prompt}}' },
        },
      },
    };

    const yaml = generateOrderedYaml(config);

    // Should have url and method
    expect(yaml).toContain('url:');
    expect(yaml).toContain('method:');
    // Empty headers should be removed
    expect(yaml).not.toContain('headers: {}');
  });

  it('generates valid YAML with schema comment', () => {
    const config: Config = {
      ...baseConfig,
      purpose: 'Test',
    };

    const yaml = generateOrderedYaml(config);

    // Should start with schema comment
    expect(yaml).toMatch(/^# yaml-language-server: \$schema=/);
  });
});
