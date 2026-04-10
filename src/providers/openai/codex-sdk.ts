import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { type Span, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import dedent from 'dedent';
import { z } from 'zod';
import cliState from '../../cliState';
import { getEnvString } from '../../envars';
import { getDirectory, importModule, resolvePackageEntryPoint } from '../../esm';
import logger from '../../logger';
import {
  type GenAISpanContext,
  type GenAISpanResult,
  getTraceparent,
  withGenAISpan,
} from '../../tracing/genaiTracer';
import { normalizeFieldName, REDACTED, sanitizeObject } from '../../util/sanitizer';
import { providerRegistry } from '../providerRegistry';

import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
  SkillCallEntry,
} from '../../types/index';

/**
 * OpenAI Codex SDK Provider
 *
 * This provider requires the @openai/codex-sdk package to be installed separately:
 *   npm install @openai/codex-sdk
 *
 * Key features:
 * - Supports API key auth or existing Codex/ChatGPT login state
 * - Thread-based conversations with persistence in ~/.codex/sessions
 * - Native JSON schema output with Zod support
 * - Git repository requirement for safety (can be disabled)
 * - Custom binary path override support
 * - Streaming events for real-time progress
 *
 * Thread Management:
 * - No persist_threads: Creates ephemeral thread per call (default)
 * - With persist_threads: Pools threads by prompt template + config cache key for reuse
 * - With thread_id: Resumes specific thread from ~/.codex/sessions
 */

/**
 * Sandbox modes controlling filesystem access
 */
export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

/**
 * Approval policies controlling when user approval is required
 */
export type ApprovalPolicy = 'never' | 'on-request' | 'on-failure' | 'untrusted';

/**
 * Reasoning effort levels for model reasoning intensity.
 *
 * Model support varies:
 * - gpt-5.4: 'minimal', 'low', 'medium', 'high', 'xhigh'
 * - gpt-5.4-pro: 'medium', 'high', 'xhigh'
 * - gpt-5.3-codex: 'low', 'medium', 'high', 'xhigh'
 * - gpt-5.3-codex-spark: 'low', 'medium', 'high'
 * - gpt-5.2 / gpt-5.2-codex: 'low', 'medium', 'high', 'xhigh'
 * - gpt-5.1-codex-max: 'low', 'medium', 'high', 'xhigh'
 * - gpt-5.1-codex/mini: 'low', 'medium', 'high'
 *
 * Values:
 * - 'minimal': Minimal reasoning overhead
 * - 'low': Light reasoning, faster responses
 * - 'medium': Balanced (default)
 * - 'high': Thorough reasoning for complex tasks
 * - 'xhigh': Maximum reasoning depth (gpt-5.4, gpt-5.2, gpt-5.1-codex-max)
 */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

/**
 * Web search modes controlling how the agent accesses the web.
 * - 'disabled': No web search
 * - 'cached': Use cached results only
 * - 'live': Allow live web searches
 */
export type WebSearchMode = 'disabled' | 'cached' | 'live';

/**
 * Multi-agent collaboration presets accepted by Codex CLI config.
 */
export type CollaborationMode = 'coding' | 'plan';

type CodexPromptInputItem =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'local_image';
      path: string;
    };

type CodexPromptInput = string | CodexPromptInputItem[];

interface CodexStreamingState {
  items: any[];
  usage: any;
  activeSpans: Map<string, Span>;
  itemStartTimes: Map<string, number>;
  lastEventTime: number;
  reasoningTexts: string[];
  conversationMessages: Array<{ role: string; content: string }>;
}

const MINIMAL_CLI_ENV_KEYS = [
  'PATH',
  'Path',
  'HOME',
  'USER',
  'USERNAME',
  'USERPROFILE',
  'TMPDIR',
  'TMP',
  'TEMP',
  'SHELL',
  'COMSPEC',
  'SystemRoot',
  'PATHEXT',
  'LANG',
  'LC_ALL',
  'TERM',
] as const;

const COMMON_OPTIONAL_PROCESS_ENV_KEYS = [
  'CODEX_HOME',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'REQUESTS_CA_BUNDLE',
  'NODE_EXTRA_CA_CERTS',
  'SSH_AUTH_SOCK',
  'GIT_SSH_COMMAND',
] as const;

export interface OpenAICodexSDKConfig {
  /**
   * Internal promptfoo config base path. Accepted for loader compatibility but not
   * forwarded to the Codex SDK constructor.
   */
  basePath?: string;

  /**
   * Internal prompt wrapper/provider metadata merged into prompt configs by promptfoo.
   * Accepted for compatibility but not forwarded to the Codex SDK constructor.
   */
  prefix?: string;
  suffix?: string;
  provider?: unknown;
  linkedTargetId?: string;

  apiKey?: string;

  /**
   * Custom base URL for API requests (for proxies)
   */
  base_url?: string;

  /**
   * Working directory for Codex to operate in
   * Defaults to process.cwd()
   */
  working_dir?: string;

  /**
   * Additional directories the agent can access beyond the working directory.
   * Maps to --add-dir flag in Codex CLI.
   */
  additional_directories?: string[];

  /**
   * Skip Git repository check (Codex requires Git by default)
   */
  skip_git_repo_check?: boolean;

  /**
   * Path to custom codex binary
   */
  codex_path_override?: string;

  /**
   * Model to use (e.g., 'gpt-5.4', 'gpt-5.3-codex', 'gpt-5.2-codex', 'gpt-5.1-codex-mini')
   */
  model?: string;

  /**
   * Sandbox access level controlling filesystem permissions
   * - 'read-only': Agent can only read files (safest)
   * - 'workspace-write': Agent can write to working directory (default)
   * - 'danger-full-access': Full filesystem access (use with caution)
   */
  sandbox_mode?: SandboxMode;

  /**
   * Model reasoning intensity. Support varies by model:
   * - 'minimal': Minimal reasoning overhead
   * - 'low': Light reasoning, faster responses
   * - 'medium': Balanced (default)
   * - 'high': Thorough reasoning for complex tasks
   * - 'xhigh': Maximum depth (gpt-5.2, gpt-5.1-codex-max only)
   */
  model_reasoning_effort?: ReasoningEffort;

  /**
   * Allow network requests
   */
  network_access_enabled?: boolean;

  /**
   * Allow web search (boolean shorthand)
   */
  web_search_enabled?: boolean;

  /**
   * Web search mode for finer-grained control.
   * - 'disabled': No web search
   * - 'cached': Use cached results only
   * - 'live': Allow live web searches
   *
   * Takes precedence over web_search_enabled if both are set.
   */
  web_search_mode?: WebSearchMode;

  /**
   * Multi-agent collaboration preset. This is mapped to
   * cli_config.collaboration_mode when constructing the SDK client.
   */
  collaboration_mode?: CollaborationMode;

  /**
   * When to require user approval
   * - 'never': Never require approval
   * - 'on-request': Require approval when requested
   * - 'on-failure': Require approval after failures
   * - 'untrusted': Require approval for untrusted operations
   */
  approval_policy?: ApprovalPolicy;

  /**
   * Thread management
   */
  thread_id?: string; // Resume existing thread
  persist_threads?: boolean; // Keep threads alive between calls
  thread_pool_size?: number; // Max concurrent threads

  /**
   * Output schema for structured JSON responses
   * Supports plain JSON schema or Zod schemas converted with zod-to-json-schema
   */
  output_schema?: Record<string, any>;

  /**
   * Environment variables to pass to Codex CLI
   * By default, Promptfoo passes a minimal shell environment plus provider credentials.
   * Set inherit_process_env: true to merge the full Node.js process environment.
   */
  cli_env?: Record<string, string | number | boolean>;

  /**
   * Merge process.env into the Codex CLI environment.
   * Defaults to false to avoid exposing unrelated process secrets to agent commands.
   */
  inherit_process_env?: boolean;

  /**
   * Enable streaming events (default: false for simplicity)
   */
  enable_streaming?: boolean;

  /**
   * Enable deep tracing of Codex CLI operations.
   * When enabled, injects OTEL environment variables so the Codex CLI
   * exports its internal spans to the local OTLP receiver.
   * Requires tracing.enabled and tracing.otlp.http.enabled in promptfooconfig.
   *
   * IMPORTANT: Deep tracing is INCOMPATIBLE with thread persistence.
   * When enabled, persist_threads, thread_id, and thread_pool_size are ignored
   * because the CLI process must be recreated for each call to get correct span linking.
   *
   * Default: false (only traces at provider level, not CLI internals)
   */
  deep_tracing?: boolean;

  /**
   * Additional CLI config overrides passed as --config key=value to the Codex CLI.
   * The SDK flattens the object into dotted paths and serializes values as TOML literals.
   *
   * Example: { collaboration_mode: 'coding', model_provider: { timeout: 30 } }
   *
   * @see https://developers.openai.com/codex/changelog/
   */
  cli_config?: Record<string, unknown>;
}

