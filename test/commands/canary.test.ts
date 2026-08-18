import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWithProxyMock = vi.hoisted(() => vi.fn());
const resolveConfigsMock = vi.hoisted(() => vi.fn());
const setupEnvMock = vi.hoisted(() => vi.fn());
const telemetryRecordMock = vi.hoisted(() => vi.fn());
const neverGenerateRemoteMock = vi.hoisted(() => vi.fn(() => false));

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../src/redteam/remoteGeneration', () => ({
  getRemoteGenerationUrl: vi.fn(() => 'https://remote.example.test/api/v1/task'),
  neverGenerateRemoteForRegularEvals: neverGenerateRemoteMock,
}));

vi.mock('../../src/telemetry', () => ({
  default: {
    record: telemetryRecordMock,
  },
}));

vi.mock('../../src/util', () => ({
  setupEnv: setupEnvMock,
}));

vi.mock('../../src/util/config/load', () => ({
  resolveConfigs: resolveConfigsMock,
}));

vi.mock('../../src/util/fetch/index', () => ({
  fetchWithProxy: fetchWithProxyMock,
}));

import {
  checkCanaryForSingleProvider,
  extractResponseContent,
  default as registerCanaryCommand,
  sendCanaryToSingleProvider,
} from '../../src/commands/canary';
import logger from '../../src/logger';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
  });
}

