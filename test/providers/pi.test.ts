import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import {
  findPiCliScript,
  PI_READONLY_TOOLS,
  PiProvider,
  redactArgsForLog,
} from '../../src/providers/pi';
import { providerRegistry } from '../../src/providers/providerRegistry';
import * as genaiTracer from '../../src/tracing/genaiTracer';

// Keep the real genaiTracer implementation (spans no-op without an OTEL SDK),
// but allow spying on withGenAISpan to assert the provider's tracing wiring.
vi.mock('../../src/tracing/genaiTracer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/tracing/genaiTracer')>()),
}));

vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  spawn: vi.fn(),
  execFile: vi.fn(),
}));

const { execFile, spawn } = await import('child_process');
const mockExecFile = vi.mocked(execFile);
const mockSpawn = vi.mocked(spawn);

class FakeChildProcess extends EventEmitter {
  stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  stdin = Object.assign(new EventEmitter(), {
    write: vi.fn(),
    end: vi.fn(),
  });
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  kill = vi.fn();
}

interface FakeRunOptions {
  exitCode?: number;
  stderr?: string;
}

function buildUsage(
  input: number,
  output: number,
  costTotal: number,
  cacheRead = 0,
  cacheWrite = 0,
) {
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens: input + output + cacheRead + cacheWrite,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: costTotal },
  };
}

function assistantMessage(
  text: string,
  options: {
    usage?: ReturnType<typeof buildUsage>;
    stopReason?: string;
    errorMessage?: string;
  } = {},
) {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    provider: 'openai',
    model: 'gpt-4o-mini',
    usage: options.usage ?? buildUsage(100, 10, 0.001),
    stopReason: options.stopReason ?? 'stop',
    ...(options.errorMessage ? { errorMessage: options.errorMessage } : {}),
  };
}

function defaultEvents(text = 'hello') {
  const message = assistantMessage(text);
  return [
    { type: 'session', version: 3, id: 'session-id', timestamp: 'now', cwd: '/tmp' },
    { type: 'agent_start' },
    { type: 'message_end', message },
    { type: 'agent_end', messages: [{ role: 'user', content: [] }, message], willRetry: false },
  ];
}

/**
 * Queue a fake `pi` process for the next spawn() call. Emits the given events
 * as JSONL on stdout, then closes with the given exit code.
 */
function mockPiRun(events: unknown[], options: FakeRunOptions = {}): FakeChildProcess {
  const child = new FakeChildProcess();
  mockSpawn.mockImplementationOnce(() => {
    setImmediate(() => {
      const completeEvents = events.some((event: any) => event?.type === 'agent_end')
        ? [...events, { type: 'agent_settled' }]
        : events;
      const stdout = completeEvents.map((event) => JSON.stringify(event)).join('\n');
      if (stdout) {
        child.stdout.emit('data', `${stdout}\n`);
      }
      if (options.stderr) {
        child.stderr.emit('data', options.stderr);
      }
      const exitCode = options.exitCode ?? 0;
      child.exitCode = exitCode;
      child.emit('close', exitCode);
    });
    return child as never;
  });
  return child;
}

function spawnedArgs(callIndex = 0): string[] {
  return mockSpawn.mock.calls[callIndex][1] as string[];
}

function spawnedOptions(callIndex = 0): Record<string, any> {
  return mockSpawn.mock.calls[callIndex][2] as Record<string, any>;
}

