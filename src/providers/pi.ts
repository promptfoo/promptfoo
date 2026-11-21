import { spawn } from 'child_process';
import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';

import { z } from 'zod';
import cliState from '../cliState';
import logger from '../logger';
import {
  buildChatSpanContext,
  extractProviderResponseAttributes,
  withGenAISpan,
} from '../tracing/genaiTracer';
import { REDACTED } from '../util/sanitizer';
import { getProjectPathCheck, resolveAgentExecutable } from './agentExecutable';
import { resolveAgenticWorkingDir } from './agentic-utils';
import { hasAgentEnvOverride } from './env';
import { providerRegistry } from './providerRegistry';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/providers';

// Tool access is disabled unless the provider explicitly opts in.
const DEFAULT_TIMEOUT_MS = 600_000;
const KILL_GRACE_MS = 5_000;
// A descendant holding stdout can delay 'close' after Pi exits.
const STDIO_FLUSH_GRACE_MS = 1_000;
const DEFAULT_MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

// Forward only the key for the vendor chosen in the provider configuration.
const PI_PROVIDER_ENV_KEYS: Record<string, string> = {
  'ant-ling': 'ANT_LING_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  'azure-openai-responses': 'AZURE_OPENAI_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  'cloudflare-ai-gateway': 'CLOUDFLARE_API_KEY',
  'cloudflare-workers-ai': 'CLOUDFLARE_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
  google: 'GEMINI_API_KEY',
  'google-vertex': 'GOOGLE_CLOUD_API_KEY',
  groq: 'GROQ_API_KEY',
  huggingface: 'HF_TOKEN',
  'kimi-coding': 'KIMI_API_KEY',
  minimax: 'MINIMAX_API_KEY',
  'minimax-cn': 'MINIMAX_CN_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  moonshotai: 'MOONSHOT_API_KEY',
  'moonshotai-cn': 'MOONSHOT_API_KEY',
  nvidia: 'NVIDIA_API_KEY',
  openai: 'OPENAI_API_KEY',
  opencode: 'OPENCODE_API_KEY',
  'opencode-go': 'OPENCODE_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  together: 'TOGETHER_API_KEY',
  'vercel-ai-gateway': 'AI_GATEWAY_API_KEY',
  xai: 'XAI_API_KEY',
  xiaomi: 'XIAOMI_API_KEY',
  'xiaomi-token-plan-ams': 'XIAOMI_TOKEN_PLAN_AMS_API_KEY',
  'xiaomi-token-plan-cn': 'XIAOMI_TOKEN_PLAN_CN_API_KEY',
  'xiaomi-token-plan-sgp': 'XIAOMI_TOKEN_PLAN_SGP_API_KEY',
  zai: 'ZAI_API_KEY',
  'zai-coding-cn': 'ZAI_CODING_CN_API_KEY',
};

const turn = z.strictObject({
  model: z
    .string()
    .regex(/^[a-zA-Z0-9][\w./:-]*$/)
    .optional(),
  thinking: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']).optional(),
});
const tool = z.enum(['find', 'grep', 'ls', 'read', 'bash', 'edit', 'write']);
const configSchema = turn.extend({
  basePath: z.string().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  linkedTargetId: z.string().optional(),
  provider_id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .optional(),
  pi_path: z.string().refine(path.isAbsolute, 'pi_path must be absolute').optional(),
  agent_dir: z.string().refine(path.isAbsolute, 'agent_dir must be absolute').optional(),
  working_dir: z.string().min(1).optional(),
  tools: z.array(tool).optional(),
  no_tools: z.boolean().optional(),
  allow_unsafe_tools: z.boolean().optional(),
  system_prompt: z.string().optional(),
  append_system_prompt: z.string().optional(),
  timeout: z.number().int().positive().max(2_147_483_647).optional(),
  max_output_bytes: z.number().int().positive().optional(),
});
type PiProviderConfig = z.infer<typeof configSchema>;

interface PiUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: {
    total?: number;
  };
}

interface PiContentPart {
  type: string;
  text?: string;
}

interface PiMessage {
  role: string;
  content?: PiContentPart[] | string;
  provider?: string;
  model?: string;
  responseModel?: string;
  usage?: PiUsage;
  stopReason?: string;
  errorMessage?: string;
}