const CodexCliEnvValueSchema = z.union([z.string(), z.number(), z.boolean()]).transform(String);

const OpenAICodexSDKConfigShape = {
  basePath: z.string().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  provider: z.unknown().optional(),
  linkedTargetId: z.string().optional(),
  apiKey: z.string().min(1).optional(),
  base_url: z.string().min(1).optional(),
  working_dir: z.string().min(1).optional(),
  additional_directories: z.array(z.string().min(1)).optional(),
  skip_git_repo_check: z.boolean().optional(),
  codex_path_override: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  sandbox_mode: z.enum(['read-only', 'workspace-write', 'danger-full-access']).optional(),
  model_reasoning_effort: z.enum(['minimal', 'low', 'medium', 'high', 'xhigh']).optional(),
  network_access_enabled: z.boolean().optional(),
  web_search_enabled: z.boolean().optional(),
  web_search_mode: z.enum(['disabled', 'cached', 'live']).optional(),
  collaboration_mode: z.enum(['coding', 'plan']).optional(),
  approval_policy: z.enum(['never', 'on-request', 'on-failure', 'untrusted']).optional(),
  thread_id: z.string().min(1).optional(),
  persist_threads: z.boolean().optional(),
  thread_pool_size: z.number().int().positive().optional(),
  output_schema: z.record(z.string(), z.unknown()).optional(),
  cli_env: z.record(z.string(), CodexCliEnvValueSchema).optional(),
  inherit_process_env: z.boolean().optional(),
  enable_streaming: z.boolean().optional(),
  deep_tracing: z.boolean().optional(),
  cli_config: z.record(z.string(), z.unknown()).optional(),
} as const;

const OpenAICodexSDKConfigSchema = z.object(OpenAICodexSDKConfigShape).strict();
const OpenAICodexSDKMergedPromptConfigSchema = z.object(OpenAICodexSDKConfigShape).strip();

function parseCodexConfig(
  config: OpenAICodexSDKConfig | undefined,
  options: { stripUnknownKeys?: boolean } = {},
): OpenAICodexSDKConfig {
  const schema = options.stripUnknownKeys
    ? OpenAICodexSDKMergedPromptConfigSchema
    : OpenAICodexSDKConfigSchema;
  try {
    return schema.parse(config ?? {});
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((issue) => {
          const pathLabel = issue.path.length > 0 ? issue.path.join('.') : '(root)';
          return `${pathLabel}: ${issue.message}`;
        })
        .join('; ');
      throw new Error(`Invalid OpenAI Codex SDK config: ${issues}`);
    }

    throw error;
  }
}

function getMinimalProcessEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of MINIMAL_CLI_ENV_KEYS) {
    const value = process.env[key];
    if (typeof value === 'string' && value.length > 0) {
      env[key] = value;
    }
  }
  return env;
}

/**
 * Helper to load the OpenAI Codex SDK ESM module
 * Uses resolvePackageEntryPoint to handle ESM-only packages with restrictive exports
 */
