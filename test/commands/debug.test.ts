import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { debugCommand } from '../../src/commands/debug';
import { setLogger, winstonLogger } from '../../src/logger';
import { addCommonOptionsRecursively } from '../../src/mainUtils';
import { checkRemoteHealth } from '../../src/util/apiHealth';
import { resolveConfigs } from '../../src/util/config/load';
import { fetchWithTimeout } from '../../src/util/fetch/index';
import { pathExists } from '../../src/util/file';
import { mockProcessEnv } from '../util/utils';

vi.unmock('../../src/logger');
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));
vi.mock('../../src/util/config/load', () => ({ resolveConfigs: vi.fn() }));
vi.mock('../../src/util/file', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/util/file')>()),
  pathExists: vi.fn(),
}));
vi.mock('../../src/util/fetch/index', () => ({ fetchWithTimeout: vi.fn() }));

const capture = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
let restoreEnvironment: () => void;
let envDirectory: string;

beforeEach(() => {
  envDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-debug-env-'));
  vi.clearAllMocks();
  vi.mocked(resolveConfigs).mockReset();
  vi.mocked(pathExists).mockResolvedValue(true);
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
  fs.rmSync(envDirectory, { recursive: true, force: true });
  restoreEnvironment();
  setLogger(winstonLogger);
  vi.restoreAllMocks();
});

describe('proxy diagnostics', () => {
  it.each(['before', 'after', 'alias', 'repeated', 'comma-separated'])(
    'preserves explicit env-file precedence with %s command options',
    async (placement) => {
      mockProcessEnv({ https_proxy: 'http://shell.example:8080', no_proxy: 'shell.example' });
      const firstPath = path.join(envDirectory, 'first.env');
      const secondPath = path.join(envDirectory, 'second.env');
      fs.writeFileSync(
        firstPath,
        'HTTPS_PROXY=http://fixture-user:fixture-password@file.example:8080\nNO_PROXY=\n',
      );
      fs.writeFileSync(secondPath, 'HTTPS_PROXY=\n');
      vi.mocked(resolveConfigs).mockResolvedValue({ config: { env: {} } } as Awaited<
        ReturnType<typeof resolveConfigs>
      >);
      const program = new Command();
      debugCommand(program, {}, undefined);
      addCommonOptionsRecursively(program);
      let envBeforeAction: NodeJS.ProcessEnv | undefined;
      program.commands[0].hook('preAction', () => {
        envBeforeAction = { ...process.env };
      });
      const args = ['debug', '-c', 'fixture.yaml'];
      if (placement === 'before') {
        args.unshift('--env-file', firstPath);
      } else if (placement === 'repeated') {
        args.push('--env-file', firstPath, '--env-file', secondPath);
      } else if (placement === 'comma-separated') {
        args.push('--env-file', `${firstPath},${secondPath}`);
      } else {
        args.push(placement === 'alias' ? '--env-path' : '--env-file', firstPath);
      }
      const previousFileEnv = cliState.envFileOverrides;

      await program.parseAsync(args, { from: 'user' });

      const output = capture.info.mock.calls.find(([message]) => message.startsWith('{'))?.[0];
      expect(JSON.parse(output).env).toMatchObject({
        httpsProxy: ['repeated', 'comma-separated'].includes(placement)
          ? ''
          : 'http://***:***@file.example:8080',
        noProxy: '',
      });
      expect(output).not.toContain('fixture-user');
      expect(output).not.toContain('fixture-password');
      expect(cliState.envFileOverrides).toBe(previousFileEnv);
      expect(process.env).toEqual(envBeforeAction);
    },
  );

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

  it.each(['missing', 'invalid'] as const)(
    'does not report default config settings when the explicit config is %s',
    async (failure) => {
      mockProcessEnv({ HTTPS_PROXY: 'http://host.example:8080' });
      vi.mocked(pathExists).mockResolvedValue(failure !== 'missing');
      vi.mocked(resolveConfigs).mockRejectedValue(new Error('fixture config failure'));
      const program = new Command();
      debugCommand(
        program,
        { env: { HTTPS_PROXY: 'http://default.example:8080' } },
        'default.yaml',
      );
      await program.parseAsync(['debug', '-c', 'explicit.yaml'], { from: 'user' });
      const output = capture.info.mock.calls.find(([message]) => message.startsWith('{'))?.[0];
      const info = JSON.parse(output);
      expect(info.env.httpsProxy).toBe('http://host.example:8080');
      expect(info.configInfo.configExists).toBe(failure !== 'missing');
      expect(info.configInfo.specifiedConfigPath).toBe('explicit.yaml');
      if (failure === 'missing') {
        expect(resolveConfigs).not.toHaveBeenCalled();
      } else {
        expect(info.configInfo.configContent).toContain('fixture config failure');
      }
    },
  );

  it('reports provided defaults when no config path is selected', async () => {
    const program = new Command();
    debugCommand(program, { env: { HTTPS_PROXY: 'http://default.example:8080' } }, undefined);
    await program.parseAsync(['debug'], { from: 'user' });
    const output = capture.info.mock.calls.find(([message]) => message.startsWith('{'))?.[0];
    expect(JSON.parse(output).env.httpsProxy).toBe('http://default.example:8080');
    expect(resolveConfigs).not.toHaveBeenCalled();
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
