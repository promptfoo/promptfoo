import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderEnvOverridesSchema } from '../../src/contracts/env';
import { MuseCodeProvider } from '../../src/providers/muse-code';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { withGenAISpan } from '../../src/tracing/genaiTracer';
import { checkProviderApiKeys } from '../../src/util/provider';
import { createDeferred, mockProcessEnv } from '../util/utils';
import type { Span } from '@opentelemetry/api';

import type { ProviderOptions } from '../../src/types/providers';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: vi.fn(),
}));
vi.mock('../../src/providers/providerRegistry', () => ({
  providerRegistry: { register: vi.fn(), unregister: vi.fn() },
}));
vi.mock('../../src/tracing/genaiTracer', () => ({
  withGenAISpan: vi.fn((_context, fn) => fn()),
  extractProviderResponseAttributes: vi.fn(),
}));

// Captured from Muse Code 1.0.2 (1.0.2-R2040.1):
// muse exec --provider echo --json --no-session-log 'Reply with exactly MUSE_CODE_SMOKE_OK.'
let fixture: string;
let fixtureEvents: Array<Record<string, any>>;
const prompt = 'Reply with exactly MUSE_CODE_SMOKE_OK.';
const sessionId = '11111111-1111-4111-8111-111111111111';
const executableName = (name: string) => `${name}${process.platform === 'win32' ? '.exe' : ''}`;

function createChild(pid: number) {
  let closed = false;
  const child = Object.assign(new EventEmitter(), {
    pid,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn((signal: NodeJS.Signals = 'SIGTERM') => {
      queueMicrotask(() => child.close(null, signal));
      return true;
    }),
    close(exitCode: number | null = 0, signal: NodeJS.Signals | null = null) {
      if (!closed) {
        closed = true;
        child.stdout.end();
        child.stderr.end();
        child.emit('exit', exitCode, signal);
        child.emit('close', exitCode, signal);
      }
    },
  });
  return child;
}

