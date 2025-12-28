import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { initialRedteamContext } from '../../../../src/ui/init/machines/initMachine.types';
import {
  generateConfig,
  generateFiles,
  generateRedteamConfig,
} from '../../../../src/ui/init/utils/configGenerator';

import type {
  InitContext,
  RedteamContext,
} from '../../../../src/ui/init/machines/initMachine.types';

const baseContext: InitContext = {
  path: 'new',
  exampleName: null,
  exampleList: [],
  downloadProgress: 0,
  downloadedFiles: [],
  useCase: 'compare',
  language: null,
  providers: [],
  prompts: ['Write a tweet about {{topic}}'],
  redteam: initialRedteamContext,
  outputDirectory: './test-output',
  filesToWrite: [],
  filesWritten: [],
  currentStep: 4,
  totalSteps: 5,
  error: null,
};

describe('generateConfig', () => {
  it('should generate valid YAML', () => {
    const config = generateConfig(baseContext);
    expect(() => yaml.load(config)).not.toThrow();
  });

  it('should include description based on use case', () => {
    const config = generateConfig({ ...baseContext, useCase: 'compare' });
    const parsed = yaml.load(config) as Record<string, unknown>;
    expect(parsed.description).toContain('Compare');
  });

  it('should include prompts', () => {
    const config = generateConfig({
      ...baseContext,
      prompts: ['Prompt 1', 'Prompt 2'],
    });
    const parsed = yaml.load(config) as Record<string, unknown>;
    expect(parsed.prompts).toEqual(['Prompt 1', 'Prompt 2']);
  });

  it('should include providers from selected models', () => {
    const config = generateConfig({
      ...baseContext,
      providers: [
        { family: 'openai', models: ['openai:gpt-4', 'openai:gpt-4-mini'] },
        { family: 'anthropic', models: ['anthropic:claude-3-sonnet'] },
      ],
    });
    const parsed = yaml.load(config) as Record<string, unknown>;
    expect(parsed.providers).toContain('openai:gpt-4');
    expect(parsed.providers).toContain('openai:gpt-4-mini');
    expect(parsed.providers).toContain('anthropic:claude-3-sonnet');
  });

  it('should include tests for compare use case', () => {
    const config = generateConfig({ ...baseContext, useCase: 'compare' });
    const parsed = yaml.load(config) as Record<string, unknown>;
    expect(Array.isArray(parsed.tests)).toBe(true);
    expect((parsed.tests as unknown[]).length).toBeGreaterThan(0);
  });

  it('should include tests for rag use case', () => {
    const config = generateConfig({ ...baseContext, useCase: 'rag' });
    const parsed = yaml.load(config) as Record<string, unknown>;
    expect(Array.isArray(parsed.tests)).toBe(true);
    const tests = parsed.tests as Array<{ vars: Record<string, unknown> }>;
    expect(tests[0].vars).toHaveProperty('context');
    expect(tests[0].vars).toHaveProperty('question');
  });

  it('should include tests for agent use case', () => {
    const config = generateConfig({ ...baseContext, useCase: 'agent' });
    const parsed = yaml.load(config) as Record<string, unknown>;
    expect(Array.isArray(parsed.tests)).toBe(true);
    const tests = parsed.tests as Array<{ vars: Record<string, unknown> }>;
    expect(tests[0].vars).toHaveProperty('request');
  });

  it('should include defaultTest configuration', () => {
    const config = generateConfig(baseContext);
    const parsed = yaml.load(config) as Record<string, unknown>;
    expect(parsed.defaultTest).toBeDefined();
    expect((parsed.defaultTest as Record<string, unknown>).options).toBeDefined();
  });

  it('should include rag-specific assertions for rag use case', () => {
    const config = generateConfig({ ...baseContext, useCase: 'rag' });
    const parsed = yaml.load(config) as Record<string, unknown>;
    const defaultTest = parsed.defaultTest as Record<string, unknown>;
    expect(Array.isArray(defaultTest.assert)).toBe(true);
    const asserts = defaultTest.assert as Array<{ type: string }>;
    const hasFactuality = asserts.some((a) => a.type === 'factuality');
    expect(hasFactuality).toBe(true);
  });

  it('should use default prompt when no prompts provided', () => {
    const config = generateConfig({ ...baseContext, prompts: [] });
    const parsed = yaml.load(config) as Record<string, unknown>;
    expect(Array.isArray(parsed.prompts)).toBe(true);
    expect((parsed.prompts as string[]).length).toBe(1);
  });
});

