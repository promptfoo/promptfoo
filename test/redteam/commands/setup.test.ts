import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultPort } from '../../../src/constants';
import { redteamSetupCommand } from '../../../src/redteam/commands/setup';
import { startServer } from '../../../src/server/server';
import { setConfigDirectoryPath } from '../../../src/util/config/manage';
import { setupEnv } from '../../../src/util/index';
import { BrowserBehavior, checkServerRunning, openBrowser } from '../../../src/util/server';

vi.mock('../../../src/server/server');
vi.mock('../../../src/util/server');
vi.mock('../../../src/util', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    setupEnv: vi.fn(),
  };
});
vi.mock('../../../src/util/config/manage', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    setConfigDirectoryPath: vi.fn(),
  };
});

describe('redteamSetupCommand', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    vi.clearAllMocks();
  });

  it('should register the setup command with correct options', () => {
    redteamSetupCommand(program);
    const setupCmd = program.commands.find((cmd) => cmd.name() === 'setup');

    expect(setupCmd).toBeDefined();
    expect(setupCmd?.description()).toBe('Start browser UI and open to redteam setup');
    expect(setupCmd?.opts().port).toBe(getDefaultPort().toString());
  });

  it('should handle setup command without directory', async () => {
    vi.mocked(checkServerRunning).mockResolvedValue(false);
    redteamSetupCommand(program);

    await program.parseAsync(['node', 'test', 'setup', '--port', '3000']);

    expect(setupEnv).toHaveBeenCalledWith(undefined);
    expect(startServer).toHaveBeenCalledWith('3000', BrowserBehavior.OPEN_TO_REDTEAM_CREATE);
  });

  it('should handle setup command with directory', async () => {
    vi.mocked(checkServerRunning).mockResolvedValue(false);
    redteamSetupCommand(program);

    await program.parseAsync(['node', 'test', 'setup', 'test-dir', '--port', '3000']);

    expect(setConfigDirectoryPath).toHaveBeenCalledWith('test-dir');
    expect(startServer).toHaveBeenCalledWith('3000', BrowserBehavior.OPEN_TO_REDTEAM_CREATE);
  });

  it('should open browser if server is already running', async () => {
    vi.mocked(checkServerRunning).mockResolvedValue(true);
    redteamSetupCommand(program);

    await program.parseAsync(['node', 'test', 'setup']);

    expect(openBrowser).toHaveBeenCalledWith(BrowserBehavior.OPEN_TO_REDTEAM_CREATE);
    expect(startServer).not.toHaveBeenCalled();
  });

  it('should ignore filter description option', async () => {
    vi.mocked(checkServerRunning).mockResolvedValue(false);
    redteamSetupCommand(program);

    await program.parseAsync(['node', 'test', 'setup', '--filter-description', 'test.*']);

    expect(startServer).toHaveBeenCalledWith(
      getDefaultPort().toString(),
      BrowserBehavior.OPEN_TO_REDTEAM_CREATE,
    );
  });

  it('should handle setup command with env file path', async () => {
    vi.mocked(checkServerRunning).mockResolvedValue(false);
    redteamSetupCommand(program);

    await program.parseAsync(['node', 'test', 'setup', '--env-file', '.env.test']);

    expect(setupEnv).toHaveBeenCalledWith('.env.test');
  });
});
