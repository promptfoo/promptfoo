import { Command } from 'commander';
import { generateShortProviderHash } from '../../src/canary';
import telemetryModule from '../../src/telemetry';
import * as cloudUtil from '../../src/util/cloud';
import * as configLoad from '../../src/util/config/load';

jest.mock('../../src/util/cloud');
jest.mock('../../src/util/config/load');
jest.mock('../../src/logger');
jest.mock('../../src/telemetry');
jest.mock('../../src/canary');

const telemetryMock = telemetryModule as any;
const makeRequestMock = cloudUtil.makeRequest as any;
const resolveConfigsMock = configLoad.resolveConfigs as any;

describe('canary command', () => {
  const mockProvider: any = {
    id: () => 'test-provider',
    callApi: jest.fn().mockResolvedValue('test response'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Patch process.exit so it doesn't terminate the test runner
    (global as any).process = {
      ...process,
      exit: jest.fn(),
    };
  });

  describe('sendCanaryToSingleProvider', () => {
    it('should send canary token to provider', async () => {
      const mockResponse = { canaryTokens: ['test-token'] };
      makeRequestMock.mockResolvedValue(mockResponse);
      jest.mocked(generateShortProviderHash).mockReturnValue('test-hash');

      const { sendCanaryToSingleProvider } = await import('../../src/commands/canary');
      const result = await sendCanaryToSingleProvider(mockProvider);

      expect(makeRequestMock).toHaveBeenCalledWith('POST', '/api/v1/task', {
        task: 'GENERATE_CANARY',
        hash: 'test-hash',
      });
      expect(mockProvider.callApi).toHaveBeenCalledWith('test-token');
      expect(result).toEqual({
        success: true,
        hash: 'test-hash',
        tokens: ['test-token'],
      });
    });

    it('should handle custom message', async () => {
      const mockResponse = { canaryTokens: ['test-token'] };
      makeRequestMock.mockResolvedValue(mockResponse);
      jest.mocked(generateShortProviderHash).mockReturnValue('test-hash');

      const { sendCanaryToSingleProvider } = await import('../../src/commands/canary');
      const result = await sendCanaryToSingleProvider(mockProvider, 'custom-message');

      expect(makeRequestMock).toHaveBeenCalledWith('POST', '/api/v1/task', {
        task: 'GENERATE_CANARY',
        hash: 'test-hash',
      });
      expect(mockProvider.callApi).toHaveBeenCalledWith('custom-message');
      expect(result.tokens).toEqual(['custom-message']);
    });

    it('should handle repeat parameter', async () => {
      const mockResponse = { canaryTokens: ['token1', 'token2', 'token3'] };
      makeRequestMock.mockResolvedValue(mockResponse);
      jest.mocked(generateShortProviderHash).mockReturnValue('test-hash');

      const { sendCanaryToSingleProvider } = await import('../../src/commands/canary');
      const result = await sendCanaryToSingleProvider(mockProvider, undefined, 2);

      expect(makeRequestMock).toHaveBeenCalledWith('POST', '/api/v1/task', {
        task: 'GENERATE_CANARY',
        hash: 'test-hash',
      });
      expect(mockProvider.callApi).toHaveBeenCalledWith('token1');
      expect(mockProvider.callApi).toHaveBeenCalledWith('token2');
      expect(result.tokens).toEqual(['token1', 'token2']);
    });

    it('should throw error if provider does not support sending messages', async () => {
      const invalidProvider = { id: 'test' } as any;
      const { sendCanaryToSingleProvider } = await import('../../src/commands/canary');

      await expect(sendCanaryToSingleProvider(invalidProvider)).rejects.toThrow(
        'Provider does not support sending messages',
      );
    });

    it('should throw error if no canary tokens returned', async () => {
      makeRequestMock.mockResolvedValue({});
      const { sendCanaryToSingleProvider } = await import('../../src/commands/canary');

      await expect(sendCanaryToSingleProvider(mockProvider)).rejects.toThrow(
        'Failed to generate canary tokens from server',
      );
    });
  });

  describe('checkCanaryForSingleProvider', () => {
    const mockProbesResponse = {
      probes: [
        { type: 'direct', message: 'test probe 1' },
        { type: 'fact', message: 'test probe 2' },
        { type: 'semantic', message: 'test probe 3' },
      ],
      detectionPatterns: [
        { pattern: 'test pattern', confidence: 0.8, type: 'exact' },
        { pattern: 'partial pattern', confidence: 0.7, type: 'partial' },
        { pattern: 'semantic test', confidence: 0.6, type: 'semantic' },
      ],
    };

    beforeEach(() => {
      makeRequestMock.mockResolvedValue(mockProbesResponse);
      (mockProvider.callApi as any).mockResolvedValue('test response');
      jest.mocked(generateShortProviderHash).mockReturnValue('test-hash');
    });

    it('should check for canary leakage in auto mode', async () => {
      const { checkCanaryForSingleProvider } = await import('../../src/commands/canary');
      const result = await checkCanaryForSingleProvider(mockProvider);

      expect(makeRequestMock).toHaveBeenCalledWith('POST', '/api/v1/task', {
        task: 'GENERATE_CANARY_PROBES',
        hash: 'test-hash',
      });
      expect(mockProvider.callApi).toHaveBeenCalledTimes(3);
      expect(result).toEqual({
        detected: false,
        hash: 'test-hash',
      });
    });

    it('should detect exact pattern matches', async () => {
      (mockProvider.callApi as any).mockResolvedValue('response with test pattern');
      const { checkCanaryForSingleProvider } = await import('../../src/commands/canary');
      const result = await checkCanaryForSingleProvider(mockProvider);

      expect(result).toEqual({
        detected: true,
        matches: expect.arrayContaining([
          expect.objectContaining({
            pattern: 'test pattern',
            confidence: 0.8,
          }),
        ]),
        hash: 'test-hash',
        confidence: 0.8,
      });
    });

    it('should detect partial pattern matches', async () => {
      (mockProvider.callApi as any).mockResolvedValue('response with PARTIAL PATTERN');
      const { checkCanaryForSingleProvider } = await import('../../src/commands/canary');
      const result = await checkCanaryForSingleProvider(mockProvider);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBeCloseTo(0.56, 6);
    });

    it('should detect semantic pattern matches', async () => {
      (mockProvider.callApi as any).mockResolvedValue('response containing semantic');
      const { checkCanaryForSingleProvider } = await import('../../src/commands/canary');
      const result = await checkCanaryForSingleProvider(mockProvider);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBeCloseTo(0.36, 6);
    });

    it('should handle complex response objects', async () => {
      (mockProvider.callApi as any).mockResolvedValue({
        choices: [{ message: { content: 'response with test pattern' } }],
      });

      const { checkCanaryForSingleProvider } = await import('../../src/commands/canary');
      const result = await checkCanaryForSingleProvider(mockProvider);

      expect(result.detected).toBe(true);
    });

    it('should throw error if no probes are returned', async () => {
      makeRequestMock.mockResolvedValue({});
      const { checkCanaryForSingleProvider } = await import('../../src/commands/canary');

      await expect(checkCanaryForSingleProvider(mockProvider)).rejects.toThrow(
        'Failed to generate canary check probes from server',
      );
    });
  });

  describe('command registration', () => {
    let program: Command;

    beforeEach(() => {
      program = new Command();
      resolveConfigsMock.mockResolvedValue({
        testSuite: {
          providers: [mockProvider],
        },
      });
    });

    it('should register canary command with subcommands', async () => {
      const { default: registerCommand } = await import('../../src/commands/canary');
      const command = registerCommand(program);

      expect(command.name()).toBe('canary');
      expect(command.commands.map((cmd: Command) => cmd.name())).toContain('send');
      expect(command.commands.map((cmd: Command) => cmd.name())).toContain('check');
    });

    it('should handle send command with custom message', async () => {
      const { default: registerCommand } = await import('../../src/commands/canary');
      const command = registerCommand(program);

      await command.commands
        .find((cmd: Command) => cmd.name() === 'send')!
        .parseAsync(['node', 'test', '--message', 'custom message']);

      expect(telemetryMock.record).toHaveBeenCalledWith('command_used', { command: 'canary:send' });
    });

    it('should handle send command with repeat parameter', async () => {
      const { default: registerCommand } = await import('../../src/commands/canary');
      const command = registerCommand(program);

      await command.commands
        .find((cmd: Command) => cmd.name() === 'send')!
        .parseAsync(['node', 'test', '--repeat', '2']);

      expect(telemetryMock.record).toHaveBeenCalledWith('command_used', { command: 'canary:send' });
    });

    it('should handle check command with valid mode', async () => {
      const { default: registerCommand } = await import('../../src/commands/canary');
      const command = registerCommand(program);

      await command.commands
        .find((cmd: Command) => cmd.name() === 'check')!
        .parseAsync(['node', 'test', '--mode', 'direct']);

      expect(telemetryMock.record).toHaveBeenCalledWith('command_used', {
        command: 'canary:check',
      });
    });

    it('should throw error for invalid check mode', async () => {
      const { default: registerCommand } = await import('../../src/commands/canary');
      const command = registerCommand(program);
      const checkCommand = command.commands.find((cmd: Command) => cmd.name() === 'check')!;

      // Patch process.exit to throw instead of exiting so we can catch it
      const originalProcessExit = process.exit;
      const exitMock = jest.fn((code?: number) => {
        throw new Error('process.exit: ' + code);
      });
      (process as any).exit = exitMock;

      await expect(checkCommand.parseAsync(['node', 'test', '--mode', 'invalid'])).rejects.toThrow(
        /process\.exit/,
      );

      // Restore process.exit
      (process as any).exit = originalProcessExit;
    });

    it('should handle environment file path', async () => {
      const { default: registerCommand } = await import('../../src/commands/canary');
      const command = registerCommand(program);

      await command.commands
        .find((cmd: Command) => cmd.name() === 'check')!
        .parseAsync(['node', 'test', '--env-path', '.env']);

      expect(telemetryMock.record).toHaveBeenCalledWith('command_used', {
        command: 'canary:check',
      });
    });
  });
});
