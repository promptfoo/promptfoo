import fs from 'fs/promises';

import confirm from '@inquirer/confirm';
import { AbortPromptError, ExitPromptError } from '@inquirer/core';
import editor from '@inquirer/editor';
import input from '@inquirer/input';
import select from '@inquirer/select';
import { Command } from 'commander';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readGlobalConfig } from '../../../src/globalConfig/globalConfig';
import { doGenerateRedteam } from '../../../src/redteam/commands/generate';
import {
  redteamInit,
  initCommand as redteamInitCommand,
  renderRedteamConfig,
} from '../../../src/redteam/commands/init';
import { type Strategy } from '../../../src/redteam/constants';
import { ProbeLimitExceededError } from '../../../src/redteam/types';

import type { RedteamFileConfig } from '../../../src/redteam/types';

vi.mock('fs/promises');
vi.mock('@inquirer/confirm');
vi.mock('@inquirer/editor');
vi.mock('@inquirer/input');
vi.mock('@inquirer/select');
vi.mock('../../../src/globalConfig/accounts', () => ({
  getUserEmail: vi.fn(),
  setUserEmail: vi.fn(),
}));
vi.mock('../../../src/globalConfig/globalConfig', () => ({
  readGlobalConfig: vi.fn(),
  writeGlobalConfigPartial: vi.fn(),
}));
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('../../../src/redteam/commands/generate', () => ({
  doGenerateRedteam: vi.fn(),
}));
vi.mock('../../../src/telemetry', () => ({
  default: {
    record: vi.fn(),
    saveConsent: vi.fn(),
  },
}));

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

describe('redteamInit', () => {
  let originalExitCode: number | string | null | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'clear').mockImplementation(() => {});
    originalExitCode = process.exitCode;
    process.exitCode = 0;

    vi.mocked(input).mockResolvedValue('target');
    vi.mocked(select)
      .mockResolvedValueOnce('prompt_model_chatbot')
      .mockResolvedValueOnce('now')
      .mockResolvedValueOnce('openai:gpt-5-mini')
      .mockResolvedValueOnce('default')
      .mockResolvedValueOnce('default');
    vi.mocked(editor).mockResolvedValue('User query: {{prompt}}');
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(readGlobalConfig).mockReturnValue({ hasHarmfulRedteamConsent: true } as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it('should treat probe-limit exhaustion as an expected CLI failure', async () => {
    vi.mocked(doGenerateRedteam).mockRejectedValueOnce(new ProbeLimitExceededError(100, 100));

    await expect(redteamInit(undefined)).resolves.toBeUndefined();

    expect(process.exitCode).toBe(1);
  });

  it('should mark prompt cancellation without hard-exiting', async () => {
    process.exitCode = undefined;
    vi.mocked(input).mockRejectedValueOnce(new ExitPromptError());
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const program = new Command();
    redteamInitCommand(program);

    await expect(program.parseAsync(['node', 'test', 'init', '--no-gui'])).resolves.toBe(program);

    expect(process.exitCode).toBe(130);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should mark prompt abort without hard-exiting', async () => {
    process.exitCode = undefined;
    vi.mocked(input).mockRejectedValueOnce(new AbortPromptError());
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const program = new Command();
    redteamInitCommand(program);

    await expect(program.parseAsync(['node', 'test', 'init', '--no-gui'])).resolves.toBe(program);

    expect(process.exitCode).toBe(130);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
