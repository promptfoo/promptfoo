import { Command } from 'commander';
import { redteamReportCommand } from '../../../src/redteam/commands/report';
import { startServer } from '../../../src/server/server';
import telemetry from '../../../src/telemetry';
import { setupEnv } from '../../../src/util';
import { setConfigDirectoryPath } from '../../../src/util/config/manage';
import { BrowserBehavior, checkServerRunning, openBrowser } from '../../../src/util/server';

jest.mock('../../../src/server/server');
jest.mock('../../../src/telemetry');
jest.mock('../../../src/util');
jest.mock('../../../src/util/config/manage');
jest.mock('../../../src/util/server');

describe('redteamReportCommand', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    jest.clearAllMocks();
  });

  it('should set up command with correct options', () => {
    redteamReportCommand(program);

    const cmd = program.commands[0];
    expect(cmd.name()).toBe('report');
    expect(cmd.description()).toBe('Start browser UI and open to report');
    expect(cmd.opts()).toEqual({
      port: expect.any(String),
      filterDescription: undefined,
      envPath: undefined,
    });
  });

  it('should handle report command with directory', async () => {
    redteamReportCommand(program);
    const cmd = program.commands[0];

    jest.mocked(checkServerRunning).mockResolvedValue(false);

    await cmd.parseAsync(['node', 'test', 'testdir', '--port', '3000']);

    expect(setupEnv).toHaveBeenCalledWith(undefined);
    expect(telemetry.record).toHaveBeenCalledWith('command_used', {
      name: 'redteam report',
    });
    expect(setConfigDirectoryPath).toHaveBeenCalledWith('testdir');
    expect(startServer).toHaveBeenCalledWith('3000', BrowserBehavior.OPEN_TO_REPORT);
  });

  it('should open browser if server is already running', async () => {
    redteamReportCommand(program);
    const cmd = program.commands[0];

    jest.mocked(checkServerRunning).mockResolvedValue(true);

    await cmd.parseAsync(['node', 'test', '--port', '3000']);

    expect(openBrowser).toHaveBeenCalledWith(BrowserBehavior.OPEN_TO_REPORT);
    expect(startServer).not.toHaveBeenCalled();
  });

  it('should ignore filter description option', async () => {
    redteamReportCommand(program);
    const cmd = program.commands[0];

    jest.mocked(checkServerRunning).mockResolvedValue(false);

    await cmd.parseAsync(['node', 'test', '--filter-description', 'test.*']);

    expect(startServer).toHaveBeenCalledWith(expect.any(String), BrowserBehavior.OPEN_TO_REPORT);
  });

  it('should handle report command with env file path', async () => {
    redteamReportCommand(program);
    const cmd = program.commands[0];

    await cmd.parseAsync(['node', 'test', '--env-file', '.env.test']);

    expect(setupEnv).toHaveBeenCalledWith('.env.test');
  });
});
