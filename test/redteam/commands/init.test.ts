import { describe, it, expect } from '@jest/globals';
import yaml from 'js-yaml';
import { renderRedteamConfig } from '../../../src/redteam/commands/init';
import { type Strategy } from '../../../src/redteam/constants';
import type { RedteamFileConfig } from '../../../src/redteam/types';

describe('renderRedteamConfig', () => {
  it('should generate valid YAML that conforms to RedteamFileConfig', () => {
    const input = {
      purpose: 'Test chatbot security',
      numTests: 5,
      plugins: [{ id: 'rbac', numTests: 2 }],
      strategies: ['prompt-injection'] as Strategy[],
      prompts: ['Hello {{prompt}}'],
      providers: ['openai:gpt-4'],
      descriptions: {
        'math-prompt': 'Basic prompt injection test',
        rbac: 'Basic RBAC test',
      },
    };

    const renderedConfig = renderRedteamConfig(input);
    expect(renderedConfig).toBeDefined();

    const parsedConfig = yaml.load(renderedConfig) as {
      description: string;
      prompts: string[];
      targets: string[];
      redteam: RedteamFileConfig;
    };

    expect(parsedConfig.redteam.purpose).toBe(input.purpose);
    expect(parsedConfig.redteam.numTests).toBe(input.numTests);
    expect(parsedConfig.redteam.plugins).toHaveLength(1);
    expect(parsedConfig.redteam.plugins?.[0]).toMatchObject({
      id: 'rbac',
      numTests: 2,
    });
  });

  it('should handle minimal configuration', () => {
    const input = {
      purpose: 'Basic test',
      numTests: 1,
      plugins: [],
      strategies: [],
      prompts: [],
      providers: [],
      descriptions: {},
    };

    const renderedConfig = renderRedteamConfig(input);
    const parsedConfig = yaml.load(renderedConfig) as {
      redteam: RedteamFileConfig;
    };

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
      strategies: ['basic', 'jailbreak'] as Strategy[],
      prompts: ['Test {{prompt}}'],
      providers: ['openai:gpt-4'],
      descriptions: {
        'basic-injection': 'Basic test',
        'advanced-injection': 'Advanced test',
      },
    };

    const renderedConfig = renderRedteamConfig(input);
    const parsedConfig = yaml.load(renderedConfig) as {
      redteam: RedteamFileConfig;
    };

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
      strategies: [],
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
    const parsedConfig = yaml.load(renderedConfig) as {
      targets: Array<{
        id: string;
        label: string;
        config: Record<string, string>;
      }>;
    };

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
