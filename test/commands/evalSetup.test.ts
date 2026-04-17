import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evalSetupCommand } from '../../src/commands/evalSetup';
import { getDefaultPort } from '../../src/constants';
import { startServer } from '../../src/server/server';
import telemetry from '../../src/telemetry';
import { setupEnv } from '../../src/util';
import { setConfigDirectoryPath } from '../../src/util/config/manage';
import { BrowserBehavior, checkServerRunning, openBrowser } from '../../src/util/server';

vi.mock('../../src/server/server');
vi.mock('../../src/telemetry');
vi.mock('../../src/util/server');
vi.mock('../../src/util', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    setupEnv: vi.fn(),
  };
});
vi.mock('../../src/util/config/manage', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    setConfigDirectoryPath: vi.fn(),
  };
});

describe('evalSetupCommand', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    vi.clearAllMocks();
  });

  it('should register the setup command with correct options', () => {
    evalSetupCommand(program);
    const setupCmd = program.commands.find((cmd) => cmd.name() === 'setup');

    expect(setupCmd).toBeDefined();
    expect(setupCmd?.description()).toBe('Start browser UI and open to eval setup');
    expect(setupCmd?.opts().port).toBe(getDefaultPort().toString());
  });

  it('should handle setup command without directory', async () => {
    vi.mocked(checkServerRunning).mockResolvedValue(false);
    evalSetupCommand(program);

    await program.parseAsync(['node', 'test', 'setup', '--port', '3000']);

    expect(setupEnv).toHaveBeenCalledWith(undefined);
    expect(telemetry.record).toHaveBeenCalledWith('eval setup', {});
    expect(startServer).toHaveBeenCalledWith('3000', BrowserBehavior.OPEN_TO_EVAL_SETUP);
  });

  it('should handle setup command with directory', async () => {
    vi.mocked(checkServerRunning).mockResolvedValue(false);
    evalSetupCommand(program);

    await program.parseAsync(['node', 'test', 'setup', 'test-dir', '--port', '3000']);

    expect(setConfigDirectoryPath).toHaveBeenCalledWith('test-dir');
    expect(startServer).toHaveBeenCalledWith('3000', BrowserBehavior.OPEN_TO_EVAL_SETUP);
  });

  it('should open browser if server is already running', async () => {
    vi.mocked(checkServerRunning).mockResolvedValue(true);
    evalSetupCommand(program);

    await program.parseAsync(['node', 'test', 'setup']);

    expect(openBrowser).toHaveBeenCalledWith(BrowserBehavior.OPEN_TO_EVAL_SETUP);
    expect(startServer).not.toHaveBeenCalled();
  });

  it('should handle setup command with env file path', async () => {
    vi.mocked(checkServerRunning).mockResolvedValue(false);
    evalSetupCommand(program);

    await program.parseAsync(['node', 'test', 'setup', '--env-file', '.env.test']);

    expect(setupEnv).toHaveBeenCalledWith('.env.test');
  });
});