describe('generateFiles', () => {
  it('should generate config file', () => {
    const files = generateFiles(baseContext);
    const configFile = files.find((f) => f.relativePath === 'promptfooconfig.yaml');
    expect(configFile).toBeDefined();
    expect(configFile?.content).toBeDefined();
    expect(configFile?.path).toContain('promptfooconfig.yaml');
  });

  it('should generate README file', () => {
    const files = generateFiles(baseContext);
    const readme = files.find((f) => f.relativePath === 'README.md');
    expect(readme).toBeDefined();
    expect(readme?.content).toContain('promptfoo');
    expect(readme?.content).toContain('eval');
  });

  it('should generate tests.yaml for rag use case', () => {
    const files = generateFiles({ ...baseContext, useCase: 'rag' });
    const testsFile = files.find((f) => f.relativePath === 'tests.yaml');
    expect(testsFile).toBeDefined();
  });

  it('should not generate tests.yaml for compare use case', () => {
    const files = generateFiles({ ...baseContext, useCase: 'compare' });
    const testsFile = files.find((f) => f.relativePath === 'tests.yaml');
    expect(testsFile).toBeUndefined();
  });

  it('should generate tools file for agent use case with python', () => {
    const files = generateFiles({
      ...baseContext,
      useCase: 'agent',
      language: 'python',
    });
    const toolsFile = files.find((f) => f.relativePath === 'tools.py');
    expect(toolsFile).toBeDefined();
    expect(toolsFile?.content).toContain('def ');
  });

  it('should generate tools file for agent use case with javascript', () => {
    const files = generateFiles({
      ...baseContext,
      useCase: 'agent',
      language: 'javascript',
    });
    const toolsFile = files.find((f) => f.relativePath === 'tools.js');
    expect(toolsFile).toBeDefined();
    expect(toolsFile?.content).toContain('function');
  });

  it('should set correct file paths based on output directory', () => {
    const files = generateFiles({
      ...baseContext,
      outputDirectory: './my-project',
    });
    files.forEach((file) => {
      expect(file.path).toContain('./my-project');
    });
  });

  it('should set exists and overwrite properties', () => {
    const files = generateFiles(baseContext);
    files.forEach((file) => {
      expect(typeof file.exists).toBe('boolean');
      expect(typeof file.overwrite).toBe('boolean');
    });
  });

  it('should include getting started instructions in README', () => {
    const files = generateFiles({
      ...baseContext,
      providers: [{ family: 'openai', models: ['openai:gpt-4'] }],
    });
    const readme = files.find((f) => f.relativePath === 'README.md');
    expect(readme?.content).toContain('Getting Started');
    expect(readme?.content).toContain('API key');
    expect(readme?.content).toContain('promptfoo eval');
    expect(readme?.content).toContain('promptfoo view');
  });

  it('should include provider list in README', () => {
    const files = generateFiles({
      ...baseContext,
      providers: [
        { family: 'openai', models: ['openai:gpt-4'] },
        { family: 'anthropic', models: ['anthropic:claude-3'] },
      ],
    });
    const readme = files.find((f) => f.relativePath === 'README.md');
    expect(readme?.content).toContain('openai:gpt-4');
    expect(readme?.content).toContain('anthropic:claude-3');
  });

  it('should generate appropriate title based on use case', () => {
    const compareFiles = generateFiles({ ...baseContext, useCase: 'compare' });
    const ragFiles = generateFiles({ ...baseContext, useCase: 'rag' });
    const agentFiles = generateFiles({ ...baseContext, useCase: 'agent' });

    const compareReadme = compareFiles.find((f) => f.relativePath === 'README.md');
    const ragReadme = ragFiles.find((f) => f.relativePath === 'README.md');
    const agentReadme = agentFiles.find((f) => f.relativePath === 'README.md');

    expect(compareReadme?.content).toContain('Comparison');
    expect(ragReadme?.content).toContain('RAG');
    expect(agentReadme?.content).toContain('Agent');
  });

  it('should generate redteam files for redteam use case', () => {
    const redteamContext: InitContext = {
      ...baseContext,
      useCase: 'redteam',
      redteam: {
        ...initialRedteamContext,
        targetLabel: 'Test Chatbot',
        targetType: 'prompt_model_chatbot',
        purpose: 'A customer service chatbot',
        plugins: [{ id: 'harmful:self-harm' }, { id: 'politics' }],
        strategies: ['jailbreak'],
        pluginConfigMode: 'manual',
        strategyConfigMode: 'manual',
      },
    };

    const files = generateFiles(redteamContext);

    // Should have config and README
    expect(files).toHaveLength(2);

    const configFile = files.find((f) => f.relativePath === 'promptfooconfig.yaml');
    expect(configFile).toBeDefined();

    const readme = files.find((f) => f.relativePath === 'README.md');
    expect(readme).toBeDefined();
    expect(readme?.content).toContain('Red Team');
    expect(readme?.content).toContain('Test Chatbot');
  });
});

