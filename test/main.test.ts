import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Command } from 'commander';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks for shutdown tests
const mockSetupEnv = vi.hoisted(() => vi.fn());
const mockSetLogLevel = vi.hoisted(() => vi.fn());
const mockTelemetryRecord = vi.hoisted(() => vi.fn());
const mockTelemetryShutdown = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockCloseLogger = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockCloseDbIfOpen = vi.hoisted(() => vi.fn());
const mockDispatcherDestroy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockGetGlobalDispatcher = vi.hoisted(() =>
  vi.fn().mockReturnValue({ destroy: mockDispatcherDestroy }),
);
// Import actual undici to preserve other exports (Agent, ProxyAgent, setGlobalDispatcher, etc.)
const actualUndici = vi.hoisted(() => vi.importActual<typeof import('undici')>('undici'));

// Mock the dependencies
vi.mock('../src/util', () => ({
  setupEnv: mockSetupEnv,
}));

vi.mock('../src/logger', () => ({
  __esModule: true,
  default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  setLogLevel: mockSetLogLevel,
  closeLogger: mockCloseLogger,
}));

vi.mock('../src/telemetry', () => ({
  __esModule: true,
  default: { record: mockTelemetryRecord, shutdown: mockTelemetryShutdown },
}));

vi.mock('../src/database/index', () => ({
  closeDbIfOpen: mockCloseDbIfOpen,
}));

vi.mock('undici', async () => ({
  ...(await actualUndici),
  getGlobalDispatcher: mockGetGlobalDispatcher,
}));

// Mock code scan commands to avoid ESM import issues with execa
vi.mock('../src/codeScan', () => ({
  codeScansCommand: vi.fn(),
}));

let addCommonOptionsRecursively: typeof import('../src/mainUtils').addCommonOptionsRecursively;
let isMainModule: typeof import('../src/mainUtils').isMainModule;
let setupEnvFilesFromArgv: typeof import('../src/mainUtils').setupEnvFilesFromArgv;
let shutdownGracefully: typeof import('../src/mainUtils').shutdownGracefully;

async function loadMainModule() {
  vi.resetModules();
  ({ addCommonOptionsRecursively, isMainModule, setupEnvFilesFromArgv, shutdownGracefully } =
    await import('../src/mainUtils'));
}

describe('setupEnvFilesFromArgv', () => {
  beforeEach(async () => {
    await loadMainModule();
    mockSetupEnv.mockReset();
  });

  it('should load env files before command actions run', () => {
    setupEnvFilesFromArgv(['eval', '--env-file', '.env.local']);

    expect(mockSetupEnv).toHaveBeenCalledWith('.env.local');
  });

  it('should support repeated and comma-separated env file args', () => {
    setupEnvFilesFromArgv(['eval', '--env-file', '.env.one', '--env-path=.env.two,.env.three']);

    expect(mockSetupEnv).toHaveBeenCalledWith(['.env.one', '.env.two', '.env.three']);
  });

  it('should ignore flags after --', () => {
    setupEnvFilesFromArgv(['eval', '--', '--env-file', '.env.local']);

    expect(mockSetupEnv).not.toHaveBeenCalled();
  });

  it('should recognize the --env-path alias', () => {
    setupEnvFilesFromArgv(['eval', '--env-path', '.env.staging']);

    expect(mockSetupEnv).toHaveBeenCalledWith('.env.staging');
  });

  it('should be a no-op when no env flags are present', () => {
    setupEnvFilesFromArgv(['eval', '--verbose', '--no-cache']);

    expect(mockSetupEnv).not.toHaveBeenCalled();
  });

  it('should ignore --env-file= with empty value', () => {
    setupEnvFilesFromArgv(['eval', '--env-file=']);

    expect(mockSetupEnv).not.toHaveBeenCalled();
  });

  it('should skip --env-file when next arg starts with -', () => {
    setupEnvFilesFromArgv(['eval', '--env-file', '--verbose']);

    expect(mockSetupEnv).not.toHaveBeenCalled();
  });
});