describe('PiProvider', () => {
  let previousBasePath: string | undefined;
  beforeEach(() => {
    vi.resetAllMocks();
    previousBasePath = cliState.basePath;
    cliState.basePath = '/test/basePath';
  });
  afterEach(() => {
    cliState.basePath = previousBasePath;
  });

  describe('id and construction', () => {
    it('defaults to the pi provider id', () => {
      expect(new PiProvider().id()).toBe('pi');
    });

    it('uses a custom id when provided', () => {
      expect(new PiProvider({ id: 'pi:openai/gpt-4o-mini' }).id()).toBe('pi:openai/gpt-4o-mini');
    });

    it('has a readable toString', () => {
      expect(new PiProvider().toString()).toBe('[Pi Coding Agent Provider]');
    });
  });

  describe('CLI arguments', () => {
    it('runs in RPC mode with discovery and tools disabled', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      const args = spawnedArgs();
      expect(args).toEqual([
        '--mode',
        'rpc',
        '--no-session',
        '--offline',
        '--no-tools',
        '--no-extensions',
        '--no-skills',
        '--no-prompt-templates',
        '--no-context-files',
        '--no-approve',
      ]);
    });

    it('passes model, provider, and thinking flags', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({
        config: {
          model: 'anthropic/claude-sonnet-4-5',
          provider_id: 'anthropic',
          thinking: 'high',
        },
      });

      await provider.callApi('test prompt');

      const args = spawnedArgs();
      expect(args).toContain('--provider');
      expect(args[args.indexOf('--provider') + 1]).toBe('anthropic');
      expect(args).toContain('--model');
      expect(args[args.indexOf('--model') + 1]).toBe('anthropic/claude-sonnet-4-5');
      expect(args).toContain('--thinking');
      expect(args[args.indexOf('--thinking') + 1]).toBe('high');
    });

    it('enables read-only tools when working_dir is set', async () => {
      const workingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-test-'));
      try {
        mockPiRun(defaultEvents());
        const provider = new PiProvider({ config: { working_dir: workingDir } });

        await provider.callApi('test prompt');

        const args = spawnedArgs();
        expect(args).toContain('--tools');
        expect(args[args.indexOf('--tools') + 1]).toBe(PI_READONLY_TOOLS.join(','));
        expect(args).not.toContain('--no-tools');
        expect(spawnedOptions().cwd).toBe(workingDir);
      } finally {
        fs.rmSync(workingDir, { recursive: true, force: true });
      }
    });

    it('respects an explicit tool allowlist', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({
        config: { tools: ['read', 'bash'], exclude_tools: ['write'] },
      });

      await provider.callApi('test prompt');

      const args = spawnedArgs();
      expect(args[args.indexOf('--tools') + 1]).toBe('read,bash');
      expect(args[args.indexOf('--exclude-tools') + 1]).toBe('write');
    });

    it('treats an empty tool allowlist as no tools', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({ config: { tools: [] } });

      await provider.callApi('test prompt');

      expect(spawnedArgs()).toContain('--no-tools');
    });

    it('gives no_tools precedence over a tool allowlist', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({ config: { no_tools: true, tools: ['bash'] } });

      await provider.callApi('test prompt');

      const args = spawnedArgs();
      expect(args).toContain('--no-tools');
      expect(args).not.toContain('--tools');
    });

    it('passes system prompt flags', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({
        config: { system_prompt: 'You are terse.', append_system_prompt: 'Answer in French.' },
      });

      await provider.callApi('test prompt');

      const args = spawnedArgs();
      expect(args[args.indexOf('--system-prompt') + 1]).toBe('You are terse.');
      expect(args[args.indexOf('--append-system-prompt') + 1]).toBe('Answer in French.');
    });

    it('omits hermetic flags when loading is enabled', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({
        config: {
          load_extensions: true,
          load_skills: true,
          load_prompt_templates: true,
          load_context_files: true,
          offline: false,
        },
      });

      await provider.callApi('test prompt');

      const args = spawnedArgs();
      expect(args).not.toContain('--no-extensions');
      expect(args).not.toContain('--no-skills');
      expect(args).not.toContain('--no-prompt-templates');
      expect(args).not.toContain('--no-context-files');
      expect(args).not.toContain('--offline');
      // Trust is a separate axis: enabling discovery does NOT imply --approve.
      expect(args).toContain('--no-approve');
      expect(args).not.toContain('--approve');
    });

    it('appends extra_args verbatim', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({ config: { extra_args: ['--approve'] } });

      await provider.callApi('test prompt');

      expect(spawnedArgs()).toContain('--approve');
    });

    it('keeps --no-approve when working_dir enables read-only tools', async () => {
      const workingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-test-'));
      try {
        mockPiRun(defaultEvents());
        const provider = new PiProvider({ config: { working_dir: workingDir } });

        await provider.callApi('test prompt');

        expect(spawnedArgs()).toContain('--no-approve');
      } finally {
        fs.rmSync(workingDir, { recursive: true, force: true });
      }
    });

    it('keeps --no-approve for context-file loading (context files do not need trust)', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({ config: { load_context_files: true } });

      await provider.callApi('test prompt');

      const args = spawnedArgs();
      expect(args).toContain('--no-approve');
      expect(args).not.toContain('--approve');
    });

    it('passes --approve only when trust_project_files is set', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({ config: { trust_project_files: true } });

      await provider.callApi('test prompt');

      const args = spawnedArgs();
      expect(args).toContain('--approve');
      expect(args).not.toContain('--no-approve');
    });

    it('allows prompt-level model selection', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({ config: { model: 'openai/gpt-4o-mini' } });

      await provider.callApi('test prompt', {
        prompt: {
          raw: 'test prompt',
          label: 'test',
          config: { model: 'anthropic/claude-sonnet-4-5' },
        },
        vars: {},
      });

      const args = spawnedArgs();
      expect(args[args.indexOf('--model') + 1]).toBe('anthropic/claude-sonnet-4-5');
    });

    it('keeps executable, tools, discovery and limits provider-owned', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({ config: { pi_path: '/trusted/pi', no_tools: true } });
      await provider.callApi('hello', {
        prompt: {
          raw: 'hello',
          label: 'fixture',
          config: {
            pi_path: '/ignored/pi',
            no_tools: false,
            tools: ['read'],
            working_dir: '/ignored/workspace',
            agent_dir: '/ignored/settings',
            load_extensions: true,
            load_skills: true,
            load_context_files: true,
            load_prompt_templates: true,
            trust_project_files: true,
            extra_args: ['--ignored'],
            offline: false,
            timeout: 0,
            max_output_bytes: 1,
          },
        },
        vars: {},
      });
      expect(mockSpawn.mock.calls[0][0]).toBe('/trusted/pi');
      expect(spawnedArgs()).toEqual(
        expect.arrayContaining([
          '--no-tools',
          '--no-extensions',
          '--no-skills',
          '--no-context-files',
          '--no-prompt-templates',
          '--no-approve',
          '--offline',
        ]),
      );
      expect(spawnedArgs()).not.toContain('--tools');
      expect(spawnedArgs()).not.toContain('--ignored');
      expect(spawnedOptions().cwd).not.toBe('/ignored/workspace');
      expect(spawnedOptions().env.PI_CODING_AGENT_DIR).not.toBe('/ignored/settings');
    });

    it('keeps environment settings provider-owned', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({
        config: { env: { KEEP_ME: 'base', OVERRIDE_ME: 'base' } },
      });

      await provider.callApi('test prompt', {
        prompt: {
          raw: 'test prompt',
          label: 'test',
          config: { env: { OVERRIDE_ME: 'prompt' } },
        },
        vars: {},
      });

      const env = spawnedOptions().env;
      expect(env.KEEP_ME).toBe('base');
      expect(env.OVERRIDE_ME).toBe('base');
    });
  });

  describe('prompt delivery', () => {
    it.each(['the prompt text', '  padded\n', '\t \n'])(
      'preserves the RPC prompt %j',
      async (prompt) => {
        const child = mockPiRun(defaultEvents());
        const provider = new PiProvider();

        await provider.callApi(prompt);

        expect(child.stdin.write).toHaveBeenCalledWith(
          `${JSON.stringify({ type: 'prompt', message: prompt })}\n`,
        );
        expect(child.stdin.end).toHaveBeenCalled();
      },
    );
  });

  it('reports RPC prompt errors and closes input', async () => {
    const child = mockPiRun([
      { type: 'response', command: 'prompt', success: false, error: 'No model configured' },
    ]);
    const result = await new PiProvider().callApi('hello');
    expect(result.error).toBe('No model configured');
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
  });

  it('finishes when an extension handles the prompt without starting an agent run', async () => {
    const child = mockPiRun([
      { type: 'response', command: 'prompt', success: true, data: { disposition: 'handled' } },
    ]);
    const result = await new PiProvider().callApi('/fixture');
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
    expect(result.error).toContain('before completing the run');
  });

  it('keeps input open until a complete final event arrives', async () => {
    const child = new FakeChildProcess();
    mockSpawn.mockReturnValueOnce(child as never);
    const pending = new PiProvider().callApi('hello');
    await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalled());
    expect(child.stdin.end).not.toHaveBeenCalled();
    child.stdout.emit('data', JSON.stringify({ type: 'agent_end', willRetry: true }) + '\n');
    expect(child.stdin.end).not.toHaveBeenCalled();
    child.stdout.emit('data', JSON.stringify({ type: 'agent_end', willRetry: false }) + '\n');
    expect(child.stdin.end).not.toHaveBeenCalled();
    const final =
      JSON.stringify({ type: 'agent_end', messages: [assistantMessage('done')] }) +
      '\n' +
      JSON.stringify({ type: 'agent_settled' }) +
      '\n';
    child.stdout.emit('data', final.slice(0, 20));
    expect(child.stdin.end).not.toHaveBeenCalled();
    child.stdout.emit('data', final.slice(20));
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
    child.emit('close', 0);
    expect((await pending).output).toBe('done');
  });

  describe('environment', () => {
    it('inherits invocation-local env-file settings before provider overrides', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'host-fixture');
      vi.stubEnv('PI_CODING_AGENT_DIR', '/host/settings');
      try {
        mockPiRun(defaultEvents());
        const provider = new PiProvider({
          config: { basePath: '/loaded/config', env: { HTTPS_PROXY: 'provider-fixture' } },
        });
        await cliState.withEnvFileOverrides(
          { OPENAI_API_KEY: 'file-fixture', PI_CODING_AGENT_DIR: './file-settings' },
          () => provider.callApi('hello'),
        );
        expect(spawnedOptions().env).toMatchObject({
          OPENAI_API_KEY: 'file-fixture',
          PI_CODING_AGENT_DIR: path.resolve('/loaded/config/file-settings'),
          HTTPS_PROXY: 'provider-fixture',
        });
        expect(process.env.OPENAI_API_KEY).toBe('host-fixture');
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('keeps loader paths after the loading scope ends', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-loader-base-'));
      try {
        fs.mkdirSync(path.join(root, 'project'));
        const { loadApiProvider } = await import('../../src/providers');
        const provider = await loadApiProvider('pi', {
          basePath: root,
          options: { config: { working_dir: './project', agent_dir: './settings' } },
        });
        mockPiRun(defaultEvents());
        await cliState.withBasePath('/different/caller', () => provider.callApi('hello'));
        expect(spawnedOptions().cwd).toBe(path.join(root, 'project'));
        expect(spawnedOptions().env.PI_CODING_AGENT_DIR).toBe(path.join(root, 'settings'));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('sets PI_CODING_AGENT_DIR from agent_dir', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({ config: { agent_dir: '/tmp/pi-agent-dir' } });

      await provider.callApi('test prompt');

      expect(spawnedOptions().env.PI_CODING_AGENT_DIR).toBe('/tmp/pi-agent-dir');
    });

    it('resolves a relative PI_CODING_AGENT_DIR from env to an absolute child env value', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({ config: { env: { PI_CODING_AGENT_DIR: './rel-agent' } } });

      await provider.callApi('test prompt');

      // pi resolves a relative value from its temp/working cwd, so the provider
      // must hand it an absolute path (resolved from the config base path) that
      // resolves from the configuration directory.
      expect(spawnedOptions().env.PI_CODING_AGENT_DIR).toBe(
        path.resolve('/test/basePath', 'rel-agent'),
      );
    });

    it('resolves a relative agent_dir from a relative config base path', async () => {
      const original = cliState.basePath;
      cliState.basePath = 'rel/config/dir';
      try {
        mockPiRun(defaultEvents());
        const provider = new PiProvider({ config: { agent_dir: './agent' } });

        await provider.callApi('test prompt');

        // Must resolve against the config dir (cwd + relative basePath), not bare cwd.
        const expected = path.resolve(process.cwd(), 'rel/config/dir', 'agent');
        expect(spawnedOptions().env.PI_CODING_AGENT_DIR).toBe(expected);
      } finally {
        cliState.basePath = original;
      }
    });

    it('injects apiKey via the provider env var instead of argv', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({
        config: { provider_id: 'anthropic', apiKey: 'test-anthropic-key' },
      });

      await provider.callApi('test prompt');

      expect(spawnedOptions().env.ANTHROPIC_API_KEY).toBe('test-anthropic-key');
      expect(spawnedArgs()).not.toContain('--api-key');
    });

    it('derives the apiKey env var from a provider/model pattern', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({
        config: { model: 'openai/gpt-4o-mini', apiKey: 'test-openai-key' },
      });

      await provider.callApi('test prompt');

      expect(spawnedOptions().env.OPENAI_API_KEY).toBe('test-openai-key');
      expect(spawnedArgs()).not.toContain('--api-key');
    });

    it('injects apiKey via api_key_env for unrecognized providers', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({
        config: {
          provider_id: 'my-custom-proxy',
          apiKey: 'custom-key',
          api_key_env: 'MY_PROXY_API_KEY',
        },
      });

      await provider.callApi('test prompt');

      expect(spawnedOptions().env.MY_PROXY_API_KEY).toBe('custom-key');
      expect(spawnedArgs()).not.toContain('--api-key');
    });

    it('rejects apiKey for unrecognized providers without api_key_env', async () => {
      const provider = new PiProvider({
        config: { provider_id: 'my-custom-proxy', apiKey: 'custom-key' },
      });

      await expect(provider.callApi('test prompt')).rejects.toThrow(/api_key_env/);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('never puts the apiKey on the command line', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({
        config: { provider_id: 'anthropic', apiKey: 'test-secret-key' },
      });

      await provider.callApi('test prompt');

      expect(spawnedArgs().join(' ')).not.toContain('test-secret-key');
    });

    it('merges provider env overrides and config env', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({
        config: { env: { CUSTOM_VAR: 'custom-value' } },
        env: { OPENAI_API_KEY: 'override-key' } as never,
      });

      await provider.callApi('test prompt');

      const env = spawnedOptions().env;
      expect(env.CUSTOM_VAR).toBe('custom-value');
      expect(env.OPENAI_API_KEY).toBe('override-key');
    });

    // Providers that pi supports beyond the original 11-entry map. Mirrors
    // pi-ai's env-api-keys.js so config.apiKey routes without api_key_env.
    it.each([
      ['together', 'TOGETHER_API_KEY'],
      ['nvidia', 'NVIDIA_API_KEY'],
      ['minimax', 'MINIMAX_API_KEY'],
      ['moonshotai', 'MOONSHOT_API_KEY'],
      ['vercel-ai-gateway', 'AI_GATEWAY_API_KEY'],
      ['azure-openai-responses', 'AZURE_OPENAI_API_KEY'],
    ])('maps apiKey to the standard env var for %s', async (providerId, envVar) => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({ config: { provider_id: providerId, apiKey: 'k' } });

      await provider.callApi('test prompt');

      expect(spawnedOptions().env[envVar]).toBe('k');
      expect(spawnedArgs()).not.toContain('--api-key');
    });
  });

  describe('response parsing', () => {
    it('returns the final assistant message text with usage and cost', async () => {
      mockPiRun(defaultEvents('final answer'));
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt');

      expect(result.output).toBe('final answer');
      expect(result.tokenUsage).toEqual({
        prompt: 100,
        completion: 10,
        total: 110,
        cached: 0,
        numRequests: 1,
      });
      expect(result.cost).toBeCloseTo(0.001);
      expect(result.metadata).toMatchObject({ provider_id: 'openai', model: 'gpt-4o-mini' });
      expect(result.raw).toContain('final answer');
    });

    it('sums usage across multiple assistant turns', async () => {
      const first = assistantMessage('let me check', {
        usage: buildUsage(100, 10, 0.001, 5),
      });
      const second = assistantMessage('done', { usage: buildUsage(200, 20, 0.002, 10) });
      mockPiRun([
        {
          type: 'agent_end',
          messages: [{ role: 'user', content: [] }, first, { role: 'toolResult' }, second],
          willRetry: false,
        },
      ]);
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt');

      expect(result.output).toBe('done');
      expect(result.tokenUsage).toEqual({
        prompt: 315,
        completion: 30,
        total: 345,
        cached: 15,
        numRequests: 2,
        completionDetails: {
          cacheReadInputTokens: 15,
          cacheCreationInputTokens: 0,
        },
      });
      expect(result.cost).toBeCloseTo(0.003);
    });

    it('preserves cache creation usage and includes cache tokens in fallback totals', async () => {
      const usage = buildUsage(100, 10, 0.001, 5, 7);
      delete (usage as Partial<typeof usage>).totalTokens;
      mockPiRun([{ type: 'agent_end', messages: [assistantMessage('done', { usage })] }]);
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt');

      expect(result.tokenUsage).toEqual({
        prompt: 112,
        completion: 10,
        total: 122,
        cached: 5,
        numRequests: 1,
        completionDetails: {
          cacheReadInputTokens: 5,
          cacheCreationInputTokens: 7,
        },
      });
    });

    it.each([
      ['stop', 'stop'],
      ['length', 'length'],
      ['toolUse', 'tool_calls'],
    ])('preserves the %s finish reason', async (stopReason, expected) => {
      mockPiRun([{ type: 'agent_end', messages: [assistantMessage('hello', { stopReason })] }]);
      expect((await new PiProvider().callApi('hello')).finishReason).toBe(expected);
    });

    it('reports the concrete response model when Pi routes to another model', async () => {
      mockPiRun([
        {
          type: 'agent_end',
          messages: [{ ...assistantMessage('hello'), responseModel: 'resolved-model' }],
        },
      ]);
      expect((await new PiProvider().callApi('hello')).metadata?.model).toBe('resolved-model');
    });

    it('captures tool calls in metadata', async () => {
      const message = assistantMessage('read the file');
      mockPiRun([
        {
          type: 'tool_execution_start',
          toolCallId: 'call-1',
          toolName: 'read',
          args: { path: 'sample.txt' },
        },
        {
          type: 'tool_execution_end',
          toolCallId: 'call-1',
          toolName: 'read',
          result: {},
          isError: false,
        },
        {
          type: 'tool_execution_end',
          toolCallId: 'call-2',
          toolName: 'bash',
          result: {},
          isError: true,
        },
        { type: 'agent_end', messages: [message], willRetry: false },
      ]);
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt');

      expect(result.metadata?.toolCalls).toEqual([
        { name: 'read', args: { path: 'sample.txt' } },
        { name: 'bash', args: undefined, is_error: true },
      ]);
    });

    it('rejects partial output when agent_settled is missing', async () => {
      mockPiRun([
        { type: 'message_end', message: assistantMessage('partial result') },
        { type: 'turn_end' },
      ]);
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('before completing the run');
    });

    it('skips malformed JSON lines', async () => {
      const child = new FakeChildProcess();
      mockSpawn.mockImplementationOnce(() => {
        setImmediate(() => {
          child.stdout.emit('data', Buffer.from('not json\n'));
          child.stdout.emit(
            'data',
            Buffer.from(
              `${JSON.stringify({
                type: 'agent_end',
                messages: [assistantMessage('parsed fine')],
                willRetry: false,
              })}\n${JSON.stringify({ type: 'agent_settled' })}\n`,
            ),
          );
          child.exitCode = 0;
          child.emit('close', 0);
        });
        return child as never;
      });
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt');

      expect(result.output).toBe('parsed fine');
    });

    it('surfaces agent errors from stopReason error', async () => {
      const message = assistantMessage('', {
        usage: buildUsage(0, 0, 0),
        stopReason: 'error',
        errorMessage: 'OpenAI API error (401): Incorrect API key',
      });
      mockPiRun([{ type: 'agent_end', messages: [message], willRetry: false }]);
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt');

      expect(result.error).toBe('OpenAI API error (401): Incorrect API key');
      expect(result.output).toBeUndefined();
    });

    it('errors when no assistant message is produced', async () => {
      mockPiRun([{ type: 'agent_start' }], { stderr: 'something broke' });
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('before completing the run');
      expect(result.error).toContain('something broke');
    });

    it('errors with stderr when pi exits nonzero without events', async () => {
      mockPiRun([], { exitCode: 1, stderr: 'Unknown flag: --bogus' });
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('Pi exited with code 1');
      expect(result.error).toContain('Unknown flag: --bogus');
    });

    it('treats a nonzero exit as an error even when events were emitted', async () => {
      // A mid-run crash leaves partial events behind; the truncated transcript
      // must not be reported (or cached) as a successful response.
      mockPiRun(defaultEvents('truncated mid-run'), { exitCode: 1, stderr: 'pi crashed' });
      mockPiRun(defaultEvents('recovered'));
      const provider = new PiProvider();

      const first = await provider.callApi('crash me');
      const second = await provider.callApi('crash me');

      expect(first.error).toContain('Pi exited with code 1');
      expect(first.error).toContain('pi crashed');
      expect(second.output).toBe('recovered');
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });

    it('decodes stdout as a stream so multi-byte UTF-8 spanning chunks survives', async () => {
      const child = mockPiRun(defaultEvents());
      const provider = new PiProvider();

      await provider.callApi('test prompt');

      expect(child.stdout.setEncoding).toHaveBeenCalledWith('utf-8');
      expect(child.stderr.setEncoding).toHaveBeenCalledWith('utf-8');
    });

    it('reports stopReason aborted as an error', async () => {
      const message = assistantMessage('', { stopReason: 'aborted' });
      mockPiRun([{ type: 'agent_end', messages: [message], willRetry: false }]);
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt');

      expect(result.error).toBe('Pi agent stopped with reason: aborted');
      expect(result.output).toBeUndefined();
    });

    it('attaches usage, cost, and the transcript to stopReason error responses', async () => {
      const message = assistantMessage('partial output before failing', {
        usage: buildUsage(50, 5, 0.0002),
        stopReason: 'error',
        errorMessage: 'OpenAI API error (500): server error',
      });
      mockPiRun([{ type: 'agent_end', messages: [message], willRetry: false }]);
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt');

      expect(result.error).toBe('OpenAI API error (500): server error');
      expect(result.tokenUsage).toEqual({
        prompt: 50,
        completion: 5,
        total: 55,
        cached: 0,
        numRequests: 1,
      });
      expect(result.cost).toBeCloseTo(0.0002);
      expect(result.raw).toContain('partial output before failing');
    });

    it('returns the last agent_end assistant turn across a retried (multi-agent_end) stream', async () => {
      // A retry stream emits an early agent_end for the failed attempt and a
      // terminal agent_end for the successful one. The backwards scan must
      // return the final turn, not the first attempt's transcript/usage.
      const failed = assistantMessage('first attempt failed', {
        usage: buildUsage(10, 0, 0.0001),
        stopReason: 'error',
        errorMessage: 'transient',
      });
      const ok = assistantMessage('final answer', { usage: buildUsage(100, 10, 0.002) });
      mockPiRun([
        { type: 'agent_end', messages: [{ role: 'user', content: [] }, failed], willRetry: true },
        { type: 'agent_end', messages: [{ role: 'user', content: [] }, ok], willRetry: false },
      ]);
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt');

      expect(result.output).toBe('final answer');
      expect(result.error).toBeUndefined();
      expect(result.tokenUsage?.total).toBe(110);
      expect(result.cost).toBeCloseTo(0.002);
    });

    it('falls back to message_end when agent_end carries no assistant message', async () => {
      // A terminal agent_end whose messages omit the assistant turn must not
      // shadow the assistant text already seen via message_end.
      const message = assistantMessage('answer from message_end');
      mockPiRun([
        { type: 'message_end', message },
        { type: 'agent_end', messages: [{ role: 'user', content: [] }], willRetry: false },
      ]);
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt');

      expect(result.output).toBe('answer from message_end');
      expect(result.tokenUsage?.total).toBe(110);
    });

    it('preserves usage and cost on the message_end fallback path', async () => {
      mockPiRun([
        {
          type: 'message_end',
          message: assistantMessage('fallback', { usage: buildUsage(70, 7, 0.003) }),
        },
        { type: 'agent_end', messages: [] },
      ]);
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt');

      expect(result.output).toBe('fallback');
      expect(result.tokenUsage).toEqual({
        prompt: 70,
        completion: 7,
        total: 77,
        cached: 0,
        numRequests: 1,
      });
      expect(result.cost).toBeCloseTo(0.003);
    });
  });

  describe('binary resolution', () => {
    it('returns install guidance when pi is not found', async () => {
      const child = new FakeChildProcess();
      mockSpawn.mockImplementationOnce(() => {
        setImmediate(() => {
          const error: NodeJS.ErrnoException = new Error('spawn pi ENOENT');
          error.code = 'ENOENT';
          child.emit('error', error);
        });
        return child as never;
      });
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('@earendil-works/pi-coding-agent');
      expect(result.error).toContain('npm install');
    });

    it('rejects relative executable paths instead of resolving them through configuration', async () => {
      const provider = new PiProvider({ config: { pi_path: './fixture-pi' } });
      const result = await provider.callApi('hello');
      expect(result.error).toContain('pi_path must be an absolute path');
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('does not discover executables from the configuration base path', async () => {
      const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-config-resolution-'));
      const previousBasePath = cliState.basePath;
      const cwd = vi.spyOn(process, 'cwd').mockReturnValue(path.join(fixture, 'project'));
      try {
        const packageDir = path.join(
          fixture,
          'config',
          'node_modules',
          '@earendil-works',
          'pi-coding-agent',
        );
        fs.mkdirSync(packageDir, { recursive: true });
        fs.writeFileSync(
          path.join(packageDir, 'package.json'),
          JSON.stringify({ bin: { pi: 'fixture.mjs' } }),
        );
        fs.writeFileSync(path.join(packageDir, 'fixture.mjs'), 'export {};');
        cliState.basePath = path.join(fixture, 'config');
        mockPiRun(defaultEvents());
        await new PiProvider().callApi('hello');
        expect(mockSpawn.mock.calls[0][0]).toBe('pi');
      } finally {
        cwd.mockRestore();
        cliState.basePath = previousBasePath;
        fs.rmSync(fixture, { recursive: true, force: true });
      }
    });

    it('uses pi_path when configured', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({ config: { pi_path: '/custom/bin/pi' } });

      await provider.callApi('test prompt');

      expect(mockSpawn.mock.calls[0][0]).toBe('/custom/bin/pi');
    });

    it('runs .js pi_path entries with the current node executable', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({ config: { pi_path: '/custom/pi/dist/cli.js' } });

      await provider.callApi('test prompt');

      expect(mockSpawn.mock.calls[0][0]).toBe(process.execPath);
      expect(spawnedArgs()[0]).toBe('/custom/pi/dist/cli.js');
    });

    it('finds a project-local pi package bin script', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-resolve-'));
      try {
        const packageDir = path.join(root, 'node_modules', '@earendil-works', 'pi-coding-agent');
        fs.mkdirSync(path.join(packageDir, 'dist'), { recursive: true });
        fs.writeFileSync(
          path.join(packageDir, 'package.json'),
          JSON.stringify({ name: '@earendil-works/pi-coding-agent', bin: { pi: 'dist/cli.js' } }),
        );
        fs.writeFileSync(path.join(packageDir, 'dist', 'cli.js'), '');

        const nested = path.join(root, 'examples', 'demo');
        fs.mkdirSync(nested, { recursive: true });

        expect(findPiCliScript([nested])).toBe(path.join(packageDir, 'dist', 'cli.js'));
        expect(findPiCliScript(['/nonexistent/path'])).toBeUndefined();
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });

  describe('working_dir validation', () => {
    it('rejects unsupported automatic workspace copying', async () => {
      const provider = new PiProvider({
        config: {
          working_dir: os.tmpdir(),
          ...({ copy_working_dir: true } as Record<string, unknown>),
        },
      });
      await expect(provider.callApi('hello')).rejects.toThrow('does not support copy_working_dir');
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('rejects a missing working directory', async () => {
      const provider = new PiProvider({ config: { working_dir: '/does/not/exist-pi-test' } });

      await expect(provider.callApi('test prompt')).rejects.toThrow(/does not exist/);
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  describe('timeouts and aborts', () => {
    it('awaits a running process during registry shutdown and can be reused', async () => {
      vi.useFakeTimers();
      const registered = vi.spyOn(providerRegistry, 'register');
      const unregistered = vi.spyOn(providerRegistry, 'unregister');
      try {
        const child = new FakeChildProcess();
        child.kill.mockImplementation((signal) => {
          if (signal === 'SIGKILL') {
            child.emit('close', null, signal);
          }
          return true;
        });
        mockSpawn.mockReturnValueOnce(child as never);
        const provider = new PiProvider();
        const pending = provider.callApi('hello');
        await vi.advanceTimersByTimeAsync(0);
        expect(registered).toHaveBeenCalledWith(provider);
        let finished = false;
        const shutdown = providerRegistry.shutdownAll().then(() => {
          finished = true;
        });
        await vi.advanceTimersByTimeAsync(4_999);
        expect(finished).toBe(false);
        expect(child.kill).toHaveBeenCalledWith('SIGTERM');
        await vi.advanceTimersByTimeAsync(1);
        await shutdown;
        expect((await pending).error).toBe('Pi call aborted');
        expect(unregistered).toHaveBeenCalledWith(provider);
        expect(vi.getTimerCount()).toBe(0);
        mockPiRun(defaultEvents('next run'));
        const next = provider.callApi('hello again');
        await vi.advanceTimersByTimeAsync(0);
        expect((await next).output).toBe('next run');
      } finally {
        vi.clearAllTimers();
        vi.useRealTimers();
        registered.mockRestore();
        unregistered.mockRestore();
      }
    });

    it('cleans the POSIX group on normal close without leaving delayed signals', async () => {
      vi.useFakeTimers();
      const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
      const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);
      try {
        const child = mockPiRun(defaultEvents('done'));
        (child as { pid?: number }).pid = 4242;
        const pending = new PiProvider().callApi('hello');
        await vi.advanceTimersByTimeAsync(0);
        expect((await pending).output).toBe('done');
        expect(killSpy).toHaveBeenCalledWith(-4242, 'SIGKILL');
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.clearAllTimers();
        vi.useRealTimers();
        killSpy.mockRestore();
        platform.mockRestore();
      }
    });

    it('returns a timeout error, escalating SIGTERM to SIGKILL for a stuck process', async () => {
      vi.useFakeTimers();
      try {
        const child = new FakeChildProcess();
        child.kill.mockImplementation((signal: NodeJS.Signals) => {
          if (signal === 'SIGKILL') {
            child.signalCode = 'SIGKILL';
            child.emit('exit', null);
            child.emit('close', null);
          }
          // SIGTERM is ignored by the stuck process.
          return true;
        });
        mockSpawn.mockImplementationOnce(() => child as never);
        const provider = new PiProvider({ config: { timeout: 20 } });

        const promise = provider.callApi('test prompt');
        await vi.advanceTimersByTimeAsync(20);
        expect(child.kill).toHaveBeenCalledWith('SIGTERM');
        await vi.advanceTimersByTimeAsync(5_000);
        expect(child.kill).toHaveBeenCalledWith('SIGKILL');

        const result = await promise;
        expect(result.error).toContain('timed out after 20ms');
      } finally {
        vi.useRealTimers();
      }
    });

    it('still force-kills the group when pi exits from SIGTERM but a child survives', async () => {
      // pi can exit cleanly on SIGTERM while a tool grandchild keeps running.
      // The SIGKILL escalation must fire regardless of pi's own exit state.
      vi.useFakeTimers();
      try {
        const child = new FakeChildProcess();
        child.kill.mockImplementation((signal: NodeJS.Signals) => {
          if (signal === 'SIGTERM') {
            // pi exits, but 'close' never fires (a grandchild holds stdout).
            child.exitCode = 0;
            child.emit('exit', 0);
          }
          return true;
        });
        mockSpawn.mockImplementationOnce(() => child as never);
        const provider = new PiProvider({ config: { timeout: 20 } });

        const promise = provider.callApi('test prompt');
        await vi.advanceTimersByTimeAsync(20); // timeout -> SIGTERM -> pi exits
        expect(child.kill).toHaveBeenCalledWith('SIGTERM');
        await vi.advanceTimersByTimeAsync(5_000); // grace -> escalation
        // Escalation is no longer gated on pi's liveness, so SIGKILL still fires.
        expect(child.kill).toHaveBeenCalledWith('SIGKILL');

        await vi.advanceTimersByTimeAsync(1_000); // exit flush grace -> settle
        const result = await promise;
        expect(result.error).toContain('timed out after 20ms');
      } finally {
        vi.useRealTimers();
      }
    });

    it('settles after the stdio flush grace when close never fires', async () => {
      // A descendant process inheriting stdout can hold the 'close' event open
      // indefinitely; the run must settle from 'exit' instead of hanging.
      vi.useFakeTimers();
      try {
        const child = new FakeChildProcess();
        mockSpawn.mockImplementationOnce(() => {
          process.nextTick(() => {
            child.stdout.emit(
              'data',
              `${JSON.stringify({
                type: 'agent_end',
                messages: [assistantMessage('flushed before exit')],
                willRetry: false,
              })}\n${JSON.stringify({ type: 'agent_settled' })}\n`,
            );
            child.exitCode = 0;
            child.emit('exit', 0);
            // 'close' never fires.
          });
          return child as never;
        });
        const provider = new PiProvider();

        const promise = provider.callApi('test prompt');
        await vi.advanceTimersByTimeAsync(1_000);

        const result = await promise;
        expect(result.output).toBe('flushed before exit');
      } finally {
        vi.useRealTimers();
      }
    });

    it('kills the process group on the exit fallback so a descendant is not orphaned', async () => {
      const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
      vi.useFakeTimers();
      const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);
      try {
        const child = new FakeChildProcess();
        (child as { pid?: number }).pid = 5151;
        mockSpawn.mockImplementationOnce(() => {
          process.nextTick(() => {
            child.stdout.emit(
              'data',
              `${JSON.stringify({
                type: 'agent_end',
                messages: [assistantMessage('done, child still running')],
                willRetry: false,
              })}\n${JSON.stringify({ type: 'agent_settled' })}\n`,
            );
            child.exitCode = 0;
            child.emit('exit', 0);
            // 'close' never fires: a backgrounded grandchild holds the pipes.
          });
          return child as never;
        });
        const provider = new PiProvider();

        const promise = provider.callApi('test prompt');
        await vi.advanceTimersByTimeAsync(1_000);
        const result = await promise;

        expect(result.output).toBe('done, child still running');
        if (process.platform !== 'win32') {
          // The lingering group is force-killed before we settle.
          expect(killSpy).toHaveBeenCalledWith(-5151, 'SIGKILL');
        }
      } finally {
        platform.mockRestore();
        killSpy.mockRestore();
        vi.useRealTimers();
      }
    });

    it('short-circuits when the abort signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt', undefined, {
        abortSignal: controller.signal,
      });

      expect(result.error).toBe('Pi call aborted before it started');
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('honors cancellation after a previous successful call', async () => {
      mockPiRun(defaultEvents('previous answer'));
      const provider = new PiProvider();

      await provider.callApi('abort me');

      const controller = new AbortController();
      controller.abort();
      const result = await provider.callApi('abort me', undefined, {
        abortSignal: controller.signal,
      });

      expect(result.error).toBe('Pi call aborted before it started');
      expect(result.cached).toBeUndefined();
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it('kills the process when aborted mid-run', async () => {
      const controller = new AbortController();
      const child = new FakeChildProcess();
      child.kill.mockImplementation(() => {
        child.signalCode = 'SIGTERM';
        child.emit('close', null);
        return true;
      });
      mockSpawn.mockImplementationOnce(() => {
        setImmediate(() => controller.abort());
        return child as never;
      });
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt', undefined, {
        abortSignal: controller.signal,
      });

      expect(result.error).toBe('Pi call aborted');
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('waits for Windows process-tree cleanup before returning an aborted call', async () => {
      const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
      vi.stubEnv('SystemRoot', 'C:\\Windows');
      try {
        const controller = new AbortController();
        const child = new FakeChildProcess();
        (child as { pid?: number }).pid = 4242;
        mockSpawn.mockReturnValueOnce(child as never);
        let completeCleanup!: (error: Error | null) => void;
        mockExecFile.mockImplementation((_file: any, _args: any, _options: any, callback: any) => {
          completeCleanup = callback;
          return {} as never;
        });
        let returned = false;
        const pending = new PiProvider()
          .callApi('hello', undefined, { abortSignal: controller.signal })
          .then((result) => {
            returned = true;
            return result;
          });
        await vi.waitFor(() => expect(child.stdin.write).toHaveBeenCalled());
        controller.abort();
        await vi.waitFor(() => expect(mockExecFile).toHaveBeenCalled());
        expect(mockExecFile.mock.calls[0].slice(0, 3)).toEqual([
          'C:\\Windows\\System32\\taskkill.exe',
          ['/PID', '4242', '/T', '/F'],
          { windowsHide: true, timeout: 5000 },
        ]);
        child.emit('close', null, 'SIGTERM');
        await Promise.resolve();
        expect(returned).toBe(false);
        completeCleanup(null);
        expect((await pending).error).toBe('Pi call aborted');
        expect(child.kill).not.toHaveBeenCalled();
      } finally {
        platform.mockRestore();
        vi.unstubAllEnvs();
      }
    });

    it('reports Windows tree-cleanup failures and still signals the direct child', async () => {
      const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
      vi.stubEnv('SystemRoot', 'C:\\Windows');
      try {
        const child = new FakeChildProcess();
        (child as { pid?: number }).pid = 4242;
        mockSpawn.mockReturnValueOnce(child as never);
        mockExecFile.mockImplementation((_file: any, _args: any, _options: any, callback: any) => {
          callback(new Error('cleanup fixture failed'));
          return {} as never;
        });
        const pending = new PiProvider({ config: { timeout: 20 } }).callApi('hello');
        const result = await pending;
        expect(result.error).toContain('cleanup fixture failed');
        expect(child.kill).toHaveBeenCalled();
      } finally {
        platform.mockRestore();
        vi.unstubAllEnvs();
      }
    });

    it('reports the terminating signal when pi exits with a null code', async () => {
      const child = new FakeChildProcess();
      mockSpawn.mockImplementationOnce(() => {
        setImmediate(() => {
          child.stderr.emit('data', 'segfault');
          child.exitCode = null;
          child.emit('close', null, 'SIGKILL');
        });
        return child as never;
      });
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('terminated by signal SIGKILL');
      expect(result.error).toContain('segfault');
    });

    it('spawns pi in its own process group on POSIX', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider();

      await provider.callApi('test prompt');

      expect(spawnedOptions().detached).toBe(process.platform !== 'win32');
    });

    it('signals the child and its POSIX process group when killing', async () => {
      vi.useFakeTimers();
      const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
      const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);
      try {
        const controller = new AbortController();
        const child = new FakeChildProcess();
        (child as { pid?: number }).pid = 4242;
        child.kill.mockImplementation(() => {
          child.emit('close', null, 'SIGTERM');
          return true;
        });
        mockSpawn.mockImplementationOnce(() => {
          setImmediate(() => controller.abort());
          return child as never;
        });
        const provider = new PiProvider();

        const pending = provider.callApi('test prompt', undefined, {
          abortSignal: controller.signal,
        });
        await vi.runAllTimersAsync();
        const result = await pending;

        expect(result.error).toBe('Pi call aborted');
        expect(child.kill).toHaveBeenCalledWith('SIGTERM');
        expect(killSpy).toHaveBeenCalledWith(-4242, 'SIGTERM');
        expect(killSpy).toHaveBeenCalledWith(-4242, 'SIGKILL');
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.clearAllTimers();
        vi.useRealTimers();
        platform.mockRestore();
        killSpy.mockRestore();
      }
    });

    it('aborts the run when stdout exceeds max_output_bytes', async () => {
      const child = new FakeChildProcess();
      child.kill.mockImplementation(() => {
        child.emit('close', null, 'SIGTERM');
        return true;
      });
      mockSpawn.mockImplementationOnce(() => {
        setImmediate(() => {
          child.stdout.emit('data', 'x'.repeat(1024));
        });
        return child as never;
      });
      const provider = new PiProvider({ config: { max_output_bytes: 100 } });

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('more than 100 bytes');
      expect(result.output).toBeUndefined();
      expect(child.kill).toHaveBeenCalled();
    });
  });

  it('runs identical calls again so changing runtime inputs cannot reuse stale output', async () => {
    mockPiRun(defaultEvents('first'));
    mockPiRun(defaultEvents('second'));
    const provider = new PiProvider();

    expect((await provider.callApi('same prompt')).output).toBe('first');
    const second = await provider.callApi('same prompt');
    expect(second.output).toBe('second');
    expect(second.cached).toBeFalsy();
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  describe('tracing', () => {
    let spanSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      spanSpy = vi.spyOn(genaiTracer, 'withGenAISpan');
    });

    afterEach(() => {
      spanSpy.mockRestore();
    });

    it('wraps the run in a GenAI span with the resolved system, model, and traceparent', async () => {
      mockPiRun(defaultEvents('traced answer'));
      const provider = new PiProvider({ config: { model: 'openai/gpt-4o-mini' } });
      const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';

      const result = await provider.callApi('test prompt', {
        prompt: { raw: 'test prompt', label: 'pi-label' },
        vars: {},
        traceparent,
      });

      expect(result.output).toBe('traced answer');
      expect(spanSpy).toHaveBeenCalledTimes(1);
      expect(spanSpy.mock.calls[0][0]).toMatchObject({
        system: 'openai',
        operationName: 'chat',
        model: 'openai/gpt-4o-mini',
        providerId: 'pi',
        traceparent,
        promptLabel: 'pi-label',
      });
    });

    it('traces each repeated call', async () => {
      mockPiRun(defaultEvents('once'));
      mockPiRun(defaultEvents('twice'));
      const provider = new PiProvider();

      await provider.callApi('same prompt');
      await provider.callApi('same prompt');

      expect(spanSpy).toHaveBeenCalledTimes(2);
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });

    it('uses the pi system label for a bare default-model run', async () => {
      mockPiRun(defaultEvents());
      await new PiProvider().callApi('test prompt');
      expect(spanSpy.mock.calls[0][0]).toMatchObject({ system: 'pi', model: 'default' });
    });
  });

  describe('redactArgsForLog', () => {
    it('redacts the value after a credential-bearing flag (space form)', () => {
      expect(
        redactArgsForLog(['--mode', 'json', '--api-key', 'sk-secret', '--thinking', 'high']),
      ).toEqual(['--mode', 'json', '--api-key', '[redacted]', '--thinking', 'high']);
    });

    it('redacts the value in --flag=value form', () => {
      expect(redactArgsForLog(['--auth-token=tok-123', '--model', 'openai/gpt-4o-mini'])).toEqual([
        '--auth-token=[redacted]',
        '--model',
        'openai/gpt-4o-mini',
      ]);
    });

    it('leaves non-secret flags and their values intact', () => {
      const args = ['--mode', 'json', '--no-approve', '--model', 'anthropic/claude-sonnet-4-5'];
      expect(redactArgsForLog(args)).toEqual(args);
    });
  });
});
