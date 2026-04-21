import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redteamReportCommand } from '../../../src/redteam/commands/report';
import { startServer } from '../../../src/server/server';
import { setConfigDirectoryPath } from '../../../src/util/config/manage';
import { setupEnv } from '../../../src/util/index';
import { BrowserBehavior, checkServerRunning, openBrowser } from '../../../src/util/server';

vi.mock('../../../src/server/server');
vi.mock('../../../src/util');
vi.mock('../../../src/util/config/manage', () => ({
  getConfigDirectoryPath: vi.fn().mockReturnValue('/tmp/test-config'),
  setConfigDirectoryPath: vi.fn(),
  maybeReadConfig: vi.fn(),
  readConfigs: vi.fn(),
}));
vi.mock('../../../src/util/server');

describe('redteamReportCommand', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    vi.clearAllMocks();
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

    vi.mocked(checkServerRunning).mockResolvedValue(false);

    await cmd.parseAsync(['node', 'test', 'testdir', '--port', '3000']);

    expect(setupEnv).toHaveBeenCalledWith(undefined);
    expect(setConfigDirectoryPath).toHaveBeenCalledWith('testdir');
    expect(startServer).toHaveBeenCalledWith('3000', BrowserBehavior.OPEN_TO_REPORT);
  });

  it('should open browser if server is already running', async () => {
    redteamReportCommand(program);
    const cmd = program.commands[0];

    vi.mocked(checkServerRunning).mockResolvedValue(true);

    await cmd.parseAsync(['node', 'test', '--port', '3000']);

    expect(openBrowser).toHaveBeenCalledWith(BrowserBehavior.OPEN_TO_REPORT);
    expect(startServer).not.toHaveBeenCalled();
  });

  it('should ignore filter description option', async () => {
    redteamReportCommand(program);
    const cmd = program.commands[0];

    vi.mocked(checkServerRunning).mockResolvedValue(false);

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