async function loadCodexSDK(): Promise<any> {
  const basePaths = [
    cliState.basePath ? path.resolve(cliState.basePath) : undefined,
    process.cwd(),
    path.resolve(getDirectory(), '..'),
    path.resolve(getDirectory(), '../..'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  let codexPath: string | null = null;
  for (const basePath of new Set(basePaths)) {
    codexPath = resolvePackageEntryPoint('@openai/codex-sdk', basePath);
    if (codexPath) {
      break;
    }
  }

  if (!codexPath) {
    throw new Error(
      dedent`The @openai/codex-sdk package is required but not installed.

      To use the OpenAI Codex SDK provider, install it with:
        npm install @openai/codex-sdk

      Requires Node.js 20.20+ or 22.22+.

      For more information, see: https://www.promptfoo.dev/docs/providers/openai-codex-sdk/`,
    );
  }

  try {
    return await importModule(codexPath);
  } catch (err) {
    logger.error(`Failed to load OpenAI Codex SDK: ${err}`);
    if ((err as any).stack) {
      logger.error((err as any).stack);
    }
    throw new Error(
      dedent`Failed to load @openai/codex-sdk.

      The package was found but could not be loaded. This may be due to:
      - Incompatible Node.js version (requires Node.js 20.20+ or 22.22+)
      - Corrupted installation

      Try reinstalling:
        npm install @openai/codex-sdk

      For more information, see: https://www.promptfoo.dev/docs/providers/openai-codex-sdk/`,
    );
  }
}

// Pricing per 1M tokens
// See: https://openai.com/pricing
const CODEX_MODEL_PRICING: Record<string, { input: number; output: number; cache_read: number }> = {
  // GPT-5.4 models
  'gpt-5.4': { input: 2.5, output: 15.0, cache_read: 0.25 },
  // gpt-5.4-pro does not have discounted cached-input pricing.
  'gpt-5.4-pro': { input: 30.0, output: 180.0, cache_read: 30.0 },
  // GPT-5.3 Codex models
  'gpt-5.3-codex': { input: 1.75, output: 14.0, cache_read: 0.175 },
  'gpt-5.3-codex-spark': { input: 0.5, output: 4.0, cache_read: 0.05 },
  // GPT-5.2 models
  'gpt-5.2': { input: 1.75, output: 14.0, cache_read: 0.175 },
  'gpt-5.2-codex': { input: 1.75, output: 14.0, cache_read: 0.175 },
  // GPT-5.1 Codex models
  'gpt-5.1-codex': { input: 2.0, output: 8.0, cache_read: 0.2 },
  'gpt-5.1-codex-max': { input: 3.0, output: 12.0, cache_read: 0.3 },
  'gpt-5.1-codex-mini': { input: 0.5, output: 2.0, cache_read: 0.05 },
  // GPT-5 models
  'gpt-5-codex': { input: 2.0, output: 8.0, cache_read: 0.2 },
  'gpt-5-codex-mini': { input: 0.5, output: 2.0, cache_read: 0.05 },
  'gpt-5': { input: 2.0, output: 8.0, cache_read: 0.2 },
};

export class OpenAICodexSDKProvider implements ApiProvider {
  static OPENAI_MODELS = [
    // GPT-5.4 models
    'gpt-5.4',
    'gpt-5.4-pro',
    // GPT-5.3 Codex models
    'gpt-5.3-codex',
    'gpt-5.3-codex-spark',
    // GPT-5.2 models
    // Note: gpt-5.2-pro is not currently supported via Codex SDK.
    'gpt-5.2',
    'gpt-5.2-codex',
    // GPT-5.1 Codex models
    'gpt-5.1-codex',
    'gpt-5.1-codex-max',
    'gpt-5.1-codex-mini',
    // GPT-5 Codex models
    'gpt-5-codex',
    'gpt-5-codex-mini',
    // GPT-5 base
    'gpt-5',
  ];

  config: OpenAICodexSDKConfig;
  env?: EnvOverrides;
  apiKey?: string;

  private providerId = 'openai:codex-sdk';
  private codexModule?: any;
  private codexInstances: Map<string, any> = new Map();
  private threads: Map<string, any> = new Map();
  private threadRunQueues: Map<string, Promise<void>> = new Map();
  private deepTracingWarningShown = false; // Show warning once per instance
  private ignoredProviderEnvWarningShown = false;
  private omittedProcessEnvWarningShown = false;

  constructor(
    options: {
      id?: string;
      config?: OpenAICodexSDKConfig;
      env?: EnvOverrides;
    } = {},
  ) {
    const { config, env, id } = options;
    this.config = parseCodexConfig(config);
    this.env = env;
    this.apiKey = this.getApiKey();
    this.providerId = id ?? this.providerId;
    providerRegistry.register(this);

    if (this.config.model && !OpenAICodexSDKProvider.OPENAI_MODELS.includes(this.config.model)) {
      logger.warn(`Using unknown model for OpenAI Codex SDK: ${this.config.model}`);
    }
  }

  id(): string {
    return this.providerId;
  }

  getApiKey(config: OpenAICodexSDKConfig = this.config): string | undefined {
    return (
      config?.apiKey ||
      this.env?.OPENAI_API_KEY ||
      this.env?.CODEX_API_KEY ||
      getEnvString('OPENAI_API_KEY') ||
      getEnvString('CODEX_API_KEY')
    );
  }

  requiresApiKey(): boolean {
    return false;
  }

  toString(): string {
    return '[OpenAI Codex SDK Provider]';
  }

  /**
   * Safely tear down a Codex instance by calling its cleanup method
   * (destroy, cleanup, or close -- whichever is available).
   */
  private async destroyInstance(instance: any): Promise<void> {
    if (typeof instance.destroy === 'function') {
      await instance.destroy();
    } else if (typeof instance.cleanup === 'function') {
      await instance.cleanup();
    } else if (typeof instance.close === 'function') {
      await instance.close();
    }
  }

  async cleanup(): Promise<void> {
    // Clean up threads
    this.threads.clear();
    this.threadRunQueues.clear();

    // Clean up Codex instances to release resources (child processes, file handles)
    for (const instance of this.codexInstances.values()) {
      try {
        await this.destroyInstance(instance);
      } catch (error) {
        logger.warn('[CodexSDK] Error during cleanup', { error });
      }
    }
    this.codexInstances.clear();
  }

  async shutdown(): Promise<void> {
    try {
      await this.cleanup();
    } finally {
      providerRegistry.unregister(this);
    }
  }

  private prepareEnvironment(
    config: OpenAICodexSDKConfig,
    traceparent?: string,
    apiKey: string | undefined = this.getApiKey(config),
  ): Record<string, string> {
    const inheritProcessEnv = config.inherit_process_env === true;
    const cliEnv = Object.fromEntries(
      Object.entries(config.cli_env ?? {}).map(([key, value]) => [key, String(value)]),
    );
    const env: Record<string, string> = {
      ...(inheritProcessEnv ? (process.env as Record<string, string>) : getMinimalProcessEnv()),
      ...cliEnv,
    };

    const ignoredProviderEnvKeys = Object.keys(this.env ?? {})
      .filter(
        (key) =>
          key !== 'OPENAI_API_KEY' && key !== 'CODEX_API_KEY' && !(key in (config.cli_env ?? {})),
      )
      .sort();

    if (ignoredProviderEnvKeys.length > 0 && !this.ignoredProviderEnvWarningShown) {
      logger.warn(
        '[CodexSDK] Ignoring promptfoo-level env overrides for the Codex CLI process. ' +
          'Move these keys into config.cli_env if Codex shell commands need them.',
        { envKeys: ignoredProviderEnvKeys },
      );
      this.ignoredProviderEnvWarningShown = true;
    }

    if (!inheritProcessEnv && !this.omittedProcessEnvWarningShown) {
      const omittedProcessEnvKeys = this.getOmittedOptionalProcessEnvKeys(config, env);

      if (omittedProcessEnvKeys.length > 0) {
        logger.warn(
          '[CodexSDK] Optional Codex CLI process env vars are not inherited by default. ' +
            'Move these keys into config.cli_env or set inherit_process_env: true if Codex CLI commands need them.',
          { envKeys: omittedProcessEnvKeys },
        );
        this.omittedProcessEnvWarningShown = true;
      }
    }

    // Sort keys for stable cache key generation
    const sortedEnv: Record<string, string> = {};
    for (const key of Object.keys(env).sort()) {
      if (env[key] !== undefined) {
        sortedEnv[key] = env[key];
      }
    }

    // Inject only the resolved Codex/OpenAI API key from provider env/config.
    // Other promptfoo env overrides should be passed explicitly via cli_env so
    // unrelated secrets are not exposed to shell commands.
    if (apiKey) {
      sortedEnv.OPENAI_API_KEY = apiKey;
      sortedEnv.CODEX_API_KEY = apiKey;
    }

    // Inject OpenTelemetry configuration for deep tracing
    // This allows the Codex CLI to export its internal traces to our OTLP receiver
    // Without deep_tracing, we still capture spans at the provider level but don't
    // inject OTEL vars into CLI (which would cause export errors if no collector)
    if (config.deep_tracing) {
      // Standard OTEL environment variables - use defaults only if not already set
      if (!sortedEnv.OTEL_EXPORTER_OTLP_ENDPOINT) {
        sortedEnv.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:4318';
      }
      if (!sortedEnv.OTEL_EXPORTER_OTLP_PROTOCOL) {
        sortedEnv.OTEL_EXPORTER_OTLP_PROTOCOL = 'http/json';
      }
      if (!sortedEnv.OTEL_SERVICE_NAME) {
        sortedEnv.OTEL_SERVICE_NAME = 'codex-cli';
      }
      if (!sortedEnv.OTEL_TRACES_EXPORTER) {
        sortedEnv.OTEL_TRACES_EXPORTER = 'otlp';
      }
      // W3C Trace Context - only set if we have a traceparent for proper parent-child linking
      if (traceparent) {
        sortedEnv.TRACEPARENT = traceparent;
      }
      logger.debug('[CodexSDK] Injecting OTEL config for deep tracing', {
        traceparent: traceparent || '(none - CLI will start own trace)',
        endpoint: sortedEnv.OTEL_EXPORTER_OTLP_ENDPOINT,
        userConfigured: {
          endpoint: !!env.OTEL_EXPORTER_OTLP_ENDPOINT,
          protocol: !!env.OTEL_EXPORTER_OTLP_PROTOCOL,
          serviceName: !!env.OTEL_SERVICE_NAME,
        },
      });
    } else {
      // When deep_tracing is disabled, remove any inherited TRACEPARENT
      // to prevent accidental trace linking from parent processes
      delete sortedEnv.TRACEPARENT;
    }

    return sortedEnv;
  }

  private getOmittedOptionalProcessEnvKeys(
    config: OpenAICodexSDKConfig,
    env: Record<string, string>,
  ): string[] {
    const shouldWarnForSshEnv =
      config.network_access_enabled === true ||
      config.web_search_enabled === true ||
      config.web_search_mode === 'live';

    return COMMON_OPTIONAL_PROCESS_ENV_KEYS.filter(
      (key) =>
        typeof process.env[key] === 'string' &&
        !(key in env) &&
        (shouldWarnForSshEnv || (key !== 'SSH_AUTH_SOCK' && key !== 'GIT_SSH_COMMAND')),
    );
  }

  private getResolvedCliConfig(config: OpenAICodexSDKConfig): Record<string, unknown> | undefined {
    if (!config.cli_config && !config.collaboration_mode) {
      return undefined;
    }

    return {
      ...(config.cli_config ?? {}),
      ...(config.collaboration_mode ? { collaboration_mode: config.collaboration_mode } : {}),
    };
  }

  private getSkillRootPrefixes(env: Record<string, string>, workingDir?: string): string[] {
    const prefixes = new Set<string>();

    const addPrefix = (candidate?: string) => {
      if (!candidate) {
        return;
      }

      const normalized = candidate.replace(/\\/g, '/').replace(/\/+$/g, '');
      if (normalized) {
        prefixes.add(normalized);
      }
    };

    addPrefix(env.CODEX_HOME);
    // Codex's system skill root is documented as /etc/codex/skills.
    addPrefix('/etc/codex');

    if (workingDir) {
      const resolvedWorkingDir = path.resolve(workingDir).replace(/\\/g, '/');
      addPrefix(path.posix.join(resolvedWorkingDir, '.agents'));

      const gitRoot = this.findGitRepositoryRoot(resolvedWorkingDir);
      if (gitRoot) {
        addPrefix(path.posix.join(gitRoot.replace(/\\/g, '/'), '.agents'));
      }
    }

    const homeDir = env.HOME || env.USERPROFILE || process.env.HOME || process.env.USERPROFILE;
    if (homeDir) {
      addPrefix(path.posix.join(homeDir.replace(/\\/g, '/'), '.codex'));
    }

    return Array.from(prefixes);
  }

  private isValidCodexSkillName(name: string): boolean {
    return /^[A-Za-z0-9._:-]+$/.test(name);
  }

  private extractSkillPathCandidates(
    text: string,
    skillRootPrefixes: readonly string[] = [],
  ): Array<{ name: string; path: string }> {
    const matches = new Map<string, { name: string; path: string }>();

    for (const rawToken of text.split(/\s+/)) {
      const token = rawToken.replace(/^[`"'([{<]+|[`"',;:)\]}>]+$/g, '').trim();
      if (!token) {
        continue;
      }

      const normalizedPath = token.replace(/\\/g, '/');
      const repoMatch = normalizedPath.match(/^\.agents\/skills\/([^/\s]+)\/SKILL\.md$/);
      if (repoMatch) {
        if (this.isValidCodexSkillName(repoMatch[1])) {
          matches.set(normalizedPath, { name: repoMatch[1], path: normalizedPath });
        }
        continue;
      }

      const matchingRoot = skillRootPrefixes.find((prefix) =>
        normalizedPath.startsWith(`${prefix}/skills/`),
      );
      if (!matchingRoot) {
        continue;
      }

      const relativeSkillPath = normalizedPath.slice(matchingRoot.length + 1);
      const customRootMatch = relativeSkillPath.match(/^skills\/([^/\s]+)\/SKILL\.md$/);
      if (customRootMatch && this.isValidCodexSkillName(customRootMatch[1])) {
        matches.set(normalizedPath, { name: customRootMatch[1], path: normalizedPath });
      }
    }

    return Array.from(matches.values());
  }

  private extractSkillCallsFromItems(
    items: any[],
    skillRootPrefixes: readonly string[] = [],
    options: { requireSuccessfulCommand?: boolean } = {},
  ): SkillCallEntry[] {
    const skillCalls = new Map<
      string,
      {
        name: string;
        path: string;
      }
    >();

    for (const item of items) {
      if (item?.type !== 'command_execution') {
        continue;
      }
      if (options.requireSuccessfulCommand && !this.isSuccessfulCommandExecution(item)) {
        continue;
      }

      const command =
        typeof item.command === 'string' && item.command.trim() ? item.command : undefined;
      if (!command) {
        continue;
      }

      for (const skillPath of this.extractSkillPathCandidates(command, skillRootPrefixes)) {
        const existing = skillCalls.get(skillPath.path) ?? {
          name: skillPath.name,
          path: skillPath.path,
        };

        skillCalls.set(skillPath.path, existing);
      }
    }

    return Array.from(skillCalls.values()).map((skillCall) => ({
      name: skillCall.name,
      path: skillCall.path,
      source: 'heuristic',
    }));
  }

  private buildSkillMetadata(
    items: any[],
    skillRootPrefixes: readonly string[] = [],
  ): { attemptedSkillCalls: SkillCallEntry[]; skillCalls: SkillCallEntry[] } | undefined {
    if (!Array.isArray(items) || items.length === 0) {
      return undefined;
    }

    const attemptedSkillCalls = this.extractSkillCallsFromItems(items, skillRootPrefixes);
    const skillCalls = this.extractSkillCallsFromItems(items, skillRootPrefixes, {
      requireSuccessfulCommand: true,
    });

    if (skillCalls.length === 0 && attemptedSkillCalls.length <= skillCalls.length) {
      return undefined;
    }

    return { attemptedSkillCalls, skillCalls };
  }

  private isSuccessfulCommandExecution(item: any): boolean {
    if (item?.type !== 'command_execution') {
      return false;
    }

    if (typeof item.status === 'string' && item.status !== 'completed') {
      return false;
    }

    if (typeof item.exit_code === 'number' && item.exit_code !== 0) {
      return false;
    }

    return true;
  }

  private validateWorkingDirectory(workingDir: string, skipGitCheck: boolean = false): void {
    let stats: fs.Stats;
    try {
      stats = fs.statSync(workingDir);
    } catch (err: any) {
      throw new Error(
        `Working directory ${workingDir} does not exist or isn't accessible: ${err.message}`,
      );
    }

    if (!stats.isDirectory()) {
      throw new Error(`Working directory ${workingDir} is not a directory`);
    }

    if (!skipGitCheck && !this.isInsideGitRepository(workingDir)) {
      throw new Error(
        dedent`Working directory ${workingDir} is not inside a Git repository.

        Codex requires a Git repository by default to prevent unrecoverable errors.

        To bypass this check, set skip_git_repo_check: true in your provider config.`,
      );
    }
  }

  private isInsideGitRepository(workingDir: string): boolean {
    return this.findGitRepositoryRoot(workingDir) !== undefined;
  }

  private findGitRepositoryRoot(workingDir: string): string | undefined {
    let currentDir = path.resolve(workingDir);

    while (true) {
      if (fs.existsSync(path.join(currentDir, '.git'))) {
        return currentDir;
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        return undefined;
      }
      currentDir = parentDir;
    }
  }

  /**
   * Build Codex constructor options from provider config.
   * Used when creating both local (deep-tracing) and cached instances.
   */
  private buildCodexOptions(
    env: Record<string, string>,
    config: OpenAICodexSDKConfig,
    apiKey: string | undefined = this.getApiKey(config),
  ): Record<string, any> {
    const cliConfig = this.getResolvedCliConfig(config);

    return {
      env,
      ...(apiKey ? { apiKey } : {}),
      ...(config.codex_path_override ? { codexPathOverride: config.codex_path_override } : {}),
      ...(config.base_url ? { baseUrl: config.base_url } : {}),
      ...(cliConfig ? { config: cliConfig } : {}),
    };
  }

  private buildThreadOptions(config: OpenAICodexSDKConfig): Record<string, any> {
    return {
      workingDirectory: config.working_dir,
      skipGitRepoCheck: config.skip_git_repo_check ?? false,
      ...(config.model ? { model: config.model } : {}),
      ...(config.additional_directories?.length
        ? { additionalDirectories: config.additional_directories }
        : {}),
      ...(config.sandbox_mode ? { sandboxMode: config.sandbox_mode } : {}),
      ...(config.model_reasoning_effort
        ? { modelReasoningEffort: config.model_reasoning_effort }
        : {}),
      ...(config.network_access_enabled === undefined
        ? {}
        : { networkAccessEnabled: config.network_access_enabled }),
      ...(config.web_search_mode ? { webSearchMode: config.web_search_mode } : {}),
      ...(config.web_search_enabled !== undefined && !config.web_search_mode
        ? { webSearchEnabled: config.web_search_enabled }
        : {}),
      ...(config.approval_policy ? { approvalPolicy: config.approval_policy } : {}),
    };
  }

  private async getOrCreateThread(
    config: OpenAICodexSDKConfig,
    cacheKey: string | undefined,
    instanceKey: string,
    instance: any,
  ): Promise<any> {
    const threadOptions = this.buildThreadOptions(config);

    // When deep_tracing is enabled, skip all thread caching/persistence
    // Each call needs a fresh thread for correct span linking
    if (config.deep_tracing) {
      return instance.startThread(threadOptions);
    }

    // Resume specific thread
    if (config.thread_id) {
      const threadIdCacheKey = `${instanceKey}:${config.thread_id}`;
      const cached = this.threads.get(threadIdCacheKey);
      if (cached) {
        return cached;
      }

      const thread = instance.resumeThread(config.thread_id, threadOptions);
      if (config.persist_threads) {
        this.threads.set(threadIdCacheKey, thread);
      }
      return thread;
    }

    // Use pooled thread
    if (config.persist_threads && cacheKey) {
      const cached = this.threads.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Enforce pool size limit
      const poolSize = config.thread_pool_size ?? 1;
      if (this.threads.size >= poolSize) {
        const oldestKey = this.threads.keys().next().value;
        if (oldestKey) {
          this.threads.delete(oldestKey);
        }
      }
    }

    // Create new thread
    const thread = instance.startThread(threadOptions);

    if (config.persist_threads && cacheKey) {
      this.threads.set(cacheKey, thread);
    }

    return thread;
  }

  private async runStreaming(
    thread: any,
    prompt: CodexPromptInput,
    runOptions: any,
    callOptions?: CallApiOptionsParams,
    skillRootPrefixes: readonly string[] = [],
  ): Promise<any> {
    const { events } = await thread.runStreamed(prompt, runOptions);
    const tracer = trace.getTracer('promptfoo.codex-sdk');
    const state = this.createCodexStreamingState(prompt);

    try {
      for await (const event of events) {
        const eventTime = Date.now();
        if (callOptions?.abortSignal?.aborted) {
          throw this.createAbortError('OpenAI Codex SDK call aborted');
        }

        this.handleStreamingEvent(event, state, tracer, eventTime, skillRootPrefixes);
        state.lastEventTime = eventTime;
      }
    } finally {
      this.endUnclosedStreamingSpans(state);
    }

    return this.buildStreamingTurnResult(state);
  }

  private createCodexStreamingState(prompt: CodexPromptInput): CodexStreamingState {
    return {
      items: [],
      usage: undefined,
      activeSpans: new Map(),
      itemStartTimes: new Map(),
      lastEventTime: Date.now(),
      reasoningTexts: [],
      conversationMessages: [
        {
          role: 'user',
          content: this.formatPromptInputForTrace(prompt),
        },
      ],
    };
  }

  private handleStreamingEvent(
    event: any,
    state: CodexStreamingState,
    tracer: ReturnType<typeof trace.getTracer>,
    eventTime: number,
    skillRootPrefixes: readonly string[],
  ): void {
    switch (event.type) {
      case 'item.started':
        this.handleStreamingItemStarted(event, state, tracer, eventTime);
        return;
      case 'item.completed':
        this.handleStreamingItemCompleted(event, state, tracer, eventTime, skillRootPrefixes);
        return;
      case 'item.updated':
        this.handleStreamingItemUpdated(event, state, skillRootPrefixes);
        return;
      case 'turn.completed':
        state.usage = event.usage;
        logger.debug('Codex turn completed', { usage: state.usage });
        return;
      case 'turn.failed': {
        const errorMsg = event.error?.message || 'Turn failed';
        logger.error('Codex turn failed', { error: errorMsg });
        throw new Error(`Codex turn failed: ${errorMsg}`);
      }
      case 'error': {
        const errorMsg =
          typeof event.message === 'string' && event.message ? event.message : 'Stream failed';
        logger.error('Codex stream error', { error: errorMsg });
        throw new Error(`Codex stream error: ${errorMsg}`);
      }
      case 'thread.started':
      case 'turn.started':
        return;
      default:
        logger.debug('Codex unknown event type', { type: event.type });
    }
  }

  private handleStreamingItemStarted(
    event: any,
    state: CodexStreamingState,
    tracer: ReturnType<typeof trace.getTracer>,
    eventTime: number,
  ): void {
    const item = event.item;
    if (!item) {
      logger.warn('Codex item.started event missing item', { event });
      return;
    }
    if (!item.id) {
      logger.debug('Codex item.started without id, will create span at completion', {
        type: item.type,
      });
      return;
    }

    const itemId = String(item.id);
    const span = this.startStreamingItemSpan(tracer, item, itemId);
    state.activeSpans.set(itemId, span);
    state.itemStartTimes.set(itemId, eventTime);
    logger.debug('Codex item started', { itemId, type: item.type });
  }

  private handleStreamingItemCompleted(
    event: any,
    state: CodexStreamingState,
    tracer: ReturnType<typeof trace.getTracer>,
    eventTime: number,
    skillRootPrefixes: readonly string[],
  ): void {
    const item = event.item;
    if (!item) {
      logger.warn('Codex item.completed event missing item', { event });
      return;
    }

    const itemId = item.id ? String(item.id) : crypto.randomUUID();
    state.items.push(item);
    this.collectStreamingItemText(item, state);

    const span =
      state.activeSpans.get(itemId) ??
      this.startStreamingItemSpan(tracer, item, itemId, state.lastEventTime);
    const hadStartEvent = state.activeSpans.has(itemId);
    const startTime = state.itemStartTimes.get(itemId) ?? state.lastEventTime;
    const durationMs = eventTime - startTime;
    this.applyStreamingCompletionAttributes(
      span,
      item,
      skillRootPrefixes,
      eventTime,
      startTime,
      hadStartEvent,
    );

    span.end();
    state.activeSpans.delete(itemId);
    state.itemStartTimes.delete(itemId);
    logger.debug('Codex item completed', {
      itemId,
      type: item.type,
      durationMs,
    });
  }

  private handleStreamingItemUpdated(
    event: any,
    state: CodexStreamingState,
    skillRootPrefixes: readonly string[],
  ): void {
    const item = event.item;
    if (item?.id) {
      const itemId = String(item.id);
      const span = state.activeSpans.get(itemId);
      if (span) {
        this.setStreamingCompletionAttributes(span, item, skillRootPrefixes);
      }
    }
    logger.debug('Codex item updated', { itemId: item?.id, type: item?.type });
  }

  private startStreamingItemSpan(
    tracer: ReturnType<typeof trace.getTracer>,
    item: any,
    itemId: string,
    startTime?: number,
  ): Span {
    return tracer.startSpan(this.getSpanNameForItem(item), {
      kind: SpanKind.INTERNAL,
      ...(startTime === undefined ? {} : { startTime }),
      attributes: {
        'codex.item.id': itemId,
        'codex.item.type': item.type,
        ...(startTime === undefined ? {} : { 'codex.timing.estimated': true }),
        ...this.getAttributesForItem(item),
      },
    });
  }

  private collectStreamingItemText(item: any, state: CodexStreamingState): void {
    if (item.type === 'reasoning' && typeof item.text === 'string') {
      const sanitizedReasoning = this.sanitizeTraceText(item.text, 'Codex reasoning trace event');
      if (sanitizedReasoning) {
        state.reasoningTexts.push(sanitizedReasoning);
      }
    }

    if (item.type === 'agent_message' && typeof item.text === 'string') {
      state.conversationMessages.push({
        role: 'assistant',
        content: this.sanitizeTraceText(item.text, 'Codex agent message trace event') ?? '',
      });
    }
  }

  private applyStreamingCompletionAttributes(
    span: Span,
    item: any,
    skillRootPrefixes: readonly string[],
    eventTime: number,
    startTime: number,
    hadStartEvent: boolean,
  ): void {
    this.setStreamingCompletionAttributes(span, item, skillRootPrefixes);
    span.setAttribute('codex.duration_ms', eventTime - startTime);
    span.setAttribute('codex.had_start_event', hadStartEvent);
    this.addStreamingSpanEvents(span, item);
    this.setStreamingSpanStatus(span, item);
  }

  private setStreamingCompletionAttributes(
    span: Span,
    item: any,
    skillRootPrefixes: readonly string[],
  ): void {
    const completionAttrs = this.getCompletionAttributesForItem(item, skillRootPrefixes);
    for (const [key, value] of Object.entries(completionAttrs)) {
      span.setAttribute(key, value);
    }
  }

  private addStreamingSpanEvents(span: Span, item: any): void {
    if (item.type === 'reasoning' && typeof item.text === 'string') {
      span.addEvent('reasoning', {
        'codex.reasoning.text':
          this.sanitizeTraceText(item.text, 'Codex reasoning span event') ?? '',
      });
    }

    if (item.type === 'agent_message' && typeof item.text === 'string') {
      span.addEvent('message', {
        'codex.message.text':
          this.sanitizeTraceText(item.text, 'Codex agent message span event') ?? '',
      });
    }

    if (item.type === 'command_execution' && typeof item.aggregated_output === 'string') {
      span.addEvent('output', {
        'codex.command.output':
          this.sanitizeTraceText(item.aggregated_output, 'Codex command output span event') ?? '',
      });
    }
  }

  private setStreamingSpanStatus(span: Span, item: any): void {
    if (!this.isStreamingItemError(item)) {
      span.setStatus({ code: SpanStatusCode.OK });
      return;
    }

    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: this.getStreamingItemErrorMessage(item),
    });
  }

  private isStreamingItemError(item: any): boolean {
    return (
      item.status === 'failed' ||
      item.type === 'error' ||
      item.error !== undefined ||
      (item.type === 'command_execution' &&
        typeof item.exit_code === 'number' &&
        item.exit_code !== 0)
    );
  }

  private getStreamingItemErrorMessage(item: any): string {
    return (
      (typeof item.message === 'string' ? item.message : null) ||
      (typeof item.error?.message === 'string' ? item.error.message : null) ||
      (item.type === 'command_execution' && item.exit_code !== 0
        ? `Command exited with code ${item.exit_code}`
        : null) ||
      'Item failed'
    );
  }

  private endUnclosedStreamingSpans(state: CodexStreamingState): void {
    for (const [itemId, span] of state.activeSpans) {
      logger.warn('Codex item span not properly closed', { itemId });
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Span not properly closed' });
      span.end();
    }
    state.activeSpans.clear();
    state.itemStartTimes.clear();
  }

  private buildStreamingTurnResult(state: CodexStreamingState): {
    finalResponse: string;
    items: any[];
    usage: any;
    reasoningTexts: string[];
    conversationMessages: Array<{ role: string; content: string }>;
  } {
    const agentMessages = state.items.filter((item) => item.type === 'agent_message');
    return {
      finalResponse:
        agentMessages.length > 0 ? agentMessages.map((item) => item.text).join('\n') : '',
      items: state.items,
      usage: state.usage,
      reasoningTexts: state.reasoningTexts,
      conversationMessages: state.conversationMessages,
    };
  }

  private parsePromptInput(prompt: string): CodexPromptInput {
    let parsedPrompt: unknown;
    try {
      parsedPrompt = JSON.parse(prompt);
    } catch {
      return prompt;
    }

    if (
      !Array.isArray(parsedPrompt) ||
      parsedPrompt.length === 0 ||
      !parsedPrompt.every((item): item is CodexPromptInputItem => this.isCodexPromptInputItem(item))
    ) {
      return prompt;
    }

    return parsedPrompt;
  }

  private isCodexPromptInputItem(item: unknown): item is CodexPromptInputItem {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return false;
    }

    const keys = Object.keys(item);

    if ('type' in item && item.type === 'text') {
      return (
        keys.length === 2 &&
        keys.includes('type') &&
        'text' in item &&
        typeof item.text === 'string'
      );
    }

    if ('type' in item && item.type === 'local_image') {
      return (
        keys.length === 2 &&
        keys.includes('type') &&
        'path' in item &&
        typeof item.path === 'string'
      );
    }

    return false;
  }

  private formatPromptInputForTrace(prompt: CodexPromptInput): string {
    if (typeof prompt === 'string') {
      return prompt;
    }

    return prompt
      .map((item) => (item.type === 'text' ? item.text : `[local_image: ${item.path}]`))
      .join('\n');
  }

  /**
   * Get a descriptive span name for a Codex item
   */
  private getSpanNameForItem(item: any): string {
    switch (item.type) {
      case 'command_execution': {
        const cmd =
          typeof item.command === 'string' ? item.command.split(' ')[0] || 'command' : 'command';
        return `exec ${cmd}`;
      }
      case 'file_change':
        return `file ${item.changes?.[0]?.kind || 'change'}`;
      case 'mcp_tool_call': {
        const server = typeof item.server === 'string' ? item.server : 'unknown';
        const tool = typeof item.tool === 'string' ? item.tool : 'unknown';
        return `mcp ${server}/${tool}`;
      }
      case 'agent_message':
        return 'agent response';
      case 'reasoning':
        return 'reasoning';
      case 'web_search': {
        const query =
          typeof item.query === 'string'
            ? (this.sanitizeTraceText(item.query, 'Codex web search span name') ?? '').slice(0, 30)
            : '';
        return `search "${query}"`;
      }
      case 'todo_list':
        return 'todo update';
      case 'error':
        return 'error';
      // Collaboration mode item types
      case 'collaboration_tool_call': {
        const tool = typeof item.tool === 'string' ? item.tool : 'unknown';
        return `collab ${tool}`;
      }
      case 'spawn_agent': {
        const role = typeof item.role === 'string' ? item.role : 'agent';
        return `spawn ${role}`;
      }
      case 'send_input':
        return 'send input';
      case 'agent_wait':
        return 'wait';
      default:
        return `codex.${item.type || 'unknown'}`;
    }
  }

  /**
   * Get attributes for a Codex item at start
   */
  private getSkillTraceAttributes(
    item: any,
    skillRootPrefixes: readonly string[] = [],
    options: { requireSuccessfulCommand?: boolean } = {},
  ): Record<string, string | number | boolean> {
    if (item?.type !== 'command_execution') {
      return {};
    }
    if (options.requireSuccessfulCommand && !this.isSuccessfulCommandExecution(item)) {
      return {};
    }

    const command =
      typeof item.command === 'string' && item.command.trim() ? item.command : undefined;
    const skillCandidates = new Map<string, { name: string; path: string }>();

    if (command) {
      for (const skill of this.extractSkillPathCandidates(command, skillRootPrefixes)) {
        skillCandidates.set(skill.path, skill);
      }
    }

    if (skillCandidates.size === 0) {
      return {};
    }

    const skills = Array.from(skillCandidates.values());
    const attrs: Record<string, string | number | boolean> = {
      'promptfoo.skill.count': skills.length,
      'promptfoo.skill.names': skills.map((skill) => skill.name).join(','),
      'promptfoo.skill.paths': skills.map((skill) => skill.path).join(','),
    };

    if (skills.length === 1) {
      attrs['promptfoo.skill.name'] = skills[0].name;
      attrs['promptfoo.skill.path'] = skills[0].path;
    }

    return attrs;
  }

  private getAttributesForItem(item: any): Record<string, string | number | boolean> {
    const attrs: Record<string, string | number | boolean> = {};

    switch (item.type) {
      case 'command_execution':
        if (typeof item.command === 'string') {
          attrs['codex.command'] =
            this.sanitizeTraceText(item.command, 'Codex command trace attribute') ?? '';
        }
        break;
      case 'mcp_tool_call':
        if (typeof item.server === 'string') {
          attrs['codex.mcp.server'] = item.server;
        }
        if (typeof item.tool === 'string') {
          attrs['codex.mcp.tool'] = item.tool;
        }
        {
          const serializedArgs = this.serializeItemValue(item.arguments ?? item.args ?? item.input);
          if (serializedArgs) {
            attrs['codex.mcp.input'] = serializedArgs;
          }
        }
        break;
      case 'web_search':
        if (typeof item.query === 'string') {
          attrs['codex.search.query'] =
            this.sanitizeTraceText(item.query, 'Codex web search query trace attribute') ?? '';
        }
        break;
      // Collaboration mode attributes
      case 'collaboration_tool_call':
        if (typeof item.tool === 'string') {
          attrs['codex.collab.tool'] = item.tool;
        }
        if (typeof item.target_thread_id === 'string') {
          attrs['codex.collab.target_thread'] = item.target_thread_id;
        }
        break;
      case 'spawn_agent':
        if (typeof item.role === 'string') {
          attrs['codex.collab.role'] = item.role;
        }
        if (typeof item.thread_id === 'string') {
          attrs['codex.collab.spawned_thread'] = item.thread_id;
        }
        break;
      case 'send_input':
        if (typeof item.target_thread_id === 'string') {
          attrs['codex.collab.target_thread'] = item.target_thread_id;
        }
        break;
    }

    return attrs;
  }

  private serializeItemValue(value: unknown): string | undefined {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }

      try {
        return JSON.stringify(this.redactTracePii(sanitizeObject(JSON.parse(trimmed))));
      } catch {
        return this.redactTracePii(
          sanitizeObject(trimmed, { context: 'Codex MCP trace input' }),
        ) as string;
      }
    }

    if (value === undefined || value === null) {
      return undefined;
    }

    try {
      return JSON.stringify(
        this.redactTracePii(sanitizeObject(value, { context: 'Codex MCP trace input' })),
      );
    } catch {
      return undefined;
    }
  }

  private sanitizeTraceText(value: string, context: string): string | undefined {
    const sanitized = this.redactTracePii(sanitizeObject(value, { context }));

    if (typeof sanitized === 'string') {
      return sanitized;
    }

    if (sanitized === undefined || sanitized === null) {
      return undefined;
    }

    try {
      return JSON.stringify(sanitized);
    } catch {
      return undefined;
    }
  }

  private redactTracePii(value: unknown): unknown {
    if (typeof value === 'string') {
      return value
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED)
        .replace(
          /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{35}|Bearer\s+[A-Za-z0-9._~+/-]{20,}|Basic\s+[A-Za-z0-9+/=]{20,})\b/g,
          REDACTED,
        )
        .replace(
          /\b(api[_-]?key|token|password|secret|authorization|auth)\s*([=:])(\s*)(["']?)[^\s"'`]+(\4)/gi,
          (_match, key, separator, spacing, quote) =>
            `${key}${separator}${spacing}${quote}${REDACTED}${quote}`,
        );
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.redactTracePii(item));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
          key,
          normalizeFieldName(key).includes('email') ? REDACTED : this.redactTracePii(entryValue),
        ]),
      );
    }

    return value;
  }

  /**
   * Get attributes for a Codex item at completion
   */
  private getCompletionAttributesForItem(
    item: any,
    skillRootPrefixes: readonly string[] = [],
  ): Record<string, string | number | boolean> {
    const attrs: Record<string, string | number | boolean> = {};

    switch (item.type) {
      case 'command_execution':
        if (typeof item.exit_code === 'number') {
          attrs['codex.exit_code'] = item.exit_code;
        }
        if (typeof item.status === 'string') {
          attrs['codex.status'] = item.status;
        }
        if (typeof item.aggregated_output === 'string') {
          attrs['codex.output'] =
            this.sanitizeTraceText(
              item.aggregated_output,
              'Codex command output trace attribute',
            ) ?? '';
        }
        Object.assign(
          attrs,
          this.getSkillTraceAttributes(item, skillRootPrefixes, {
            requireSuccessfulCommand: true,
          }),
        );
        break;
      case 'file_change':
        if (typeof item.status === 'string') {
          attrs['codex.status'] = item.status;
        }
        if (Array.isArray(item.changes) && item.changes.length) {
          attrs['codex.files_changed'] = item.changes.length;
          attrs['codex.files'] = item.changes
            .map((c: any) => (typeof c?.path === 'string' ? c.path : ''))
            .filter(Boolean)
            .join(', ');
        }
        break;
      case 'mcp_tool_call':
        if (typeof item.status === 'string') {
          attrs['codex.status'] = item.status;
        }
        if (typeof item.error?.message === 'string') {
          attrs['codex.error'] =
            this.sanitizeTraceText(item.error.message, 'Codex MCP error trace attribute') ?? '';
        }
        {
          const serializedArgs = this.serializeItemValue(item.arguments ?? item.args ?? item.input);
          if (serializedArgs) {
            attrs['codex.mcp.input'] = serializedArgs;
          }
        }
        break;
      case 'agent_message':
        if (typeof item.text === 'string') {
          attrs['codex.message'] =
            this.sanitizeTraceText(item.text, 'Codex agent message trace attribute') ?? '';
        }
        break;
      case 'reasoning':
        if (typeof item.text === 'string') {
          attrs['codex.reasoning'] =
            this.sanitizeTraceText(item.text, 'Codex reasoning trace attribute') ?? '';
        }
        break;
      case 'error':
        if (typeof item.message === 'string') {
          attrs['codex.error'] =
            this.sanitizeTraceText(item.message, 'Codex error trace attribute') ?? '';
        }
        break;
    }

    return attrs;
  }

  private generateInstanceKey(env: Record<string, string>, config: OpenAICodexSDKConfig): string {
    const keyData = {
      env,
      base_url: config.base_url,
      cli_config: this.getResolvedCliConfig(config),
      codex_path_override: config.codex_path_override,
    };

    const hash = crypto.createHash('sha256').update(JSON.stringify(keyData)).digest('hex');
    return `openai:codex-sdk:instance:${hash}`;
  }

  private generateCacheKey(
    config: OpenAICodexSDKConfig,
    prompt: string,
    instanceKey: string,
  ): string {
    const keyData = {
      instanceKey,
      working_dir: config.working_dir,
      additional_directories: config.additional_directories,
      model: config.model,
      output_schema: config.output_schema,
      sandbox_mode: config.sandbox_mode,
      model_reasoning_effort: config.model_reasoning_effort,
      network_access_enabled: config.network_access_enabled,
      web_search_enabled: config.web_search_enabled,
      web_search_mode: config.web_search_mode,
      approval_policy: config.approval_policy,
      prompt,
    };

    const hash = crypto.createHash('sha256').update(JSON.stringify(keyData)).digest('hex');
    return `openai:codex-sdk:${hash}`;
  }

  private getThreadRunQueueKey(
    config: OpenAICodexSDKConfig,
    cacheKey: string | undefined,
    instanceKey: string,
  ): string | undefined {
    if (config.deep_tracing) {
      return undefined;
    }

    if (config.thread_id) {
      return `${instanceKey}:${config.thread_id}`;
    }

    if (config.persist_threads && cacheKey) {
      return cacheKey;
    }

    return undefined;
  }

  private async runSerializedThreadTurn<T>(
    queueKey: string | undefined,
    abortSignal: AbortSignal | undefined,
    executeTurn: () => Promise<T>,
  ): Promise<T> {
    if (!queueKey) {
      return executeTurn();
    }

    const previousRun = this.threadRunQueues.get(queueKey) ?? Promise.resolve();
    let releaseCurrentRun: () => void = () => {};
    const currentRun = new Promise<void>((resolve) => {
      releaseCurrentRun = resolve;
    });
    const queuedRun = previousRun.catch(() => undefined).then(() => currentRun);
    this.threadRunQueues.set(queueKey, queuedRun);
    void queuedRun.finally(() => {
      if (this.threadRunQueues.get(queueKey) === queuedRun) {
        this.threadRunQueues.delete(queueKey);
      }
    });

    try {
      await this.waitForPreviousThreadRun(previousRun, abortSignal);
      return await executeTurn();
    } finally {
      releaseCurrentRun();
    }
  }

  private async waitForPreviousThreadRun(
    previousRun: Promise<void>,
    abortSignal: AbortSignal | undefined,
  ): Promise<void> {
    const previousRunDone = previousRun.catch(() => undefined);

    if (!abortSignal) {
      await previousRunDone;
      return;
    }

    if (abortSignal.aborted) {
      throw this.createAbortError('Codex thread turn wait aborted');
    }

    let onAbort: (() => void) | undefined;
    const abortPromise = new Promise<void>((_, reject) => {
      onAbort = () => reject(this.createAbortError('Codex thread turn wait aborted'));
      abortSignal.addEventListener('abort', onAbort, { once: true });
    });

    try {
      await Promise.race([previousRunDone, abortPromise]);
    } finally {
      if (onAbort) {
        abortSignal.removeEventListener('abort', onAbort);
      }
    }
  }

  private createAbortError(message: string): Error {
    const error = new Error(message);
    error.name = 'AbortError';
    return error;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Merge configs (prompt config takes precedence)
    const config: OpenAICodexSDKConfig = {
      ...this.config,
      ...context?.prompt?.config,
    };

    const requestedModel =
      typeof config.model === 'string' && config.model ? config.model : undefined;

    // Wrap the API call in a GenAI span
    // withGenAISpan handles both exceptions and { error: ... } responses
    return withGenAISpan(
      this.buildCodexSpanContext(prompt, context, requestedModel),
      () => this.callApiInternal(prompt, context, callOptions, config),
      (response) => this.extractCodexSpanResult(response, requestedModel),
    );
  }

  private buildCodexSpanContext(
    prompt: string,
    context: CallApiContextParams | undefined,
    requestedModel: string | undefined,
  ): GenAISpanContext {
    return {
      system: 'openai',
      operationName: 'chat',
      model: requestedModel ?? 'codex',
      providerId: this.id(),
      evalId: context?.evaluationId || context?.test?.metadata?.evaluationId,
      testIndex:
        typeof context?.test?.vars?.__testIdx === 'number'
          ? context.test.vars.__testIdx
          : undefined,
      promptLabel: context?.prompt?.label,
      traceparent: context?.traceparent,
      requestBody: prompt,
    };
  }

  private extractCodexSpanResult(
    response: ProviderResponse,
    requestedModel: string | undefined,
  ): GenAISpanResult {
    const result: GenAISpanResult = {};

    if (response.tokenUsage) {
      result.tokenUsage = response.tokenUsage;
    }
    if (response.sessionId) {
      result.responseId = response.sessionId;
    }
    if (response.cached !== undefined) {
      result.cacheHit = response.cached;
    }
    if (requestedModel) {
      result.responseModel = requestedModel;
    }

    this.setCodexSpanResponseBody(result, response.output);
    this.setCodexSpanRawAttributes(result, response.raw);

    return result;
  }

  private setCodexSpanResponseBody(result: GenAISpanResult, output: unknown): void {
    if (output === undefined) {
      return;
    }

    try {
      result.responseBody = typeof output === 'string' ? output : JSON.stringify(output);
    } catch {
      result.responseBody = '[unable to serialize output]';
    }
  }

  private setCodexSpanRawAttributes(result: GenAISpanResult, raw: ProviderResponse['raw']): void {
    if (!raw) {
      return;
    }

    try {
      const rawData = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (rawData.reasoningTexts?.length > 0) {
        result.additionalAttributes = {
          ...result.additionalAttributes,
          'codex.reasoning.count': rawData.reasoningTexts.length,
          'codex.reasoning.summary': rawData.reasoningTexts.join('\n---\n').slice(0, 2000),
        };
      }
      if (rawData.conversationMessages?.length > 0) {
        result.additionalAttributes = {
          ...result.additionalAttributes,
          'codex.conversation.message_count': rawData.conversationMessages.length,
        };
      }
      if (rawData.items?.length > 0) {
        result.additionalAttributes = {
          ...result.additionalAttributes,
          'codex.items.total': rawData.items.length,
          'codex.items.breakdown': JSON.stringify(this.getCodexItemCounts(rawData.items)),
        };
      }
    } catch {
      // Ignore parse errors
    }
  }

  private getCodexItemCounts(items: any[]): Record<string, number> {
    const itemCounts: Record<string, number> = {};
    for (const item of items) {
      itemCounts[item.type] = (itemCounts[item.type] || 0) + 1;
    }
    return itemCounts;
  }

  /**
   * Internal implementation of callApi without tracing wrapper.
   * Context is available for future use (e.g., _context?.vars for template rendering,
   * _context?.bustCache for cache control, _context?.debug for debug mode).
   */
  private async callApiInternal(
    prompt: string,
    context: CallApiContextParams | undefined,
    callOptions: CallApiOptionsParams | undefined,
    rawConfig: OpenAICodexSDKConfig,
  ): Promise<ProviderResponse> {
    let config: OpenAICodexSDKConfig;
    try {
      config = parseCodexConfig(rawConfig, { stripUnknownKeys: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error calling OpenAI Codex SDK', { error: errorMessage });
      return { error: `Error calling OpenAI Codex SDK: ${errorMessage}` };
    }

    // Get current trace context for deep tracing
    // This allows the Codex CLI to export its internal spans as children of our span
    const currentTraceparent = getTraceparent();
    const apiKey = this.getApiKey(config);
    const workingDirectory = config.working_dir ?? process.cwd();
    const resolvedConfig: OpenAICodexSDKConfig = {
      ...config,
      working_dir: workingDirectory,
    };

    // Prepare environment with OTEL config for deep tracing
    const env: Record<string, string> = this.prepareEnvironment(
      resolvedConfig,
      currentTraceparent,
      apiKey,
    );
    const skillRootPrefixes = this.getSkillRootPrefixes(env, resolvedConfig.working_dir);
    const promptInput = this.parsePromptInput(prompt);

    if (apiKey) {
      logger.debug('[CodexSDK] Using explicit API credentials from promptfoo config/environment');
    } else {
      logger.debug(
        '[CodexSDK] No explicit API credentials configured; deferring auth resolution to Codex SDK login state',
      );
    }

    // Check abort signal
    if (callOptions?.abortSignal?.aborted) {
      return { error: 'OpenAI Codex SDK call aborted before it started' };
    }

    let localInstance: any = undefined;
    let useLocalInstance = false;
    let cacheKey: string | undefined = undefined;

    // Execute turn
    try {
      this.validateWorkingDirectory(
        resolvedConfig.working_dir as string,
        resolvedConfig.skip_git_repo_check,
      );

      const codexInstance = await this.getCodexInstanceForTurn(env, resolvedConfig, apiKey);
      const activeInstance = codexInstance.activeInstance;
      localInstance = codexInstance.localInstance;
      useLocalInstance = codexInstance.useLocalInstance;

      // Persist threads by prompt template (when available) rather than rendered prompt values
      // so test vars can drive a multi-turn conversation on the same thread.
      const promptCacheBasis = context?.prompt?.raw ?? prompt;
      cacheKey = this.generateCacheKey(resolvedConfig, promptCacheBasis, codexInstance.instanceKey);
      const { turn, sessionId } = await this.executeCodexTurn(
        activeInstance,
        codexInstance.instanceKey,
        cacheKey,
        promptInput,
        resolvedConfig,
        callOptions,
        skillRootPrefixes,
      );

      return this.buildCodexProviderResponse(turn, sessionId, skillRootPrefixes, resolvedConfig);
    } catch (error: unknown) {
      const isAbort =
        (error instanceof Error && error.name === 'AbortError') ||
        callOptions?.abortSignal?.aborted;

      if (isAbort) {
        logger.warn('OpenAI Codex SDK call aborted');
        return { error: 'OpenAI Codex SDK call aborted' };
      }

      // Safely extract error message - error may not be an Error object
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error calling OpenAI Codex SDK', { error: errorMessage });
      return {
        error: `Error calling OpenAI Codex SDK: ${errorMessage}`,
      };
    } finally {
      await this.cleanupCodexTurn(resolvedConfig, cacheKey, useLocalInstance, localInstance);
    }
  }

  private buildCodexRunOptions(
    config: OpenAICodexSDKConfig,
    callOptions: CallApiOptionsParams | undefined,
  ): Record<string, unknown> {
    return {
      ...(config.output_schema ? { outputSchema: config.output_schema } : {}),
      ...(callOptions?.abortSignal ? { signal: callOptions.abortSignal } : {}),
    };
  }

  private async getCodexInstanceForTurn(
    env: Record<string, string>,
    resolvedConfig: OpenAICodexSDKConfig,
    apiKey: string | undefined,
  ): Promise<{
    activeInstance: any;
    instanceKey: string;
    localInstance: any;
    useLocalInstance: boolean;
  }> {
    if (!this.codexModule) {
      this.codexModule = await loadCodexSDK();
    }

    const stableEnv = { ...env };
    delete stableEnv.TRACEPARENT;
    const instanceKey = this.generateInstanceKey(stableEnv, resolvedConfig);
    if (resolvedConfig.deep_tracing) {
      this.warnOnceForDeepTracingThreadOptions(resolvedConfig);
      const localInstance = new this.codexModule.Codex(
        this.buildCodexOptions(env, resolvedConfig, apiKey),
      );
      return {
        activeInstance: localInstance,
        instanceKey,
        localInstance,
        useLocalInstance: true,
      };
    }

    let activeInstance = this.codexInstances.get(instanceKey);
    if (!activeInstance) {
      activeInstance = new this.codexModule.Codex(
        this.buildCodexOptions(env, resolvedConfig, apiKey),
      );
      this.codexInstances.set(instanceKey, activeInstance);
    }

    return {
      activeInstance,
      instanceKey,
      localInstance: undefined,
      useLocalInstance: false,
    };
  }

  private warnOnceForDeepTracingThreadOptions(resolvedConfig: OpenAICodexSDKConfig): void {
    if (
      this.deepTracingWarningShown ||
      (!resolvedConfig.persist_threads &&
        !resolvedConfig.thread_id &&
        (resolvedConfig.thread_pool_size ?? 0) <= 1)
    ) {
      return;
    }

    logger.warn(
      '[CodexSDK] deep_tracing is incompatible with thread persistence. ' +
        'Thread options (persist_threads, thread_id, thread_pool_size) are ignored when deep_tracing is enabled.',
    );
    this.deepTracingWarningShown = true;
  }

  private async executeCodexTurn(
    activeInstance: any,
    instanceKey: string,
    cacheKey: string,
    promptInput: CodexPromptInput,
    resolvedConfig: OpenAICodexSDKConfig,
    callOptions: CallApiOptionsParams | undefined,
    skillRootPrefixes: readonly string[],
  ): Promise<{ turn: any; sessionId: string }> {
    const queueKey = this.getThreadRunQueueKey(resolvedConfig, cacheKey, instanceKey);
    const runOptions = this.buildCodexRunOptions(resolvedConfig, callOptions);

    return this.runSerializedThreadTurn(queueKey, callOptions?.abortSignal, async () => {
      const thread = await this.getOrCreateThread(
        resolvedConfig,
        cacheKey,
        instanceKey,
        activeInstance,
      );
      const turn = resolvedConfig.enable_streaming
        ? await this.runStreaming(thread, promptInput, runOptions, callOptions, skillRootPrefixes)
        : await thread.run(promptInput, runOptions);

      return {
        turn,
        sessionId: thread.id || 'unknown',
      };
    });
  }

  private buildCodexProviderResponse(
    turn: any,
    sessionId: string,
    skillRootPrefixes: readonly string[],
    resolvedConfig: OpenAICodexSDKConfig,
  ): ProviderResponse {
    const output = turn.finalResponse || '';
    const tokenUsage = this.buildCodexTokenUsage(turn.usage);
    logger.debug('OpenAI Codex SDK response', { output, usage: turn.usage });

    return {
      output,
      tokenUsage,
      cost: this.calculateCodexResponseCost(tokenUsage, resolvedConfig.model),
      metadata: this.buildCodexResponseMetadata(turn.items, skillRootPrefixes),
      raw: JSON.stringify(turn),
      sessionId,
    };
  }

  private buildCodexResponseMetadata(
    items: any[],
    skillRootPrefixes: readonly string[],
  ): ProviderResponse['metadata'] {
    const skillMetadata = this.buildSkillMetadata(items, skillRootPrefixes);
    if (!skillMetadata) {
      return undefined;
    }

    return {
      ...(skillMetadata.skillCalls.length > 0 ? { skillCalls: skillMetadata.skillCalls } : {}),
      ...(skillMetadata.attemptedSkillCalls.length > skillMetadata.skillCalls.length
        ? { attemptedSkillCalls: skillMetadata.attemptedSkillCalls }
        : {}),
    };
  }

  private buildCodexTokenUsage(turnUsage: any): ProviderResponse['tokenUsage'] {
    if (!turnUsage) {
      return undefined;
    }

    return {
      // cached_input_tokens is already included in input_tokens by the Codex SDK.
      prompt: turnUsage.input_tokens,
      completion: turnUsage.output_tokens,
      total: turnUsage.input_tokens + turnUsage.output_tokens,
      cached: turnUsage.cached_input_tokens || 0,
    };
  }

  private calculateCodexResponseCost(
    tokenUsage: ProviderResponse['tokenUsage'],
    model: string | undefined,
  ): number {
    if (!tokenUsage || !model) {
      return 0;
    }

    const pricing = CODEX_MODEL_PRICING[model];
    if (!pricing) {
      return 0;
    }

    const cachedTokens = tokenUsage.cached || 0;
    const uncachedInputTokens = (tokenUsage.prompt || 0) - cachedTokens;
    const inputCost = uncachedInputTokens * (pricing.input / 1_000_000);
    const cacheReadCost = cachedTokens * (pricing.cache_read / 1_000_000);
    const outputCost = (tokenUsage.completion || 0) * (pricing.output / 1_000_000);

    return inputCost + cacheReadCost + outputCost;
  }

  private async cleanupCodexTurn(
    resolvedConfig: OpenAICodexSDKConfig,
    cacheKey: string | undefined,
    useLocalInstance: boolean,
    localInstance: any,
  ): Promise<void> {
    if (
      !resolvedConfig.deep_tracing &&
      !resolvedConfig.persist_threads &&
      !resolvedConfig.thread_id &&
      cacheKey
    ) {
      this.threads.delete(cacheKey);
    }

    if (!useLocalInstance || !localInstance) {
      return;
    }

    try {
      await this.destroyInstance(localInstance);
    } catch (cleanupError) {
      logger.debug('[CodexSDK] Error cleaning up local instance', { error: cleanupError });
    }
  }
}
