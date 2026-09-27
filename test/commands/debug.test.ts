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
    NO_PROXY: undefined,
    no_proxy: undefined,
  });
  setLogger(capture);
});

afterEach(() => {
  restoreEnvironment();
  setLogger(winstonLogger);
  vi.restoreAllMocks();
});

describe('proxy diagnostics', () => {
  it.each(['specified', 'default'] as const)(
    'reports the resolved %s config environment without an external scope',
    async (source) => {
      mockProcessEnv({ https_proxy: 'http://host.example:8080', no_proxy: 'host.example' });
      const env = {
        HTTPS_PROXY: 'http://fixture-user:fixture-password@config.example:8080',
        NO_PROXY: '',
        PROMPTFOO_DISABLE_TELEMETRY: 'true',
      };
      vi.mocked(resolveConfigs).mockResolvedValue({
        config: { env },
        testSuite: { prompts: [], providers: [] },
        basePath: '',
      });
      const program = new Command();
      debugCommand(program, {}, source === 'default' ? 'fixture.yaml' : undefined);
      const previousEnv = cliState.env;
      await program.parseAsync(
        source === 'specified' ? ['debug', '-c', 'fixture.yaml'] : ['debug'],
        { from: 'user' },
      );
      const output = capture.info.mock.calls.find(([message]) => message.startsWith('{'))?.[0];
      expect(JSON.parse(output).env).toMatchObject({
        httpsProxy: 'http://***:***@config.example:8080',
        noProxy: '',
        telemetryDisabled: true,
      });
      expect(JSON.parse(output).env).not.toHaveProperty('https_proxy');
      expect(output).not.toContain('fixture-password');
      expect(cliState.env).toBe(previousEnv);
      expect(process.env.https_proxy).toBe('http://host.example:8080');
    },
  );

  it('reports ambient settings and the error when config resolution fails', async () => {
    mockProcessEnv({ HTTPS_PROXY: 'http://host.example:8080' });
    vi.mocked(resolveConfigs).mockRejectedValue(new Error('fixture config failure'));
    const program = new Command();
    debugCommand(program, {}, undefined);
    await program.parseAsync(['debug', '-c', 'fixture.yaml'], { from: 'user' });
    const output = capture.info.mock.calls.find(([message]) => message.startsWith('{'))?.[0];
    const info = JSON.parse(output);
    expect(info.env.httpsProxy).toBe('http://host.example:8080');
    expect(info.configInfo.configContent).toContain('fixture config failure');
  });

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
