import { Command } from 'commander';
import { redteamRunCommand } from '../../../src/redteam/commands/run';
import { doRedteamRun } from '../../../src/redteam/shared';
import { getConfigFromCloud } from '../../../src/util/cloud';

jest.mock('../../../src/cliState', () => ({
  remote: false,
}));

jest.mock('../../../src/telemetry', () => ({
  record: jest.fn(),
}));

jest.mock('../../../src/util', () => ({
  setupEnv: jest.fn(),
}));

jest.mock('../../../src/redteam/shared', () => ({
  doRedteamRun: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../../src/util/cloud', () => ({
  getConfigFromCloud: jest.fn(),
}));

describe('redteamRunCommand', () => {
  let program: Command;

  beforeEach(() => {
    jest.resetAllMocks();
    program = new Command();
    redteamRunCommand(program);
  });

  it('should use target option to set cloud target when UUID is provided', async () => {
    // Mock the getConfigFromCloud function
    const mockConfig = {
      prompts: ['Test prompt'],
      vars: {},
      providers: [{ id: 'test-provider' }],
      targets: [
        {
          id: 'test-provider',
        },
      ],
    };
    jest.mocked(getConfigFromCloud).mockResolvedValue(mockConfig);

    // UUID format for config and target
    const configUUID = '12345678-1234-1234-1234-123456789012';
    const targetUUID = '87654321-4321-4321-4321-210987654321';

    // Find the run command
    const runCommand = program.commands.find((cmd) => cmd.name() === 'run');
    expect(runCommand).toBeDefined();

    // Execute the command with the target option
    await runCommand!.parseAsync(['node', 'test', '--config', configUUID, '--target', targetUUID]);

    // Verify doRedteamRun was called with the right parameters
    expect(doRedteamRun).toHaveBeenCalledWith(
      expect.objectContaining({
        liveRedteamConfig: mockConfig,
        config: undefined,
        loadedFromCloud: true,
        target: targetUUID,
      }),
    );
  });

  it('should not modify targets when config is not a UUID', async () => {
    // Find the run command
    const runCommand = program.commands.find((cmd) => cmd.name() === 'run');
    expect(runCommand).toBeDefined();

    const configPath = 'path/to/config.yaml';
    const targetUUID = '87654321-4321-4321-4321-210987654321';

    // Execute the command with the target option but a path config
    await runCommand!.parseAsync(['node', 'test', '--config', configPath, '--target', targetUUID]);

    // getConfigFromCloud should not be called
    expect(getConfigFromCloud).not.toHaveBeenCalled();

    // Verify doRedteamRun was called with the right parameters
    expect(doRedteamRun).toHaveBeenCalledWith(
      expect.objectContaining({
        config: configPath,
        target: targetUUID,
      }),
    );
  });

  it('should not modify targets when target is not a UUID', async () => {
    // Mock the getConfigFromCloud function
    const mockConfig = {
      prompts: ['Test prompt'],
      vars: {},
      providers: [{ id: 'test-provider' }],
      targets: [],
    };
    jest.mocked(getConfigFromCloud).mockResolvedValue(mockConfig);

    // UUID format for config but not for target
    const configUUID = '12345678-1234-1234-1234-123456789012';
    const invalidTarget = 'not-a-uuid';

    // Find the run command
    const runCommand = program.commands.find((cmd) => cmd.name() === 'run');
    expect(runCommand).toBeDefined();

    // Execute the command with the target option
    await runCommand!.parseAsync([
      'node',
      'test',
      '--config',
      configUUID,
      '--target',
      invalidTarget,
    ]);

    // Verify the cloud config was not modified
    expect(mockConfig.targets).toEqual([]);

    // Verify doRedteamRun was called with the right parameters
    expect(doRedteamRun).toHaveBeenCalledWith(
      expect.objectContaining({
        liveRedteamConfig: mockConfig,
        config: undefined,
        loadedFromCloud: true,
        target: invalidTarget,
      }),
    );
  });
});
