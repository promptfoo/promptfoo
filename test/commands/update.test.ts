import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateCommand } from '../../src/commands/update';
import logger from '../../src/logger';
import { getInstallationInfo } from '../../src/updates/installationInfo';
import { checkForUpdates } from '../../src/updates/updateCheck';
import { runNpmUpdate } from '../../src/updates/updateCommandUtils';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/updates/installationInfo', () => ({ getInstallationInfo: vi.fn() }));
vi.mock('../../src/updates/updateCommandUtils', () => ({ runNpmUpdate: vi.fn() }));
vi.mock('../../src/updates/updateCheck', () => ({
  checkForUpdates: vi.fn(),
  getUpdateInstructions: vi.fn(),
}));
vi.mock('../../src/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const info = {
  message: 'Update available',
  update: { name: 'promptfoo', current: '1.0.0', latest: '1.2.3' },
};
let originalExitCode: typeof process.exitCode;
let restoreEnvironment: () => void;
beforeEach(() => {
  restoreEnvironment = mockProcessEnv({}, { clear: true });
  originalExitCode = process.exitCode;
  vi.mocked(getInstallationInfo)
    .mockReset()
    .mockReturnValue({ canUpdate: true, message: 'Global npm' });
  vi.mocked(checkForUpdates).mockReset().mockResolvedValue(info);
  vi.mocked(runNpmUpdate).mockReset().mockResolvedValue(undefined);
  vi.clearAllMocks();
});
afterEach(() => {
  restoreEnvironment();
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});
async function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  const program = new Command();
  updateCommand(program, env);
  await program.parseAsync(['node', 'promptfoo', 'update', ...args]);
}

describe('update command', () => {
  it('checks without detecting or changing an installation', async () => {
    await run(['--check']);
    expect(logger.info).toHaveBeenCalledWith('Update available');
    expect(getInstallationInfo).not.toHaveBeenCalled();
    expect(runNpmUpdate).not.toHaveBeenCalled();
  });
  it('delegates version selection to the verified npm installation', async () => {
    const env = { PATH: '/trusted/bin' };
    await run([], env);
    expect(checkForUpdates).not.toHaveBeenCalled();
    expect(getInstallationInfo).toHaveBeenCalledWith(process.cwd(), env);
    expect(runNpmUpdate).toHaveBeenCalledWith(env, process.cwd());
  });
  it('prints manual guidance for unsupported installations', async () => {
    vi.mocked(getInstallationInfo).mockReturnValue({
      canUpdate: false,
      message: 'Use your package manager.',
    });
    await run([]);
    expect(logger.info).toHaveBeenCalledWith('Use your package manager.');
    expect(runNpmUpdate).not.toHaveBeenCalled();
  });
  it.each([{ args: [] }, { args: ['--check'] }, { args: ['--check', '--force'] }])(
    'respects launch disable for $args',
    async ({ args }) => {
      await run(args, { PROMPTFOO_DISABLE_UPDATE: '1' });
      expect(checkForUpdates).not.toHaveBeenCalled();
      expect(runNpmUpdate).not.toHaveBeenCalled();
    },
  );
  it('lets --force update when checks are disabled without a metadata lookup', async () => {
    const env = { PROMPTFOO_DISABLE_UPDATE: '1' };
    await run(['--force'], env);
    expect(checkForUpdates).not.toHaveBeenCalled();
    expect(runNpmUpdate).toHaveBeenCalledWith(env, process.cwd());
  });
  it('reports check-only lookup failures without starting an installer', async () => {
    vi.mocked(checkForUpdates).mockRejectedValue(new Error('offline'));
    await run(['--check']);
    expect(runNpmUpdate).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
  it('reports an installer failure once', async () => {
    vi.mocked(runNpmUpdate).mockRejectedValue(new Error('fixture failure'));
    await run([]);
    expect(logger.error).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(1);
  });
});
