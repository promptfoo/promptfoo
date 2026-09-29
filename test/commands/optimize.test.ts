import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { doOptimize, optimizeCommand } from '../../src/commands/optimize';
import logger from '../../src/logger';
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
    debug: vi.fn(),
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
    process.exitCode = undefined;
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
    process.exitCode = undefined;
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

  it('loads config-defined env files when the CLI does not override them', async () => {
    vi.mocked(resolveConfigs).mockResolvedValue({
      config: {},
      testSuite: {
        providers: [],
        prompts: [{ raw: 'Prompt', label: 'Prompt' }],
        tests: [{}],
      },
      basePath: '',
      commandLineOptions: {
        envPath: '.env.optimize',
      },
    } as any);

    await doOptimize({
      defaultConfig: {},
      defaultConfigPath: 'promptfooconfig.yaml',
    });

    expect(setupEnv).toHaveBeenNthCalledWith(1, undefined);
    expect(setupEnv).toHaveBeenNthCalledWith(2, '.env.optimize');
  });

  it('keeps explicit CLI env files ahead of config-defined env files', async () => {
    vi.mocked(resolveConfigs).mockResolvedValue({
      config: {},
      testSuite: {
        providers: [],
        prompts: [{ raw: 'Prompt', label: 'Prompt' }],
        tests: [{}],
      },
      basePath: '',
      commandLineOptions: {
        envPath: '.env.config',
      },
    } as any);

    await doOptimize({
      defaultConfig: {},
      defaultConfigPath: 'promptfooconfig.yaml',
      envPath: '.env.cli',
    });

    expect(setupEnv).toHaveBeenCalledTimes(1);
    expect(setupEnv).toHaveBeenCalledWith('.env.cli');
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

  it('requires a config path when no default config is available', async () => {
    await expect(
      doOptimize({
        defaultConfig: {},
        defaultConfigPath: undefined,
      }),
    ).rejects.toThrow('Could not find a config file.');
  });

  it('logs validation scores and a non-improving result', async () => {
    vi.mocked(optimizePromptTestSuite).mockResolvedValue({
      baselinePrompt: { label: 'Prompt', raw: 'Prompt', metrics: { score: 0.5 } },
      bestPrompt: { label: 'Prompt', raw: 'Prompt', metrics: { score: 0.5 } },
      baselineValidationPrompt: {
        label: 'Prompt',
        raw: 'Prompt',
        metrics: { score: 0.4 },
      },
      bestValidationPrompt: {
        label: 'Prompt',
        raw: 'Prompt',
        metrics: { score: 0.4 },
      },
      improved: false,
      candidates: [],
      searchTestCount: 1,
      validationSplit: 0.2,
      validationTestCount: 1,
    } as any);

    await doOptimize({
      defaultConfig: {},
      defaultConfigPath: 'promptfooconfig.yaml',
      validationSplit: 0.2,
    });

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Baseline validation:'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Best validation:'));
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Baseline remains strongest.'),
    );
  });

  it('parses valid CLI optimizer selections and validation split', async () => {
    const program = new Command();
    optimizeCommand(program, {}, 'promptfooconfig.yaml');

    await program.parseAsync([
      'node',
      'test',
      'optimize',
      '--prompt-index',
      '2',
      '--provider-index',
      '1',
      '--validation-split',
      '0.3',
    ]);

    expect(optimizePromptTestSuite).toHaveBeenCalledWith({}, expect.any(Object), {
      promptIndex: 2,
      providerIndex: 1,
      validationSplit: 0.3,
    });
  });

  it.each([
    ['--prompt-index', '-1', '--prompt-index must be a non-negative integer.'],
    ['--provider-index', '1.5', '--provider-index must be a non-negative integer.'],
    [
      '--validation-split',
      '0.75',
      '--validation-split must be greater than 0 and less than or equal to 0.5',
    ],
    [
      '--validation-split',
      '0.2typo',
      '--validation-split must be greater than 0 and less than or equal to 0.5',
    ],
  ])('rejects invalid %s values', async (flag, value, message) => {
    const program = new Command();
    program.exitOverride();
    optimizeCommand(program, {}, 'promptfooconfig.yaml');

    await expect(program.parseAsync(['node', 'test', 'optimize', flag, value])).rejects.toThrow(
      message,
    );
  });

  it('logs action handler failures and sets the exit code', async () => {
    vi.mocked(resolveConfigs).mockRejectedValue(new Error('config exploded'));
    const program = new Command();
    optimizeCommand(program, {}, 'promptfooconfig.yaml');

    await program.parseAsync(['node', 'test', 'optimize']);

    expect(logger.error).toHaveBeenCalledWith('config exploded');
    expect(process.exitCode).toBe(1);
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