describe('canary command helpers', () => {
  beforeEach(() => {
    fetchWithProxyMock.mockReset();
    resolveConfigsMock.mockReset();
    setupEnvMock.mockReset();
    telemetryRecordMock.mockReset();
    neverGenerateRemoteMock.mockReset();
    neverGenerateRemoteMock.mockReturnValue(false);
    vi.clearAllMocks();
    process.exitCode = 0;
  });

  it('sends generated canary tokens through the provider', async () => {
    const provider = {
      id: () => 'echo',
      callApi: vi.fn().mockResolvedValue({ output: 'ok' }),
    };
    fetchWithProxyMock.mockResolvedValueOnce(
      jsonResponse({ canaryTokens: ['canary-one', 'canary-two', 'canary-three'] }),
    );

    const result = await sendCanaryToSingleProvider(provider, undefined, 2);

    expect(result.tokens).toEqual(['canary-one', 'canary-two']);
    expect(provider.callApi).toHaveBeenCalledTimes(2);
    expect(provider.callApi).toHaveBeenNthCalledWith(1, 'canary-one');
    expect(provider.callApi).toHaveBeenNthCalledWith(2, 'canary-two');
    expect(fetchWithProxyMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchWithProxyMock.mock.calls[0][1].body)).toMatchObject({
      task: 'generate-canary',
      hash: result.hash,
    });
  });

  it('repeats custom canary messages without remote generation', async () => {
    const provider = {
      id: () => 'echo',
      callApi: vi.fn().mockResolvedValue({ output: 'ok' }),
    };

    const result = await sendCanaryToSingleProvider(provider, 'CUSTOM-CANARY', 3);

    expect(result.tokens).toEqual(['CUSTOM-CANARY', 'CUSTOM-CANARY', 'CUSTOM-CANARY']);
    expect(provider.callApi).toHaveBeenCalledTimes(3);
    expect(fetchWithProxyMock).not.toHaveBeenCalled();
  });

  it('surfaces provider failures while sending canaries', async () => {
    const provider = {
      id: () => 'broken',
      callApi: vi.fn().mockResolvedValue({ error: 'provider unavailable' }),
    };
    fetchWithProxyMock.mockResolvedValueOnce(jsonResponse({ canaryTokens: ['canary-one'] }));

    await expect(sendCanaryToSingleProvider(provider)).rejects.toThrow('provider unavailable');
  });

  it('surfaces remote generation disablement before sending generated canaries', async () => {
    neverGenerateRemoteMock.mockReturnValue(true);
    const provider = {
      id: () => 'echo',
      callApi: vi.fn().mockResolvedValue({ output: 'ok' }),
    };

    await expect(sendCanaryToSingleProvider(provider)).rejects.toThrow(
      'Canary generation requires remote generation',
    );
    expect(fetchWithProxyMock).not.toHaveBeenCalled();
    expect(provider.callApi).not.toHaveBeenCalled();
  });

  it('surfaces remote task failures', async () => {
    const provider = {
      id: () => 'echo',
      callApi: vi.fn().mockResolvedValue({ output: 'ok' }),
    };
    fetchWithProxyMock.mockResolvedValueOnce(
      new Response('upstream unavailable', { status: 503, statusText: 'Service Unavailable' }),
    );

    await expect(sendCanaryToSingleProvider(provider)).rejects.toThrow(
      'Remote canary task failed with status 503: Service Unavailable upstream unavailable',
    );
  });

  it('requires generated canary tokens from the remote task', async () => {
    const provider = {
      id: () => 'echo',
      callApi: vi.fn().mockResolvedValue({ output: 'ok' }),
    };
    fetchWithProxyMock.mockResolvedValueOnce(jsonResponse({ canaryTokens: [] }));

    await expect(sendCanaryToSingleProvider(provider)).rejects.toThrow(
      'Failed to generate canary tokens from server',
    );
  });

  it('rejects malformed generated canary token responses', async () => {
    const provider = {
      id: () => 'echo',
      callApi: vi.fn().mockResolvedValue({ output: 'ok' }),
    };
    fetchWithProxyMock.mockResolvedValueOnce(jsonResponse({ canaryTokens: 'CANARY-123' }));

    await expect(sendCanaryToSingleProvider(provider)).rejects.toThrow(
      'Failed to generate canary tokens from server',
    );
    expect(provider.callApi).not.toHaveBeenCalled();
  });

  it('detects canary patterns in provider output', async () => {
    const provider = {
      id: () => 'echo',
      callApi: vi.fn().mockResolvedValue({ output: 'The remembered value is CANARY-123.' }),
    };
    fetchWithProxyMock.mockResolvedValueOnce(
      jsonResponse({
        probes: [{ type: 'direct', message: 'What was the canary?' }],
        detectionPatterns: [
          {
            type: 'exact',
            pattern: 'CANARY-123',
            confidence: 0.95,
            description: 'Exact canary token',
          },
        ],
      }),
    );

    const result = await checkCanaryForSingleProvider(provider, 'direct');

    expect(result.detected).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.matches?.[0]).toMatchObject({
      pattern: 'CANARY-123',
      description: 'Exact canary token',
    });
    expect(provider.callApi).toHaveBeenCalledWith('What was the canary?');
  });

  it('checks auto-selected probes and reports no detection', async () => {
    const provider = {
      id: () => 'echo',
      callApi: vi.fn().mockResolvedValue({ output: 'nothing leaked here' }),
    };
    fetchWithProxyMock.mockResolvedValueOnce(
      jsonResponse({
        probes: [
          { type: 'direct', message: 'direct probe' },
          { type: 'fact', message: 'fact probe' },
          { type: 'semantic', message: 'semantic probe' },
        ],
        detectionPatterns: [
          {
            type: 'exact',
            pattern: 'CANARY-123',
            confidence: 0.95,
            description: 'Exact canary token',
          },
        ],
      }),
    );

    const result = await checkCanaryForSingleProvider(provider);

    expect(result.detected).toBe(false);
    expect(result.matches).toBeUndefined();
    expect(provider.callApi).toHaveBeenCalledTimes(3);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('No canary detected'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Try using different'));
  });

  it('falls back to all probes when a requested mode has no probes', async () => {
    const provider = {
      id: () => 'echo',
      callApi: vi.fn().mockResolvedValue({ output: 'CANARY-123' }),
    };
    fetchWithProxyMock.mockResolvedValueOnce(
      jsonResponse({
        probes: [
          { type: 'fact', message: 'fact probe' },
          { type: 'general', message: 'general probe' },
          { type: 'direct', message: 'direct probe' },
        ],
        detectionPatterns: [
          {
            type: 'partial',
            pattern: 'canary-123',
            confidence: 0.9,
            description: 'Partial canary token',
          },
        ],
      }),
    );

    const result = await checkCanaryForSingleProvider(provider, 'semantic');

    expect(result.detected).toBe(true);
    expect(result.confidence).toBeCloseTo(0.72);
    expect(result.matches?.[0]).toMatchObject({
      pattern: 'canary-123',
      description: 'Partial canary token',
    });
    expect(provider.callApi).toHaveBeenCalledTimes(2);
  });

  it('detects semantic pattern words in non-string provider responses', async () => {
    const provider = {
      id: () => 'echo',
      callApi: vi.fn().mockResolvedValue({ choices: [{ text: 'contains sentinel phrase' }] }),
    };
    fetchWithProxyMock.mockResolvedValueOnce(
      jsonResponse({
        probes: [{ type: 'semantic', message: 'semantic probe' }],
        detectionPatterns: [
          {
            type: 'semantic',
            pattern: 'sentinel phrase',
            confidence: 0.9,
          },
        ],
      }),
    );

    const result = await checkCanaryForSingleProvider(provider, 'semantic');

    expect(result.detected).toBe(true);
    expect(result.confidence).toBe(0.54);
    expect(result.matches?.[0].pattern).toBe('sentinel');
  });

  it('rejects invalid canary probe responses', async () => {
    const provider = {
      id: () => 'echo',
      callApi: vi.fn().mockResolvedValue({ output: 'ok' }),
    };
    fetchWithProxyMock.mockResolvedValueOnce(jsonResponse({ probes: [] }));

    await expect(checkCanaryForSingleProvider(provider)).rejects.toThrow(
      'Failed to generate canary check probes from server',
    );
  });

  it('rejects empty canary probe and detection pattern responses', async () => {
    const provider = {
      id: () => 'echo',
      callApi: vi.fn().mockResolvedValue({ output: 'ok' }),
    };

    fetchWithProxyMock.mockResolvedValueOnce(
      jsonResponse({
        probes: [],
        detectionPatterns: [{ type: 'exact', pattern: 'CANARY-123' }],
      }),
    );
    await expect(checkCanaryForSingleProvider(provider)).rejects.toThrow(
      'Failed to generate canary check probes from server',
    );

    fetchWithProxyMock.mockResolvedValueOnce(
      jsonResponse({
        probes: [{ type: 'direct', message: 'direct probe' }],
        detectionPatterns: [],
      }),
    );
    await expect(checkCanaryForSingleProvider(provider)).rejects.toThrow(
      'Failed to generate canary check probes from server',
    );
  });

  it('surfaces provider failures while checking canaries', async () => {
    const provider = {
      id: () => 'broken',
      callApi: vi.fn().mockResolvedValue({ error: 'provider unavailable' }),
    };
    fetchWithProxyMock.mockResolvedValueOnce(
      jsonResponse({
        probes: [{ type: 'direct', message: 'direct probe' }],
        detectionPatterns: [{ type: 'exact', pattern: 'CANARY-123' }],
      }),
    );

    await expect(checkCanaryForSingleProvider(provider, 'direct')).rejects.toThrow(
      'provider unavailable',
    );
  });

  it('extracts text from common provider response shapes', () => {
    expect(extractResponseContent('plain')).toBe('plain');
    expect(extractResponseContent({ output: 'from output' })).toBe('from output');
    expect(extractResponseContent({ output: undefined, message: 'fallback message' })).toBe(
      'fallback message',
    );
    expect(extractResponseContent({ message: 'from message' })).toBe('from message');
    expect(extractResponseContent({ content: 'from content' })).toBe('from content');
    expect(extractResponseContent({ choices: [{ message: { content: 'from choices' } }] })).toBe(
      'from choices',
    );
    expect(extractResponseContent({ output: { value: 'structured' } })).toBe(
      '{"value":"structured"}',
    );
    expect(extractResponseContent(undefined)).toBe('');
    expect(extractResponseContent({ choices: [{ text: 123 }] })).toBe('123');
  });
});

