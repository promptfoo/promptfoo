import { spawn } from 'child_process';
import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';

import dedent from 'dedent';
import cliState from '../cliState';
import logger from '../logger';
import {
  cacheResponse,
  getCachedResponse,
  initializeAgenticCache,
  resolveAgenticWorkingDir,
  validateAgenticWorkingDir,
} from './agentic-utils';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../types/index';

/**
 * Pi Coding Agent Provider
 *
 * This provider runs evals through Pi (https://pi.dev), a minimal terminal coding
 * agent. Promptfoo spawns the `pi` CLI in one-shot JSON event-stream mode
 * (`pi --mode json --no-session`) for each call, so the provider exercises the same
 * runtime users get in their terminal.
 *
 * Installation (any of):
 *   npm install -g @earendil-works/pi-coding-agent
 *   npm install @earendil-works/pi-coding-agent   (project-local; resolved automatically)
 *   curl -fsSL https://pi.dev/install.sh | sh
 *
 * Pi has NO built-in permission or sandbox system, so promptfoo defaults are
 * conservative and mirror the OpenCode provider:
 * - No working_dir: runs in a temp directory with all tools disabled (chat-only)
 * - With working_dir: runs in that directory with read-only tools (read, grep, find, ls)
 *
 * For side effects (file writes, bash commands), configure `tools` explicitly.
 */

/** Read-only built-in tools enabled by default when working_dir is set */
export const PI_READONLY_TOOLS = ['find', 'grep', 'ls', 'read'];

const PI_PACKAGE_NAME = '@earendil-works/pi-coding-agent';

const DEFAULT_TIMEOUT_MS = 600_000;
const KILL_GRACE_MS = 5_000;
// After the pi process exits, wait briefly for stdio to flush before settling.
// A descendant process that inherited stdout can otherwise hold the 'close'
// event open forever.
const STDIO_FLUSH_GRACE_MS = 1_000;
const MAX_STDERR_LENGTH = 16_384;

/**
 * Env vars pi (via pi-ai) reads for each provider's API key.
 * Used to inject config.apiKey without putting it on the command line.
 */
const PI_PROVIDER_ENV_KEYS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
  google: 'GEMINI_API_KEY',
  groq: 'GROQ_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  xai: 'XAI_API_KEY',
  zai: 'ZAI_API_KEY',
};

export type PiThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

/**
 * Pi provider configuration
 */
export interface PiProviderConfig {
  /**
   * Model pattern or ID passed to `--model`.
   * Supports pi's `provider/id` form and optional `:<thinking>` suffix
   * (e.g. 'anthropic/claude-sonnet-4-5', 'openai/gpt-4o-mini', 'sonnet:high').
   * Can also be set via the provider path: `pi:anthropic/claude-sonnet-4-5`.
   */
  model?: string;

  /**
   * LLM provider name passed to `--provider` (e.g. 'anthropic', 'openai', 'google').
   * Unnecessary when `model` uses the `provider/id` form.
   */
  provider_id?: string;

  /** Thinking level passed to `--thinking` */
  thinking?: PiThinkingLevel;

  /**
   * API key for the selected LLM provider. Injected into the pi process
   * environment using the env var named by `api_key_env` if set, otherwise
   * the provider's standard env var when the provider is recognized.
   * When unset, pi reads its native env vars (ANTHROPIC_API_KEY,
   * OPENAI_API_KEY, GEMINI_API_KEY, ...) from the inherited environment.
   */
  apiKey?: string;

  /**
   * Env var name that carries `apiKey` into the pi process.
   * Required when `apiKey` is set for a provider promptfoo does not recognize
   * (keeps credentials out of the command line).
   */
  api_key_env?: string;

  /**
   * Working directory for pi to operate in.
   * If not specified, uses a temporary directory with all tools disabled.
   * Relative paths are resolved from the directory containing the config file.
   */
  working_dir?: string;