interface PiEvent {
  type: string;
  message?: PiMessage;
  messages?: PiMessage[];
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  willRetry?: boolean;
  command?: string;
  data?: { disposition?: string };
  success?: boolean;
  error?: string;
}

interface PiToolCall {
  name: string;
  is_error?: boolean;
}

interface PiRunResult {
  stdout: string;
  exitCode: number | null;
  /** Signal that terminated the process, when exitCode is null. */
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  aborted: boolean;
  /** True when stdout exceeded the configured cap and the run was aborted. */
  stdoutOverflow: boolean;
}

interface PiPreparedCall {
  config: PiProviderConfig;
  /** Resolved working_dir; undefined means run in a fresh temp directory */
  workingDir: string | undefined;
}

function resolveBasePath(config: PiProviderConfig): string {
  return path.resolve(config.basePath ?? cliState.basePath ?? process.cwd());
}

const OVERRIDE_ERROR =
  'Set the vendor key in the Promptfoo process environment, or select a trusted agent_dir in the provider configuration.';
const INSTALL_HELP =
  'Install Pi 0.99.1 or later outside the project. Set pi_path or add an absolute installation directory to PATH.';

export class PiProvider implements ApiProvider {
  readonly handlesOwnRetries = true;
  readonly config: PiProviderConfig;
  private readonly providerId: string;
  private readonly processSettings: string[];
  private readonly activeRuns = new Map<AbortController, Promise<ProviderResponse>>();

