import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { providersCommand } from '../../src/commands/providers';
import logger from '../../src/logger';
import { getDefaultProviderSelectionInfo } from '../../src/providers/defaults';

vi.mock('../../src/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/providers/defaults', () => ({
  getDefaultProviderSelectionInfo: vi.fn(),
}));

describe('providers command', () => {
  let program: Command;
  const defaultConfig = { env: { ANTHROPIC_API_KEY: 'configured-key' } };
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    vi.resetAllMocks();
    process.exitCode = undefined;
    program = new Command();
    providersCommand(program, defaultConfig);
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.resetAllMocks();
  });

  it('prints detected credentials, skipped providers, and assignments', async () => {
    vi.mocked(getDefaultProviderSelectionInfo).mockResolvedValue({
      selectedProvider: 'Azure OpenAI',
      reason: 'AZURE_API_KEY found',
      detectedCredentials: ['AZURE_API_KEY'],
      skippedProviders: [{ name: 'Anthropic', reason: 'Azure has higher priority' }],
      providerSlots: {
        grading: { id: 'azureopenai:chat:grading', model: 'gpt-4.1' },
        gradingJson: { id: 'azureopenai:chat:grading-json' },
      },
    });

    await program.parseAsync(['node', 'test', 'providers', '--env-file', '.env.local']);

    expect(getDefaultProviderSelectionInfo).toHaveBeenCalledWith(defaultConfig.env);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Default Provider Selection'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('AZURE_API_KEY'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Skipped Providers:'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Anthropic'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('grading'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('gpt-4.1'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('grading-json'));
  });

  it('omits optional sections when there is nothing to report', async () => {
    vi.mocked(getDefaultProviderSelectionInfo).mockResolvedValue({
      selectedProvider: 'GitHub Models',
      reason: 'GITHUB_TOKEN found',
      detectedCredentials: [],
      skippedProviders: [],
      providerSlots: {},
    });

    await program.parseAsync(['node', 'test', 'providers']);

    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Skipped Providers:'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Provider Assignments:'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Override:'));
  });

  it('sets a non-zero exit code when provider selection fails', async () => {
    const error = new Error('no providers');
    vi.mocked(getDefaultProviderSelectionInfo).mockRejectedValue(error);

    await program.parseAsync(['node', 'test', 'providers']);

    expect(logger.error).toHaveBeenCalledWith('Failed to determine default provider selection', {
      error,
    });
    expect(process.exitCode).toBe(1);
  });
});
