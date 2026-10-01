import { spawn } from 'child_process';
import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';

import dedent from 'dedent';
import cliState from '../cliState';
import { getProcessEnv } from '../envars';
import logger from '../logger';
import {
  buildChatSpanContext,
  extractProviderResponseAttributes,
  withGenAISpan,
} from '../tracing/genaiTracer';
import { resolveAgenticWorkingDir, validateAgenticWorkingDir } from './agentic-utils';
import { clearRepositoryEnv, isAgentWorkspace } from './agentWorkspace';
import { providerRegistry } from './providerRegistry';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../types/index';

// Run the installed Pi CLI with tools disabled unless a workspace or tools are configured.
/** Read-only built-in tools enabled by default when working_dir is set */
export const PI_READONLY_TOOLS = ['find', 'grep', 'ls', 'read'];

const PI_PACKAGE_NAME = '@earendil-works/pi-coding-agent';

const DEFAULT_TIMEOUT_MS = 600_000;
const KILL_GRACE_MS = 5_000;
// A descendant holding stdout can delay 'close' after Pi exits.
const STDIO_FLUSH_GRACE_MS = 1_000;
const MAX_STDERR_LENGTH = 16_384;
// Retain bounded diagnostics; truncateStderr separately limits their display.
const MAX_STDERR_BYTES = 256 * 1024;
// Bound the retained JSONL stream; configurable with max_output_bytes.
const DEFAULT_MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

// Flag names whose VALUE is a credential (only reachable via user extra_args;
// the provider never puts secrets on argv). Used to redact the debug-log argv.
const SECRET_ARG_FLAG_PATTERN = /^--?[a-z0-9-]*(?:key|token|secret|password|credential|auth)/i;

/**
 * Redact the value following a credential-bearing flag in an argv array before
 * it is debug-logged. The structured logger sanitizes object keys but not
 * positional argv, so a secret a user passed via extra_args (e.g. `--api-key`)
 * could otherwise reach debug logs. Handles both `--flag value` and `--flag=v`.
 */
export function redactArgsForLog(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const eq = arg.indexOf('=');
    const flag = eq >= 0 ? arg.slice(0, eq) : arg;
    if (SECRET_ARG_FLAG_PATTERN.test(flag)) {
      if (eq >= 0) {
        out.push(`${flag}=[redacted]`);
      } else {
        out.push(arg);
        if (i + 1 < args.length) {
          out.push('[redacted]');
          i++;
        }
      }
      continue;
    }
    out.push(arg);
  }
  return out;
}

/**
 * Env vars pi (via pi-ai) reads for each provider's API key. Used to inject
 * config.apiKey without putting it on the command line.
 *
 * Mirrors pi-ai's own `getApiKeyEnvVars` map (env-api-keys.js); keep in sync
 * when pi adds providers. Providers with multi-source auth (github-copilot,
 * amazon-bedrock, google-vertex ADC) are intentionally omitted — supply those
 * via `api_key_env` or the inherited environment.
 */
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

export type PiThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

/**
 * Pi provider configuration
 */
export interface PiProviderConfig {
  /** Configuration directory captured by the provider loader. */
  basePath?: string;

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
   * Disabled by default for reproducible evals. Does not require
   * `trust_project_files` — pi loads context files independently of trust.
   */
  load_context_files?: boolean;

  /**
   * Trust project-local pi files in the working directory (`--approve`):
   * `.pi/settings.json`, project extensions/skills/prompt-templates, and a
   * project `.pi/SYSTEM.md`. Off by default (`--no-approve`) so a trusted
   * working_dir cannot alter an otherwise-hermetic run. Enable this when you
   * deliberately want a project's pi configuration to take effect. Note pi's
   * trust is all-or-nothing: enabling it trusts every project-local pi file.
   */
  trust_project_files?: boolean;

  /**
   * Pi config directory (sessions, settings.json, auth.json, models.json).
   * Sets PI_CODING_AGENT_DIR for the spawned process.
   * Defaults to pi's own default (~/.pi/agent), so subscription auth and
   * custom models configured in pi keep working.
   */
  agent_dir?: string;

