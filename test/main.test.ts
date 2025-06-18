import { Command } from 'commander';
import { generateAssertionsCommand } from '../src/commands/generate/assertions';
import { generateDatasetCommand } from '../src/commands/generate/dataset';
import { setLogLevel } from '../src/logger';
import { addCommonOptionsRecursively } from '../src/main';
import { setupEnv } from '../src/util';

jest.mock('../src/util', () => ({
  setupEnv: jest.fn(),
}));

jest.mock('../src/logger', () => ({
  __esModule: true,
  default: { debug: jest.fn() },
  setLogLevel: jest.fn(),
}));

jest.mock('../src/commands/generate/assertions', () => ({
  generateAssertionsCommand: jest.fn(),
}));

jest.mock('../src/commands/generate/dataset', () => ({
  generateDatasetCommand: jest.fn(),
}));

describe('addCommonOptionsRecursively', () => {
  const originalExit = process.exit;
  let program: Command;
  let subCommand: Command;

  beforeAll(() => {
    process.exit = jest.fn() as any;
  });

  beforeEach(() => {
    program = new Command();
    program.action(() => {});
    subCommand = program.command('subcommand');
    subCommand.action(() => {});
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.exit = originalExit;
  });

  it('should add both verbose and env-file options to a command', () => {
    addCommonOptionsRecursively(program);

    const hasVerboseOption = program.options.some(
      (option) => option.short === '-v' || option.long === '--verbose',
    );
    const hasEnvFileOption = program.options.some(
      (option) => option.long === '--env-file' || option.long === '--env-path',
    );

    expect(hasVerboseOption).toBe(true);
    expect(hasEnvFileOption).toBe(true);
  });

  it('should not add duplicate options if they already exist', () => {
    program.option('--env-file, --env-path <path>', 'Path to .env file');
    program.option('-v, --verbose', 'Show debug logs', false);

    const envFileOptionsBefore = program.options.filter(
      (option) => option.long === '--env-file' || option.long === '--env-path',
    ).length;

    const verboseOptionsBefore = program.options.filter(
      (option) => option.short === '-v' || option.long === '--verbose',
    ).length;

    addCommonOptionsRecursively(program);

    const envFileOptionsAfter = program.options.filter(
      (option) => option.long === '--env-file' || option.long === '--env-path',
    ).length;

    const verboseOptionsAfter = program.options.filter(
      (option) => option.short === '-v' || option.long === '--verbose',
    ).length;

    expect(envFileOptionsAfter).toBe(envFileOptionsBefore);
    expect(verboseOptionsAfter).toBe(verboseOptionsBefore);
  });

  it('should add options to subcommands', () => {
    addCommonOptionsRecursively(program);

    const hasSubcommandVerboseOption = subCommand.options.some(
      (option) => option.short === '-v' || option.long === '--verbose',
    );
    const hasSubcommandEnvFileOption = subCommand.options.some(
      (option) => option.long === '--env-file' || option.long === '--env-path',
    );

    expect(hasSubcommandVerboseOption).toBe(true);
    expect(hasSubcommandEnvFileOption).toBe(true);
  });

  it('should add options to nested subcommands', () => {
    const subSubCommand = subCommand.command('subsubcommand');
    subSubCommand.action(() => {});
    const subSubSubCommand = subSubCommand.command('subsubsubcommand');
    subSubSubCommand.action(() => {});

    addCommonOptionsRecursively(program);

    const hasMainVerboseOption = program.options.some(
      (option) => option.short === '-v' || option.long === '--verbose',
    );
    const hasMainEnvFileOption = program.options.some(
      (option) => option.long === '--env-file' || option.long === '--env-path',
    );

    const hasSubCommandVerboseOption = subCommand.options.some(
      (option) => option.short === '-v' || option.long === '--verbose',
    );
    const hasSubCommandEnvFileOption = subCommand.options.some(
      (option) => option.long === '--env-file' || option.long === '--env-path',
    );

    const hasSubSubCommandVerboseOption = subSubCommand.options.some(
      (option) => option.short === '-v' || option.long === '--verbose',
    );
    const hasSubSubCommandEnvFileOption = subSubCommand.options.some(
      (option) => option.long === '--env-file' || option.long === '--env-path',
    );

    const hasSubSubSubCommandVerboseOption = subSubSubCommand.options.some(
      (option) => option.short === '-v' || option.long === '--verbose',
    );
    const hasSubSubSubCommandEnvFileOption = subSubSubCommand.options.some(
      (option) => option.long === '--env-file' || option.long === '--env-path',
    );

    expect(hasMainVerboseOption).toBe(true);
    expect(hasMainEnvFileOption).toBe(true);
    expect(hasSubCommandVerboseOption).toBe(true);
    expect(hasSubCommandEnvFileOption).toBe(true);
    expect(hasSubSubCommandVerboseOption).toBe(true);
    expect(hasSubSubCommandEnvFileOption).toBe(true);
    expect(hasSubSubSubCommandVerboseOption).toBe(true);
    expect(hasSubSubSubCommandEnvFileOption).toBe(true);
  });

  it('should register a single hook that handles both options', () => {
    const mockHookRegister = jest.fn();
    (program as any).hook = mockHookRegister;

    addCommonOptionsRecursively(program);

    expect(mockHookRegister).toHaveBeenCalledTimes(1);
    expect(mockHookRegister).toHaveBeenCalledWith('preAction', expect.any(Function));

    const preActionFn = mockHookRegister.mock.calls[0][1];

    preActionFn({ opts: () => ({ verbose: true }) });
    expect(setLogLevel).toHaveBeenCalledWith('debug');

    preActionFn({ opts: () => ({ envFile: '.env.test' }) });
    expect(setupEnv).toHaveBeenCalledWith('.env.test');

    preActionFn({ opts: () => ({ verbose: true, envFile: '.env.combined' }) });
    expect(setLogLevel).toHaveBeenCalledWith('debug');
    expect(setupEnv).toHaveBeenCalledWith('.env.combined');
  });
});

describe('generate commands', () => {
  let generateCommand: Command;
  const defaultConfig = { prompts: [] };
  const defaultConfigPath = 'config.yml';

  beforeEach(() => {
    generateCommand = new Command('generate');
    jest.clearAllMocks();
  });

  it('should register commands in correct order', () => {
    generateDatasetCommand(generateCommand, defaultConfig, defaultConfigPath);
    generateAssertionsCommand(generateCommand, defaultConfig, defaultConfigPath);

    expect(generateDatasetCommand).toHaveBeenCalledWith(
      generateCommand,
      defaultConfig,
      defaultConfigPath,
    );
    expect(generateAssertionsCommand).toHaveBeenCalledWith(
      generateCommand,
      defaultConfig,
      defaultConfigPath,
    );
    expect(generateDatasetCommand).toHaveBeenCalledWith(
      generateCommand,
      defaultConfig,
      defaultConfigPath,
    );
  });

  it('should pass correct config parameters to generateAssertionsCommand', () => {
    const customConfig = { prompts: [] };
    const customPath = 'custom.yml';

    generateAssertionsCommand(generateCommand, customConfig, customPath);

    expect(generateAssertionsCommand).toHaveBeenCalledWith(
      generateCommand,
      customConfig,
      customPath,
    );
  });

  it('should handle undefined config parameters', () => {
    generateAssertionsCommand(generateCommand, undefined as any, undefined);

    expect(generateAssertionsCommand).toHaveBeenCalledWith(generateCommand, undefined, undefined);
  });
});