  /**
   * Tool allowlist passed to `--tools` (built-in, extension, and custom tools).
   * Built-in tools: read, bash, edit, write, grep, find, ls.
   * An empty array disables all tools.
   */
  tools?: string[];

  /** Tool denylist passed to `--exclude-tools` */
  exclude_tools?: string[];

  /** Disable all tools (`--no-tools`). Takes precedence over `tools`. */
  no_tools?: boolean;

  /** Replace pi's system prompt (`--system-prompt`) */
  system_prompt?: string;

  /** Append text to pi's system prompt (`--append-system-prompt`) */
  append_system_prompt?: string;

  /**
   * Load pi extensions discovered from the agent dir and working dir.
   * Disabled by default for reproducible evals.
   */
  load_extensions?: boolean;

  /**
   * Load pi skills discovered from the agent dir and working dir.
   * Disabled by default for reproducible evals.
   */
  load_skills?: boolean;

  /**
   * Expand pi prompt templates in prompts.
   * Disabled by default so eval prompts are passed through verbatim.
   */
  load_prompt_templates?: boolean;

  /**
   * Load AGENTS.md / CLAUDE.md context files from the working directory.
   * Disabled by default for reproducible evals.
   */
  load_context_files?: boolean;

  /**
   * Pi config directory (sessions, settings.json, auth.json, models.json).
   * Sets PI_CODING_AGENT_DIR for the spawned process.
   * Defaults to pi's own default (~/.pi/agent), so subscription auth and
   * custom models configured in pi keep working.
   */
  agent_dir?: string;

  /** Path to the pi executable. Overrides package/PATH resolution. */
  pi_path?: string;

  /** Extra environment variables for the pi process */
  env?: Record<string, string>;

  /** Additional CLI arguments appended verbatim (escape hatch) */
  extra_args?: string[];

  /**
   * Maximum run time for a single call in milliseconds
   * @default 600000
   */
  timeout?: number;

  /**
   * Pass `--offline` to disable pi's startup network operations
   * (version checks, package update checks, install telemetry).
   * LLM API calls are unaffected.
   * @default true
   */
  offline?: boolean;
}

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
  args?: Record<string, unknown>;
  isError?: boolean;
}

interface PiToolCall {
  name: string;
  args?: Record<string, unknown>;
  is_error?: boolean;
}

interface PiRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  aborted: boolean;
}

interface PiPreparedCall {
  config: PiProviderConfig;
  /** Resolved working_dir; undefined means run in a fresh temp directory */
  workingDir: string | undefined;
}

function resolveBasePath(): string {
  return cliState.basePath && path.isAbsolute(cliState.basePath)
    ? cliState.basePath
    : process.cwd();
}

function truncateStderr(stderr: string): string {
  const trimmed = stderr.trim();
  if (trimmed.length <= MAX_STDERR_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_STDERR_LENGTH)}... (truncated)`;
}

/**
 * Read the pi bin script path from an installed package's package.json.
 * Returns undefined when the package or its bin script is absent or unreadable.
 */
function readPiBinScript(packageJsonPath: string): string | undefined {
  try {
    if (!fs.existsSync(packageJsonPath)) {
      return undefined;
    }
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const binEntry = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.pi;
    if (typeof binEntry !== 'string') {
      return undefined;
    }
    const scriptPath = path.join(path.dirname(packageJsonPath), binEntry);
    return fs.existsSync(scriptPath) ? scriptPath : undefined;
  } catch (err) {
    logger.debug(`[Pi] Failed to inspect ${packageJsonPath}: ${err}`);
    return undefined;
  }
}

/**
 * Locate the pi CLI entry point from a project-local install of
 * @earendil-works/pi-coding-agent by walking up from the given base directories.
 * Returns the absolute path to the package's bin script, or undefined.
 *
 * esm.ts's resolvePackageEntryPoint is not usable here: it resolves the
 * package's main export, while spawning requires the `bin.pi` script.
 */
export function findPiCliScript(baseDirs: Array<string | undefined>): string | undefined {
  const seen = new Set<string>();
  for (const base of baseDirs) {
    if (!base) {
      continue;
    }
    let current = path.resolve(base);
    while (true) {
      if (!seen.has(current)) {
        seen.add(current);
        const scriptPath = readPiBinScript(
          path.join(current, 'node_modules', ...PI_PACKAGE_NAME.split('/'), 'package.json'),
        );
        if (scriptPath) {
          return scriptPath;
        }
      }
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }
  return undefined;
}

function piInstallGuidance(): string {
  return dedent`The pi coding agent CLI is required but was not found.

    Install it with one of:
      npm install -g ${PI_PACKAGE_NAME}
      npm install ${PI_PACKAGE_NAME}
      curl -fsSL https://pi.dev/install.sh | sh

    Or set pi_path in the provider config to the pi executable.

    For more information, see: https://www.promptfoo.dev/docs/providers/pi/`;
}

