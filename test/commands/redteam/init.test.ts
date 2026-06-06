import { AbortPromptError, ExitPromptError } from '@inquirer/core';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initCommand } from '../../../src/commands/redteam/init';
import { getDefaultPort } from '../../../src/constants';
import logger from '../../../src/logger';
import { redteamInit } from '../../../src/redteam/commands/init';
import { startServer } from '../../../src/server/server';
import telemetry from '../../../src/telemetry';
import { setupEnv } from '../../../src/util/index';
import { BrowserBehavior, checkServerRunning, openBrowser } from '../../../src/util/server';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/logger');
vi.mock('../../../src/redteam/commands/init');
vi.mock('../../../src/server/server');
vi.mock('../../../src/telemetry');
vi.mock('../../../src/util/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/util/index')>()),
  setupEnv: vi.fn(),
}));
vi.mock('../../../src/util/server');

describe('redteam init command', () => {
  let originalExitCode: number | string | null | undefined;
  let program: Command;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redteamInit).mockReset();
    vi.mocked(startServer).mockReset();
    vi.mocked(telemetry.record).mockReset();
    vi.mocked(setupEnv).mockReset();
    vi.mocked(checkServerRunning).mockReset();
    vi.mocked(openBrowser).mockReset();

    originalExitCode = process.exitCode;
    process.exitCode = 0;
    program = new Command();
    initCommand(program);
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it('runs the reusable flow in non-GUI mode', async () => {
    await program.parseAsync([
      'node',
      'test',
      'init',
      'project-dir',
      '--no-gui',
      '--env-file',
      '.env.test',
    ]);

    expect(setupEnv).toHaveBeenCalledWith('.env.test');
    expect(redteamInit).toHaveBeenCalledWith('project-dir');
    expect(checkServerRunning).not.toHaveBeenCalled();
  });

  it('opens the redteam create UI when a server is already running', async () => {
    const restoreEnv = mockProcessEnv({ DISPLAY: ':99' });
    vi.mocked(checkServerRunning).mockResolvedValue(true);

    try {
      await program.parseAsync(['node', 'test', 'init']);
    } finally {
      restoreEnv();
    }

    expect(openBrowser).toHaveBeenCalledWith(BrowserBehavior.OPEN_TO_REDTEAM_CREATE);
    expect(startServer).not.toHaveBeenCalled();
    expect(redteamInit).not.toHaveBeenCalled();
  });

  it('starts the redteam create UI when no server is running', async () => {
    const restoreEnv = mockProcessEnv({ DISPLAY: ':99' });
    vi.mocked(checkServerRunning).mockResolvedValue(false);

    try {
      await program.parseAsync(['node', 'test', 'init']);
    } finally {
      restoreEnv();
    }

    expect(startServer).toHaveBeenCalledWith(
      getDefaultPort(),
      BrowserBehavior.OPEN_TO_REDTEAM_CREATE,
    );
    expect(openBrowser).not.toHaveBeenCalled();
    expect(redteamInit).not.toHaveBeenCalled();
  });

  it.each([
    new ExitPromptError(),
    new AbortPromptError(),
  ])('marks %s cancellation without hard-exiting', async (error) => {
    process.exitCode = undefined;
    vi.mocked(redteamInit).mockRejectedValueOnce(error);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await expect(program.parseAsync(['node', 'test', 'init', '--no-gui'])).resolves.toBe(program);

    expect(telemetry.record).toHaveBeenCalledWith('funnel', {
      type: 'redteam onboarding',
      step: 'early exit',
    });
    expect(logger.info).toHaveBeenCalled();
    expect(process.exitCode).toBe(130);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('rethrows unexpected errors', async () => {
    vi.mocked(redteamInit).mockRejectedValueOnce(new Error('unexpected failure'));

    await expect(program.parseAsync(['node', 'test', 'init', '--no-gui'])).rejects.toThrow(
      'unexpected failure',
    );
  });
});
