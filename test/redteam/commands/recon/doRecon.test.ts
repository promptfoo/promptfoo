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
  deletePendingReconConfig,
  writePendingReconConfig,
} from '../../../../src/redteam/commands/recon/pending';
import { buildReconPrompt } from '../../../../src/redteam/commands/recon/prompt';
import {
  createAnthropicReconProvider,
  createOpenAIReconProvider,
  selectProvider,
} from '../../../../src/redteam/commands/recon/providers';
import { createScratchpad } from '../../../../src/redteam/commands/recon/scratchpad';
import { prepareReconTarget } from '../../../../src/redteam/commands/recon/target';
import { startServer } from '../../../../src/server/server';
import { writePromptfooConfig } from '../../../../src/util/config/writer';
import { fetchWithProxy } from '../../../../src/util/fetch/index';
import { checkServerRunning } from '../../../../src/util/server';

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
  getDefaultPort: vi.fn(() => 15500),
  getLocalAppUrl: vi.fn((urlPath: string, queryParams?: Record<string, string>) => {
    const params = new URLSearchParams(queryParams).toString();
    return `http://localhost:15500${urlPath}${params ? `?${params}` : ''}`;
  }),
}));

vi.mock('../../../../src/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
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
  deletePendingReconConfig: vi.fn(),
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

vi.mock('../../../../src/redteam/commands/recon/target', () => ({
  prepareReconTarget: vi.fn((directory: string) => ({
    directory: `${directory}/.promptfoo-recon-snapshot`,
    excludedPatterns: ['.env*'],
    copiedFiles: 2,
    skippedEntries: 1,
  })),
}));

vi.mock('../../../../src/util/server', () => ({
  BrowserBehavior: {
    SKIP: 2,
  },
  checkServerRunning: vi.fn(),
}));

vi.mock('../../../../src/util/fetch/index', () => ({
  fetchWithProxy: vi.fn(),
}));

vi.mock('../../../../src/server/server', () => ({
  startServer: vi.fn(),
}));

describe('doRecon', () => {
  const mockedConfirm = vi.mocked(confirm);
  const mockedOpener = vi.mocked(opener);
  const mockedSelectProvider = vi.mocked(selectProvider);
  const mockedCreateScratchpad = vi.mocked(createScratchpad);
  const mockedCheckServerRunning = vi.mocked(checkServerRunning);
  const mockedStartServer = vi.mocked(startServer);
  const mockedFetchWithProxy = vi.mocked(fetchWithProxy);

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
    mockedCheckServerRunning.mockResolvedValue(true);
    mockedFetchWithProxy.mockResolvedValue(new Response(null, { status: 204 }));
    mockedStartServer.mockResolvedValue(undefined);
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
    expect(prepareReconTarget).toHaveBeenCalledWith(directory, '/tmp/recon-notes', [
      'node_modules',
    ]);
    expect(createOpenAIReconProvider).toHaveBeenCalledWith(
      `${directory}/.promptfoo-recon-snapshot`,
      expect.objectContaining({ dir: '/tmp/recon-notes' }),
      'gpt-test',
      expect.any(Function),
    );
    expect(buildReconPrompt).toHaveBeenCalledWith(
      `${directory}/.promptfoo-recon-snapshot`,
      '/tmp/recon-notes/notes.md',
      ['node_modules'],
    );
    expect(displayResults).toHaveBeenCalledWith(result, true);
    expect(buildRedteamConfig).toHaveBeenCalledWith(result, directory);
    expect(writePromptfooConfig).toHaveBeenCalledWith(
      { description: 'generated config' },
      'promptfooconfig.yaml',
      expect.arrayContaining(['  promptfoo redteam run']),
    );
    expect(spinner.text).toBe('Reading files');
    expect(createReconHandoffToken).not.toHaveBeenCalled();
    expect(buildPendingConfig).not.toHaveBeenCalled();
    expect(writePendingReconConfig).not.toHaveBeenCalled();
    expect(opener).not.toHaveBeenCalled();
    expect(mockedCreateScratchpad.mock.results[0]?.value.cleanup).toHaveBeenCalled();
  });

  it('points no-open instructions at a custom generated config', async () => {
    await doRecon({
      dir: '/repo',
      output: 'reports/recon config.yaml',
      yes: true,
      open: false,
    });

    expect(writePromptfooConfig).toHaveBeenCalledWith(
      { description: 'generated config' },
      'reports/recon config.yaml',
      expect.arrayContaining(['  promptfoo redteam run -c "reports/recon config.yaml"']),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('promptfoo redteam run -c "reports/recon config.yaml"'),
    );
  });

  it('opens the browser, uses anthropic, and falls back to a manual URL when open fails', async () => {
    mockedSelectProvider.mockReturnValue({ type: 'anthropic', model: 'opus' });
    mockedOpener.mockRejectedValue(new Error('browser unavailable'));

    await doRecon({ dir: '/repo', yes: true });

    expect(createAnthropicReconProvider).toHaveBeenCalledWith(
      `${path.resolve('/repo')}/.promptfoo-recon-snapshot`,
      expect.objectContaining({ dir: '/tmp/recon-notes' }),
      'opus',
      expect.any(Function),
    );
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

  it('does not log the browser handoff token when the browser opens successfully', async () => {
    await doRecon({ dir: '/repo', yes: true });

    expect(opener).toHaveBeenCalledWith(
      'http://localhost:15500/redteam/setup?source=recon&token=test-handoff-token',
    );

    const infoMessages = vi
      .mocked(logger.info)
      .mock.calls.map(([message]) => String(message))
      .join('\n');
    expect(infoMessages).toContain('http://localhost:15500/redteam/setup?source=recon');
    expect(infoMessages).not.toContain('token=test-handoff-token');
  });

  it('does not open an existing server that cannot read this pending handoff', async () => {
    mockedFetchWithProxy.mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(doRecon({ dir: '/repo', yes: true })).rejects.toThrow(
      'An existing promptfoo server cannot access this recon handoff',
    );

    expect(fetchWithProxy).toHaveBeenCalledWith(
      'http://localhost:15500/api/redteam/recon/pending?token=test-handoff-token',
      {
        method: 'HEAD',
        headers: { 'x-promptfoo-silent': 'true' },
      },
    );
    expect(deletePendingReconConfig).toHaveBeenCalled();
    expect(opener).not.toHaveBeenCalled();
    expect(spinner.fail).not.toHaveBeenCalled();
  });

  it('starts the local server before opening recon handoff when none is running', async () => {
    mockedCheckServerRunning
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await doRecon({ dir: '/repo', yes: true });

    expect(startServer).toHaveBeenCalledWith(15500, 2);
    expect(opener).toHaveBeenCalledWith(
      'http://localhost:15500/redteam/setup?source=recon&token=test-handoff-token',
    );
  });

  it('keeps a recon-started server on the CLI lifecycle after opening the handoff', async () => {
    mockedCheckServerRunning.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    let stopServer!: () => void;
    mockedStartServer.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        stopServer = resolve;
      }),
    );

    const reconPromise = doRecon({ dir: '/repo', yes: true });

    await vi.waitFor(() => {
      expect(opener).toHaveBeenCalledWith(
        'http://localhost:15500/redteam/setup?source=recon&token=test-handoff-token',
      );
    });

    let settled = false;
    reconPromise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    stopServer();
    await expect(reconPromise).resolves.toEqual(expect.objectContaining({ purpose: 'Target app' }));
  });

  it('logs when a recon-started server stops unexpectedly after handoff opens', async () => {
    mockedCheckServerRunning.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    let stopServer!: (error: Error) => void;
    mockedStartServer.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        stopServer = reject;
      }),
    );

    const reconPromise = doRecon({ dir: '/repo', yes: true });

    await vi.waitFor(() => {
      expect(opener).toHaveBeenCalled();
    });

    stopServer(new Error('server crashed'));

    await expect(reconPromise).resolves.toEqual(expect.objectContaining({ purpose: 'Target app' }));
    expect(logger.error).toHaveBeenCalledWith(
      'Local promptfoo server stopped unexpectedly: server crashed',
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