export class PiProvider implements ApiProvider {
  config: PiProviderConfig;
  env?: EnvOverrides;

  private providerId = 'pi';
  /** Memoized findPiCliScript result; null = searched and not found */
  private cachedCliScript: string | null | undefined;

  constructor(
    options: {
      id?: string;
      config?: PiProviderConfig;
      env?: EnvOverrides;
    } = {},
  ) {
    const { config, env, id } = options;
    this.config = config ?? {};
    this.env = env;
    this.providerId = id ?? this.providerId;
  }

  id(): string {
    return this.providerId;
  }

  toString(): string {
    return '[Pi Coding Agent Provider]';
  }

  /**
   * Resolve the command used to launch pi.
   * Priority: config.pi_path > project-local npm package > `pi` on PATH.
   */
  private resolvePiCommand(config: PiProviderConfig): { command: string; argsPrefix: string[] } {
    if (config.pi_path) {
      const resolved = path.isAbsolute(config.pi_path)
        ? config.pi_path
        : path.resolve(resolveBasePath(), config.pi_path);
      if (resolved.endsWith('.js') || resolved.endsWith('.mjs')) {
        return { command: process.execPath, argsPrefix: [resolved] };
      }
      return { command: resolved, argsPrefix: [] };
    }

    // The node_modules walk is stable for the lifetime of a provider instance;
    // cache it so repeated calls don't re-stat the directory tree.
    if (this.cachedCliScript === undefined) {
      this.cachedCliScript = findPiCliScript([cliState.basePath, process.cwd()]) ?? null;
    }
    if (this.cachedCliScript) {
      logger.debug(`[Pi] Using project-local pi CLI: ${this.cachedCliScript}`);
      return { command: process.execPath, argsPrefix: [this.cachedCliScript] };
    }

    return { command: 'pi', argsPrefix: [] };
  }

  /**
   * Build the tool restriction args. Mirrors the OpenCode provider's safety
   * defaults: chat-only without a working directory, read-only tools with one.
   */
  private buildToolArgs(config: PiProviderConfig): string[] {
    const args: string[] = [];

    if (config.no_tools) {
      args.push('--no-tools');
    } else if (config.tools !== undefined) {
      if (config.tools.length === 0) {
        args.push('--no-tools');
      } else {
        args.push('--tools', config.tools.join(','));
      }
    } else if (config.working_dir) {
      args.push('--tools', PI_READONLY_TOOLS.join(','));
    } else {
      args.push('--no-tools');
    }

    if (config.exclude_tools?.length) {
      args.push('--exclude-tools', config.exclude_tools.join(','));
    }

    return args;
  }