  /** Absolute path to the pi executable or CLI script. Overrides package discovery. */
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

  /**
   * Maximum bytes of stdout (pi's JSON event stream) to retain before the run
   * is aborted. Guards against unbounded memory use from a runaway or
   * adversarial agent, or a tool echoing a very large file.
   * @default 33554432 (32 MiB)
   */
  max_output_bytes?: number;
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
  args?: Record<string, unknown>;
  isError?: boolean;
  willRetry?: boolean;
  command?: string;
  data?: { disposition?: string };
  success?: boolean;
  error?: string;
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
  return dedent`The pi coding agent CLI (0.99.1 or later) is required but was not found.

    Install it in the project where you run promptfoo:
      npm install ${PI_PACKAGE_NAME}

    Or set pi_path to an absolute path to an installed Pi executable or CLI script.

    For more information, see: https://www.promptfoo.dev/docs/providers/pi/`;
}

export class PiProvider implements ApiProvider {
  readonly handlesOwnRetries = true;
  config: PiProviderConfig;
  env?: EnvOverrides;

  private providerId = 'pi';
  private activeRuns = new Map<AbortController, Promise<ProviderResponse>>();
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
   * Use an explicit absolute path or a project-local npm package.
   */
  private resolvePiCommand(config: PiProviderConfig): { command: string; argsPrefix: string[] } {
    if (config.pi_path) {
      if (!path.isAbsolute(config.pi_path)) {
        throw new Error('pi_path must be an absolute path to the Pi executable or CLI script.');
      }
      const resolved = config.pi_path;
      if (resolved.endsWith('.js') || resolved.endsWith('.mjs')) {
        return { command: process.execPath, argsPrefix: [resolved] };
      }
      return { command: resolved, argsPrefix: [] };
    }

    // The node_modules walk is stable for the lifetime of a provider instance;
    // cache it so repeated calls don't re-stat the directory tree.
    if (this.cachedCliScript === undefined) {
      this.cachedCliScript = findPiCliScript([process.cwd()]) ?? null;
    }
    if (this.cachedCliScript) {
      logger.debug(`[Pi] Using project-local pi CLI: ${this.cachedCliScript}`);
      return { command: process.execPath, argsPrefix: [this.cachedCliScript] };
    }

    throw new Error(piInstallGuidance());
  }

  /**
   * Build the tool restriction args. Mirrors the OpenCode provider's safety
   * defaults: chat-only without a working directory, read-only tools with one.
   */
  private buildToolArgs(config: PiProviderConfig): string[] {
    const tools = config.no_tools
      ? []
      : (config.tools ?? (config.working_dir ? PI_READONLY_TOOLS : []));
    const args = tools.length > 0 ? ['--tools', tools.join(',')] : ['--no-tools'];

    if (config.exclude_tools?.length) {
      args.push('--exclude-tools', config.exclude_tools.join(','));
    }

    return args;
  }

