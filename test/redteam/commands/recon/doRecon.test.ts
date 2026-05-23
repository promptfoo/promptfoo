import * as path from 'path';
import type { ChildProcess } from 'child_process';

import confirm from '@inquirer/confirm';
import opener from 'opener';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../../src/logger';
import { buildRedteamConfig } from '../../../../src/redteam/commands/recon/config';
import { doRecon } from '../../../../src/redteam/commands/recon/index';
import { displayResults } from '../../../../src/redteam/commands/recon/output';
import {
  buildPendingConfig,
  createReconHandoffToken,
  writePendingReconConfig,
} from '../../../../src/redteam/commands/recon/pending';
import { buildReconPrompt } from '../../../../src/redteam/commands/recon/prompt';
import {
  createAnthropicReconProvider,
  createOpenAIReconProvider,
  selectProvider,
} from '../../../../src/redteam/commands/recon/providers';
import { createScratchpad } from '../../../../src/redteam/commands/recon/scratchpad';
import { writePromptfooConfig } from '../../../../src/util/config/writer';

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
}));

vi.mock('@inquirer/confirm', () => ({
  default: vi.fn(),
}));

vi.mock('opener', () => ({
  default: vi.fn(),
}));

const spinner = {
  text: '',
  start: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
};

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    ...spinner,
    start: () => {
      spinner.start();
      return spinner;
    },
  })),
}));

vi.mock('../../../../src/constants', () => ({
  getLocalAppUrl: vi.fn(
    () => 'http://localhost:15500/redteam/setup?source=recon&token=test-handoff-token',
  ),
}));

vi.mock('../../../../src/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../../src/util/config/writer', () => ({
  writePromptfooConfig: vi.fn(),
}));

vi.mock('../../../../src/redteam/commands/recon/config', () => ({
  buildRedteamConfig: vi.fn(() => ({ description: 'generated config' })),
}));

vi.mock('../../../../src/redteam/commands/recon/output', () => ({
  displayResults: vi.fn(),
}));

vi.mock('../../../../src/redteam/commands/recon/pending', () => ({
  buildPendingConfig: vi.fn(() => ({ metadata: { source: 'recon-cli' } })),
  createReconHandoffToken: vi.fn(() => 'test-handoff-token'),
  writePendingReconConfig: vi.fn(),
}));

vi.mock('../../../../src/redteam/commands/recon/prompt', () => ({
  buildReconPrompt: vi.fn(() => 'recon prompt'),
}));

const analyze = vi.fn();

vi.mock('../../../../src/redteam/commands/recon/providers', () => ({
  selectProvider: vi.fn(),
  createOpenAIReconProvider: vi.fn(async () => ({ analyze })),
  createAnthropicReconProvider: vi.fn(async () => ({ analyze })),
}));

vi.mock('../../../../src/redteam/commands/recon/scratchpad', () => ({
  createScratchpad: vi.fn(() => ({
    dir: '/tmp/recon-notes',
    path: '/tmp/recon-notes/notes.md',
    cleanup: vi.fn(),
  })),
}));

describe('doRecon', () => {
  const mockedConfirm = vi.mocked(confirm);
  const mockedOpener = vi.mocked(opener);
  const mockedSelectProvider = vi.mocked(selectProvider);
  const mockedCreateScratchpad = vi.mocked(createScratchpad);

  beforeEach(() => {
    vi.clearAllMocks();
    analyze.mockResolvedValue({
      purpose: 'Target app',
      discoveredTools: [{ name: 'lookup', description: 'Lookup' }],
      suggestedPlugins: ['pii:direct'],
      keyFiles: ['src/app.ts'],
      stateful: true,
    });
    mockedConfirm.mockResolvedValue(true);
    mockedOpener.mockResolvedValue({} as ChildProcess);
    mockedSelectProvider.mockReturnValue({ type: 'openai', model: 'gpt-test' });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('writes config without retaining browser handoff data when browser launch is disabled', async () => {
    const directory = path.resolve('/repo');

    vi.mocked(createOpenAIReconProvider).mockImplementationOnce(
      async (_directory, _scratchpad, _model, onProgress) => {
        onProgress?.({ type: 'step', message: 'Reading files' });
        return { analyze };
      },
    );

    const result = await doRecon({
      dir: '/repo',
      output: 'promptfooconfig.yaml',
      yes: true,
      open: false,
      exclude: ['node_modules'],
      verbose: true,
    });

    expect(result.purpose).toBe('Target app');
    expect(createOpenAIReconProvider).toHaveBeenCalled();
    expect(buildReconPrompt).toHaveBeenCalledWith(directory, '/tmp/recon-notes/notes.md', [
      'node_modules',
    ]);
    expect(displayResults).toHaveBeenCalledWith(result, true);
    expect(buildRedteamConfig).toHaveBeenCalledWith(result, directory);
    expect(writePromptfooConfig).toHaveBeenCalledWith(
      { description: 'generated config' },
      'promptfooconfig.yaml',
      expect.any(Array),
    );
    expect(spinner.text).toBe('Reading files');
    expect(createReconHandoffToken).not.toHaveBeenCalled();
    expect(buildPendingConfig).not.toHaveBeenCalled();
    expect(writePendingReconConfig).not.toHaveBeenCalled();
    expect(opener).not.toHaveBeenCalled();
    expect(mockedCreateScratchpad.mock.results[0]?.value.cleanup).toHaveBeenCalled();
  });

  it('opens the browser, uses anthropic, and falls back to a manual URL when open fails', async () => {
    mockedSelectProvider.mockReturnValue({ type: 'anthropic', model: 'opus' });
    mockedOpener.mockRejectedValue(new Error('browser unavailable'));

    await doRecon({ dir: '/repo', yes: true });

    expect(createAnthropicReconProvider).toHaveBeenCalled();
    expect(buildPendingConfig).toHaveBeenCalledWith(
      { description: 'generated config' },
      expect.objectContaining({ purpose: 'Target app' }),
      path.resolve('/repo'),
      'test-handoff-token',
    );
    expect(writePendingReconConfig).toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      'Failed to open browser automatically',
      expect.objectContaining({ error: expect.any(Error) }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Open this URL in your browser:'),
    );
  });

  it('returns early without writing config when confirmation is declined', async () => {
    mockedConfirm.mockResolvedValue(false);

    const result = await doRecon({ dir: '/repo' });

    expect(result.purpose).toBe('Target app');
    expect(writePromptfooConfig).not.toHaveBeenCalled();
    expect(writePendingReconConfig).not.toHaveBeenCalled();
  });

  it('fails the spinner and cleans up when analysis throws', async () => {
    analyze.mockRejectedValue(new Error('analysis failed'));

    await expect(doRecon({ dir: '/repo', yes: true })).rejects.toThrow('analysis failed');

    expect(spinner.fail).toHaveBeenCalledWith('Analysis failed');
    expect(mockedCreateScratchpad.mock.results[0]?.value.cleanup).toHaveBeenCalled();
  });
});