  private buildArgs(config: PiProviderConfig): string[] {
    const args: string[] = ['--mode', 'json', '--no-session'];

    if (config.offline !== false) {
      args.push('--offline');
    }

    if (config.provider_id) {
      args.push('--provider', config.provider_id);
    }
    if (config.model) {
      args.push('--model', config.model);
    }
    if (config.thinking) {
      args.push('--thinking', config.thinking);
    }

    args.push(...this.buildToolArgs(config));

    if (config.system_prompt) {
      args.push('--system-prompt', config.system_prompt);
    }
    if (config.append_system_prompt) {
      args.push('--append-system-prompt', config.append_system_prompt);
    }

    if (config.load_extensions !== true) {
      args.push('--no-extensions');
    }
    if (config.load_skills !== true) {
      args.push('--no-skills');
    }
    if (config.load_prompt_templates !== true) {
      args.push('--no-prompt-templates');
    }
    if (config.load_context_files !== true) {
      args.push('--no-context-files');
    }

    if (config.extra_args?.length) {
      args.push(...config.extra_args);
    }

    return args;
  }

  /**
   * Determine which env var should carry config.apiKey: an explicit
   * api_key_env, or the standard env var for the provider derived from
   * provider_id or the provider prefix of the model pattern.
   *
   * The key is never passed via --api-key so it stays off the command line
   * (visible in process listings) and out of the args-derived cache key.
   */
  private getApiKeyEnvVar(config: PiProviderConfig): string | undefined {
    if (config.api_key_env) {
      return config.api_key_env;
    }
    const provider =
      config.provider_id?.toLowerCase() ??
      (config.model?.includes('/') ? config.model.split('/')[0].toLowerCase() : undefined);
    if (!provider) {
      return undefined;
    }
    return PI_PROVIDER_ENV_KEYS[provider];
  }

  private buildEnv(config: PiProviderConfig): Record<string, string> {
    const env: Record<string, string> = {};

    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }

