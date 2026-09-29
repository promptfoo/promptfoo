import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { providersCommand } from '../../src/commands/providers';
import { getEnvString } from '../../src/envars';
import logger from '../../src/logger';
import { getDefaultProviders } from '../../src/providers/defaults';

vi.mock('../../src/logger', () => ({ default: { info: vi.fn(), error: vi.fn() } }));
vi.mock('../../src/providers/defaults', () => ({ getDefaultProviders: vi.fn() }));

describe('providers command', () => {
  const originalExitCode = process.exitCode;
  const callApi = vi.fn();
  const provider = { id: () => 'test:model', callApi, config: { apiKey: 'private-key' } };
  let program: Command;

  beforeEach(() => {
    vi.resetAllMocks();
    process.exitCode = undefined;
    program = new Command();
    providersCommand(program, { env: { ANTHROPIC_API_KEY: 'configured-key' } });
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    });
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.resetAllMocks();
  });

  it('shows the resolved slots without printing config or making model calls', async () => {
    await program.parseAsync(['node', 'test', 'providers']);

    expect(getDefaultProviders).toHaveBeenCalledExactlyOnceWith({
      ANTHROPIC_API_KEY: 'configured-key',
    });
    const output = vi.mocked(logger.info).mock.calls.flat().join('\n');
    for (const slot of [
      'embedding',
      'gradingJson',
      'grading',
      'moderation',
      'suggestions',
      'synthesize',
    ]) {
      expect(output).toContain(`${slot}Provider: test:model`);
    }
    expect(output).toContain('Eval-specific provider overrides are not included.');
    expect(output).not.toContain('private-key');
    expect(output).not.toContain('configured-key');
    expect(callApi).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('includes optional assignments and omits absent slots', async () => {
    const defaults = await getDefaultProviders();
    vi.mocked(getDefaultProviders).mockResolvedValue({
      ...defaults,
      llmRubricProvider: { ...provider, id: () => 'test:rubric' },
      webSearchProvider: undefined,
    });

    await program.parseAsync(['node', 'test', 'providers']);

    expect(logger.info).toHaveBeenCalledWith('  llmRubricProvider: test:rubric');
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('webSearchProvider'));
    expect(callApi).not.toHaveBeenCalled();
  });

  it('scopes config environment overrides to provider resolution', async () => {
    const defaults = await getDefaultProviders();
    vi.mocked(getDefaultProviders).mockImplementation(async () => {
      expect(getEnvString('ANTHROPIC_API_KEY')).toBe('configured-key');
      return defaults;
    });
    await cliState.withEnv({ ANTHROPIC_API_KEY: 'outer-key' }, async () => {
      await program.parseAsync(['node', 'test', 'providers']);
      expect(getEnvString('ANTHROPIC_API_KEY')).toBe('outer-key');
    });
  });

  it('reports resolution errors and exits unsuccessfully', async () => {
    const error = new Error('Unavailable provider defaults');
    vi.mocked(getDefaultProviders).mockRejectedValue(error);

    await program.parseAsync(['node', 'test', 'providers']);

    expect(logger.error).toHaveBeenCalledWith('Failed to determine default providers', { error });
    expect(process.exitCode).toBe(1);
    expect(logger.info).not.toHaveBeenCalled();
  });
});
