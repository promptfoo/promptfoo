import { describe, it, expect } from '@jest/globals';
import yaml from 'js-yaml';
import { renderRedteamConfig } from '../../../src/redteam/commands/init';
import type { RedteamFileConfig } from '../../../src/redteam/types';

describe('renderRedteamConfig', () => {
  it('should generate valid YAML that conforms to RedteamFileConfig', () => {
    const input = {
      purpose: 'Test chatbot security',
      numTests: 5,
      plugins: [{ id: 'rbac', numTests: 2 }],
      strategies: ['math-prompt'] as const, // Fix: type assertion
      prompts: ['Hello {{prompt}}'],
      providers: ['openai:gpt-4'],
      descriptions: {
        'math-prompt': 'Basic prompt injection test',
        rbac: 'Basic RBAC test',
      },
    };

    const renderedConfig = renderRedteamConfig(input);
    expect(renderedConfig).toBeDefined();

    const parsedConfig = yaml.load(renderedConfig) as RedteamFileConfig;

    expect(parsedConfig.redteam.purpose).toBe(input.purpose); // Fix: access under redteam
    expect(parsedConfig.redteam.numTests).toBe(input.numTests); // Fix: access under redteam
    expect(parsedConfig.redteam.plugins).toHaveLength(1); // Fix: access under redteam
    expect(parsedConfig.redteam.plugins?.[0]).toMatchObject({
      // Fix: access under redteam
      id: 'rbac',
      numTests: 2,
    });
  });

  it('should handle minimal configuration', () => {
    const input = {
      purpose: 'Basic test',
      numTests: 1,
      plugins: [],
      strategies: [] as const,
      prompts: [],
      providers: [],
      descriptions: {},
    };

    const renderedConfig = renderRedteamConfig(input);
    const parsedConfig = yaml.load(renderedConfig) as RedteamFileConfig;

    expect(parsedConfig.redteam.purpose).toBe(input.purpose);
    expect(parsedConfig.redteam.numTests).toBe(input.numTests);
    expect(parsedConfig.redteam.plugins || []).toEqual([]);
    expect(parsedConfig.redteam.strategies || []).toEqual([]);
  });

  it('should include all provided plugins and strategies', () => {
    const input = {
      purpose: 'Test all plugins',
      numTests: 3,
      plugins: [
        { id: 'prompt-injection', numTests: 1 },
        { id: 'policy', numTests: 2 },
      ],
      strategies: ['basic', 'jailbreak'] as const,
      prompts: ['Test {{prompt}}'],
      providers: ['openai:gpt-4'],
      descriptions: {
        'basic-injection': 'Basic test',
        'advanced-injection': 'Advanced test',
      },
    };

    const renderedConfig = renderRedteamConfig(input);
    const parsedConfig = yaml.load(renderedConfig) as RedteamFileConfig;

    expect(parsedConfig.redteam.plugins).toHaveLength(2);
    expect(parsedConfig.redteam.strategies).toHaveLength(2);
    expect(parsedConfig.redteam.plugins).toEqual(
      expect.arrayContaining([
        { id: 'prompt-injection', numTests: 1 },
        { id: 'policy', numTests: 2 },
      ]),
    );
    expect(parsedConfig.redteam.strategies).toEqual(expect.arrayContaining(['basic', 'jailbreak']));
  });

  it('should handle custom provider configuration', () => {
    const input = {
      purpose: 'Test custom provider',
      numTests: 1,
      plugins: [],
      strategies: [] as const,
      prompts: ['Test'],
      providers: [
        {
          id: 'custom-provider',
          label: 'Custom API',
          config: {
            apiKey: '{{CUSTOM_API_KEY}}',
            baseUrl: 'https://api.custom.com',
          },
        },
      ],
      descriptions: {},
    };

    const renderedConfig = renderRedteamConfig(input);
    const parsedConfig = yaml.load(renderedConfig) as RedteamFileConfig;

    // Changed from provider to targets to match the template
    expect(parsedConfig.targets).toBeDefined();
    expect(parsedConfig.targets[0]).toMatchObject({
      id: 'custom-provider',
      label: 'Custom API',
      config: {
        apiKey: '{{CUSTOM_API_KEY}}',
        baseUrl: 'https://api.custom.com',
      },
    });
  });
});
