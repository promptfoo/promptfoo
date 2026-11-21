import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { getProjectPathCheck, resolveAgentExecutable } from '../../src/providers/agentExecutable';
import { PiProvider } from '../../src/providers/pi';
import { providerRegistry } from '../../src/providers/providerRegistry';
import * as genaiTracer from '../../src/tracing/genaiTracer';

vi.mock('../../src/providers/agentExecutable', async (original) => ({
  ...(await original<typeof import('../../src/providers/agentExecutable')>()),
  getProjectPathCheck: vi.fn(),
  resolveAgentExecutable: vi.fn(),
}));

// Keep the real genaiTracer implementation (spans no-op without an OTEL SDK),
// but allow spying on withGenAISpan to assert the provider's tracing wiring.
vi.mock('../../src/tracing/genaiTracer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/tracing/genaiTracer')>()),
}));

vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  spawn: vi.fn(),
}));

const { spawn } = await import('child_process');
const mockSpawn = vi.mocked(spawn);

class FakeChildProcess extends EventEmitter {
  stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn(), destroy: vi.fn() });
  stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn(), destroy: vi.fn() });
  stdin = Object.assign(new EventEmitter(), {
    write: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(),
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

const fixturePiPath = path.resolve('/fixture/pi');

function createProvider(options: ConstructorParameters<typeof PiProvider>[0] = {}) {
  return new PiProvider({
    ...options,
    config: { pi_path: fixturePiPath, ...options.config },
  });
}

describe('PiProvider', () => {
  let previousBasePath: string | undefined;
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    previousBasePath = cliState.basePath;
    cliState.basePath = process.cwd();
    vi.mocked(getProjectPathCheck).mockResolvedValue(() => false);
    vi.mocked(resolveAgentExecutable).mockResolvedValue(fixturePiPath);
  });
  afterEach(() => {
    cliState.basePath = previousBasePath;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
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
      const provider = createProvider();

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
      const provider = createProvider({
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

    it('keeps all tools disabled even when working_dir is set', async () => {
      const workingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-test-'));
      try {
        mockPiRun(defaultEvents());
        const provider = createProvider({ config: { working_dir: workingDir } });

        await provider.callApi('test prompt');

        const args = spawnedArgs();
        expect(args).not.toContain('--tools');
        expect(args).toContain('--no-tools');
        expect(args).toContain('--no-approve');
        expect(spawnedOptions().cwd).toBe(workingDir);
      } finally {
        fs.rmSync(workingDir, { recursive: true, force: true });
      }
    });

    it('respects an explicit tool allowlist', async () => {
      mockPiRun(defaultEvents());
      const provider = createProvider({
        config: { tools: ['read', 'bash'], allow_unsafe_tools: true, working_dir: process.cwd() },
      });

      await provider.callApi('test prompt');

      const args = spawnedArgs();
      expect(args[args.indexOf('--tools') + 1]).toBe('read,bash');
    });

    it('treats an empty tool allowlist as no tools', async () => {
      mockPiRun(defaultEvents());
      const provider = createProvider({ config: { tools: [] } });

      await provider.callApi('test prompt');

      expect(spawnedArgs()).toContain('--no-tools');
    });

    it('gives no_tools precedence over a tool allowlist', async () => {
      mockPiRun(defaultEvents());
      const provider = createProvider({ config: { no_tools: true, tools: ['bash'] } });

      await provider.callApi('test prompt');

      const args = spawnedArgs();
      expect(args).toContain('--no-tools');
      expect(args).not.toContain('--tools');
    });

    it('passes system prompt flags', async () => {
      mockPiRun(defaultEvents());
      const provider = createProvider({
        config: { system_prompt: 'You are terse.', append_system_prompt: 'Answer in French.' },
      });

      await provider.callApi('test prompt');

      const args = spawnedArgs();
      expect(args[args.indexOf('--system-prompt') + 1]).toBe('You are terse.');
      expect(args[args.indexOf('--append-system-prompt') + 1]).toBe('Answer in French.');
    });

    it.each([
      { tools: ['read'], working_dir: '.' },
      { tools: ['bash'], allow_unsafe_tools: true },
      { tools: ['read,bash'], allow_unsafe_tools: true, working_dir: '.' },
      { trust_project_files: true },
      { load_extensions: true },
      { extra_args: ['--approve'] },
      { apiKey: 'inline' },
      { env: { PATH: '.' } },
      { copy_working_dir: true },
      { pi_path: './agent' },
      { model: '--approve' },
    ])('rejects unsafe configuration before invoking Pi', (config) => {
      expect(() => createProvider({ config })).toThrow();
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it.each([
      { model: 'anthropic/other' },
      { model: '--approve' },
      { thinking: 'invalid' },
      { pi_path: '/untrusted' },
      { tools: ['read'] },
      { working_dir: '/' },
      { env: { OPENAI_API_KEY: 'row-secret' } },
      { allow_unsafe_tools: true },
      { extra_args: ['--approve'] },
    ])('rejects execution and vendor overrides from test rows', async (config) => {
      const provider = createProvider({ config: { model: 'openai/fixture' } });
      const result = await provider.callApi('hello', {
        vars: {},
        prompt: { label: 'test', raw: 'hello', config },
      });
      expect(result.error).toContain('Invalid Pi config');
      expect(result.error).not.toContain('row-secret');
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('keeps the explicit provider_id even when a row names another vendor', async () => {
      const provider = createProvider({ config: { provider_id: 'openai' } });
      const result = await provider.callApi('hello', {
        vars: {},
        prompt: { label: 'test', raw: 'hello', config: { model: 'anthropic/other' } },
      });
      expect(result.error).toContain('configured vendor');
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('accepts same-vendor model and thinking overrides', async () => {
      mockPiRun(defaultEvents());
      const provider = createProvider({ config: { model: 'openai/fixture' } });
      const config = { model: 'openai/other', thinking: 'high', prefix: '', suffix: '' };
      const result = await provider.callApi('hello', {
        vars: {},
        prompt: { label: 'test', raw: 'hello', config },
      });
      expect(result.error).toBeUndefined();
      expect(spawnedArgs()).toEqual(expect.arrayContaining(['openai/other', 'high']));
    });
  });

  describe('prompt delivery', () => {
    it.each(['the prompt text', '  padded\n', '\t \n'])(
      'preserves the RPC prompt %j',
      async (prompt) => {
        const child = mockPiRun(defaultEvents());
        const provider = createProvider();

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
    const result = await createProvider().callApi('hello');
    expect(result.error).toBe('No model configured');
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
  });

  it('finishes when an extension handles the prompt without starting an agent run', async () => {
    const child = mockPiRun([
      { type: 'response', command: 'prompt', success: true, data: { disposition: 'handled' } },
    ]);
    const result = await createProvider().callApi('/fixture');
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
    expect(result.error).toContain('before completing the run');
  });

  it('keeps input open until a complete final event arrives', async () => {
    const child = new FakeChildProcess();
    mockSpawn.mockReturnValueOnce(child as never);
    const pending = createProvider().callApi('hello');
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
    it('isolates the selected vendor from the host login, loader and other credentials', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'example-openai');
      vi.stubEnv('ANTHROPIC_API_KEY', 'other-key');
      vi.stubEnv('PI_CODING_AGENT_DIR', '/shared/profile');
      vi.stubEnv('NODE_OPTIONS', '--inspect');
      mockPiRun(defaultEvents('key=example-openai'));
      const response = await createProvider({ config: { model: 'openai/fixture' } }).callApi(
        'hello',
      );
      const { env } = spawnedOptions();
      expect(env.OPENAI_API_KEY).toBe('example-openai');
      expect(env.ANTHROPIC_API_KEY).toBeUndefined();
      expect(env.NODE_OPTIONS).toBeUndefined();
      expect(env.HOME).not.toBe(os.homedir());
      expect(env.PI_CODING_AGENT_DIR).toBe(path.join(env.HOME, 'agent'));
      expect(fs.existsSync(env.HOME)).toBe(false);
      expect(spawnedArgs()).not.toContain('example-openai');
      expect(response.output).toBe('key=[REDACTED]');
      expect(response.raw).toBeUndefined();
    });

    it('rejects a profile from the project before launching Pi', async () => {
      const actual = await vi.importActual<typeof import('../../src/providers/agentExecutable')>(
        '../../src/providers/agentExecutable',
      );
      vi.mocked(getProjectPathCheck).mockImplementationOnce(actual.getProjectPathCheck);
      const provider = createProvider({ config: { agent_dir: process.cwd() } });
      expect((await provider.callApi('hello')).error).toContain('outside the project');
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('an explicit profile does not receive ambient provider or OAuth tokens', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'example-key');
      vi.stubEnv('ANTHROPIC_OAUTH_TOKEN', 'oauth');
      const agent_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-profile-'));
      try {
        mockPiRun(defaultEvents());
        await createProvider({ config: { model: 'anthropic/fixture', agent_dir } }).callApi(
          'hello',
        );
        const { env } = spawnedOptions();
        expect(env.PI_CODING_AGENT_DIR).toBe(fs.realpathSync(agent_dir));
        expect(env.ANTHROPIC_API_KEY).toBeUndefined();
        expect(env.ANTHROPIC_OAUTH_TOKEN).toBeUndefined();
      } finally {
        fs.rmSync(agent_dir, { force: true, recursive: true });
      }
    });

    it('honors invocation-local masks on a reused provider', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'host-key');
      const provider = createProvider({ config: { model: 'openai/fixture' } });
      const result = await cliState.withEnvFileOverrides({ OPENAI_API_KEY: '' }, () =>
        provider.callApi('hello'),
      );
      expect(result.error).toContain('process environment');
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('rejects scoped API keys instead of falling back to the host key', () => {
      expect(() =>
        createProvider({ config: { model: 'openai/fixture' }, env: { OPENAI_API_KEY: 'secret' } }),
      ).toThrow('process environment');
    });
  });

  describe('response parsing', () => {
    it('returns the final assistant message text with usage and cost', async () => {
      mockPiRun(defaultEvents('final answer'));
      const provider = createProvider();

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
      expect(result.raw).toBeUndefined();
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
      const provider = createProvider();

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
      const provider = createProvider();

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
      expect((await createProvider().callApi('hello')).finishReason).toBe(expected);
    });

    it('reports the concrete response model when Pi routes to another model', async () => {
      mockPiRun([
        {
          type: 'agent_end',
          messages: [{ ...assistantMessage('hello'), responseModel: 'resolved-model' }],
        },
      ]);
      expect((await createProvider().callApi('hello')).metadata?.model).toBe('resolved-model');
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
      const provider = createProvider();

      const result = await provider.callApi('test prompt');

      expect(result.metadata?.toolCalls).toEqual([
        { name: 'read' },
        { name: 'bash', is_error: true },
      ]);
    });

    it('rejects partial output when agent_settled is missing', async () => {
      mockPiRun([
        { type: 'message_end', message: assistantMessage('partial result') },
        { type: 'turn_end' },
      ]);
      const provider = createProvider();

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('before completing the run');
    });

    it('skips valid JSON that is not a protocol event', async () => {
      mockPiRun([null, false, 5, 'status', [], { type: 17 }, ...defaultEvents('complete')]);
      const response = await createProvider().callApi('hello');
      expect(response.error).toBeUndefined();
      expect(response.output).toBe('complete');
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
      const provider = createProvider();

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
      const provider = createProvider();

      const result = await provider.callApi('test prompt');

      expect(result.error).toBe('OpenAI API error (401): Incorrect API key');
      expect(result.output).toBeUndefined();
    });

    it('errors when no assistant message is produced', async () => {
      mockPiRun([{ type: 'agent_start' }], { stderr: 'something broke' });
      const provider = createProvider();

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('before completing the run');
      expect(result.error).not.toContain('something broke');
    });

    it('omits stderr when pi exits nonzero without events', async () => {
      mockPiRun([], { exitCode: 1, stderr: 'Unknown flag: --bogus' });
      const provider = createProvider();

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('Pi exited with code 1');
      expect(result.error).not.toContain('Unknown flag: --bogus');
    });

    it('treats a nonzero exit as an error even when events were emitted', async () => {
      // A mid-run crash leaves partial events behind; the truncated transcript
      // must not be reported (or cached) as a successful response.
      mockPiRun(defaultEvents('truncated mid-run'), { exitCode: 1, stderr: 'pi crashed' });
      mockPiRun(defaultEvents('recovered'));
      const provider = createProvider();

      const first = await provider.callApi('crash me');
      const second = await provider.callApi('crash me');

      expect(first.error).toContain('Pi exited with code 1');
      expect(first.error).not.toContain('pi crashed');
      expect(second.output).toBe('recovered');
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });

    it('decodes stdout as a stream so multi-byte UTF-8 spanning chunks survives', async () => {
      const child = mockPiRun(defaultEvents());
      const provider = createProvider();

      await provider.callApi('test prompt');

      expect(child.stdout.setEncoding).toHaveBeenCalledWith('utf-8');
    });

    it('reports stopReason aborted as an error', async () => {
      const message = assistantMessage('', { stopReason: 'aborted' });
      mockPiRun([{ type: 'agent_end', messages: [message], willRetry: false }]);
      const provider = createProvider();

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
      const provider = createProvider();

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
      expect(result.raw).toBeUndefined();
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
      const provider = createProvider();

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
      const provider = createProvider();

      const result = await provider.callApi('test prompt');

      expect(result.output).toBe('answer from message_end');
      expect(result.tokenUsage?.total).toBe(110);
    });

    it('retains completed messages from an interrupted retry', async () => {
      const previous = assistantMessage('previous attempt', { usage: buildUsage(10, 1, 0.001) });
      const current = [
        assistantMessage('first completed turn', { usage: buildUsage(70, 7, 0.002) }),
        assistantMessage('second completed turn', { usage: buildUsage(50, 5, 0.003) }),
      ];
      mockPiRun(
        [
          { type: 'message_end', message: previous },
          { type: 'agent_end', messages: [previous], willRetry: true },
          ...current.map((message) => ({ type: 'message_end', message })),
        ],
        { exitCode: 1 },
      );

      const result = await createProvider().callApi('test prompt');

      expect(result.error).toContain('exited with code 1');
      expect(result.output).toBeUndefined();
      expect(result.tokenUsage).toMatchObject({ prompt: 120, completion: 12, total: 132 });
      expect(result.cost).toBeCloseTo(0.005);
      expect(result.raw).toBeUndefined();
    });

    it('preserves usage and cost on the message_end fallback path', async () => {
      mockPiRun([
        {
          type: 'message_end',
          message: assistantMessage('fallback', { usage: buildUsage(70, 7, 0.003) }),
        },
        { type: 'agent_end', messages: [] },
      ]);
      const provider = createProvider();

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

  it('rejects a missing working directory', async () => {
    const response = await createProvider({
      config: { working_dir: '/does/not/exist-pi-test' },
    }).callApi('hello');
    expect(response.error).toContain('ENOENT');
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('rejects workspace executables, including absolute paths', async () => {
    const { getProjectPathCheck: check, resolveAgentExecutable: resolve } = await vi.importActual<
      typeof import('../../src/providers/agentExecutable')
    >('../../src/providers/agentExecutable');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-project-'));
    try {
      const pi_path = path.join(dir, 'pi');
      fs.writeFileSync(pi_path, '', { mode: 0o700 });
      vi.mocked(getProjectPathCheck).mockImplementationOnce(check);
      vi.mocked(resolveAgentExecutable).mockImplementationOnce(resolve);
      const result = await createProvider({ config: { pi_path, working_dir: dir } }).callApi(
        'hello',
      );
      expect(result.error).toContain('outside the project');
      expect(mockSpawn).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  describe('timeouts and aborts', () => {
    it.each(['timeout', 'abort', 'overflow', 'coalesced overflow', 'nonzero', 'incomplete'])(
      'retains completed usage when a later turn ends through %s',
      async (reason) => {
        vi.useFakeTimers();
        const controller = new AbortController();
        const child = new FakeChildProcess();
        child.kill.mockImplementation(() => {
          child.emit('close', null, 'SIGTERM');
          return true;
        });
        mockSpawn.mockImplementationOnce(() => child as never);
        const provider = createProvider({ config: { timeout: 20, max_output_bytes: 2_000 } });
        try {
          const pending = provider.callApi('hello', undefined, { abortSignal: controller.signal });
          await vi.advanceTimersByTimeAsync(0);
          const completed =
            JSON.stringify({ type: 'message_end', message: assistantMessage('billed turn') }) +
            '\n';
          child.stdout.emit(
            'data',
            completed + (reason === 'coalesced overflow' ? 'x'.repeat(2_001) : ''),
          );
          if (reason === 'timeout') {
            await vi.advanceTimersByTimeAsync(20);
          } else if (reason === 'abort') {
            controller.abort();
          } else if (reason === 'overflow') {
            child.stdout.emit('data', 'x'.repeat(2_001));
          } else if (reason !== 'coalesced overflow') {
            child.emit('close', reason === 'nonzero' ? 1 : 0);
          }
          const result = await pending;
          expect(result.error).toBeTruthy();
          expect(result.output).toBeUndefined();
          expect(result.tokenUsage).toMatchObject({
            prompt: 100,
            completion: 10,
            total: 110,
            numRequests: 1,
          });
          expect(result.cost).toBe(0.001);
          expect(result.raw).toBeUndefined();
        } finally {
          vi.useRealTimers();
        }
      },
    );

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
        const provider = createProvider();
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
        const pending = createProvider().callApi('hello');
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
        const provider = createProvider({ config: { timeout: 20 } });

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
        const provider = createProvider({ config: { timeout: 20 } });

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
        const provider = createProvider();

        const promise = provider.callApi('test prompt');
        await vi.advanceTimersByTimeAsync(1_000);

        const result = await promise;
        expect(result.output).toBe('flushed before exit');
        expect(child.stdin.destroy).toHaveBeenCalledOnce();
        expect(child.stdout.destroy).toHaveBeenCalledOnce();
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
        const provider = createProvider();

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
      const provider = createProvider();

      const result = await provider.callApi('test prompt', undefined, {
        abortSignal: controller.signal,
      });

      expect(result.error).toBe('Pi call aborted before it started');
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('honors cancellation after a previous successful call', async () => {
      mockPiRun(defaultEvents('previous answer'));
      const provider = createProvider();

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
      const provider = createProvider();

      const result = await provider.callApi('test prompt', undefined, {
        abortSignal: controller.signal,
      });

      expect(result.error).toBe('Pi call aborted');
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('rejects Windows before starting a process', async () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
      const result = await createProvider().callApi('hello');
      expect(result.error).toContain('supports Linux and macOS only');
      expect(mockSpawn).not.toHaveBeenCalled();
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
      const provider = createProvider();

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('terminated by signal SIGKILL');
      expect(result.error).not.toContain('segfault');
    });

    it('spawns pi in its own process group on POSIX', async () => {
      mockPiRun(defaultEvents());
      const provider = createProvider();

      await provider.callApi('test prompt');

      expect(spawnedOptions().detached).toBe(true);
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
        const provider = createProvider();

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
      const provider = createProvider({ config: { max_output_bytes: 100 } });

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('more than 100 bytes');
      expect(result.output).toBeUndefined();
      expect(child.kill).toHaveBeenCalled();
    });
  });

  it('runs identical calls again so changing runtime inputs cannot reuse stale output', async () => {
    mockPiRun(defaultEvents('first'));
    mockPiRun(defaultEvents('second'));
    const provider = createProvider();

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
      const provider = createProvider({ config: { model: 'openai/gpt-4o-mini' } });
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
      const provider = createProvider();

      await provider.callApi('same prompt');
      await provider.callApi('same prompt');

      expect(spanSpy).toHaveBeenCalledTimes(2);
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });

    it('uses the pi system label for a bare default-model run', async () => {
      mockPiRun(defaultEvents());
      await createProvider().callApi('test prompt');
      expect(spanSpy.mock.calls[0][0]).toMatchObject({ system: 'pi', model: 'default' });
    });
  });
});