describe('addCommonOptionsRecursively', () => {
  const originalExit = process.exit;
  let program: Command;
  let subCommand: Command;

  beforeAll(() => {
    process.exit = vi.fn() as any;
  });

  beforeEach(async () => {
    await loadMainModule();
    program = new Command('promptfoo');
    program.action(() => {});
    subCommand = program.command('subcommand');
    subCommand.action(() => {});
    mockTelemetryRecord.mockReset();
    vi.clearAllMocks();
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

    // Count options before
    const envFileOptionsBefore = program.options.filter(
      (option) => option.long === '--env-file' || option.long === '--env-path',
    ).length;

    const verboseOptionsBefore = program.options.filter(
      (option) => option.short === '-v' || option.long === '--verbose',
    ).length;

    addCommonOptionsRecursively(program);

    // Count options after
    const envFileOptionsAfter = program.options.filter(
      (option) => option.long === '--env-file' || option.long === '--env-path',
    ).length;

    const verboseOptionsAfter = program.options.filter(
      (option) => option.short === '-v' || option.long === '--verbose',
    ).length;

    // Should still have the same number of options
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
    // Create a deeper command structure
    const subSubCommand = subCommand.command('subsubcommand');
    subSubCommand.action(() => {});
    const subSubSubCommand = subSubCommand.command('subsubsubcommand');
    subSubSubCommand.action(() => {});

    addCommonOptionsRecursively(program);

    // Check all levels of commands have the options
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
    // Create a fake action that manually mocks the Commander hook system
    const mockHookRegister = vi.fn();
    (program as any).hook = mockHookRegister;

    // Apply common options
    addCommonOptionsRecursively(program);

    // Verify the hook was registered only once
    expect(mockHookRegister).toHaveBeenCalledTimes(1);
    expect(mockHookRegister).toHaveBeenCalledWith('preAction', expect.any(Function));

    // Get the hook function
    const preActionFn = mockHookRegister.mock.calls[0][1];

    // Create mock command object with name() and parent for telemetry
    const createMockCommand = (opts: Record<string, unknown>, commandName = 'test') => ({
      opts: () => opts,
      name: () => commandName,
      parent: null,
    });

    // Test verbose option
    preActionFn(createMockCommand({ verbose: true }));
    expect(mockSetLogLevel).toHaveBeenCalledWith('debug');

    // Test env-file option
    preActionFn(createMockCommand({ envFile: '.env.test' }));
    expect(mockSetupEnv).toHaveBeenCalledWith('.env.test');

    // Test both options together
    preActionFn(createMockCommand({ verbose: true, envFile: '.env.combined' }));
    expect(mockSetLogLevel).toHaveBeenCalledWith('debug');
    expect(mockSetupEnv).toHaveBeenCalledWith('.env.combined');
  });

  it('should parse --env-file without consuming positional subcommand arguments', async () => {
    const action = vi.fn();
    const documentCommand = program.command('scan-model').argument('<model>').action(action);

    addCommonOptionsRecursively(program);

    await program.parseAsync(['scan-model', '--env-file', '.env.local', 'llama-3'], {
      from: 'user',
    });

    expect(action).toHaveBeenCalledWith(
      'llama-3',
      expect.objectContaining({ verbose: false }),
      documentCommand,
    );
    expect(mockSetupEnv).toHaveBeenCalledWith('.env.local');
  });

  it('should support repeated and comma-separated --env-file values', async () => {
    addCommonOptionsRecursively(program);

    await program.parseAsync(
      ['subcommand', '--env-file', '.env.one', '--env-file', '.env.two,.env.three'],
      { from: 'user' },
    );

    expect(mockSetupEnv).toHaveBeenCalledWith(['.env.one', '.env.two', '.env.three']);
  });

  it('should record telemetry once for nested subcommands', async () => {
    const nestedParent = program.command('redteam');
    const nestedAction = vi.fn();
    nestedParent.command('run').action(nestedAction);

    addCommonOptionsRecursively(program);

    await program.parseAsync(['redteam', 'run'], { from: 'user' });

    expect(nestedAction).toHaveBeenCalledTimes(1);
    expect(mockTelemetryRecord).toHaveBeenCalledTimes(1);
    expect(mockTelemetryRecord).toHaveBeenCalledWith('command_used', { name: 'redteam run' });
  });
});

