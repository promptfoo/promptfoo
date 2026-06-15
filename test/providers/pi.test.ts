import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, disableCache, enableCache } from '../../src/cache';
import { findPiCliScript, PI_READONLY_TOOLS, PiProvider } from '../../src/providers/pi';

vi.mock('../../src/cliState', () => ({
  default: { basePath: '/test/basePath' },
  basePath: '/test/basePath',
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

const { spawn } = await import('child_process');
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

function buildUsage(input: number, output: number, costTotal: number, cacheRead = 0) {
  return {
    input,
    output,
    cacheRead,
    cacheWrite: 0,
    totalTokens: input + output,
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
      const stdout = events.map((event) => JSON.stringify(event)).join('\n');
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
  beforeEach(() => {
    vi.resetAllMocks();
    disableCache();
  });

  afterEach(async () => {
    await clearCache();
    enableCache();
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
    it('runs in JSON mode with hermetic defaults and no tools', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      const args = spawnedArgs();
      expect(args).toEqual([
        '--mode',
        'json',
        '--no-session',
        '--offline',
        '--no-tools',
        '--no-extensions',
        '--no-skills',
        '--no-prompt-templates',
        '--no-context-files',
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
    });

    it('appends extra_args verbatim', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({ config: { extra_args: ['--approve'] } });

      await provider.callApi('test prompt');

      expect(spawnedArgs()).toContain('--approve');
    });

    it('merges prompt-level config over provider config', async () => {
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

    it('deep-merges prompt-level env with provider-level env', async () => {
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
      expect(env.OVERRIDE_ME).toBe('prompt');
    });
  });

  describe('prompt delivery', () => {
    it('writes the prompt to stdin and closes it', async () => {
      const child = mockPiRun(defaultEvents());
      const provider = new PiProvider();

      await provider.callApi('the prompt text');

      expect(child.stdin.write).toHaveBeenCalledWith('the prompt text');
      expect(child.stdin.end).toHaveBeenCalled();
    });
  });

  describe('environment', () => {
    it('sets PI_CODING_AGENT_DIR from agent_dir', async () => {
      mockPiRun(defaultEvents());
      const provider = new PiProvider({ config: { agent_dir: '/tmp/pi-agent-dir' } });

      await provider.callApi('test prompt');

      expect(spawnedOptions().env.PI_CODING_AGENT_DIR).toBe('/tmp/pi-agent-dir');
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
        prompt: 300,
        completion: 30,
        total: 330,
        cached: 15,
        numRequests: 2,
      });
      expect(result.cost).toBeCloseTo(0.003);
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

    it('falls back to message_end events when agent_end is missing', async () => {
      mockPiRun([
        { type: 'message_end', message: assistantMessage('partial result') },
        { type: 'turn_end' },
      ]);
      const provider = new PiProvider();

      const result = await provider.callApi('test prompt');

      expect(result.output).toBe('partial result');
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
              })}\n`,
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

      expect(result.error).toContain('Pi agent produced no assistant response');
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
      enableCache();
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
        { type: 'turn_end' },
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
    it('rejects a missing working directory', async () => {
      const provider = new PiProvider({ config: { working_dir: '/does/not/exist-pi-test' } });

      await expect(provider.callApi('test prompt')).rejects.toThrow(/does not exist/);
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  describe('timeouts and aborts', () => {
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
              })}\n`,
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

    it.skipIf(process.platform === 'win32')(
      'signals the whole process group when killing on POSIX',
      async () => {
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

          const result = await provider.callApi('test prompt', undefined, {
            abortSignal: controller.signal,
          });

          expect(result.error).toBe('Pi call aborted');
          // Negative pid signals pi AND its tool grandchildren (e.g. bash).
          expect(killSpy).toHaveBeenCalledWith(-4242, 'SIGTERM');
        } finally {
          killSpy.mockRestore();
        }
      },
    );

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

  describe('caching', () => {
    it('serves the second identical call from cache', async () => {
      enableCache();
      mockPiRun(defaultEvents('cached answer'));
      const provider = new PiProvider();

      const first = await provider.callApi('cache me');
      const second = await provider.callApi('cache me');

      expect(first.output).toBe('cached answer');
      expect(second.output).toBe('cached answer');
      expect(second.cached).toBe(true);
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it('does not cache error responses', async () => {
      enableCache();
      mockPiRun([
        {
          type: 'agent_end',
          messages: [assistantMessage('', { stopReason: 'error', errorMessage: 'rate limited' })],
          willRetry: false,
        },
      ]);
      mockPiRun(defaultEvents('recovered'));
      const provider = new PiProvider();

      const first = await provider.callApi('retry me');
      const second = await provider.callApi('retry me');

      expect(first.error).toBe('rate limited');
      expect(second.output).toBe('recovered');
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });

    it('spawns again when caching is disabled', async () => {
      mockPiRun(defaultEvents());
      mockPiRun(defaultEvents());
      const provider = new PiProvider();

      await provider.callApi('no cache');
      await provider.callApi('no cache');

      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });

    it('excludes the apiKey from the cache key', async () => {
      enableCache();
      mockPiRun(defaultEvents('shared answer'));
      const first = new PiProvider({ config: { provider_id: 'anthropic', apiKey: 'key-one' } });
      const second = new PiProvider({ config: { provider_id: 'anthropic', apiKey: 'key-two' } });

      await first.callApi('same prompt');
      const result = await second.callApi('same prompt');

      // Different credentials must map to the same cache entry: the key
      // never incorporates the secret.
      expect(result.cached).toBe(true);
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it('excludes the credential env var from the cache key even when set via config.env', async () => {
      enableCache();
      mockPiRun(defaultEvents('shared answer'));
      const first = new PiProvider({
        config: { model: 'openai/gpt-4o-mini', env: { OPENAI_API_KEY: 'k1' } },
      });
      const second = new PiProvider({
        config: { model: 'openai/gpt-4o-mini', env: { OPENAI_API_KEY: 'k2' } },
      });

      await first.callApi('same prompt');
      const result = await second.callApi('same prompt');

      expect(result.cached).toBe(true);
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it('busts the cache when a non-secret env value changes', async () => {
      enableCache();
      mockPiRun(defaultEvents('answer-a'));
      mockPiRun(defaultEvents('answer-b'));
      const first = new PiProvider({ config: { env: { OPENAI_BASE_URL: 'http://proxy-a' } } });
      const second = new PiProvider({ config: { env: { OPENAI_BASE_URL: 'http://proxy-b' } } });

      const a = await first.callApi('same prompt');
      const b = await second.callApi('same prompt');

      // Different backends must not collide on one cache entry.
      expect(a.output).toBe('answer-a');
      expect(b.output).toBe('answer-b');
      expect(b.cached).toBeFalsy();
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });

    it('busts the cache when agent_dir config files change', async () => {
      enableCache();
      const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-agent-'));
      try {
        fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify({ model: 'one' }));
        mockPiRun(defaultEvents('first'));
        mockPiRun(defaultEvents('second'));
        const provider = new PiProvider({ config: { agent_dir: agentDir } });

        const first = await provider.callApi('same prompt');
        fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify({ model: 'two' }));
        const second = await provider.callApi('same prompt');

        expect(first.output).toBe('first');
        expect(second.output).toBe('second');
        expect(second.cached).toBeFalsy();
        expect(mockSpawn).toHaveBeenCalledTimes(2);
      } finally {
        fs.rmSync(agentDir, { recursive: true, force: true });
      }
    });

    it('keeps distinct prompts and models on separate cache entries', async () => {
      enableCache();
      mockPiRun(defaultEvents('a'));
      mockPiRun(defaultEvents('b'));
      mockPiRun(defaultEvents('c'));
      const openai = new PiProvider({ config: { model: 'openai/gpt-4o-mini' } });
      const anthropic = new PiProvider({ config: { model: 'anthropic/claude-sonnet-4-5' } });

      await openai.callApi('prompt one');
      await openai.callApi('prompt two'); // different prompt
      await anthropic.callApi('prompt one'); // different model

      // No over-collapse: each distinct (prompt, model) spawned its own run.
      expect(mockSpawn).toHaveBeenCalledTimes(3);
    });
  });
});
