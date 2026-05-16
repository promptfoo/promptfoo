import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../../src/logger';
import { reconCommand } from '../../../../src/redteam/commands/recon';
import { doRecon } from '../../../../src/redteam/commands/recon/index';
import telemetry from '../../../../src/telemetry';

vi.mock('../../../../src/logger', () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock('../../../../src/telemetry', () => ({
  default: {
    record: vi.fn(),
  },
}));

vi.mock('../../../../src/redteam/commands/recon/index', () => ({
  doRecon: vi.fn(),
}));

describe('reconCommand', () => {
  const mockedDoRecon = vi.mocked(doRecon);

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.resetAllMocks();
    process.exitCode = undefined;
  });

  function createProgram() {
    const program = new Command();
    reconCommand(program);
    return program;
  }

  it('records a successful recon execution', async () => {
    mockedDoRecon.mockResolvedValue({
      purpose: 'Support bot',
      discoveredTools: [{ name: 'lookup', description: 'Lookup' }],
      suggestedPlugins: ['pii:direct'],
      keyFiles: ['src/app.ts'],
      stateful: true,
    });

    await createProgram().parseAsync(
      ['recon', '--provider', 'openai', '--model', 'gpt-test', '--yes', '--no-open'],
      { from: 'user' },
    );

    expect(doRecon).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        model: 'gpt-test',
        yes: true,
        open: false,
      }),
    );
    expect(telemetry.record).toHaveBeenCalledWith('command_used', {
      name: 'redteam recon',
    });
    expect(telemetry.record).toHaveBeenCalledWith(
      'redteam recon',
      expect.objectContaining({
        success: true,
        provider: 'openai',
        discoveredToolsCount: 1,
        suggestedPluginsCount: 1,
        keyFilesCount: 1,
        stateful: true,
      }),
    );
  });

  it('uses telemetry fallbacks when optional recon result fields are absent', async () => {
    mockedDoRecon.mockResolvedValue({});

    await createProgram().parseAsync(['recon', '--yes'], { from: 'user' });

    expect(telemetry.record).toHaveBeenCalledWith(
      'redteam recon',
      expect.objectContaining({
        success: true,
        provider: 'auto',
        discoveredToolsCount: 0,
        suggestedPluginsCount: 0,
        keyFilesCount: 0,
        stateful: false,
      }),
    );
  });

  it('reports invalid args without invoking recon', async () => {
    await createProgram().parseAsync(['recon', '--provider', 'bogus'], { from: 'user' });

    expect(doRecon).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Invalid options:');
    expect(telemetry.record).toHaveBeenCalledWith('redteam recon', {
      success: false,
      error: 'invalid_args',
    });
    expect(process.exitCode).toBe(1);
  });

  it('records recon failures', async () => {
    mockedDoRecon.mockRejectedValue(new Error('provider failed'));

    await createProgram().parseAsync(['recon', '--provider', 'anthropic'], { from: 'user' });

    expect(logger.error).toHaveBeenCalledWith('Recon failed: provider failed');
    expect(telemetry.record).toHaveBeenCalledWith(
      'redteam recon',
      expect.objectContaining({
        success: false,
        provider: 'anthropic',
        error: 'provider failed',
      }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('records unknown non-Error failures', async () => {
    mockedDoRecon.mockRejectedValue('provider failed');

    await createProgram().parseAsync(['recon'], { from: 'user' });

    expect(logger.error).toHaveBeenCalledWith('Recon failed: provider failed');
    expect(telemetry.record).toHaveBeenCalledWith(
      'redteam recon',
      expect.objectContaining({
        success: false,
        provider: 'auto',
        error: 'unknown',
      }),
    );
  });
});
