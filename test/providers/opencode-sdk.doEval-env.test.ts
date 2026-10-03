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

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-opencode-eval-env-'));
    restoreEnv = mockProcessEnv({
      OPENAI_API_KEY: 'host-key',
      OPENCODE_TRACEPARENT: undefined,
      PROMPTFOO_OPENCODE_ENV_PROBE: 'host',
      PROMPTFOO_DISABLE_TELEMETRY: 'true',
    });
    spawnedEnvs.length = 0;
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

  async function runEval(value: string, providerEnv?: Record<string, string>) {
    const envPath = path.join(tempDir, `${value}.env`);
    fs.writeFileSync(
      envPath,
      `OPENAI_API_KEY=${value}-key\nPROMPTFOO_OPENCODE_ENV_PROBE=${value}\n`,
    );
    const evaluation = await doEval(
      { envPath: [envPath], write: false, share: false, table: false, progressBar: false },
      {
        prompts: ['hello'],
        providers: [{ id: 'opencode:sdk', env: providerEnv, config: { tools: { skill: false } } }],
        tests: [{ vars: {} }],
      },
      undefined,
      { eventSource: 'mcp', cache: false },
    );
    const [row] = await evaluation.getResults();
    return row;
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