    if (this.env) {
      for (const key of Object.keys(this.env).sort()) {
        const value = (this.env as Record<string, string | undefined>)[key];
        if (value !== undefined) {
          env[key] = value;
        }
      }
    }

    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        env[key] = String(value);
      }
    }

    if (config.agent_dir) {
      env.PI_CODING_AGENT_DIR = path.isAbsolute(config.agent_dir)
        ? config.agent_dir
        : path.resolve(resolveBasePath(), config.agent_dir);
    }

    if (config.apiKey) {
      const envVar = this.getApiKeyEnvVar(config);
      if (envVar) {
        env[envVar] = config.apiKey;
      }
    }

    return env;
  }

  private prepareCall(context?: CallApiContextParams): PiPreparedCall {
    const promptConfig = (context?.prompt?.config ?? {}) as PiProviderConfig;
    const config: PiProviderConfig = {
      ...this.config,
      ...promptConfig,
      // Shallow spread would replace the whole env record; merge it instead.
      ...(this.config.env || promptConfig.env
        ? { env: { ...this.config.env, ...promptConfig.env } }
        : {}),
    };

    if (config.apiKey && !this.getApiKeyEnvVar(config)) {
      throw new Error(
        dedent`Pi provider: apiKey is set but promptfoo cannot determine which env var should carry it for this provider.

        Set api_key_env to the env var name pi expects (e.g. api_key_env: MY_PROXY_API_KEY),
        or pass the credential through the env config option instead.`,
      );
    }

    if (config.working_dir) {
      const workingDir =
        resolveAgenticWorkingDir(config.working_dir, cliState.basePath) ?? process.cwd();
      validateAgenticWorkingDir(workingDir, config.working_dir);
      return { config, workingDir };
    }

    // The temp directory is created later in callApi, after the cache and
    // abort checks, so cache hits don't leave empty directories behind.
    return { config, workingDir: undefined };
  }

  private runPi(
    command: string,
    args: string[],
    options: {
      cwd: string;
      env: Record<string, string>;
      prompt: string;
      timeoutMs: number;
      abortSignal?: AbortSignal;
    },
  ): Promise<PiRunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let aborted = false;
      let settled = false;

      const killChild = () => {
        try {
          child.kill('SIGTERM');
        } catch (err) {
          logger.debug(`[Pi] Failed to send SIGTERM: ${err}`);
        }
        setTimeout(() => {
          try {
            if (child.exitCode === null && child.signalCode === null) {
              child.kill('SIGKILL');
            }
          } catch (err) {
            logger.debug(`[Pi] Failed to send SIGKILL: ${err}`);
          }
        }, KILL_GRACE_MS).unref();
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
        options.abortSignal?.removeEventListener('abort', abortListener);
        fn();
      };

      // setEncoding makes Node buffer partial multi-byte UTF-8 sequences across
      // chunk boundaries instead of corrupting them into U+FFFD.
      child.stdout.setEncoding('utf-8');
      child.stderr.setEncoding('utf-8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });

      child.stdin.on('error', (err) => {
        // EPIPE if pi exits before reading the prompt; surfaced via exit code.
        logger.debug(`[Pi] stdin error: ${err.message}`);
      });
      child.stdin.write(options.prompt);
      child.stdin.end();

      child.on('error', (err: NodeJS.ErrnoException) => {
        finish(() => {
          if (err.code === 'ENOENT') {
            reject(new Error(piInstallGuidance()));
          } else {
            reject(err);
          }
        });
      });

      const resolveRun = (code: number | null) => {
        finish(() => resolve({ stdout, stderr, exitCode: code, timedOut, aborted }));
      };

      // 'close' waits for all stdio to end; a descendant process holding the
      // inherited pipes can delay it indefinitely. Settle from 'exit' after a
      // short flush grace period so the call can't hang forever.
      child.on('exit', (code) => {
        setTimeout(() => resolveRun(code), STDIO_FLUSH_GRACE_MS).unref();
      });
      child.on('close', (code) => {
        resolveRun(code);
      });
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
        events.push(JSON.parse(trimmed));
      } catch {
        logger.debug(`[Pi] Skipping non-JSON output line: ${trimmed.slice(0, 200)}`);
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
    // agent_end carries the authoritative final message list; scan backwards
    // for the last one.
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event.type === 'agent_end' && event.messages) {
        return event.messages.filter((message) => message.role === 'assistant');
      }
    }

    // Fall back to message_end events when the run ended without agent_end.
    return events
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
    for (const message of withUsage) {
      const usage = message.usage!;
      prompt += usage.input ?? 0;
      completion += usage.output ?? 0;
      total += usage.totalTokens ?? (usage.input ?? 0) + (usage.output ?? 0);
      cached += usage.cacheRead ?? 0;
    }

    return {
      prompt,
      completion,
      total,
      cached,
      numRequests: withUsage.length,
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
    const argsByCallId = new Map<string, Record<string, unknown> | undefined>();
    for (const event of events) {
      if (event.type === 'tool_execution_start' && event.toolCallId) {
        argsByCallId.set(event.toolCallId, event.args);
      }
    }

    return events
      .filter((event) => event.type === 'tool_execution_end' && event.toolName)
      .map((event) => ({
        name: event.toolName!,
        args: event.toolCallId ? argsByCallId.get(event.toolCallId) : undefined,
        ...(event.isError ? { is_error: true } : {}),
      }));
  }

  private buildProviderResponse(events: PiEvent[], stderr: string): ProviderResponse {
    const assistantMessages = this.collectAssistantMessages(events);
    const finalMessage = assistantMessages[assistantMessages.length - 1];

    const tokenUsage = this.buildTokenUsage(assistantMessages);
    const cost = this.buildCost(assistantMessages);

    if (!finalMessage) {
      const stderrSuffix = stderr ? `\n${truncateStderr(stderr)}` : '';
      return {
        error: `Pi agent produced no assistant response.${stderrSuffix}`,
      };
    }

    if (finalMessage.stopReason === 'error' || finalMessage.stopReason === 'aborted') {
      return {
        error:
          finalMessage.errorMessage ?? `Pi agent stopped with reason: ${finalMessage.stopReason}`,
        ...(tokenUsage ? { tokenUsage } : {}),
        ...(cost === undefined ? {} : { cost }),
      };
    }

    const toolCalls = this.collectToolCalls(events);
    const metadata: Record<string, unknown> = {};
    if (finalMessage.provider) {
      metadata.provider_id = finalMessage.provider;
    }
    if (finalMessage.model) {
      metadata.model = finalMessage.model;
    }
    if (toolCalls.length > 0) {
      metadata.toolCalls = toolCalls;
    }

    return {
      output: this.getMessageText(finalMessage),
      ...(tokenUsage ? { tokenUsage } : {}),
      ...(cost === undefined ? {} : { cost }),
      raw: JSON.stringify(assistantMessages),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const { config, workingDir } = this.prepareCall(context);
    const args = this.buildArgs(config);

    const cacheResult = await initializeAgenticCache(
      {
        cacheKeyPrefix: 'pi',
        workingDir: config.working_dir ? workingDir : undefined,
        bustCache: context?.bustCache,
      },
      {
        prompt,
        // args capture model, provider, thinking, tools, prompts, and flags.
        // config.apiKey never reaches args (env-var injection only) and env
        // values are deliberately excluded from the key; only names are keyed.
        args,
        envKeys: Object.keys(config.env ?? {}).sort(),
        agentDir: config.agent_dir,
      },
    );

    const cachedResponse = await getCachedResponse(cacheResult, 'Pi');
    if (cachedResponse) {
      return cachedResponse;
    }

    if (callOptions?.abortSignal?.aborted) {
      return { error: 'Pi call aborted before it started' };
    }

    const runDir = workingDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-pi-'));

    try {
      const { command, argsPrefix } = this.resolvePiCommand(config);
      const fullArgs = [...argsPrefix, ...args];
      logger.debug(`[Pi] Running ${command}`, { args: fullArgs, cwd: runDir });

      const runResult = await this.runPi(command, fullArgs, {
        cwd: runDir,
        env: this.buildEnv(config),
        prompt,
        timeoutMs: config.timeout ?? DEFAULT_TIMEOUT_MS,
        abortSignal: callOptions?.abortSignal,
      });

      if (runResult.aborted) {
        return { error: 'Pi call aborted' };
      }
      if (runResult.timedOut) {
        return {
          error: `Pi call timed out after ${config.timeout ?? DEFAULT_TIMEOUT_MS}ms`,
        };
      }

      // Pi exits 0 in JSON mode even when the agent run fails (failures show
      // up as stopReason on the final message). A nonzero or signal exit means
      // the CLI itself crashed, so any parsed events may be truncated mid-run;
      // never report them as a successful (and cacheable) response.
      if (runResult.exitCode !== 0) {
        const stderrSuffix = runResult.stderr ? `\n${truncateStderr(runResult.stderr)}` : '';
        return {
          error: `Pi exited with code ${runResult.exitCode}.${stderrSuffix}`,
        };
      }

      const events = this.parseEvents(runResult.stdout);
      const providerResponse = this.buildProviderResponse(events, runResult.stderr);

      if (!providerResponse.error) {
        await cacheResponse(cacheResult, providerResponse, 'Pi');
      }

      return providerResponse;
    } catch (error) {
      if (
        (error instanceof Error && error.name === 'AbortError') ||
        callOptions?.abortSignal?.aborted
      ) {
        return { error: 'Pi call aborted' };
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error calling Pi', { error });
      return { error: `Error calling Pi: ${errorMessage}` };
    } finally {
      if (!workingDir) {
        await fsPromises.rm(runDir, { recursive: true, force: true }).catch((err) => {
          logger.debug(`[Pi] Failed to remove temp dir ${runDir}: ${err}`);
        });
      }
    }
  }
}