  constructor(options: ProviderOptions = {}) {
    const config = options.config ?? {};
    if (config.apiKey !== undefined || config.env !== undefined) {
      throw new Error(
        'Pi uses a process API key or an explicit agent_dir. Inline keys and env overrides are unsupported.',
      );
    }
    this.config = configSchema.parse(config);
    this.providerId = options.id ?? 'pi';
    const key = PI_PROVIDER_ENV_KEYS[this.resolveProviderName(this.config) ?? ''];
    this.processSettings = ['PI_CODING_AGENT_DIR', ...(key ? [key] : [])];
    if (hasAgentEnvOverride(this.processSettings, options.env)) {
      throw new Error(OVERRIDE_ERROR);
    }
    for (const name of ['pi_path', 'agent_dir', 'working_dir', 'basePath'] as const) {
      if (/{[{%#]/.test(this.config[name] ?? '')) {
        throw new Error(`Pi ${name} must be a static provider setting`);
      }
    }
    if (
      this.config.tools?.length &&
      !this.config.no_tools &&
      !(this.config.allow_unsafe_tools && this.config.working_dir)
    ) {
      throw new Error(
        'Pi tools are unsandboxed. Set allow_unsafe_tools and working_dir only in an isolated, trusted environment.',
      );
    }
  }

  id(): string {
    return this.providerId;
  }

  toString(): string {
    return '[Pi Coding Agent Provider]';
  }

  private buildArgs(config: PiProviderConfig): string[] {
    const args = ['--mode', 'rpc', '--no-session', '--offline'];
    if (config.provider_id) {
      args.push('--provider', config.provider_id);
    }
    if (config.model) {
      args.push('--model', config.model);
    }
    if (config.thinking) {
      args.push('--thinking', config.thinking);
    }

    if (!config.no_tools && config.tools?.length) {
      args.push('--tools', config.tools.join(','));
    } else {
      args.push('--no-tools');
    }

    if (config.system_prompt) {
      args.push('--system-prompt', config.system_prompt);
    }
    if (config.append_system_prompt) {
      args.push('--append-system-prompt', config.append_system_prompt);
    }

    args.push(
      '--no-extensions',
      '--no-skills',
      '--no-prompt-templates',
      '--no-context-files',
      '--no-approve',
    );
    return args;
  }

  /**
   * The underlying model-provider name pi routes to, derived from provider_id or
   * the `provider/` prefix of the model pattern (lowercased), or undefined when
   * neither is set (a bare `pi` run using pi's configured default).
   */
  private resolveProviderName(config: PiProviderConfig): string | undefined {
    return (
      config.provider_id?.toLowerCase() ??
      (config.model?.includes('/') ? config.model.split('/')[0].toLowerCase() : undefined)
    );
  }

  private prepareCall(context?: CallApiContextParams): PiPreparedCall {
    const {
      provider: _provider,
      prefix: _prefix,
      suffix: _suffix,
      ...overrides
    } = context?.prompt?.config ?? {};
    const row = turn.parse(overrides);
    const config = { ...this.config, ...row };
    const vendor = this.resolveProviderName(this.config);
    if (
      this.resolveProviderName(config) !== vendor ||
      (row.model?.includes('/') && this.resolveProviderName(row) !== vendor)
    ) {
      throw new Error('Pi model overrides must use the configured vendor');
    }
    const workingDir = resolveAgenticWorkingDir(config.working_dir, resolveBasePath(config));
    if (workingDir && !fs.statSync(workingDir).isDirectory()) {
      throw new Error('working_dir must be a directory');
    }
    return { config, workingDir };
  }

  private buildEnv(tempDir: string) {
    const env: Record<string, string> = {
      HOME: tempDir,
      PI_CODING_AGENT_DIR: this.config.agent_dir ?? path.join(tempDir, 'agent'),
    };
    for (const name of ['PATH', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'SSL_CERT_DIR']) {
      const value = process.env[name];
      if (value) {
        env[name] = value;
      }
    }
    // An explicit Pi profile can use its own login. Never mix it with an ambient key.
    const vendor = this.resolveProviderName(this.config);
    const name = vendor && PI_PROVIDER_ENV_KEYS[vendor];
    const key = name && !this.config.agent_dir ? process.env[name] : undefined;
    if (name && key) {
      env[name] = key;
    }
    return { env, key };
  }

  private runPi(
    command: string,
    args: string[],
    options: {
      cwd: string;
      env: Record<string, string>;
      prompt: string;
      timeoutMs: number;
      maxOutputBytes: number;
      abortSignal?: AbortSignal;
    },
  ): Promise<PiRunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ['pipe', 'pipe', 'ignore'],
        // Keep descendants in a group for cancellation and cleanup.
        detached: true,
      });

      let stdout = '';
      let rpcBuffer = '';
      let stdoutBytes = 0;
      let stdoutOverflow = false;
      let timedOut = false;
      let aborted = false;
      let settled = false;
      let exitSignal: NodeJS.Signals | null = null;
      let killHandle: ReturnType<typeof setTimeout> | undefined;
      let exitHandle: ReturnType<typeof setTimeout> | undefined;
      let stopping = false;

      const signalGroup = (signal: NodeJS.Signals) => {
        try {
          child.kill(signal);
        } catch (err) {
          logger.debug(`[Pi] Failed to send ${signal}: ${err}`);
        }
        if (typeof child.pid === 'number') {
          try {
            process.kill(-child.pid, signal);
          } catch (err) {
            // ESRCH when the group is already gone; nothing to do.
            logger.debug(`[Pi] Failed to signal process group: ${err}`);
          }
        }
      };

      const killChild = () => {
        if (stopping || settled) {
          return;
        }
        stopping = true;
        killHandle = setTimeout(() => signalGroup('SIGKILL'), KILL_GRACE_MS);
        signalGroup('SIGTERM');
      };

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        killChild();
      }, options.timeoutMs);
      timeoutHandle.unref();

      const abortListener = () => {
        aborted = true;
        killChild();
      };
      options.abortSignal?.addEventListener('abort', abortListener, { once: true });

      const finish = (fn: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutHandle);
        clearTimeout(killHandle);
        clearTimeout(exitHandle);
        // Closed pipes do not prove that background descendants have stopped.
        if (stopping || typeof child.pid === 'number') {
          signalGroup('SIGKILL');
        }
        options.abortSignal?.removeEventListener('abort', abortListener);
        child.stdin.destroy();
        child.stdout.destroy();
        fn();
      };

      // setEncoding makes Node buffer partial multi-byte UTF-8 sequences across
      // chunk boundaries instead of corrupting them into U+FFFD.
      child.stdout.setEncoding('utf-8');
      child.stdout.on('data', (chunk: string) => {
        if (stdoutOverflow) {
          return;
        }
        const availableBytes = Math.max(0, options.maxOutputBytes - stdoutBytes);
        stdoutBytes += Buffer.byteLength(chunk, 'utf-8');
        if (stdoutBytes > options.maxOutputBytes) {
          // Retain complete billed events before the output limit.
          const retained =
            stdout + Buffer.from(chunk).subarray(0, availableBytes).toString('utf-8');
          stdout = retained.slice(0, retained.lastIndexOf('\n') + 1);
          stdoutOverflow = true;
          killChild();
          return;
        }
        stdout += chunk;
        rpcBuffer += chunk;
        let newline: number;
        while ((newline = rpcBuffer.indexOf('\n')) !== -1) {
          const line = rpcBuffer.slice(0, newline);
          rpcBuffer = rpcBuffer.slice(newline + 1);
          try {
            const event = JSON.parse(line) as PiEvent;
            if (
              event?.type === 'agent_settled' ||
              (event?.type === 'response' &&
                event.command === 'prompt' &&
                (event.success === false || event.data?.disposition === 'handled'))
            ) {
              // RPC stays alive between commands. EOF requests shutdown after this run.
              child.stdin.end();
            }
          } catch {
            // Ignore non-protocol output; parseEvents applies the same rule.
          }
        }
      });
      child.stdin.on('error', (err) => {
        // EPIPE if pi exits before reading the prompt; surfaced via exit code.
        logger.debug(`[Pi] stdin error: ${err.message}`);
      });
      child.stdin.write(`${JSON.stringify({ type: 'prompt', message: options.prompt })}\n`);

      child.on('error', (err: NodeJS.ErrnoException) => {
        finish(() => {
          if (err.code === 'ENOENT') {
            reject(new Error(INSTALL_HELP));
          } else {
            reject(err);
          }
        });
      });

      const resolveRun = (code: number | null) => {
        finish(() =>
          resolve({
            stdout,
            exitCode: code,
            signal: exitSignal,
            timedOut,
            aborted,
            stdoutOverflow,
          }),
        );
      };

      // 'close' waits for all stdio to end; a descendant process holding the
      // inherited pipes can delay it indefinitely. Settle from 'exit' after a
      // short flush grace period so the call can't hang forever.
      child.on('exit', (code, signal) => {
        exitSignal = signal;
        if (!settled) {
          exitHandle = setTimeout(() => resolveRun(code), STDIO_FLUSH_GRACE_MS);
        }
      });
      child.on('close', (code, signal) => {
        exitSignal = signal ?? exitSignal;
        resolveRun(code);
      });
      if (options.abortSignal?.aborted) {
        abortListener();
      }
    });
  }

  private parseEvents(stdout: string): PiEvent[] {
    const events: PiEvent[] = [];
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const event: unknown = JSON.parse(trimmed);
        if (
          event &&
          typeof event === 'object' &&
          !Array.isArray(event) &&
          'type' in event &&
          typeof event.type === 'string'
        ) {
          events.push(event as PiEvent);
        }
      } catch {
        logger.debug('[Pi] Skipping non-JSON output line');
      }
    }
    return events;
  }

  private getMessageText(message: PiMessage): string {
    if (typeof message.content === 'string') {
      return message.content;
    }
    return (message.content ?? [])
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n');
  }

  private collectAssistantMessages(events: PiEvent[]): PiMessage[] {
    let lastAgentEnd = -1;
    let lastMessageEnd = -1;
    events.forEach((event, index) => {
      if (event.type === 'agent_end' && event.messages) {
        lastAgentEnd = index;
      } else if (event.type === 'message_end' && event.message?.role === 'assistant') {
        lastMessageEnd = index;
      }
    });
    // Use the terminal snapshot only when no completed assistant turn follows it.
    if (lastAgentEnd > lastMessageEnd) {
      const assistant = events[lastAgentEnd].messages!.filter(
        (message) => message.role === 'assistant',
      );
      if (assistant.length > 0) {
        return assistant;
      }
    }

    // An interrupted retry can have completed turns without a terminal snapshot.
    return events
      .slice(lastMessageEnd > lastAgentEnd ? lastAgentEnd + 1 : 0)
      .filter((event) => event.type === 'message_end' && event.message?.role === 'assistant')
      .map((event) => event.message!);
  }

  private buildTokenUsage(
    assistantMessages: PiMessage[],
  ): ProviderResponse['tokenUsage'] | undefined {
    const withUsage = assistantMessages.filter((message) => message.usage);
    if (withUsage.length === 0) {
      return undefined;
    }

    let prompt = 0;
    let completion = 0;
    let total = 0;
    let cached = 0;
    let cacheCreation = 0;
    for (const message of withUsage) {
      const usage = message.usage!;
      const input = usage.input ?? 0;
      const output = usage.output ?? 0;
      const cacheRead = usage.cacheRead ?? 0;
      const cacheWrite = usage.cacheWrite ?? 0;
      prompt += input + cacheRead + cacheWrite;
      completion += output;
      total += usage.totalTokens ?? input + output + cacheRead + cacheWrite;
      cached += cacheRead;
      cacheCreation += cacheWrite;
    }

    return {
      prompt,
      completion,
      total,
      cached,
      numRequests: withUsage.length,
      ...(cached > 0 || cacheCreation > 0
        ? {
            completionDetails: {
              cacheReadInputTokens: cached,
              cacheCreationInputTokens: cacheCreation,
            },
          }
        : {}),
    };
  }

  private buildCost(assistantMessages: PiMessage[]): number | undefined {
    const costs = assistantMessages
      .map((message) => message.usage?.cost?.total)
      .filter((cost): cost is number => typeof cost === 'number');
    if (costs.length === 0) {
      return undefined;
    }
    return costs.reduce((sum, cost) => sum + cost, 0);
  }

  private collectToolCalls(events: PiEvent[]): PiToolCall[] {
    const names = new Map<string, string>();
    const calls: PiToolCall[] = [];
    for (const { type, toolCallId, toolName, isError } of events) {
      if (type === 'tool_execution_start' && toolCallId && toolName) {
        names.set(toolCallId, toolName);
      } else if (type === 'tool_execution_end') {
        const name = toolName ?? (toolCallId && names.get(toolCallId));
        if (name) {
          calls.push({ name, ...(isError ? { is_error: true } : {}) });
        }
      }
    }
    return calls;
  }

  private buildProviderResponse(events: PiEvent[]): ProviderResponse {
    const assistantMessages = this.collectAssistantMessages(events);
    const finalMessage = assistantMessages[assistantMessages.length - 1];

    const tokenUsage = this.buildTokenUsage(assistantMessages);
    const cost = this.buildCost(assistantMessages);

    if (!finalMessage) {
      return { error: 'Pi agent produced no assistant response.' };
    }

    // Preserve completed requests for billing even when the final attempt fails.
    const billing = {
      ...(tokenUsage ? { tokenUsage } : {}),
      ...(cost === undefined ? {} : { cost }),
    };

    if (finalMessage.stopReason === 'error' || finalMessage.stopReason === 'aborted') {
      return {
        error:
          finalMessage.errorMessage ?? `Pi agent stopped with reason: ${finalMessage.stopReason}`,
        ...billing,
      };
    }

    const toolCalls = this.collectToolCalls(events);
    const metadata: Record<string, unknown> = {};
    if (finalMessage.provider) {
      metadata.provider_id = finalMessage.provider;
    }
    const model = finalMessage.responseModel ?? finalMessage.model;
    if (model) {
      metadata.model = model;
    }
    if (toolCalls.length > 0) {
      metadata.toolCalls = toolCalls;
    }

    return {
      output: this.getMessageText(finalMessage),
      ...(finalMessage.stopReason
        ? {
            finishReason:
              finalMessage.stopReason === 'toolUse' ? 'tool_calls' : finalMessage.stopReason,
          }
        : {}),
      ...billing,
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (process.platform !== 'linux' && process.platform !== 'darwin') {
      return {
        error: 'The Pi provider supports Linux and macOS only; this platform is unsupported.',
      };
    }

    if (callOptions?.abortSignal?.aborted) {
      return { error: 'Pi call aborted before it started' };
    }

    if (hasAgentEnvOverride(this.processSettings)) {
      return { error: OVERRIDE_ERROR };
    }
    let prepared: PiPreparedCall;
    try {
      prepared = this.prepareCall(context);
    } catch (error) {
      return {
        error: `Invalid Pi config: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    const { config, workingDir } = prepared;
    const args = this.buildArgs(config);

    const spanContext = buildChatSpanContext({
      system: this.resolveProviderName(config) ?? 'pi',
      model: config.model ?? 'default',
      providerId: this.providerId,
      prompt,
      context,
    });

    const controller = new AbortController();
    const abortSignal = callOptions?.abortSignal
      ? AbortSignal.any([callOptions.abortSignal, controller.signal])
      : controller.signal;
    const run = withGenAISpan(
      spanContext,
      () =>
        this.executeRun({
          args,
          workingDir,
          config,
          prompt,
          callOptions: { ...callOptions, abortSignal },
        }),
      extractProviderResponseAttributes,
    );
    this.activeRuns.set(controller, run);
    providerRegistry.register(this);
    try {
      return await run;
    } finally {
      this.activeRuns.delete(controller);
      if (this.activeRuns.size === 0) {
        providerRegistry.unregister(this);
      }
    }
  }

  async cleanup(): Promise<void> {
    const runs = [...this.activeRuns.entries()];
    for (const [controller] of runs) {
      controller.abort();
    }
    await Promise.allSettled(runs.map(([, run]) => run));
  }

  async shutdown(): Promise<void> {
    await this.cleanup();
  }

  private async executeRun(opts: {
    args: string[];
    workingDir: string | undefined;
    config: PiProviderConfig;
    prompt: string;
    callOptions?: CallApiOptionsParams;
  }): Promise<ProviderResponse> {
    const { args, workingDir, config, prompt, callOptions } = opts;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-pi-'));
    const runDir = workingDir ?? tempDir;

    const timeoutMs = config.timeout ?? DEFAULT_TIMEOUT_MS;
    const maxOutputBytes = config.max_output_bytes ?? DEFAULT_MAX_OUTPUT_BYTES;

    const { env, key } = this.buildEnv(tempDir);
    try {
      const isLocal = await getProjectPathCheck(runDir, resolveBasePath(config));
      if (config.agent_dir) {
        const profile = await fsPromises.realpath(config.agent_dir);
        if (
          isLocal(config.agent_dir) ||
          isLocal(profile) ||
          !(await fsPromises.stat(profile)).isDirectory()
        ) {
          return { error: 'agent_dir must be a trusted Pi profile outside the project' };
        }
        env.PI_CODING_AGENT_DIR = profile;
      }
      const command = await resolveAgentExecutable(
        config.pi_path ?? 'pi',
        env,
        isLocal,
        resolveBasePath(config),
      );
      if (!command) {
        return { error: INSTALL_HELP };
      }
      callOptions?.abortSignal?.throwIfAborted();
      const runResult = await this.runPi(command, args, {
        cwd: runDir,
        env,
        prompt,
        timeoutMs,
        maxOutputBytes,
        abortSignal: callOptions?.abortSignal,
      });

      const events = this.parseEvents(runResult.stdout);
      const response = this.buildProviderResponse(events);
      const protect = (result: ProviderResponse): ProviderResponse =>
        key
          ? JSON.parse(
              JSON.stringify(result, (_field, value) =>
                typeof value === 'string' ? value.replaceAll(key, REDACTED) : value,
              ),
            )
          : result;
      const fail = (error: string): ProviderResponse => {
        delete response.output;
        return protect({ ...response, error });
      };

      if (runResult.aborted) {
        return fail('Pi call aborted');
      }
      if (runResult.timedOut) {
        return fail(`Pi call timed out after ${timeoutMs}ms`);
      }
      if (runResult.stdoutOverflow) {
        return fail(
          `Pi produced more than ${maxOutputBytes} bytes of output and was terminated. Increase max_output_bytes if this output is expected.`,
        );
      }

      // A successful process exit is required in addition to a completed agent run.
      if (runResult.exitCode !== 0) {
        const reason =
          runResult.exitCode === null && runResult.signal
            ? `was terminated by signal ${runResult.signal}`
            : `exited with code ${runResult.exitCode}`;
        return fail(`Pi ${reason}.`);
      }

      const failure = events.find(
        (event) =>
          event?.type === 'response' && event.command === 'prompt' && event.success === false,
      );
      if (failure) {
        return fail(failure.error ?? 'Pi rejected the prompt');
      }
      if (!events.some((event) => event?.type === 'agent_settled')) {
        return fail(`Pi exited before completing the run.`);
      }
      return protect(response);
    } catch (error) {
      if (
        (error instanceof Error && error.name === 'AbortError') ||
        callOptions?.abortSignal?.aborted
      ) {
        return { error: 'Pi call aborted' };
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        error: `Error calling Pi: ${key ? errorMessage.replaceAll(key, REDACTED) : errorMessage}`,
      };
    } finally {
      await fsPromises.rm(tempDir, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}
