import { Command } from 'commander';
import { addEnvFileOptionRecursively } from '../src/main';
import { setupEnv } from '../src/util';

// Mock the dependencies
jest.mock('../src/util', () => ({
  setupEnv: jest.fn(),
}));

describe('addEnvFileOptionRecursively', () => {
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

  it('should add env-file option to a command that does not have it', () => {
    addEnvFileOptionRecursively(program);

    const hasEnvFileOption = program.options.some(
      (option) => option.long === '--env-file' || option.long === '--env-path',
    );
    expect(hasEnvFileOption).toBe(true);
  });

  it('should not add env-file option if it already exists', () => {
    program.option('--env-file, --env-path <path>', 'Path to .env file');
    const initialOptionsLength = program.options.length;

    addEnvFileOptionRecursively(program);

    expect(program.options).toHaveLength(initialOptionsLength);
  });

  it('should add env-file option to subcommands', () => {
    addEnvFileOptionRecursively(program);

    const hasSubcommandEnvFileOption = subCommand.options.some(
      (option) => option.long === '--env-file' || option.long === '--env-path',
    );
    expect(hasSubcommandEnvFileOption).toBe(true);
  });

  it('should add env-file option to nested subcommands', () => {
    // Create a deeper command structure
    const subSubCommand = subCommand.command('subsubcommand');
    subSubCommand.action(() => {});
    const subSubSubCommand = subSubCommand.command('subsubsubcommand');
    subSubSubCommand.action(() => {});

    addEnvFileOptionRecursively(program);

    // Check all levels of commands have the env-file option
    const hasMainEnvFileOption = program.options.some(
      (option) => option.long === '--env-file' || option.long === '--env-path',
    );
    const hasSubCommandEnvFileOption = subCommand.options.some(
      (option) => option.long === '--env-file' || option.long === '--env-path',
    );
    const hasSubSubCommandEnvFileOption = subSubCommand.options.some(
      (option) => option.long === '--env-file' || option.long === '--env-path',
    );
    const hasSubSubSubCommandEnvFileOption = subSubSubCommand.options.some(
      (option) => option.long === '--env-file' || option.long === '--env-path',
    );

    expect(hasMainEnvFileOption).toBe(true);
    expect(hasSubCommandEnvFileOption).toBe(true);
    expect(hasSubSubCommandEnvFileOption).toBe(true);
    expect(hasSubSubSubCommandEnvFileOption).toBe(true);
  });

  it('should register the hook that calls setupEnv when receiving the env-file option', () => {
    // Create a program with the option
    program.option('--env-file, --env-path <path>', 'Path to .env file');

    // Create a fake action that manually mocks the Commander hook system
    const mockHookRegister = jest.fn();
    (program as any).hook = mockHookRegister;

    // Apply env-file option functionality
    addEnvFileOptionRecursively(program);

    // Verify the hook was registered
    expect(mockHookRegister).toHaveBeenCalledWith('preAction', expect.any(Function));

    // Get the hook function
    const preActionFn = mockHookRegister.mock.calls.find((call) => call[0] === 'preAction')?.[1];

    // Ensure preActionFn exists before testing it
    expect(preActionFn).toBeDefined();

    // Call the preAction hook with mock data safely (no conditional expect)
    preActionFn!({ opts: () => ({ envFile: '.env.test' }) });

    // Verify setupEnv was called with the right argument
    expect(setupEnv).toHaveBeenCalledWith('.env.test');
  });
});