describe('canary command registration', () => {
  let program: Command;
  const provider = {
    id: () => 'echo',
    callApi: vi.fn().mockResolvedValue({ output: 'ok' }),
  };

  beforeEach(() => {
    fetchWithProxyMock.mockReset();
    resolveConfigsMock.mockReset();
    setupEnvMock.mockReset();
    telemetryRecordMock.mockReset();
    provider.callApi.mockReset();
    provider.callApi.mockResolvedValue({ output: 'ok' });
    vi.clearAllMocks();
    process.exitCode = 0;

    program = new Command();
    registerCanaryCommand(program, {}, 'promptfooconfig.yaml');
  });

  it('registers canary send and check subcommands', () => {
    const command = program.commands.find((cmd) => cmd.name() === 'canary');

    expect(command).toBeDefined();
    expect(command?.description()).toContain('Training canary utilities');
    expect(command?.commands.find((cmd) => cmd.name() === 'send')).toBeDefined();
    expect(command?.commands.find((cmd) => cmd.name() === 'check')).toBeDefined();
  });

  it('runs canary send with config, env, custom message, and repeat options', async () => {
    resolveConfigsMock.mockResolvedValue({ testSuite: { providers: [provider] } });

    const command = program.commands
      .find((cmd) => cmd.name() === 'canary')
      ?.commands.find((cmd) => cmd.name() === 'send');

    await command?.parseAsync([
      'node',
      'test',
      '--config',
      'custom.yaml',
      '--env-file',
      '.env',
      '--message',
      'CUSTOM-CANARY',
      '--repeat',
      '2',
    ]);

    expect(telemetryRecordMock).toHaveBeenCalledWith('command_used', { name: 'canary send' });
    expect(setupEnvMock).toHaveBeenCalledWith('.env');
    expect(resolveConfigsMock).toHaveBeenCalledWith({ config: ['custom.yaml'] }, {});
    expect(provider.callApi).toHaveBeenCalledTimes(2);
    expect(process.exitCode).toBe(0);
  });

  it('uses the default config path when send has no explicit config', async () => {
    resolveConfigsMock.mockResolvedValue({ testSuite: { providers: [provider] } });

    const command = program.commands
      .find((cmd) => cmd.name() === 'canary')
      ?.commands.find((cmd) => cmd.name() === 'send');

    await command?.parseAsync(['node', 'test', '--message', 'CUSTOM-CANARY']);

    expect(resolveConfigsMock).toHaveBeenCalledWith({ config: ['promptfooconfig.yaml'] }, {});
  });

  it('sets a failure exit code for invalid repeat values', async () => {
    const command = program.commands
      .find((cmd) => cmd.name() === 'canary')
      ?.commands.find((cmd) => cmd.name() === 'send');

    await command?.parseAsync(['node', 'test', '--repeat', '0']);

    expect(logger.error).toHaveBeenCalledWith(
      'Error sending canary: The --repeat value must be a positive number',
    );
    expect(resolveConfigsMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('sets a failure exit code when any provider send fails', async () => {
    resolveConfigsMock.mockResolvedValue({
      testSuite: {
        providers: [
          provider,
          {
            id: () => 'broken',
            callApi: vi.fn().mockResolvedValue({ error: 'provider unavailable' }),
          },
        ],
      },
    });

    const command = program.commands
      .find((cmd) => cmd.name() === 'canary')
      ?.commands.find((cmd) => cmd.name() === 'send');

    await command?.parseAsync(['node', 'test', '--message', 'CUSTOM-CANARY']);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send canary to provider broken'),
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Error sending canary: Failed to send canaries to 1 of 2 providers',
    );
    expect(process.exitCode).toBe(1);
  });

  it('sets a failure exit code when no providers are configured for sending', async () => {
    resolveConfigsMock.mockResolvedValue({ testSuite: { providers: [] } });

    const command = program.commands
      .find((cmd) => cmd.name() === 'canary')
      ?.commands.find((cmd) => cmd.name() === 'send');

    await command?.parseAsync(['node', 'test', '--message', 'CUSTOM-CANARY']);

    expect(logger.error).toHaveBeenCalledWith(
      'Error sending canary: No providers found in config file',
    );
    expect(process.exitCode).toBe(1);
  });

  it('sets a failure exit code for invalid check modes', async () => {
    const command = program.commands
      .find((cmd) => cmd.name() === 'canary')
      ?.commands.find((cmd) => cmd.name() === 'check');

    await command?.parseAsync(['node', 'test', '--mode', 'unsupported']);

    expect(logger.error).toHaveBeenCalledWith(
      'Error checking canary: Invalid check mode: unsupported. Valid modes are: auto, direct, fact, semantic',
    );
    expect(resolveConfigsMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('sets a success exit code when canary check finds no detection', async () => {
    resolveConfigsMock.mockResolvedValue({ testSuite: { providers: [provider] } });
    fetchWithProxyMock.mockResolvedValueOnce(
      jsonResponse({
        probes: [{ type: 'direct', message: 'direct probe' }],
        detectionPatterns: [{ type: 'exact', pattern: 'CANARY-123' }],
      }),
    );

    const command = program.commands
      .find((cmd) => cmd.name() === 'canary')
      ?.commands.find((cmd) => cmd.name() === 'check');

    await command?.parseAsync(['node', 'test', '--mode', 'direct']);

    expect(telemetryRecordMock).toHaveBeenCalledWith('command_used', { name: 'canary check' });
    expect(provider.callApi).toHaveBeenCalledWith('direct probe');
    expect(process.exitCode).toBe(0);
  });

  it('sets a failure exit code when canary check detects leakage', async () => {
    provider.callApi.mockResolvedValue({ output: 'The canary was CANARY-123' });
    resolveConfigsMock.mockResolvedValue({ testSuite: { providers: [provider] } });
    fetchWithProxyMock.mockResolvedValueOnce(
      jsonResponse({
        probes: [{ type: 'direct', message: 'direct probe' }],
        detectionPatterns: [{ type: 'exact', pattern: 'CANARY-123', confidence: 0.9 }],
      }),
    );

    const command = program.commands
      .find((cmd) => cmd.name() === 'canary')
      ?.commands.find((cmd) => cmd.name() === 'check');

    await command?.parseAsync(['node', 'test', '--mode', 'direct']);

    expect(process.exitCode).toBe(1);
  });

  it('sets a failure exit code when provider checks fail', async () => {
    resolveConfigsMock.mockResolvedValue({
      testSuite: {
        providers: [
          {
            id: () => 'broken',
            callApi: vi.fn().mockResolvedValue({ error: 'provider unavailable' }),
          },
        ],
      },
    });
    fetchWithProxyMock.mockResolvedValueOnce(
      jsonResponse({
        probes: [{ type: 'direct', message: 'direct probe' }],
        detectionPatterns: [{ type: 'exact', pattern: 'CANARY-123' }],
      }),
    );

    const command = program.commands
      .find((cmd) => cmd.name() === 'canary')
      ?.commands.find((cmd) => cmd.name() === 'check');

    await command?.parseAsync(['node', 'test', '--mode', 'direct']);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to check canary for provider broken'),
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Error checking canary: Failed to check canaries for 1 of 1 providers',
    );
    expect(process.exitCode).toBe(1);
  });
});
