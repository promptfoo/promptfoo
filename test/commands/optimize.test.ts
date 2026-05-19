import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { doOptimize, optimizeCommand } from '../../src/commands/optimize';
import { optimizePromptTestSuite } from '../../src/optimizer/promptOptimizer';
import telemetry from '../../src/telemetry';
import { resolveConfigs } from '../../src/util/config/load';
import { setupEnv } from '../../src/util/index';

vi.mock('../../src/optimizer/promptOptimizer', () => ({
  optimizePromptTestSuite: vi.fn(),
}));

vi.mock('../../src/telemetry', () => ({
  default: {
    record: vi.fn(),
  },
}));

vi.mock('../../src/util/config/load', () => ({
  resolveConfigs: vi.fn(),
}));

vi.mock('../../src/util', () => ({
  printBorder: vi.fn(),
  setupEnv: vi.fn(),
}));

vi.mock('../../src/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/util/promptfooCommand', () => ({
  promptfooCommand: vi.fn().mockReturnValue('promptfoo init'),
}));

describe('optimize command', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveConfigs).mockResolvedValue({
      config: {},
      testSuite: {
        providers: [],
        prompts: [{ raw: 'Prompt', label: 'Prompt' }],
        tests: [{}],
      },
      basePath: '',
    } as any);
    vi.mocked(optimizePromptTestSuite).mockResolvedValue({
      baselinePrompt: { label: 'Prompt', raw: 'Prompt', metrics: { score: 0.5 } },
      bestPrompt: { label: 'Prompt [optimized 1]', raw: 'Better prompt', metrics: { score: 0.8 } },
      improved: true,
      candidates: [{ prompt: 'Better prompt', hypothesis: 'Improve clarity.' }],
    } as any);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('uses the implicit default config path when -c is omitted', async () => {
    await doOptimize({
      defaultConfig: {},
      defaultConfigPath: 'promptfooconfig.yaml',
    });

    expect(setupEnv).toHaveBeenCalledWith(undefined);
    expect(resolveConfigs).toHaveBeenCalledWith({ config: ['promptfooconfig.yaml'] }, {});
    expect(optimizePromptTestSuite).toHaveBeenCalledTimes(1);
    expect(optimizePromptTestSuite).toHaveBeenCalledWith({}, expect.any(Object), {
      promptIndex: 0,
      providerIndex: 0,
      validationSplit: undefined,
    });
    expect(telemetry.record).toHaveBeenCalledWith(
      'command_used',
      expect.objectContaining({ name: 'optimize - started' }),
    );
  });

  it('passes validation split through to the optimizer', async () => {
    await doOptimize({
      defaultConfig: {},
      defaultConfigPath: 'promptfooconfig.yaml',
      validationSplit: 0.2,
    });

    expect(optimizePromptTestSuite).toHaveBeenCalledWith({}, expect.any(Object), {
      promptIndex: 0,
      providerIndex: 0,
      validationSplit: 0.2,
    });
  });

  it('passes explicit prompt and provider indices through to the optimizer', async () => {
    await doOptimize({
      defaultConfig: {},
      defaultConfigPath: 'promptfooconfig.yaml',
      promptIndex: 2,
      providerIndex: 1,
    });

    expect(optimizePromptTestSuite).toHaveBeenCalledWith({}, expect.any(Object), {
      promptIndex: 2,
      providerIndex: 1,
      validationSplit: undefined,
    });
  });

  it('registers a top-level optimize command', () => {
    const program = new Command();
    optimizeCommand(program, {}, 'promptfooconfig.yaml');

    const command = program.commands[0];
    expect(command.name()).toBe('optimize');
    expect(command.description()).toBe('Optimize one prompt against one configured provider');
    expect(command.options.some((option) => option.long === '--prompt-index')).toBe(true);
    expect(command.options.some((option) => option.long === '--provider-index')).toBe(true);
    expect(command.options.some((option) => option.long === '--validation-split')).toBe(true);
  });
});
