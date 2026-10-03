import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import type { ChildProcess, SpawnOptions } from 'node:child_process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { doEval } from '../../src/node/doEval';
import { mockProcessEnv } from '../util/utils';

const hasSdk = fs.existsSync(
  path.resolve(process.cwd(), 'node_modules/@opencode-ai/sdk/package.json'),
);

// Exercise the installed SDK, including its actual child-process environment handling.
// Only process creation and HTTP are intercepted; no OpenCode executable or API key is needed.
describe.runIf(hasSdk)('OpenCode environment files through doEval', () => {
  let tempDir: string;
  let restoreEnv: () => void;
  let startupError: boolean;
  const spawnedEnvs: NodeJS.ProcessEnv[] = [];
  const authorizations: (string | null)[] = [];

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-opencode-eval-env-'));
    restoreEnv = mockProcessEnv({
      OPENAI_API_KEY: 'host-key',
      OPENCODE_SERVER_PASSWORD: undefined,
      OPENCODE_SERVER_USERNAME: undefined,
      OPENCODE_TRACEPARENT: undefined,
      PROMPTFOO_OPENCODE_ENV_PROBE: 'host',
      PROMPTFOO_DISABLE_TELEMETRY: 'true',
    });
    spawnedEnvs.length = 0;
    authorizations.length = 0;
    startupError = false;
    vi.spyOn(childProcess, 'spawn').mockImplementation(((
      _command,
      _args,
      options: SpawnOptions,
    ) => {
      spawnedEnvs.push({ ...options.env });
      const serverPort = 45000 + spawnedEnvs.length;
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        exitCode: null,
        signalCode: null,
        kill: vi.fn(() => true),
      });
      queueMicrotask(() => {
        if (startupError) {
          child.emit('error', new Error('fixture startup failure'));
        } else {
          child.stdout.write(`opencode server listening on http://127.0.0.1:${serverPort}\n`);
        }
      });
      return child as unknown as ChildProcess;
    }) as typeof childProcess.spawn);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const request = input instanceof Request ? input : new Request(input);
        const url = new URL(request.url);
        expect(url.hostname).toBe('127.0.0.1');
        const env = spawnedEnvs[Number(url.port) - 45001];
        const serverEnv =
          os.platform() === 'win32'
            ? Object.fromEntries(
                Object.entries(env).map(([key, value]) => [key.toUpperCase(), value]),
              )
            : env;
        const authorization = request.headers.get('authorization');
        authorizations.push(authorization);
        if (serverEnv.OPENCODE_SERVER_PASSWORD) {
          const credentials = `${serverEnv.OPENCODE_SERVER_USERNAME ?? 'opencode'}:${serverEnv.OPENCODE_SERVER_PASSWORD}`;
          if (authorization !== `Basic ${Buffer.from(credentials).toString('base64')}`) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
        }
        let data: unknown;
        if (request.method === 'POST' && url.pathname === '/session') {
          data = { id: 'fixture-session' };
        } else if (request.method === 'POST' && url.pathname.endsWith('/message')) {
          data = {
            info: { id: 'fixture-message', role: 'assistant' },
            parts: [{ type: 'text', text: env.PROMPTFOO_OPENCODE_ENV_PROBE }],
          };
        } else if (request.method === 'DELETE') {
          data = true;
        } else {
          throw new Error(`Unexpected OpenCode request: ${request.method} ${url.pathname}`);
        }
        return Response.json(data);
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    restoreEnv();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function runEvaluation(
    value: string,
    providerEnv?: Record<string, string>,
    fileEnv: Record<string, string> = {},
    testCount = 1,
  ) {
    const envPath = path.join(tempDir, `${value}.env`);
    fs.writeFileSync(
      envPath,
      `OPENAI_API_KEY=${value}-key\nPROMPTFOO_OPENCODE_ENV_PROBE=${value}\n` +
        Object.entries(fileEnv)
          .map(([key, envValue]) => `${key}=${envValue}\n`)
          .join(''),
    );
    const evaluation = await doEval(
      { envPath: [envPath], write: false, share: false, table: false, progressBar: false },
      {
        prompts: ['hello'],
        providers: [{ id: 'opencode:sdk', env: providerEnv, config: { tools: { skill: false } } }],
        tests: Array.from({ length: testCount }, () => ({ vars: {} })),
      },
      undefined,
      { eventSource: 'mcp', cache: false, maxConcurrency: 1 },
    );
    return evaluation.getResults();
  }

  async function runEval(
    value: string,
    providerEnv?: Record<string, string>,
    fileEnv?: Record<string, string>,
  ) {
    return (await runEvaluation(value, providerEnv, fileEnv))[0];
  }

  it('passes scoped env files to the real SDK spawn and restores the host environment', async () => {
    const row = await runEval('scoped');
    expect(row.success).toBe(true);
    expect(row.response?.output).toBe('scoped');
    expect(spawnedEnvs).toHaveLength(1);
    expect(spawnedEnvs[0].OPENAI_API_KEY).toBe('scoped-key');
    expect(process.env.OPENAI_API_KEY).toBe('host-key');
    expect(process.env.PROMPTFOO_OPENCODE_ENV_PROBE).toBe('host');
  });

  it('preserves explicit provider overrides above env-file credentials', async () => {
    const row = await runEval('scoped', { OPENAI_API_KEY: 'provider-key' });
    expect(row.success).toBe(true);
    expect(spawnedEnvs[0].OPENAI_API_KEY).toBe('provider-key');
    expect(process.env.OPENAI_API_KEY).toBe('host-key');
  });

  it.each([undefined, 'configured-user', ''])(
    'authenticates a reused SDK client with username %s',
    async (username) => {
      const fileEnv: Record<string, string> = { OPENCODE_SERVER_PASSWORD: 'fixture:password-π' };
      if (username !== undefined) {
        fileEnv.OPENCODE_SERVER_USERNAME = username;
      }
      const rows = await runEvaluation('authenticated', undefined, fileEnv, 2);
      expect(rows.map((row) => row.success)).toEqual([true, true]);
      expect(rows.map((row) => row.response?.output)).toEqual(['authenticated', 'authenticated']);
      expect(spawnedEnvs).toHaveLength(1);
      expect(authorizations).toHaveLength(6);
      expect(new Set(authorizations)).toEqual(
        new Set([
          `Basic ${Buffer.from(`${username ?? 'opencode'}:fixture:password-π`).toString('base64')}`,
        ]),
      );
      expect(process.env.OPENCODE_SERVER_PASSWORD).toBeUndefined();
      expect(process.env.OPENCODE_SERVER_USERNAME).toBeUndefined();
    },
  );

  it.each(['linux', 'win32'] as const)(
    'uses the winning server credentials on %s',
    async (platform) => {
      vi.spyOn(os, 'platform').mockReturnValue(platform);
      const passwordKey =
        platform === 'win32' ? 'opencode_server_password' : 'OPENCODE_SERVER_PASSWORD';
      const usernameKey =
        platform === 'win32' ? 'OpenCode_Server_Username' : 'OPENCODE_SERVER_USERNAME';
      const row = await runEval(
        'auth-override',
        {
          [passwordKey]: 'provider-password',
          [usernameKey]: 'provider-user',
        },
        {
          OPENCODE_SERVER_PASSWORD: 'file-password',
          OPENCODE_SERVER_USERNAME: 'file-user',
        },
      );
      expect(row.success).toBe(true);
      expect(new Set(authorizations)).toEqual(
        new Set([`Basic ${Buffer.from('provider-user:provider-password').toString('base64')}`]),
      );
      expect(process.env.OPENCODE_SERVER_PASSWORD).toBeUndefined();
    },
  );

  it.each([undefined, ''])(
    'keeps SDK requests unauthenticated when the server password is %s',
    async (password) => {
      const providerEnv: Record<string, string> = {};
      if (password !== undefined) {
        providerEnv.OPENCODE_SERVER_PASSWORD = password;
      }
      const row = await runEval(
        'no-auth',
        providerEnv,
        password === ''
          ? {
              OPENCODE_SERVER_PASSWORD: 'overridden-file-password',
            }
          : {},
      );
      expect(row.success).toBe(true);
      expect(authorizations).toEqual([null, null, null]);
    },
  );

  it('keeps differently cased POSIX server variables distinct', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    const row = await runEval('posix-auth', { opencode_server_password: 'not-a-server-password' });
    expect(row.success).toBe(true);
    expect(authorizations).toEqual([null, null, null]);
  });

  it('isolates credentials between overlapping authenticated evaluations', async () => {
    const rows = await Promise.all(
      ['first', 'second'].map((value) =>
        runEval(value, undefined, {
          OPENCODE_SERVER_PASSWORD: `${value}-password`,
          OPENCODE_SERVER_USERNAME: `${value}-user`,
        }),
      ),
    );
    expect(rows.map((row) => row.success)).toEqual([true, true]);
    expect(rows.map((row) => row.response?.output)).toEqual(['first', 'second']);
    expect(spawnedEnvs).toHaveLength(2);
    expect(new Set(authorizations).size).toBe(2);
    expect(process.env.OPENCODE_SERVER_PASSWORD).toBeUndefined();
    expect(process.env.OPENCODE_SERVER_USERNAME).toBeUndefined();
  });

  it.each([
    {
      fileKey: 'OPENAI_API_KEY',
      overrideKey: 'openai_api_key',
      templateKey: undefined,
      hostKey: undefined,
    },
    ...[
      ['OPENAI_API_KEY', 'openai_api_key'],
      ['openai_api_key', 'OPENAI_API_KEY'],
      ['OpenAI_Api_Key', 'oPeNaI_aPi_KeY'],
    ].flatMap(([fileKey, overrideKey]) =>
      [fileKey, overrideKey].flatMap((templateKey) =>
        [undefined, 'host-key'].map((hostKey) => ({
          fileKey,
          overrideKey,
          templateKey,
          hostKey,
        })),
      ),
    ),
  ])(
    'passes Windows credentials through preflight, templates, and SDK spawn: $fileKey/$overrideKey/$templateKey/$hostKey',
    async ({ fileKey, overrideKey, templateKey, hostKey }) => {
      vi.spyOn(os, 'platform').mockReturnValue('win32');
      mockProcessEnv({ OPENAI_API_KEY: hostKey, ANTHROPIC_API_KEY: undefined });
      const originalLowercaseKey = process.env.openai_api_key;
      const providerPath = path.join(tempDir, 'provider.json');
      fs.writeFileSync(
        providerPath,
        JSON.stringify({
          id: 'opencode:sdk',
          config: {
            provider_id: 'openai',
            tools: { skill: false },
            apiKey: templateKey ? `{{ env.${templateKey} }}` : undefined,
          },
          env: { [fileKey]: 'provider-file-key' },
        }),
      );
      const providerEnv: Record<string, string> = {
        [overrideKey]: 'provider-override-key',
        PROMPTFOO_OPENCODE_ENV_PROBE: 'windows-alias',
      };
      const evaluation = await doEval(
        { write: false, share: false, table: false, progressBar: false },
        {
          prompts: ['hello'],
          providers: [
            {
              id: `file://${providerPath}`,
              env: providerEnv,
            },
          ],
          tests: [{ vars: {} }],
        },
        undefined,
        { eventSource: 'mcp', cache: false },
      );
      const [row] = await evaluation.getResults();
      expect(row.success).toBe(true);
      expect(row.response?.output).toBe('windows-alias');
      const credentialEntries = Object.entries(spawnedEnvs[0]).filter(
        ([key]) => key.toUpperCase() === 'OPENAI_API_KEY',
      );
      expect(credentialEntries).toHaveLength(1);
      expect(credentialEntries[0][1]).toBe('provider-override-key');
      if (templateKey) {
        const serverConfig = JSON.parse(spawnedEnvs[0].OPENCODE_CONFIG_CONTENT!);
        expect(serverConfig.provider.openai.options.apiKey).toBe('provider-override-key');
      }
      expect(process.env.OPENAI_API_KEY).toBe(hostKey);
      expect(process.env.openai_api_key).toBe(originalLowercaseKey);
    },
  );

  it('restores the host environment after actual SDK startup rejects', async () => {
    startupError = true;
    const row = await runEval('failed');
    expect(row.success).toBe(false);
    expect(row.error).toContain('fixture startup failure');
    expect(spawnedEnvs[0].OPENAI_API_KEY).toBe('failed-key');
    expect(process.env.OPENAI_API_KEY).toBe('host-key');
    expect(process.env.PROMPTFOO_OPENCODE_ENV_PROBE).toBe('host');
  });

  it('keeps overlapping evaluation environments separate at the SDK spawn boundary', async () => {
    const rows = await Promise.all([runEval('first'), runEval('second')]);
    expect(rows.map((row) => row.success)).toEqual([true, true]);
    expect(rows.map((row) => row.response?.output)).toEqual(['first', 'second']);
    expect(spawnedEnvs.map((env) => env.OPENAI_API_KEY).sort()).toEqual([
      'first-key',
      'second-key',
    ]);
    expect(process.env.OPENAI_API_KEY).toBe('host-key');
    expect(process.env.PROMPTFOO_OPENCODE_ENV_PROBE).toBe('host');
  });
});
