import { Command } from 'commander';
import { getDefaultPort } from '../../../src/constants';
import { redteamSetupCommand } from '../../../src/redteam/commands/setup';
import { startServer } from '../../../src/server/server';
import telemetry from '../../../src/telemetry';
import { setupEnv } from '../../../src/util';
import { setConfigDirectoryPath } from '../../../src/util/config/manage';
import { BrowserBehavior, checkServerRunning, openBrowser } from '../../../src/util/server';

jest.mock('../../../src/server/server');
jest.mock('../../../src/util/server');
jest.mock('../../../src/util', () => ({
  setupEnv: jest.fn(),
}));
jest.mock('../../../src/util/config/manage', () => ({
  setConfigDirectoryPath: jest.fn(),
}));
jest.mock('../../../src/telemetry', () => ({
  record: jest.fn(),
}));

describe('redteamSetupCommand', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    jest.clearAllMocks();
  });

  it('should register the setup command with correct options', () => {
    redteamSetupCommand(program);
    const setupCmd = program.commands.find((cmd) => cmd.name() === 'setup');

    expect(setupCmd).toBeDefined();
    expect(setupCmd?.description()).toBe('Start browser UI and open to redteam setup');
    expect(setupCmd?.opts().port).toBe(getDefaultPort().toString());
  });

  it('should handle setup command without directory', async () => {
    jest.mocked(checkServerRunning).mockResolvedValue(false);
    redteamSetupCommand(program);

    await program.parseAsync(['node', 'test', 'setup', '--port', '3000']);

    expect(setupEnv).toHaveBeenCalledWith(undefined);
    expect(telemetry.record).toHaveBeenCalledWith('command_used', {
      name: 'redteam setup',
    });
    expect(startServer).toHaveBeenCalledWith('3000', BrowserBehavior.OPEN_TO_REDTEAM_CREATE);
  });

  it('should handle setup command with directory', async () => {
    jest.mocked(checkServerRunning).mockResolvedValue(false);
    redteamSetupCommand(program);

    await program.parseAsync(['node', 'test', 'setup', 'test-dir', '--port', '3000']);

    expect(setConfigDirectoryPath).toHaveBeenCalledWith('test-dir');
    expect(startServer).toHaveBeenCalledWith('3000', BrowserBehavior.OPEN_TO_REDTEAM_CREATE);
  });

  it('should open browser if server is already running', async () => {
    jest.mocked(checkServerRunning).mockResolvedValue(true);
    redteamSetupCommand(program);

    await program.parseAsync(['node', 'test', 'setup']);

    expect(openBrowser).toHaveBeenCalledWith(BrowserBehavior.OPEN_TO_REDTEAM_CREATE);
    expect(startServer).not.toHaveBeenCalled();
  });

  it('should ignore filter description option', async () => {
    jest.mocked(checkServerRunning).mockResolvedValue(false);
    redteamSetupCommand(program);

    await program.parseAsync(['node', 'test', 'setup', '--filter-description', 'test.*']);

    expect(startServer).toHaveBeenCalledWith(
      getDefaultPort().toString(),
      BrowserBehavior.OPEN_TO_REDTEAM_CREATE,
    );
  });

  it('should handle setup command with env file path', async () => {
    jest.mocked(checkServerRunning).mockResolvedValue(false);
    redteamSetupCommand(program);

    await program.parseAsync(['node', 'test', 'setup', '--env-file', '.env.test']);

    expect(setupEnv).toHaveBeenCalledWith('.env.test');
  });
});