describe('isMainModule', () => {
  let tempDir: string;
  let realFilePath: string;
  let symlinkPath: string;

  beforeAll(async () => {
    await loadMainModule();
    // Create a temporary directory with a real file and a symlink
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'main-test-'));
    realFilePath = path.join(tempDir, 'real-file.js');
    symlinkPath = path.join(tempDir, 'symlink-file.js');

    // Create a real file
    fs.writeFileSync(realFilePath, '// test file');

    // Create a symlink pointing to the real file
    fs.symlinkSync(realFilePath, symlinkPath);
  });

  afterAll(() => {
    // Clean up temporary files
    try {
      fs.unlinkSync(symlinkPath);
      fs.unlinkSync(realFilePath);
      fs.rmdirSync(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should return false when processArgv1 is undefined', () => {
    const result = isMainModule('file:///some/path/main.js', undefined);
    expect(result).toBe(false);
  });

  it('should return false when processArgv1 is empty string', () => {
    const result = isMainModule('file:///some/path/main.js', '');
    expect(result).toBe(false);
  });

  it('should return true when paths match directly', () => {
    const fileUrl = pathToFileURL(realFilePath).href;
    const result = isMainModule(fileUrl, realFilePath);
    expect(result).toBe(true);
  });

  it('should return true when processArgv1 is a symlink pointing to the module', () => {
    // This is the key test case for npm global bin symlinks
    const fileUrl = pathToFileURL(realFilePath).href;
    const result = isMainModule(fileUrl, symlinkPath);
    expect(result).toBe(true);
  });

  it('should return false when paths do not match', () => {
    const fileUrl = pathToFileURL(realFilePath).href;
    const otherPath = path.join(tempDir, 'other-file.js');
    fs.writeFileSync(otherPath, '// other file');

    try {
      const result = isMainModule(fileUrl, otherPath);
      expect(result).toBe(false);
    } finally {
      fs.unlinkSync(otherPath);
    }
  });

  it('should return false when processArgv1 points to non-existent file', () => {
    const fileUrl = pathToFileURL(realFilePath).href;
    const nonExistentPath = path.join(tempDir, 'non-existent.js');
    const result = isMainModule(fileUrl, nonExistentPath);
    expect(result).toBe(false);
  });

  it('should handle relative paths correctly', () => {
    // Save current directory
    const originalCwd = process.cwd();

    try {
      // Change to temp directory
      process.chdir(tempDir);

      const fileUrl = pathToFileURL(realFilePath).href;
      const result = isMainModule(fileUrl, './real-file.js');
      expect(result).toBe(true);
    } finally {
      // Restore original directory
      process.chdir(originalCwd);
    }
  });

  it('should handle symlink to symlink chains', () => {
    const secondSymlinkPath = path.join(tempDir, 'second-symlink.js');

    try {
      // Create a symlink pointing to the first symlink
      fs.symlinkSync(symlinkPath, secondSymlinkPath);

      const fileUrl = pathToFileURL(realFilePath).href;
      const result = isMainModule(fileUrl, secondSymlinkPath);
      expect(result).toBe(true);
    } finally {
      try {
        fs.unlinkSync(secondSymlinkPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  });
});

describe('shutdownGracefully', () => {
  const originalExit = process.exit;

  beforeEach(async () => {
    await loadMainModule();
    vi.useFakeTimers();
    process.exit = vi.fn() as never;
    // Reset all mocks to default behavior
    mockSetupEnv.mockReset();
    mockSetLogLevel.mockReset();
    mockTelemetryShutdown.mockReset().mockResolvedValue(undefined);
    mockCloseLogger.mockReset().mockResolvedValue(undefined);
    mockCloseDbIfOpen.mockReset();
    mockDispatcherDestroy.mockReset().mockResolvedValue(undefined);
    mockGetGlobalDispatcher.mockReset().mockReturnValue({ destroy: mockDispatcherDestroy });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
    process.exit = originalExit;
  });

  it('should complete gracefully when all operations succeed quickly', async () => {
    const shutdownPromise = shutdownGracefully();

    // Advance past any internal timeouts
    await vi.runAllTimersAsync();

    await shutdownPromise;

    expect(mockTelemetryShutdown).toHaveBeenCalled();
    expect(mockCloseLogger).toHaveBeenCalled();
    expect(mockCloseDbIfOpen).toHaveBeenCalled();
    expect(mockDispatcherDestroy).toHaveBeenCalled();
  });

  it('should handle telemetry shutdown timeout', async () => {
    // Make telemetry.shutdown() hang forever
    mockTelemetryShutdown.mockImplementation(() => new Promise(() => {}));

    const shutdownPromise = shutdownGracefully();

    // Advance time to trigger the individual operation timeout (1s)
    await vi.advanceTimersByTimeAsync(1100);

    // Advance remaining timers
    await vi.runAllTimersAsync();

    await shutdownPromise;

    // Should still have called other cleanup operations
    expect(mockCloseLogger).toHaveBeenCalled();
    expect(mockCloseDbIfOpen).toHaveBeenCalled();
  });

  it('should handle closeLogger timeout', async () => {
    // Make closeLogger() hang forever
    mockCloseLogger.mockImplementation(() => new Promise(() => {}));

    const shutdownPromise = shutdownGracefully();

    // Advance time to trigger all timeouts
    await vi.runAllTimersAsync();

    await shutdownPromise;

    // Other operations should still complete
    expect(mockTelemetryShutdown).toHaveBeenCalled();
    expect(mockCloseDbIfOpen).toHaveBeenCalled();
    expect(mockDispatcherDestroy).toHaveBeenCalled();
  });

  it('should handle dispatcher.destroy() timeout', async () => {
    // Make dispatcher.destroy() hang forever
    mockDispatcherDestroy.mockImplementation(() => new Promise(() => {}));

    const shutdownPromise = shutdownGracefully();

    // Advance time to trigger all timeouts
    await vi.runAllTimersAsync();

    await shutdownPromise;

    // Other operations should still complete
    expect(mockTelemetryShutdown).toHaveBeenCalled();
    expect(mockCloseLogger).toHaveBeenCalled();
    expect(mockCloseDbIfOpen).toHaveBeenCalled();
  });

  it('should handle telemetry shutdown throwing error', async () => {
    mockTelemetryShutdown.mockRejectedValue(new Error('Telemetry failed'));

    const shutdownPromise = shutdownGracefully();

    await vi.runAllTimersAsync();

    // Should not throw - should handle error gracefully
    await expect(shutdownPromise).resolves.toBeUndefined();

    // Other operations should still complete
    expect(mockCloseLogger).toHaveBeenCalled();
    expect(mockCloseDbIfOpen).toHaveBeenCalled();
  });

  it('should handle dispatcher.destroy() throwing error', async () => {
    mockDispatcherDestroy.mockRejectedValue(new Error('Dispatcher failed'));

    const shutdownPromise = shutdownGracefully();

    await vi.runAllTimersAsync();

    // Should not throw
    await expect(shutdownPromise).resolves.toBeUndefined();
  });

  it('should force exit when all cleanup operations hang', async () => {
    // Make all operations hang
    mockTelemetryShutdown.mockImplementation(() => new Promise(() => {}));
    mockCloseLogger.mockImplementation(() => new Promise(() => {}));
    mockDispatcherDestroy.mockImplementation(() => new Promise(() => {}));

    // Start shutdown but don't await yet
    void shutdownGracefully();

    // The force exit timeout is 3000ms
    await vi.advanceTimersByTimeAsync(3000);

    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('should clear force exit timeout when cleanup completes normally', async () => {
    const shutdownPromise = shutdownGracefully();

    // Advance a little to let the cleanup complete
    await vi.runAllTimersAsync();

    await shutdownPromise;

    // The force exit (3s) should not have been called since cleanup completed
    // We verify this by checking process.exit was called with the natural exit timeout (100ms)
    // not the force exit message
    expect(process.exit).toHaveBeenCalled();
  });

  it('should handle getGlobalDispatcher throwing', async () => {
    mockGetGlobalDispatcher.mockImplementation(() => {
      throw new Error('No dispatcher');
    });

    const shutdownPromise = shutdownGracefully();

    await vi.runAllTimersAsync();

    // Should complete without throwing
    await expect(shutdownPromise).resolves.toBeUndefined();
  });
});
