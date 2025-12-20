import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloudConfig } from '../../../src/globalConfig/cloud';
import logger from '../../../src/logger';
import { redteamRunCommand } from '../../../src/redteam/commands/run';
import { doRedteamResume, doRedteamRun } from '../../../src/redteam/shared';
import {
  getCompletedPairsFromCloud,
  getConfigFromCloud,
  getEvalFromCloud,
  streamResultsToCloud,
} from '../../../src/util/cloud';

vi.mock('../../../src/cliState', () => ({
  default: {
    remote: false,
    resume: false,
    cloudResumeEvalId: undefined,
    cloudCompletedPairs: undefined,
  },
}));

vi.mock('../../../src/globalConfig/cloud', () => ({
  cloudConfig: {
    isEnabled: vi.fn().mockReturnValue(false),
    getAppUrl: vi.fn().mockReturnValue('https://app.promptfoo.dev'),
  },
}));

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  getLogLevel: vi.fn().mockReturnValue('info'),
}));

vi.mock('../../../src/telemetry', () => ({
  default: {
    record: vi.fn(),
  },
}));

vi.mock('../../../src/util', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    setupEnv: vi.fn(),
  };
});

vi.mock('../../../src/redteam/shared', () => ({
  doRedteamRun: vi.fn().mockResolvedValue({}),
  doRedteamResume: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../src/util/cloud', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getConfigFromCloud: vi.fn(),
    getEvalFromCloud: vi.fn(),
    getCompletedPairsFromCloud: vi.fn(),
    streamResultsToCloud: vi.fn(),
  };
});