  private buildArgs(config: PiProviderConfig): string[] {
    const args: string[] = ['--mode', 'rpc', '--no-session'];

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

    // Resource discovery does not grant project trust; context files load independently.
    args.push(config.trust_project_files ? '--approve' : '--no-approve');

    if (config.extra_args?.length) {
      args.push(...config.extra_args);
    }

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

  /**
   * Determine which env var should carry config.apiKey: an explicit
   * api_key_env, or the standard env var for the provider derived from
   * provider_id or the provider prefix of the configured model. Row model overrides
   * do not change the credential destination.
   *
   * The key is never passed via --api-key so it stays off the command line
   * (visible in process listings) and out of debug logs.
   */
  private getApiKeyEnvVar(): string | undefined {
    if (this.config.api_key_env) {
      return this.config.api_key_env;
    }
    const provider = this.resolveProviderName(this.config);
    if (!provider) {
      return undefined;
    }
    return PI_PROVIDER_ENV_KEYS[provider];
  }

  /**
   * The `gen_ai.system` value for tracing: the underlying model provider pi
   * routes to (from provider_id or the model prefix), or 'pi' when unknown
   * (e.g. a bare `pi` run using pi's configured default).
   */
  private resolveGenAiSystem(config: PiProviderConfig): string {
    return this.resolveProviderName(config) || 'pi';
  }

  /** EnvOverrides as a plain record (empty when unset), avoiding repeated casts. */
  private get envOverrides(): Record<string, string | undefined> {
    return (this.env ?? {}) as Record<string, string | undefined>;
  }

  /**
   * The explicitly-configured provider env: EnvOverrides merged with config.env
   * (config wins), skipping undefined EnvOverrides values and coercing config.env
   * values to strings. The ambient process.env is intentionally NOT included here.
   */
  private mergeConfiguredEnv(config: PiProviderConfig): Record<string, string> {
    const merged: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.envOverrides)) {
      if (value !== undefined) {
        merged[key] = value;
      }
    }
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        merged[key] = String(value);
      }
    }
    return merged;
  }

  private buildEnv(config: PiProviderConfig): Record<string, string> {
    // Provider settings override the inherited environment.
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(getProcessEnv())) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
    Object.assign(env, this.mergeConfiguredEnv(config));

    const configuredAgentDir = this.resolveConfiguredAgentDir(config);
    if (configuredAgentDir) {
      env.PI_CODING_AGENT_DIR = configuredAgentDir;
    }

    if (config.apiKey) {
      const envVar = this.getApiKeyEnvVar();
      if (envVar) {
        env[envVar] = config.apiKey;
      }
    }

    if (config.working_dir && isAgentWorkspace(config.working_dir)) {
      clearRepositoryEnv(env);
    }
    return env;
  }

  /**
   * Resolve the explicitly configured agent dir to an absolute path, or
   * undefined. PI_CODING_AGENT_DIR may be set via agent_dir or env (config.env,
   * EnvOverrides, or the inherited process env); a relative value is resolved
   * against the config base path. buildEnv writes this resolved value into the
   * child env so relative paths use the configuration directory, not the temporary cwd.
   */
  private resolveConfiguredAgentDir(config: PiProviderConfig): string | undefined {
    const raw =
      config.agent_dir ??
      config.env?.PI_CODING_AGENT_DIR ??
      this.envOverrides.PI_CODING_AGENT_DIR ??
      getProcessEnv().PI_CODING_AGENT_DIR;
    if (!raw) {
      return undefined;
    }
    return path.isAbsolute(raw) ? raw : path.resolve(resolveBasePath(config), raw);
  }

  private prepareCall(context?: CallApiContextParams): PiPreparedCall {
    const promptConfig = (context?.prompt?.config ?? {}) as PiProviderConfig;
    // Test rows can choose a model and thinking level, but cannot change execution settings.
    const config: PiProviderConfig = {
      ...this.config,
      ...(typeof promptConfig.model === 'string' ? { model: promptConfig.model } : {}),
      ...(typeof promptConfig.thinking === 'string' ? { thinking: promptConfig.thinking } : {}),
    };
    if (
      ('copy_working_dir' in this.config && this.config.copy_working_dir) ||
      ('copy_working_dir' in promptConfig && promptConfig.copy_working_dir)
    ) {
      throw new Error(
        'Pi does not support copy_working_dir. Configure an isolated working_dir instead.',
      );
    }

    if (config.apiKey && !this.getApiKeyEnvVar()) {
      throw new Error(
        dedent`Pi provider: apiKey is set but promptfoo cannot determine which env var should carry it for this provider.

        Set api_key_env to the env var name pi expects (e.g. api_key_env: MY_PROXY_API_KEY),
        or pass the credential through the env config option instead.`,
      );
    }

    if (config.working_dir) {
      const workingDir =
        resolveAgenticWorkingDir(config.working_dir, resolveBasePath(config)) ?? process.cwd();
      validateAgenticWorkingDir(workingDir, config.working_dir);
      return { config, workingDir };
    }

    // Create a temporary directory only when the call starts.
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
      maxOutputBytes: number;
      abortSignal?: AbortSignal;
    },
  ): Promise<PiRunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        // Keep descendants in a group for cancellation and cleanup.
        detached: true,
      });

      let stdout = '';
      let stderr = '';
      let rpcBuffer = '';
      let stdoutBytes = 0;
      let stderrBytes = 0;
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
        fn();
      };

      // setEncoding makes Node buffer partial multi-byte UTF-8 sequences across
      // chunk boundaries instead of corrupting them into U+FFFD.
      child.stdout.setEncoding('utf-8');
      child.stderr.setEncoding('utf-8');
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
      child.stderr.on('data', (chunk: string) => {
        if (stderrBytes >= MAX_STDERR_BYTES) {
          return;
        }
        stderrBytes += Buffer.byteLength(chunk, 'utf-8');
        stderr += chunk;
      });

      child.stdin.on('error', (err) => {
        // EPIPE if pi exits before reading the prompt; surfaced via exit code.
        logger.debug(`[Pi] stdin error: ${err.message}`);
      });
      child.stdin.write(`${JSON.stringify({ type: 'prompt', message: options.prompt })}\n`);

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
        finish(() =>
          resolve({
            stdout,
            stderr,
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
    // agent_end carries the authoritative final message list; scan backwards
    // for the last one that actually contains an assistant turn.
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event.type === 'agent_end' && event.messages) {
        const assistant = event.messages.filter((message) => message.role === 'assistant');
        if (assistant.length > 0) {
          return assistant;
        }
        // agent_end carried no assistant turn (e.g. the assistant text only
        // arrived via message_end). Stop scanning and use the fallback below.
        break;
      }
    }

    // Fall back to message_end events when the run ended without an agent_end
    // that carried assistant messages.
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

    // Usage, cost, and the transcript are reported on both the error and success
    // branches (the error branch keeps them so a failed row stays inspectable).
    const usageCostRaw = {
      ...(tokenUsage ? { tokenUsage } : {}),
      ...(cost === undefined ? {} : { cost }),
      raw: JSON.stringify(assistantMessages),
    };

    if (finalMessage.stopReason === 'error' || finalMessage.stopReason === 'aborted') {
      return {
        error:
          finalMessage.errorMessage ?? `Pi agent stopped with reason: ${finalMessage.stopReason}`,
        ...usageCostRaw,
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
      ...usageCostRaw,
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

    const { config, workingDir } = this.prepareCall(context);
    const args = this.buildArgs(config);

    const spanContext = buildChatSpanContext({
      system: this.resolveGenAiSystem(config),
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
    const runDir = workingDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-pi-'));

    const timeoutMs = config.timeout ?? DEFAULT_TIMEOUT_MS;
    const maxOutputBytes = config.max_output_bytes ?? DEFAULT_MAX_OUTPUT_BYTES;

    try {
      const { command, argsPrefix } = this.resolvePiCommand(config);
      const fullArgs = [...argsPrefix, ...args];
      logger.debug(`[Pi] Running ${command}`, { args: redactArgsForLog(fullArgs), cwd: runDir });

      const runResult = await this.runPi(command, fullArgs, {
        cwd: runDir,
        env: this.buildEnv(config),
        prompt,
        timeoutMs,
        maxOutputBytes,
        abortSignal: callOptions?.abortSignal,
      });

      const events = this.parseEvents(runResult.stdout);
      const response = this.buildProviderResponse(events, runResult.stderr);
      const fail = (error: string): ProviderResponse => {
        delete response.output;
        return { ...response, error };
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
        const stderrSuffix = runResult.stderr ? `\n${truncateStderr(runResult.stderr)}` : '';
        const reason =
          runResult.exitCode === null && runResult.signal
            ? `was terminated by signal ${runResult.signal}`
            : `exited with code ${runResult.exitCode}`;
        return fail(`Pi ${reason}.${stderrSuffix}`);
      }

      const failure = events.find(
        (event) =>
          event?.type === 'response' && event.command === 'prompt' && event.success === false,
      );
      if (failure) {
        return fail(failure.error ?? 'Pi rejected the prompt');
      }
      if (!events.some((event) => event?.type === 'agent_settled')) {
        const stderrSuffix = runResult.stderr ? `\n${truncateStderr(runResult.stderr)}` : '';
        return fail(`Pi exited before completing the run.${stderrSuffix}`);
      }
      return response;
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