describe('MuseCodeProvider', () => {
  let testDir: string;
  let binDir: string;
  let providers: MuseCodeProvider[];
  let children: ReturnType<typeof createChild>[];
  let started: ReturnType<typeof createDeferred<void>>;
  let onSpawn: (child: ReturnType<typeof createChild>) => void;
  let restoreEnv: () => void;

  function provider(options: ProviderOptions = {}) {
    const instance = new MuseCodeProvider(options);
    providers.push(instance);
    return instance;
  }

  beforeAll(async () => {
    fixture = await fs.readFile(
      path.resolve('test/fixtures/providers/muse-code/echo.jsonl'),
      'utf8',
    );
    fixtureEvents = fixture
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
  });

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.mocked(withGenAISpan).mockImplementation(async (_context, fn) => fn({} as Span));
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-provider-test-'));
    binDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'muse-test-bin-')));
    await Promise.all(
      ['muse', 'custom-muse'].map((name) =>
        fs.writeFile(path.join(binDir, executableName(name)), '', { mode: 0o700 }),
      ),
    );
    restoreEnv = mockProcessEnv({
      META_API_KEY: undefined,
      MUSE_CLI_PATH: undefined,
      PATH: binDir,
    });
    providers = [];
    children = [];
    started = createDeferred<void>();
    onSpawn = (child) => {
      child.stdout.write(fixture);
      child.close();
    };
    vi.mocked(spawn).mockImplementation(() => {
      const child = createChild(42000 + children.length);
      children.push(child);
      started.resolve();
      queueMicrotask(() => onSpawn(child));
      return child as unknown as ReturnType<typeof spawn>;
    });
    vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      const child = children.find((candidate) => candidate.pid === -pid);
      if (child) {
        child.kill(signal as NodeJS.Signals);
      }
      return true;
    });
  });

  afterEach(async () => {
    for (const child of children) {
      child.close();
    }
    await Promise.all(providers.map((instance) => instance.shutdown()));
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(binDir, { recursive: true, force: true });
    vi.useRealTimers();
    vi.restoreAllMocks();
    restoreEnv();
  });

  it('parses the native journal and cleans up an isolated workspace', async () => {
    const instance = provider();
    const response = await instance.callApi(prompt);
    expect(response).toMatchObject({
      output: `echo: ${prompt}`,
      sessionId: fixtureEvents[0].stream.id,
      metadata: { runId: fixtureEvents.at(-1)!.payload.run_stream.id },
      raw: fixtureEvents,
    });
    // Echo reports no usage. Do not invent zero-cost model calls or token counts.
    expect(response.tokenUsage).toBeUndefined();
    expect(response.cost).toBeUndefined();
    expect(instance.id()).toBe('muse-code');
    expect(instance.toString()).toBe('[Muse Code Provider]');
    expect(providerRegistry.register).toHaveBeenCalledWith(instance);

    const [command, args, options] = vi.mocked(spawn).mock.calls[0];
    expect(command).toBe(path.join(binDir, executableName('muse')));
    expect(options).toMatchObject({ shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    expect(args).toEqual([
      'exec',
      '--json',
      '--workspace',
      options!.cwd,
      '--prompt-file',
      path.join(path.dirname(String(options!.cwd)), 'prompt.txt'),
      '--user-input-auto-resolve',
      '--no-session-log',
    ]);
    expect(args).not.toContain('--disable-sandbox');
    expect(args).not.toContain('--trust-workspace');
    await expect(fs.stat(String(options!.cwd))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('passes a hostile multiline prompt through a private file without shell interpretation', async () => {
    const input = '--yolo\n$(touch injected); `echo injected`\n"quoted" 🎵';
    let received = '';
    let promptPath = '';
    onSpawn = () => {};
    const call = provider().callApi(input);
    await started.promise;
    const args = vi.mocked(spawn).mock.calls[0][1]!;
    promptPath = args[args.indexOf('--prompt-file') + 1];
    received = await fs.readFile(promptPath, 'utf8');
    expect(received).toBe(input);
    expect(args).not.toContain(input);
    expect(args).not.toContain('--yolo');
    if (process.platform !== 'win32') {
      expect((await fs.stat(promptPath)).mode & 0o777).toBe(0o600);
    }
    children[0].stdout.write(fixture);
    children[0].close();
    await call;
    await expect(fs.stat(promptPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('renders per-prompt options, resolves paths from the config, and leaves the workspace intact', async () => {
    await fs.mkdir(path.join(testDir, 'project'));
    const instance = provider({
      config: {
        basePath: testDir,
        working_dir: 'project',
        muse_path: './bin/muse',
        model: 'default-model',
        reasoning_effort: 'medium',
        approval_mode: 'never',
        approval_judge: false,
        sandbox_network: 'restricted',
        disable_shell: true,
        disable_write: true,
        disable_web_tools: true,
        no_foreign_personal_context: true,
        trust_workspace: true,
        max_model_steps: 4,
        base_url: 'https://example.com/v1',
      },
    });
    const circularProvider = { child: {} };
    circularProvider.child = circularProvider;
    const result = await instance.callApi(prompt, {
      prompt: {
        raw: '{{prompt}}',
        label: 'review',
        config: { model: '{{model}}', provider: circularProvider },
      },
      vars: { model: 'muse-spark-1.2' },
      evaluationId: 'eval-muse',
      testIdx: 2,
    });
    expect(result.error).toBeUndefined();
    expect(spawn).toHaveBeenCalledWith(
      path.join(testDir, 'bin/muse'),
      expect.arrayContaining([
        '--model',
        'muse-spark-1.2',
        '--reasoning-effort',
        'medium',
        '--approval-mode',
        'never',
        '--approval-judge',
        'off',
        '--sandbox-network',
        'restricted',
        '--disable-shell',
        '--disable-write',
        '--disable-web-tools',
        '--no-foreign-personal-context',
        '--trust-workspace',
        '--max-model-steps',
        '4',
        '--base-url',
        'https://example.com/v1',
      ]),
      expect.objectContaining({ cwd: path.join(testDir, 'project') }),
    );
    expect((await fs.stat(path.join(testDir, 'project'))).isDirectory()).toBe(true);
    expect(withGenAISpan).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'meta',
        operationName: 'invoke_agent',
        agentName: 'Muse Code',
        model: 'muse-spark-1.2',
        evalId: 'eval-muse',
        testIndex: 2,
        promptLabel: 'review',
      }),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it.each([
    [
      { apiKey: 'explicit', env: { META_API_KEY: 'child' } },
      { META_API_KEY: 'override' },
      'explicit',
    ],
    [{ env: { META_API_KEY: 'child' } }, { META_API_KEY: 'override' }, 'child'],
    [{}, { META_API_KEY: 'override' }, 'override'],
    [{}, {}, 'inherited-meta'],
    [{ env: { META_API_KEY: '' } }, {}, ''],
  ])(
    'applies credential precedence without inheriting other provider secrets',
    async (config, env, expected) => {
      mockProcessEnv({
        ...process.env,
        META_API_KEY: 'inherited-meta',
        OPENAI_API_KEY: 'unrelated-secret',
      });
      const instance = provider({ config, env });
      await instance.callApi(prompt);
      const childEnv = vi.mocked(spawn).mock.calls[0][2]!.env!;
      expect(childEnv.META_API_KEY).toBe(expected);
      expect(childEnv.OPENAI_API_KEY).toBeUndefined();
      expect(childEnv.MUSE_NO_AUTO_UPDATE).toBe('1');
      expect(JSON.stringify(instance)).toBe('{"provider":"muse-code"}');
    },
  );

  it('supports existing Muse authentication without requiring an API key', async () => {
    const instance = provider({
      env: { MUSE_CLI_PATH: 'custom-muse' },
      config: { env: { CUSTOM_SETTING: 'configured' } },
    });
    expect(checkProviderApiKeys([instance]).size).toBe(0);
    const result = await instance.callApi(prompt);
    expect(result.error).toBeUndefined();
    expect(spawn).toHaveBeenCalledWith(
      path.join(binDir, executableName('custom-muse')),
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({ CUSTOM_SETTING: 'configured' }),
      }),
    );
    expect(vi.mocked(spawn).mock.calls[0][2]!.env!.META_API_KEY).toBeUndefined();
    expect(
      ProviderEnvOverridesSchema.parse({ META_API_KEY: 'key', MUSE_CLI_PATH: 'muse' }),
    ).toEqual({
      META_API_KEY: 'key',
      MUSE_CLI_PATH: 'muse',
    });
  });

  it.each(['.', '', 'tools'])(
    'does not resolve the Muse executable from relative PATH entry %j in the workspace',
    async (entry) => {
      const workspace = path.join(testDir, 'target');
      await fs.mkdir(path.join(workspace, 'tools'), { recursive: true });
      await fs.writeFile(path.join(workspace, executableName('muse')), '', { mode: 0o700 });
      await fs.writeFile(path.join(workspace, 'tools', executableName('muse')), '', {
        mode: 0o700,
      });
      const response = await provider({
        config: {
          working_dir: workspace,
          env: { PATH: `${entry}${path.delimiter}${binDir}` },
        },
      }).callApi(prompt);
      expect(response.error).toBeUndefined();
      expect(spawn).toHaveBeenCalledWith(
        path.join(binDir, executableName('muse')),
        expect.any(Array),
        expect.objectContaining({ cwd: workspace }),
      );
    },
  );

  it('fails without spawning when PATH has no absolute directories', async () => {
    const response = await provider({ config: { env: { PATH: '.' } } }).callApi(prompt);
    expect(response.error).toContain('Muse Code CLI was not found');
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each(['direct', 'directory alias', 'workspace alias'])(
    'excludes a workspace PATH directory through a %s path',
    async (kind) => {
      const workspace = path.join(testDir, 'target');
      const workspaceBin = path.join(workspace, 'node_modules', '.bin');
      await fs.mkdir(workspaceBin, { recursive: true });
      await fs.writeFile(path.join(workspaceBin, executableName('muse')), '', { mode: 0o700 });
      const alias = path.join(testDir, 'alias');
      let workingDir = workspace;
      let searchDirectory = workspaceBin;
      if (kind !== 'direct') {
        await fs.symlink(
          kind === 'directory alias' ? workspaceBin : workspace,
          alias,
          process.platform === 'win32' ? 'junction' : 'dir',
        );
        if (kind === 'directory alias') {
          searchDirectory = alias;
        } else {
          workingDir = alias;
        }
      }
      const response = await provider({
        config: {
          working_dir: workingDir,
          env: { PATH: `${searchDirectory}${path.delimiter}${binDir}` },
        },
      }).callApi(prompt);
      expect(response.error).toBeUndefined();
      expect(vi.mocked(spawn).mock.calls[0][0]).toBe(path.join(binDir, executableName('muse')));
    },
  );

  it.skipIf(process.platform === 'win32')(
    'excludes an executable symlink into the workspace',
    async () => {
      const workspace = path.join(testDir, 'target');
      const firstBin = path.join(testDir, 'first-bin');
      await fs.mkdir(workspace);
      await fs.mkdir(firstBin);
      const malicious = path.join(workspace, 'muse');
      await fs.writeFile(malicious, '', { mode: 0o700 });
      await fs.symlink(malicious, path.join(firstBin, 'muse'));
      const response = await provider({
        config: {
          working_dir: workspace,
          env: { PATH: `${firstBin}${path.delimiter}${binDir}` },
        },
      }).callApi(prompt);
      expect(response.error).toBeUndefined();
      expect(vi.mocked(spawn).mock.calls[0][0]).toBe(path.join(binDir, 'muse'));
    },
  );

  it('fails without spawning when Muse is only available inside the workspace', async () => {
    await fs.writeFile(path.join(testDir, executableName('muse')), '', { mode: 0o700 });
    const response = await provider({
      config: { working_dir: testDir, env: { PATH: testDir } },
    }).callApi(prompt);
    expect(response.error).toContain('Muse Code CLI was not found');
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each([
    { timeout_ms: 0 },
    { timeout_ms: 2_147_483_648 },
    { max_model_steps: -1 },
    { max_output_bytes: 0 },
    { approval_mode: 'yolo' },
    { reasoning_effort: 'none' },
    { session_id: 'not-a-uuid' },
    { sandbox_network: 'all' },
    { unknown_option: true },
  ])('rejects invalid provider config %j', (config) => {
    expect(() => provider({ config })).toThrow();
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each([
    ['base_url', 'https://meta.example/v1', '--base-url'],
    ['reasoning_effort', 'high', '--reasoning-effort'],
    ['approval_mode', 'never', '--approval-mode'],
    ['sandbox_network', 'restricted', '--sandbox-network'],
    ['session_id', sessionId, '--session-id'],
  ])('renders constrained provider option %s before validating it', async (key, value, flag) => {
    const instance = provider({ config: { working_dir: testDir, [key]: '{{setting}}' } });
    const response = await instance.callApi(prompt, {
      vars: { setting: value },
      prompt: { raw: prompt, label: 'test' },
    });
    expect(response.error).toBeUndefined();
    const args = vi.mocked(spawn).mock.calls[0][1]!;
    expect(args[args.indexOf(flag) + 1]).toBe(value);
  });

  it('rejects an invalid constrained option after rendering', async () => {
    const instance = provider({ config: { approval_mode: '{{mode}}' } });
    const response = await instance.callApi(prompt, {
      vars: { mode: 'invalid' },
      prompt: { raw: prompt, label: 'test' },
    });
    expect(response.error).toContain('Invalid Muse Code config');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('validates prompt-level overrides before starting a process', async () => {
    const result = await provider().callApi(prompt, {
      vars: {},
      prompt: { raw: prompt, label: 'test', config: { max_model_steps: 0 } },
    });
    expect(result.error).toContain('Invalid Muse Code config');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('reports missing workspaces without invoking the CLI', async () => {
    const result = await provider({
      config: { working_dir: path.join(testDir, 'missing') },
    }).callApi(prompt);
    expect(result.error).toContain('ENOENT');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('reports a missing binary with installation instructions', async () => {
    onSpawn = (child) => {
      child.emit('error', Object.assign(new Error('not found'), { code: 'ENOENT' }));
      child.close(-2);
    };
    const result = await provider().callApi(prompt);
    expect(result.error).toContain('Muse Code CLI was not found');
    expect(result.error).toContain('MUSE_CLI_PATH');
  });

  it('fails a nonzero process exit even when stdout contains a completed run', async () => {
    onSpawn = (child) => {
      child.stdout.write(fixture);
      child.stderr.write('backend rejected fixture-secret');
      child.close(1);
    };
    const result = await provider({ config: { apiKey: 'fixture-secret' } }).callApi(prompt);
    expect(result.error).toBe('Muse Code exited with code 1: backend rejected [REDACTED]');
    expect(result.output).toBeUndefined();
  });

  it.each([0, 1])(
    'redacts credentials throughout the response before tracing (exit %i)',
    async (exitCode) => {
      const apiKey = 'fixture-"secret\\\n🎵';
      const events = structuredClone(fixtureEvents);
      events.at(-1)!.payload.text = `META_API_KEY=${apiKey}`;
      events.at(-1)!.payload.details = { values: [apiKey, { echoed: apiKey }], [apiKey]: apiKey };
      onSpawn = (child) => {
        child.stdout.write(events.map((event) => JSON.stringify(event)).join('\n'));
        child.stderr.write(`backend rejected ${apiKey}`);
        child.close(exitCode);
      };
      let tracedResponse: unknown;
      vi.mocked(withGenAISpan).mockImplementation(async (_context, fn) => {
        const response = await fn({} as Span);
        tracedResponse = response;
        return response;
      });

      const response = await provider({ config: { apiKey } }).callApi('Print META_API_KEY');
      if (exitCode === 0) {
        expect(response.output).toBe('META_API_KEY=[REDACTED]');
      } else {
        expect(response.error).toBe('Muse Code exited with code 1: backend rejected [REDACTED]');
      }
      expect(response.raw.at(-1).payload.details).toEqual({
        values: ['[REDACTED]', { echoed: '[REDACTED]' }],
        '[REDACTED]': '[REDACTED]',
      });
      expect(tracedResponse).toEqual(response);
      expect(JSON.stringify(tracedResponse)).not.toContain(JSON.stringify(apiKey).slice(1, -1));
    },
  );

  it.each([
    ['output', 0],
    ['error', 1],
  ] as const)(
    'preserves the %s response field when redacting a short key',
    async (apiKey, exitCode) => {
      const events = structuredClone(fixtureEvents);
      events.at(-1)!.payload.text = apiKey;
      onSpawn = (child) => {
        child.stdout.write(events.map((event) => JSON.stringify(event)).join('\n'));
        child.stderr.write(apiKey);
        child.close(exitCode);
      };
      const response = await provider({ config: { apiKey } }).callApi(prompt);
      if (exitCode === 0) {
        expect(response.output).toBe('[REDACTED]');
      } else {
        expect(response.error).toBe('Muse Code exited with code 1: [REDACTED]');
      }
    },
  );

  it('redacts other injected credentials and URL authentication from journal data', async () => {
    const proxy = 'http://proxy-user:p%40ssword@proxy.example:8080';
    const restoreProxy = mockProcessEnv({ HTTPS_PROXY: proxy });
    const sensitive = [
      'github-credential',
      'database-credential',
      'deploy-credential',
      proxy,
      'proxy-user',
      'p%40ssword',
      'p@ssword',
      'query-credential',
      'endpoint-password',
    ];
    try {
      onSpawn = (child) => {
        const env = vi.mocked(spawn).mock.calls[0][2]!.env!;
        expect(env.GITHUB_TOKEN).toBe(sensitive[0]);
        expect(env.DATABASE_PASSWORD).toBe(sensitive[1]);
        expect(env.HTTPS_PROXY).toBe(proxy);
        const events = structuredClone(fixtureEvents);
        events.at(-1)!.payload.text = `${sensitive.join(' | ')} | keep-me`;
        events.at(-1)!.payload.details = { values: sensitive, [sensitive[0]]: 'field name' };
        child.stdout.write(events.map((event) => JSON.stringify(event)).join('\n'));
        child.close();
      };
      const response = await provider({
        config: {
          base_url: 'https://endpoint-user:endpoint-password@meta.example',
          env: {
            GITHUB_TOKEN: sensitive[0],
            DATABASE_PASSWORD: sensitive[1],
            DEPLOY_KEY: sensitive[2],
            SERVICE_URL: 'https://service.example?api_key=query-credential',
            PUBLIC_SETTING: 'keep-me',
          },
        },
      }).callApi(prompt);
      expect(response.error).toBeUndefined();
      expect(response.output).toContain('keep-me');
      for (const credential of sensitive) {
        expect(JSON.stringify(response)).not.toContain(credential);
      }
    } finally {
      restoreProxy();
    }
  });

  it('redacts overlapping credentials in stderr without rewriting redaction markers', async () => {
    onSpawn = (child) => {
      child.stderr.write('RED-secret RED literal.[key]+$');
      child.close(1);
    };
    const response = await provider({
      config: {
        apiKey: 'RED',
        env: { GITHUB_TOKEN: 'RED-secret', DATABASE_PASSWORD: 'literal.[key]+$' },
      },
    }).callApi(prompt);
    expect(response.error).toBe('Muse Code exited with code 1: [REDACTED] [REDACTED] [REDACTED]');
  });

  it.each([
    ['GITHUB_PAT', 'synthetic-personal-token'],
    ['GITHUB_TOKEN_VALUE', 'synthetic-token-value'],
    ['servicePasswordValue', 'synthetic-password'],
    ['DEPLOY_CREDENTIAL', 'synthetic-credential'],
    ['CUSTOM_SETTING', `sk-${'a'.repeat(24)}`],
    ['GIT_ACCESS', `ghp_${'a'.repeat(36)}`],
    ['USER', `ghp_${'b'.repeat(36)}`],
  ])('redacts credential %s by name or value', async (name, value) => {
    const events = structuredClone(fixtureEvents);
    events.at(-1)!.payload.text = value;
    events.at(-1)!.payload.details = { [value]: value };
    onSpawn = (child) => {
      expect(vi.mocked(spawn).mock.calls[0][2]!.env![name]).toBe(value);
      child.stdout.write(events.map((event) => JSON.stringify(event)).join('\n'));
      child.close();
    };
    const response = await provider({ config: { env: { [name]: value } } }).callApi(prompt);
    expect(response.output).toBe('[REDACTED]');
    expect(JSON.stringify(response)).not.toContain(value);
  });

  it.each(['HOTKEY', 'MONKEY', 'TOKENIZER_SETTING'])(
    'preserves ordinary output when nonsecret setting %s contains it',
    async (name) => {
      const events = structuredClone(fixtureEvents);
      events.at(-1)!.payload.text = 'save changes to save.txt';
      onSpawn = (child) => {
        child.stdout.write(events.map((event) => JSON.stringify(event)).join('\n'));
        child.close();
      };
      const response = await provider({ config: { env: { [name]: 'save' } } }).callApi(prompt);
      expect(response.output).toBe('save changes to save.txt');
      expect(response.raw).toEqual(events);
    },
  );

  it('preserves operational paths that resemble long opaque credentials', async () => {
    const directory = path.join(testDir, 'x'.repeat(80));
    const events = structuredClone(fixtureEvents);
    events.at(-1)!.payload.text = directory;
    onSpawn = (child) => {
      child.stdout.write(events.map((event) => JSON.stringify(event)).join('\n'));
      child.close();
    };
    const response = await provider({
      config: { env: { MUSE_AUTH_PATH: directory, XDG_CACHE_HOME: directory } },
    }).callApi(prompt);
    expect(response.output).toBe(directory);
    expect(response.raw).toEqual(events);
  });

  it('preserves a nonsecret checksum supplied through the environment', async () => {
    const checksum = 'a'.repeat(64);
    const events = structuredClone(fixtureEvents);
    events.at(-1)!.payload.text = checksum;
    onSpawn = (child) => {
      child.stdout.write(events.map((event) => JSON.stringify(event)).join('\n'));
      child.close();
    };
    const response = await provider({ config: { env: { CHECKSUM: checksum } } }).callApi(prompt);
    expect(response.output).toBe(checksum);
    expect(response.raw).toEqual(events);
  });

  it.each(['failed', 'cancelled'])(
    'fails a %s terminal event even when the process exits zero',
    async (terminal) => {
      const events = structuredClone(fixtureEvents);
      events.at(-1)!.payload_type = `run.terminal.${terminal}`;
      events.at(-1)!.payload.terminal = terminal;
      events.at(-1)!.payload.reason = 'maximum model steps reached';
      onSpawn = (child) => {
        child.stdout.write(events.map((event) => JSON.stringify(event)).join('\n'));
        child.close();
      };
      const result = await provider().callApi(prompt);
      expect(result.error).toBe('Muse Code run failed: maximum model steps reached');
      expect(result.output).toBeUndefined();
    },
  );

  it.each([
    '',
    'not json',
    'null',
    '[]',
    '{"schema_version":2}',
    '{"payload_type":"run.terminal.completed"}',
  ])('fails closed for incomplete or malformed JSONL: %s', async (output) => {
    onSpawn = (child) => {
      child.stdout.write(output);
      child.close();
    };
    const result = await provider().callApi(prompt);
    expect(result.error).toMatch(/invalid or unsupported JSONL|without a terminal event/);
    expect(result.output).toBeUndefined();
  });

  it('does not treat partial deltas or a child session completion as the root result', async () => {
    const events = structuredClone(fixtureEvents);
    events.at(-1)!.stream.id = 'child-session';
    onSpawn = (child) => {
      child.stdout.write(events.map((event) => JSON.stringify(event)).join('\n'));
      child.close();
    };
    const result = await provider().callApi(prompt);
    expect(result.error).toContain('without a terminal event');
  });

  it('selects the current run if the journal contains earlier completed runs', async () => {
    const current = JSON.parse(
      JSON.stringify(fixtureEvents).replaceAll(
        fixtureEvents.at(-1)!.payload.run_stream.id,
        'new-run',
      ),
    );
    current.at(-1).payload.text = 'current result';
    onSpawn = (child) => {
      child.stdout.write(
        [...fixtureEvents, ...current].map((event) => JSON.stringify(event)).join('\n'),
      );
      child.close();
    };
    const result = await provider().callApi(prompt);
    expect(result).toMatchObject({ output: 'current result', metadata: { runId: 'new-run' } });
  });

  it('decodes split UTF-8 chunks and accepts a final line without a newline', async () => {
    const events = structuredClone(fixtureEvents);
    events.at(-1)!.payload.text = '音楽 🎵';
    const bytes = Buffer.from(events.map((event) => JSON.stringify(event)).join('\r\n'));
    onSpawn = (child) => {
      for (let index = 0; index < bytes.length; index += 7) {
        child.stdout.write(bytes.subarray(index, index + 7));
      }
      child.close();
    };
    expect((await provider().callApi(prompt)).output).toBe('音楽 🎵');
  });

  it('kills the process when the output limit is exceeded', async () => {
    onSpawn = (child) => child.stdout.write('x'.repeat(101));
    const result = await provider({ config: { max_output_bytes: 100 } }).callApi(prompt);
    expect(result.error).toBe('Muse Code exceeded max_output_bytes');
    expect(children[0].kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('reaps the process group before waiting for inherited output pipes to close', async () => {
    vi.useFakeTimers();
    onSpawn = (child) => {
      child.stdout.write(fixture);
      child.kill.mockReturnValue(true);
      child.emit('exit', 0, null);
    };
    const call = provider().callApi(prompt);
    await started.promise;
    await Promise.resolve();
    if (process.platform !== 'win32') {
      expect(process.kill).toHaveBeenCalledWith(-children[0].pid, 'SIGKILL');
    }
    children[0].close();
    expect((await call).output).toBe(`echo: ${prompt}`);
  });

  it('bounds cleanup when an escaped descendant keeps output pipes open after exit', async () => {
    vi.useFakeTimers();
    onSpawn = (child) => {
      child.kill.mockReturnValue(true);
      child.stdout.write(fixture);
      child.emit('exit', 0, null);
    };
    const call = provider().callApi(prompt);
    await started.promise;
    await vi.advanceTimersByTimeAsync(1000);
    expect(children[0].stdout.destroyed).toBe(true);
    expect(children[0].stderr.destroyed).toBe(true);
    expect((await call).error).toContain('output pipes did not close');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['timeout', 'shutdown'])(
    'bounds %s when killed processes never close their pipes',
    async (trigger) => {
      vi.useFakeTimers();
      onSpawn = (child) => child.kill.mockReturnValue(true);
      const instance = provider({ config: { timeout_ms: 100 } });
      const call = instance.callApi(prompt);
      await started.promise;
      await Promise.resolve();
      const cleanup = trigger === 'shutdown' ? instance.shutdown() : undefined;
      await vi.advanceTimersByTimeAsync(trigger === 'timeout' ? 1100 : 1000);
      expect(children[0].stdout.destroyed).toBe(true);
      expect(children[0].stderr.destroyed).toBe(true);
      expect((await call).error).toBe(
        trigger === 'timeout' ? 'Muse Code timed out after 100ms' : 'Muse Code call aborted',
      );
      await cleanup;
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('honors cancellation before allocating a workspace', async () => {
    const controller = new AbortController();
    controller.abort();
    const mkdtemp = vi.spyOn(fs, 'mkdtemp');
    expect(
      (await provider().callApi(prompt, undefined, { abortSignal: controller.signal })).error,
    ).toContain('aborted');
    expect(mkdtemp).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('cleans up if cancelled after creating the prompt file', async () => {
    const controller = new AbortController();
    const writeFile = fs.writeFile;
    let promptFile = '';
    vi.spyOn(fs, 'writeFile').mockImplementationOnce(async (file, contents, options) => {
      promptFile = String(file);
      await writeFile(file, contents, options);
      controller.abort();
    });
    const result = await provider().callApi(prompt, undefined, { abortSignal: controller.signal });
    expect(result.error).toContain('aborted');
    expect(spawn).not.toHaveBeenCalled();
    await expect(fs.stat(path.dirname(promptFile))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('cancels an active call and removes its workspace', async () => {
    onSpawn = () => {};
    const controller = new AbortController();
    const call = provider().callApi(prompt, undefined, { abortSignal: controller.signal });
    await started.promise;
    controller.abort();
    expect((await call).error).toContain('aborted');
    expect(children[0].kill).toHaveBeenCalledWith('SIGTERM');
    const cwd = String(vi.mocked(spawn).mock.calls[0][2]!.cwd);
    await expect(fs.stat(cwd)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('enforces timeout and forcibly stops a process that ignores SIGTERM', async () => {
    vi.useFakeTimers();
    onSpawn = (child) => {
      child.kill.mockImplementation((signal) => {
        if (signal === 'SIGKILL') {
          queueMicrotask(() => child.close(null, 'SIGKILL'));
        }
        return true;
      });
    };
    const call = provider({ config: { timeout_ms: 100 } }).callApi(prompt);
    await started.promise;
    await vi.advanceTimersByTimeAsync(100);
    expect(children[0].kill).toHaveBeenCalledWith('SIGTERM');
    await vi.advanceTimersByTimeAsync(1000);
    expect((await call).error).toBe('Muse Code timed out after 100ms');
    expect(children[0].kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('shutdown cancels active calls and unregisters the provider', async () => {
    onSpawn = () => {};
    const instance = provider();
    const call = instance.callApi(prompt);
    await started.promise;
    await instance.shutdown();
    expect((await call).error).toContain('aborted');
    expect(providerRegistry.unregister).toHaveBeenCalledWith(instance);
  });

  it('requires a stable, retained workspace for session reuse', async () => {
    expect((await provider({ config: { session_id: sessionId } }).callApi(prompt)).error).toContain(
      'requires working_dir',
    );
    expect(
      (
        await provider({
          config: { session_id: sessionId, working_dir: testDir, no_session_log: true },
        }).callApi(prompt)
      ).error,
    ).toContain('cannot be combined');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('prevents overlapping calls on an explicit session and permits reuse after completion', async () => {
    onSpawn = () => {};
    const instance = provider({ config: { session_id: sessionId, working_dir: testDir } });
    const first = instance.callApi(prompt);
    await started.promise;
    expect((await instance.callApi('overlap')).error).toContain('already in use');
    expect(spawn).toHaveBeenCalledTimes(1);
    const args = vi.mocked(spawn).mock.calls[0][1]!;
    expect(args).toEqual(expect.arrayContaining(['--session-id', sessionId]));
    expect(args).not.toContain('--no-session-log');
    children[0].stdout.write(fixture);
    children[0].close();
    await first;
    onSpawn = (child) => {
      child.stdout.write(fixture);
      child.close();
    };
    expect((await instance.callApi(prompt)).error).toBeUndefined();
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('creates a separate workspace for each independent call without caching responses', async () => {
    const instance = provider();
    const results = await Promise.all([instance.callApi(prompt), instance.callApi(prompt)]);
    expect(results.every((result) => !result.error)).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(vi.mocked(spawn).mock.calls[0][2]!.cwd).not.toBe(vi.mocked(spawn).mock.calls[1][2]!.cwd);
  });
});