describe('redteamRunCommand', () => {
  let program: Command;
  let originalExitCode: number | undefined;

  beforeEach(() => {
    vi.resetAllMocks();
    program = new Command();
    redteamRunCommand(program);
    // Store original exitCode to restore later
    originalExitCode = process.exitCode as number | undefined;
    process.exitCode = 0;
  });

  afterEach(() => {
    // Restore original exitCode
    process.exitCode = originalExitCode;
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
    vi.mocked(getConfigFromCloud).mockResolvedValue(mockConfig);

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

  it('should not support target argument with a local config file', async () => {
    // Find the run command
    const runCommand = program.commands.find((cmd) => cmd.name() === 'run');
    expect(runCommand).toBeDefined();

    const configPath = 'path/to/config.yaml';
    const targetUUID = '87654321-4321-4321-4321-210987654321';

    // Execute the command with the target option but a path config
    await runCommand!.parseAsync(['node', 'test', '--config', configPath, '--target', targetUUID]);

    // Should log error message
    expect(logger.error).toHaveBeenCalledWith(
      `Target ID (-t) can only be used when -c is used. To use a cloud target inside of a config set the id of the target to promptfoo://provider/${targetUUID}. `,
    );

    // Should set exit code to 1
    expect(process.exitCode).toBe(1);

    // getConfigFromCloud should not be called
    expect(getConfigFromCloud).not.toHaveBeenCalled();

    // doRedteamRun should not be called
    expect(doRedteamRun).not.toHaveBeenCalled();
  });

  it('should not support target argument when no cloud config file is provided', async () => {
    // Find the run command
    const runCommand = program.commands.find((cmd) => cmd.name() === 'run');
    expect(runCommand).toBeDefined();

    const targetUUID = '87654321-4321-4321-4321-210987654321';

    // Execute the command with the target option but a path config
    await runCommand!.parseAsync(['node', 'test', '--target', targetUUID]);

    // Should log error message
    expect(logger.error).toHaveBeenCalledWith(
      `Target ID (-t) can only be used when -c is used. To use a cloud target inside of a config set the id of the target to promptfoo://provider/${targetUUID}. `,
    );

    // Should set exit code to 1
    expect(process.exitCode).toBe(1);

    // getConfigFromCloud should not be called
    expect(getConfigFromCloud).not.toHaveBeenCalled();

    // doRedteamRun should not be called
    expect(doRedteamRun).not.toHaveBeenCalled();
  });

  it('should throw error when target is not a UUID', async () => {
    // UUID format for config but not for target
    const configUUID = '12345678-1234-1234-1234-123456789012';
    const invalidTarget = 'not-a-uuid';

    // Find the run command
    const runCommand = program.commands.find((cmd) => cmd.name() === 'run');
    expect(runCommand).toBeDefined();

    // Execute the command with the target option and expect it to throw
    await expect(
      runCommand!.parseAsync(['node', 'test', '--config', configUUID, '--target', invalidTarget]),
    ).rejects.toThrow('Invalid target ID, it must be a valid UUID');

    // Verify getConfigFromCloud was not called
    expect(getConfigFromCloud).not.toHaveBeenCalled();
  });

  it('should handle backwards compatibility with empty targets and a valid target UUID', async () => {
    // Mock the getConfigFromCloud function to return config without targets
    const mockConfig = {
      prompts: ['Test prompt'],
      vars: {},
      providers: [{ id: 'test-provider' }],
      targets: [], // Empty targets
    };
    vi.mocked(getConfigFromCloud).mockResolvedValue(mockConfig);

    // UUID format for config and target
    const configUUID = '12345678-1234-1234-1234-123456789012';
    const targetUUID = '87654321-4321-4321-4321-210987654321';

    // Find the run command
    const runCommand = program.commands.find((cmd) => cmd.name() === 'run');
    expect(runCommand).toBeDefined();

    // Execute the command with the target option
    await runCommand!.parseAsync(['node', 'test', '--config', configUUID, '--target', targetUUID]);

    // Verify that a target was added to the config with the CLOUD_PROVIDER_PREFIX
    expect(mockConfig.targets).toEqual([
      {
        id: `promptfoo://provider/${targetUUID}`,
        config: {},
      },
    ]);

    // Verify doRedteamRun was called with the updated config
    expect(doRedteamRun).toHaveBeenCalledWith(
      expect.objectContaining({
        liveRedteamConfig: mockConfig,
        config: undefined,
        loadedFromCloud: true,
        target: targetUUID,
      }),
    );
  });

  describe('--resume flag', () => {
    it('should reject invalid eval ID format for --resume', async () => {
      const runCommand = program.commands.find((cmd) => cmd.name() === 'run');
      expect(runCommand).toBeDefined();

      await runCommand!.parseAsync(['node', 'test', '--resume', 'invalid-id']);

      expect(logger.error).toHaveBeenCalledWith(
        'Invalid eval ID for --resume. It must be a valid UUID or cloud eval ID.',
      );
      expect(process.exitCode).toBe(1);
    });

    it('should reject --resume when cloud is not configured', async () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);

      const runCommand = program.commands.find((cmd) => cmd.name() === 'run');
      expect(runCommand).toBeDefined();

      const validEvalId = '12345678-1234-1234-1234-123456789012';
      await runCommand!.parseAsync(['node', 'test', '--resume', validEvalId]);

      expect(logger.error).toHaveBeenCalledWith(
        'Cloud is not configured. Please run `promptfoo auth login` to enable cloud features before resuming a scan.',
      );
      expect(process.exitCode).toBe(1);
    });

    it('should accept valid UUID format for --resume', async () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);

      const mockEval = {
        id: '12345678-1234-1234-1234-123456789012',
        createdAt: new Date().toISOString(),
        config: {
          prompts: ['Test prompt'],
          tests: [{ vars: { prompt: 'test' } }],
          providers: ['test-provider'],
        },
      };
      vi.mocked(getEvalFromCloud).mockResolvedValue(mockEval as any);
      vi.mocked(getCompletedPairsFromCloud).mockResolvedValue(new Set(['0:0']));
      vi.mocked(streamResultsToCloud).mockResolvedValue(undefined);

      const runCommand = program.commands.find((cmd) => cmd.name() === 'run');
      expect(runCommand).toBeDefined();

      const validEvalId = '12345678-1234-1234-1234-123456789012';
      await runCommand!.parseAsync(['node', 'test', '--resume', validEvalId]);

      expect(getEvalFromCloud).toHaveBeenCalledWith(validEvalId);
      expect(getCompletedPairsFromCloud).toHaveBeenCalledWith(validEvalId);
      expect(doRedteamResume).toHaveBeenCalled();
    });

    it('should accept cloud eval ID format for --resume', async () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);

      const mockEval = {
        id: 'eval-ABC-2024-01-15T10:30:00',
        createdAt: new Date().toISOString(),
        config: {
          prompts: ['Test prompt'],
          tests: [{ vars: { prompt: 'test' } }],
          providers: ['test-provider'],
        },
      };
      vi.mocked(getEvalFromCloud).mockResolvedValue(mockEval as any);
      vi.mocked(getCompletedPairsFromCloud).mockResolvedValue(new Set());
      vi.mocked(streamResultsToCloud).mockResolvedValue(undefined);

      const runCommand = program.commands.find((cmd) => cmd.name() === 'run');
      expect(runCommand).toBeDefined();

      const cloudEvalId = 'eval-ABC-2024-01-15T10:30:00';
      await runCommand!.parseAsync(['node', 'test', '--resume', cloudEvalId]);

      expect(getEvalFromCloud).toHaveBeenCalledWith(cloudEvalId);
      expect(doRedteamResume).toHaveBeenCalled();
    });

    it('should reject --resume when eval has no generated tests', async () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);

      const mockEval = {
        id: '12345678-1234-1234-1234-123456789012',
        createdAt: new Date().toISOString(),
        config: {
          prompts: ['Test prompt'],
          tests: [], // No tests
          providers: ['test-provider'],
        },
      };
      vi.mocked(getEvalFromCloud).mockResolvedValue(mockEval as any);

      const runCommand = program.commands.find((cmd) => cmd.name() === 'run');
      expect(runCommand).toBeDefined();

      const validEvalId = '12345678-1234-1234-1234-123456789012';
      await runCommand!.parseAsync(['node', 'test', '--resume', validEvalId]);

      expect(logger.error).toHaveBeenCalledWith(
        'Cannot resume: the eval does not contain generated tests. The scan may have failed before test generation completed.',
      );
      expect(process.exitCode).toBe(1);
      expect(doRedteamResume).not.toHaveBeenCalled();
    });
  });
});
