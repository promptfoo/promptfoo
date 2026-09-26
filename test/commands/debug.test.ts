import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { debugCommand } from '../../src/commands/debug';
import { setLogger, winstonLogger } from '../../src/logger';
import { checkRemoteHealth } from '../../src/util/apiHealth';
import { resolveConfigs } from '../../src/util/config/load';
import { fetchWithTimeout } from '../../src/util/fetch/index';
import { mockProcessEnv } from '../util/utils';

vi.unmock('../../src/logger');
vi.mock('../../src/util/config/load', () => ({ resolveConfigs: vi.fn() }));
vi.mock('../../src/util/file', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/util/file')>()),
  pathExists: async () => true,
}));
vi.mock('../../src/util/fetch/index', () => ({ fetchWithTimeout: vi.fn() }));

const capture = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
let restoreEnvironment: () => void;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveConfigs).mockReset();
  vi.mocked(fetchWithTimeout).mockReset();
  restoreEnvironment = mockProcessEnv({
    HTTP_PROXY: undefined,
    http_proxy: undefined,
    HTTPS_PROXY: undefined,
    https_proxy: undefined,
    ALL_PROXY: undefined,
    all_proxy: undefined,
  });
  setLogger(capture);
});

afterEach(() => {
  restoreEnvironment();
  setLogger(winstonLogger);
  vi.restoreAllMocks();
});

describe('proxy diagnostics', () => {
  it.each(['suite', 'file'] as const)(
    'redacts proxy credentials from %s diagnostics',
    async (scope) => {
      const env = {
        HTTP_PROXY: 'http://fixture-user:fixture-password@proxy.example:8080',
        HTTPS_PROXY: 'http://fixture-user:fixture-password@proxy.example:8080',
        ALL_PROXY: 'fixture-user:fixture-password@proxy.example:8080',
      };
      vi.mocked(resolveConfigs).mockResolvedValue({
        config: { env },
      } as Awaited<ReturnType<typeof resolveConfigs>>);
      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'OK' }),
      } as Response);

      const run = async () => {
        const program = new Command();
        debugCommand(program, {}, undefined);
        await program.parseAsync(['debug', '-c', 'fixture.yaml'], { from: 'user' });
        await checkRemoteHealth('https://health.example/health');
      };
      await (scope === 'suite'
        ? cliState.withEnv(env, run)
        : cliState.withEnvFileOverrides(env, run));

      const debugOutput = JSON.stringify(capture.info.mock.calls);
      const healthOutput = JSON.stringify(capture.debug.mock.calls);
      for (const output of [debugOutput, healthOutput]) {
        expect(output).toContain('proxy.example:8080');
        expect(output).not.toContain('fixture-user');
        expect(output).not.toContain('fixture-password');
      }
    },
  );
});
