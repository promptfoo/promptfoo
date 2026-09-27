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

  it.each([
    [
      'protocol',
      {
        HTTPS_PROXY: 'http://fixture-user:fixture-password@selected.example:8080',
        ALL_PROXY: 'http://fallback.example:8080',
      },
      'http://***:***@selected.example:8080/',
    ],
    [
      'bypass',
      {
        HTTPS_PROXY: 'http://fixture-user:fixture-password@selected.example:8080',
        NO_PROXY: 'health.example',
      },
      '',
    ],
    [
      'fallback',
      { HTTPS_PROXY: '', ALL_PROXY: 'fixture-user:fixture-password@fallback.example:8443' },
      'https://***:***@fallback.example:8443/',
    ],
  ] as const)(
    'reports the selected %s route in health diagnostics',
    async (_name, env, selectedProxy) => {
      vi.mocked(fetchWithTimeout).mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'OK' }),
      } as Response);
      await cliState.withEnv(env, () => checkRemoteHealth('https://health.example/health'));
      const output = capture.debug.mock.calls.find(([message]) =>
        message.startsWith('[CheckRemoteHealth] Checking'),
      )?.[0];
      const details = JSON.parse(output.slice(output.indexOf('{')));
      expect(details.selectedProxy).toBe(selectedProxy);
      expect(details.env).toHaveProperty('https_proxy');
      expect(output).not.toContain('fixture-user');
      expect(output).not.toContain('fixture-password');
    },
  );

  it.each(['suite', 'file'].flatMap((scope) => [false, true].map((opaque) => ({ scope, opaque }))))(
    'redacts $scope proxy diagnostics (opaque=$opaque)',
    async ({ scope, opaque }) => {
      const token = `sk-${'x'.repeat(32)}`;
      const proxy = opaque ? token : 'fixture-user:fixture-password@proxy.example:8080';
      const env = {
        HTTP_PROXY: opaque ? proxy : `http://${proxy}`,
        HTTPS_PROXY: opaque ? proxy : `http://${proxy}`,
        ALL_PROXY: proxy,
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
        expect(output).toContain(opaque ? '[REDACTED]' : 'proxy.example:8080');
        expect(output).not.toContain(token);
        expect(output).not.toContain('fixture-user');
        expect(output).not.toContain('fixture-password');
      }
    },
  );
});
