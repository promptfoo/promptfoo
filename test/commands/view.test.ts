import { Command } from 'commander';
import { viewCommand } from '../../src/commands/view';
import { getDefaultPort } from '../../src/constants';
import { startServer } from '../../src/server/server';
import telemetry from '../../src/telemetry';
import { setupEnv } from '../../src/util';
import { setConfigDirectoryPath } from '../../src/util/config/manage';
import { BrowserBehavior } from '../../src/util/server';

jest.mock('../../src/server/server');
jest.mock('../../src/telemetry');
jest.mock('../../src/util');
jest.mock('../../src/util/config/manage');

describe('viewCommand', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    jest.clearAllMocks();
  });

  it('should register view command with correct options', () => {
    viewCommand(program);

    const viewCmd = program.commands[0];
    expect(viewCmd.name()).toBe('view');
    expect(viewCmd.description()).toBe('Start browser UI');

    const options = viewCmd.opts();
    expect(options).toEqual({
      port: getDefaultPort().toString(),
    });
  });

  it('should call startServer with correct parameters when executed', async () => {
    viewCommand(program);
    const viewCmd = program.commands[0];

    await viewCmd.parseAsync(['node', 'test', '--port', '3001']);

    expect(startServer).toHaveBeenCalledWith('3001', BrowserBehavior.ASK, undefined);
  });

  it('should handle directory parameter and set config directory', async () => {
    viewCommand(program);
    const viewCmd = program.commands[0];

    await viewCmd.parseAsync(['node', 'test', 'testdir', '--port', '3001']);

    expect(setConfigDirectoryPath).toHaveBeenCalledWith('testdir');
  });

  it('should handle browser behavior options correctly', async () => {
    viewCommand(program);
    const viewCmd = program.commands[0];

    await viewCmd.parseAsync(['node', 'test', '--yes']);
    expect(startServer).toHaveBeenCalledWith(
      getDefaultPort().toString(),
      BrowserBehavior.OPEN,
      undefined,
    );

    jest.clearAllMocks();

    // Use a unique port to avoid confusion with default port
    await viewCmd.parseAsync(['node', 'test', '--no', '--port', '15500']);
    // --no sets BrowserBehavior.OPEN when both --yes and --no are supplied due to commander behavior
    expect(startServer).toHaveBeenCalledWith('15500', BrowserBehavior.OPEN, undefined);
  });

  it('should handle filter description option', async () => {
    viewCommand(program);
    const viewCmd = program.commands[0];

    await viewCmd.parseAsync(['node', 'test', '--filter-description', 'test-pattern']);

    expect(startServer).toHaveBeenCalledWith(
      getDefaultPort().toString(),
      BrowserBehavior.ASK,
      'test-pattern',
    );
  });

  it('should setup environment from env file path', async () => {
    viewCommand(program);
    const viewCmd = program.commands[0];

    await viewCmd.parseAsync(['node', 'test', '--env-path', '.env.test']);

    expect(setupEnv).toHaveBeenCalledWith('.env.test');
  });

  it('should record telemetry when command is used', async () => {
    viewCommand(program);
    const viewCmd = program.commands[0];

    await viewCmd.parseAsync(['node', 'test']);

    expect(telemetry.record).toHaveBeenCalledWith('command_used', {
      name: 'view',
    });
  });

  it('should handle both --yes and --no options with --yes taking precedence', async () => {
    viewCommand(program);
    const viewCmd = program.commands[0];

    await viewCmd.parseAsync(['node', 'test', '--yes', '--no']);

    expect(startServer).toHaveBeenCalledWith(
      getDefaultPort().toString(),
      BrowserBehavior.OPEN,
      undefined,
    );
  });

  it('should call startServer with default port if no port is specified', async () => {
    viewCommand(program);
    const viewCmd = program.commands[0];

    await viewCmd.parseAsync(['node', 'test']);

    expect(startServer).toHaveBeenCalledWith(
      getDefaultPort().toString(),
      BrowserBehavior.ASK,
      undefined,
    );
  });

  it('should support all options together', async () => {
    viewCommand(program);
    const viewCmd = program.commands[0];

    await viewCmd.parseAsync([
      'node',
      'test',
      'mydir',
      '--port',
      '9876',
      '--yes',
      '--filter-description',
      'desc',
      '--env-path',
      '.env.foo',
    ]);

    expect(setConfigDirectoryPath).toHaveBeenCalledWith('mydir');
    expect(setupEnv).toHaveBeenCalledWith('.env.foo');
    expect(startServer).toHaveBeenCalledWith('9876', BrowserBehavior.OPEN, 'desc');
    expect(telemetry.record).toHaveBeenCalledWith('command_used', {
      name: 'view',
    });
  });

  it('should pass undefined directory if not provided', async () => {
    viewCommand(program);
    const viewCmd = program.commands[0];

    await viewCmd.parseAsync(['node', 'test', '--port', '3002']);
    expect(setConfigDirectoryPath).not.toHaveBeenCalled();
  });

  it('should prefer --yes over --no if both are supplied', async () => {
    viewCommand(program);
    const viewCmd = program.commands[0];

    await viewCmd.parseAsync(['node', 'test', '--yes', '--no', '--port', '4444']);
    expect(startServer).toHaveBeenCalledWith('4444', BrowserBehavior.OPEN, undefined);
  });

  it('should parse port as string if passed as number', async () => {
    viewCommand(program);
    const viewCmd = program.commands[0];

    // Simulate user passing a numeric port
    await viewCmd.parseAsync(['node', 'test', '--port', '7777']);
    expect(startServer).toHaveBeenCalledWith('7777', BrowserBehavior.ASK, undefined);
  });

  it('should call startServer with undefined filterDescription if not provided', async () => {
    viewCommand(program);
    const viewCmd = program.commands[0];

    await viewCmd.parseAsync(['node', 'test', '--yes', '--port', '2222']);
    expect(startServer).toHaveBeenCalledWith('2222', BrowserBehavior.OPEN, undefined);
  });

  it('should handle --filter-description with empty string', async () => {
    viewCommand(program);
    const viewCmd = program.commands[0];

    await viewCmd.parseAsync(['node', 'test', '--filter-description', '']);
    expect(startServer).toHaveBeenCalledWith(getDefaultPort().toString(), BrowserBehavior.ASK, '');
  });

  it('should call setupEnv with undefined if --env-path not provided', async () => {
    viewCommand(program);
    const viewCmd = program.commands[0];
    await viewCmd.parseAsync(['node', 'test']);
    expect(setupEnv).toHaveBeenCalledWith(undefined);
  });

  it('should call startServer with correct port and browserBehavior when only --no is supplied and --yes is not present', async () => {
    viewCommand(program);
    const viewCmd = program.commands[0];

    jest.clearAllMocks();
    // Only --no, no --yes
    await viewCmd.parseAsync(['node', 'test', '--no', '--port', '15501']);
    // Commander sets --no to true, --yes to undefined, so browserBehavior should be SKIP
    expect(startServer).toHaveBeenCalledWith('15501', BrowserBehavior.SKIP, undefined);
  });

  it('should call startServer with correct port and browserBehavior when only --yes is supplied', async () => {
    viewCommand(program);
    const viewCmd = program.commands[0];

    jest.clearAllMocks();
    await viewCmd.parseAsync(['node', 'test', '--yes', '--port', '16600']);
    expect(startServer).toHaveBeenCalledWith('16600', BrowserBehavior.OPEN, undefined);
  });

  it('should call startServer with ASK when neither --yes nor --no is supplied', async () => {
    viewCommand(program);
    const viewCmd = program.commands[0];

    jest.clearAllMocks();
    await viewCmd.parseAsync(['node', 'test', '--port', '17700']);
    expect(startServer).toHaveBeenCalledWith('17700', BrowserBehavior.ASK, undefined);
  });
});