describe('generateRedteamConfig', () => {
  const baseRedteamContext: RedteamContext = {
    targetLabel: 'Customer Support Bot',
    targetType: 'prompt_model_chatbot',
    systemPrompt: '',
    purpose: 'Helps users with account issues',
    plugins: [],
    strategies: [],
    numTests: 5,
    generateImmediately: false,
    pluginConfigMode: 'default',
    strategyConfigMode: 'default',
  };

  it('should generate valid YAML', () => {
    const config = generateRedteamConfig(baseRedteamContext);
    expect(() => yaml.load(config)).not.toThrow();
  });

  it('should include description with target label', () => {
    const config = generateRedteamConfig(baseRedteamContext);
    const parsed = yaml.load(config) as Record<string, unknown>;
    expect(parsed.description).toContain('Customer Support Bot');
  });

  it('should include targets section', () => {
    const config = generateRedteamConfig(baseRedteamContext);
    const parsed = yaml.load(config) as Record<string, unknown>;
    expect(Array.isArray(parsed.targets)).toBe(true);
    const targets = parsed.targets as Array<Record<string, unknown>>;
    expect(targets[0].label).toBe('Customer Support Bot');
  });

  it('should include redteam section with purpose', () => {
    const config = generateRedteamConfig(baseRedteamContext);
    const parsed = yaml.load(config) as Record<string, unknown>;
    const redteam = parsed.redteam as Record<string, unknown>;
    expect(redteam.purpose).toBe('Helps users with account issues');
  });

  it('should use default plugins when pluginConfigMode is default', () => {
    const config = generateRedteamConfig(baseRedteamContext);
    const parsed = yaml.load(config) as Record<string, unknown>;
    const redteam = parsed.redteam as Record<string, unknown>;
    expect(Array.isArray(redteam.plugins)).toBe(true);
    expect((redteam.plugins as unknown[]).length).toBeGreaterThan(0);
  });

  it('should use manual plugins when pluginConfigMode is manual', () => {
    const config = generateRedteamConfig({
      ...baseRedteamContext,
      pluginConfigMode: 'manual',
      plugins: [{ id: 'harmful:self-harm' }, { id: 'politics' }],
    });
    const parsed = yaml.load(config) as Record<string, unknown>;
    const redteam = parsed.redteam as Record<string, unknown>;
    expect(redteam.plugins).toContain('harmful:self-harm');
    expect(redteam.plugins).toContain('politics');
  });

  it('should use default strategies when strategyConfigMode is default', () => {
    const config = generateRedteamConfig(baseRedteamContext);
    const parsed = yaml.load(config) as Record<string, unknown>;
    const redteam = parsed.redteam as Record<string, unknown>;
    expect(Array.isArray(redteam.strategies)).toBe(true);
    expect((redteam.strategies as unknown[]).length).toBeGreaterThan(0);
  });

  it('should use manual strategies when strategyConfigMode is manual', () => {
    const config = generateRedteamConfig({
      ...baseRedteamContext,
      strategyConfigMode: 'manual',
      strategies: ['jailbreak', 'prompt-injection'],
    });
    const parsed = yaml.load(config) as Record<string, unknown>;
    const redteam = parsed.redteam as Record<string, unknown>;
    expect(redteam.strategies).toContain('jailbreak');
    expect(redteam.strategies).toContain('prompt-injection');
  });

  it('should configure http target for http_endpoint type', () => {
    const config = generateRedteamConfig({
      ...baseRedteamContext,
      targetType: 'http_endpoint',
    });
    const parsed = yaml.load(config) as Record<string, unknown>;
    const targets = parsed.targets as Array<Record<string, unknown>>;
    expect(targets[0].id).toBe('http');
    expect(targets[0].config).toBeDefined();
  });

  it('should include plugin config when present', () => {
    const config = generateRedteamConfig({
      ...baseRedteamContext,
      pluginConfigMode: 'manual',
      plugins: [{ id: 'policy', config: { policy: 'Do not discuss competitors' } }],
    });
    const parsed = yaml.load(config) as Record<string, unknown>;
    const redteam = parsed.redteam as Record<string, unknown>;
    const plugins = redteam.plugins as Array<unknown>;
    const policyPlugin = plugins.find(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        'id' in p &&
        (p as Record<string, unknown>).id === 'policy',
    ) as Record<string, unknown>;
    expect(policyPlugin).toBeDefined();
    expect(policyPlugin.config).toEqual({ policy: 'Do not discuss competitors' });
  });
});
