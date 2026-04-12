import { type ChildProcessWithoutNullStreams, spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

import { type Span, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import dedent from 'dedent';
import { z } from 'zod';
import cliState from '../../cliState';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import {
  type GenAISpanContext,
  type GenAISpanResult,
  getTraceparent,
  withGenAISpan,
} from '../../tracing/genaiTracer';
import { renderVarsInObject } from '../../util/render';
import { normalizeFieldName, REDACTED, sanitizeObject } from '../../util/sanitizer';
import { VERSION } from '../../version';
import { providerRegistry } from '../providerRegistry';

import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
  SkillCallEntry,
} from '../../types/index';

export type CodexAppServerSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';
export interface CodexAppServerGranularApprovalPolicy {
  granular: {
    sandbox_approval: boolean;
    rules: boolean;
    skill_approval: boolean;
    request_permissions: boolean;
    mcp_elicitations: boolean;
  };
}
export type CodexAppServerApprovalPolicy =
  | 'never'
  | 'on-request'
  | 'on-failure'
  | 'untrusted'
  | CodexAppServerGranularApprovalPolicy;
export type CodexAppServerReasoningEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh';
export type CodexAppServerReasoningSummary = 'auto' | 'concise' | 'detailed' | 'none';
export type CodexAppServerServiceTier = 'fast' | 'flex';
export type CodexAppServerPersonality = 'none' | 'friendly' | 'pragmatic';

export interface CodexAppServerCollaborationMode {
  mode: 'plan' | 'default';
  settings: {
    model: string;
    reasoning_effort: CodexAppServerReasoningEffort | null;
    developer_instructions: string | null;
  };
}

type CodexAppServerCommandExecutionApprovalDecision =
  | 'accept'
  | 'acceptForSession'
  | 'decline'
  | 'cancel'
  | {
      acceptWithExecpolicyAmendment: {
        execpolicy_amendment: string[];
      };
    }
  | {
      applyNetworkPolicyAmendment: {
        network_policy_amendment: {
          host: string;
          action: 'allow' | 'deny';
        };
      };
    };
type CodexAppServerFileChangeApprovalDecision =
  | 'accept'
  | 'acceptForSession'
  | 'decline'
  | 'cancel';
type CodexAppServerMcpElicitationPolicy =
  | 'accept'
  | 'decline'
  | 'cancel'
  | {
      action: 'accept' | 'decline' | 'cancel';
      content?: unknown;
      _meta?: unknown;
    };

type JsonRpcId = string | number;

const MAX_BUFFERED_JSON_RPC_CHARS = 5_000_000;

type CodexAppServerPromptInputItem =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image';
      url: string;
    }
  | {
      type: 'local_image' | 'localImage';
      path: string;
    }
  | {
      type: 'skill';
      name: string;
      path: string;
    }
  | {
      type: 'mention';
      name: string;
      path: string;
    };

type CodexAppServerUserInput =
  | {
      type: 'text';
      text: string;
      text_elements: [];
    }
  | {
      type: 'image';
      url: string;
    }
  | {
      type: 'localImage';
      path: string;
    }
  | {
      type: 'skill';
      name: string;
      path: string;
    }
  | {
      type: 'mention';
      name: string;
      path: string;
    };

type CodexAppServerThreadCleanup = 'unsubscribe' | 'archive' | 'none';
type CodexAppServerUserInputPolicy = 'empty' | 'first-option' | Record<string, string | string[]>;

export interface CodexAppServerDynamicToolResponse {
  success?: boolean;
  text?: string;
  contentItems?: Array<
    { type: 'inputText'; text: string } | { type: 'inputImage'; imageUrl: string }
  >;
}

export interface CodexAppServerRequestPolicy {
  command_execution?: CodexAppServerCommandExecutionApprovalDecision;
  file_change?: CodexAppServerFileChangeApprovalDecision;
  permissions?: {
    permissions?: Record<string, unknown>;
    scope?: 'turn' | 'session';
  };
  user_input?: CodexAppServerUserInputPolicy;
  mcp_elicitation?: CodexAppServerMcpElicitationPolicy;
  dynamic_tools?: Record<string, CodexAppServerDynamicToolResponse>;
}

export interface CodexAppServerConfig {
  basePath?: string;
  prefix?: string;
  suffix?: string;
  provider?: unknown;
  linkedTargetId?: string;

  apiKey?: string;
  base_url?: string;
  working_dir?: string;
  additional_directories?: string[];
  skip_git_repo_check?: boolean;
  codex_path_override?: string;

  model?: string;
  model_provider?: string;
  service_tier?: CodexAppServerServiceTier;
  sandbox_mode?: CodexAppServerSandboxMode;
  sandbox_policy?: Record<string, unknown>;
  network_access_enabled?: boolean;
  approval_policy?: CodexAppServerApprovalPolicy;
  approvals_reviewer?: 'user' | 'guardian_subagent';
  model_reasoning_effort?: CodexAppServerReasoningEffort;
  reasoning_summary?: CodexAppServerReasoningSummary;
  personality?: CodexAppServerPersonality;
  base_instructions?: string;
  developer_instructions?: string;
  collaboration_mode?: CodexAppServerCollaborationMode;
  output_schema?: Record<string, unknown>;

  thread_id?: string;
  persist_threads?: boolean;
  thread_pool_size?: number;
  thread_cleanup?: CodexAppServerThreadCleanup;
  ephemeral?: boolean;
  persist_extended_history?: boolean;
  experimental_raw_events?: boolean;
  experimental_api?: boolean;
  include_raw_events?: boolean;

  cli_config?: Record<string, unknown>;
  cli_env?: Record<string, string | number | boolean>;
  inherit_process_env?: boolean;
  reuse_server?: boolean;
  deep_tracing?: boolean;
  request_timeout_ms?: number;
  startup_timeout_ms?: number;
  turn_timeout_ms?: number;
  server_request_policy?: CodexAppServerRequestPolicy;
}

interface JsonRpcMessage {
  id?: JsonRpcId;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
  abortListener?: () => void;
  abortSignal?: AbortSignal;
  onResponse?: (result: unknown) => void;
}

interface AppServerConnectionOptions {
  connectionInstanceId: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  requestTimeoutMs: number;
  startupTimeoutMs: number;
  onNotification: (message: JsonRpcMessage) => void;
  onServerRequest: (message: JsonRpcMessage) => Promise<unknown>;
  onClose: (error: Error) => void;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

interface ServerRequestRecord {
  id: JsonRpcId;
  method: string;
  params: unknown;
  response?: unknown;
  error?: string;
}

interface CodexAppServerTurnState {
  connectionKey: string;
  connectionInstanceId: string;
  threadId: string;
  turnId?: string;
  config: CodexAppServerConfig;
  appServerEnv: Record<string, string>;
  promptInput: CodexAppServerUserInput[];
  items: any[];
  itemStarts: any[];
  notifications: JsonRpcMessage[];
  notificationCount: number;
  serverRequests: ServerRequestRecord[];
  agentMessageDeltas: string[];
  agentMessageDeltasByItemId: Map<string, string>;
  tokenUsage?: ProviderResponse['tokenUsage'];
  rawTokenUsage?: unknown;
  turn?: any;
  error?: string;
  completed: Deferred<void>;
  activeSpans: Map<string, Span>;
  itemStartTimes: Map<string, number>;
  lastEventTime: number;
}

interface ThreadHandle {
  connectionKey: string;
  threadId: string;
  response: any;
  cacheKey?: string;
  persistent: boolean;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;

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

const CODEX_MODEL_PRICING: Record<string, { input: number; output: number; cache_read: number }> = {
  'gpt-5.4': { input: 2.5, output: 15.0, cache_read: 0.25 },
  'gpt-5.4-pro': { input: 30.0, output: 180.0, cache_read: 30.0 },
  'gpt-5.3-codex': { input: 1.75, output: 14.0, cache_read: 0.175 },
  'gpt-5.3-codex-spark': { input: 0.5, output: 4.0, cache_read: 0.05 },
  'gpt-5.2': { input: 1.75, output: 14.0, cache_read: 0.175 },
  'gpt-5.2-codex': { input: 1.75, output: 14.0, cache_read: 0.175 },
  'gpt-5.1-codex': { input: 2.0, output: 8.0, cache_read: 0.2 },
  'gpt-5.1-codex-max': { input: 3.0, output: 12.0, cache_read: 0.3 },
  'gpt-5.1-codex-mini': { input: 0.5, output: 2.0, cache_read: 0.05 },
  'gpt-5-codex': { input: 2.0, output: 8.0, cache_read: 0.2 },
  'gpt-5-codex-mini': { input: 0.5, output: 2.0, cache_read: 0.05 },
  'gpt-5': { input: 2.0, output: 8.0, cache_read: 0.2 },
};

const CodexCliEnvValueSchema = z.union([z.string(), z.number(), z.boolean()]).transform(String);

const CodexAppServerReasoningEffortSchema = z.enum([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
]);

const CodexAppServerGranularApprovalPolicySchema = z
  .object({
    granular: z
      .object({
        sandbox_approval: z.boolean(),
        rules: z.boolean(),
        skill_approval: z.boolean(),
        request_permissions: z.boolean(),
        mcp_elicitations: z.boolean(),
      })
      .strict(),
  })
  .strict();

const CodexAppServerApprovalPolicySchema = z.union([
  z.enum(['never', 'on-request', 'on-failure', 'untrusted']),
  CodexAppServerGranularApprovalPolicySchema,
]);

const CommandExecutionApprovalDecisionSchema = z.union([
  z.enum(['accept', 'acceptForSession', 'decline', 'cancel']),
  z
    .object({
      acceptWithExecpolicyAmendment: z
        .object({
          execpolicy_amendment: z.array(z.string()),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      applyNetworkPolicyAmendment: z
        .object({
          network_policy_amendment: z
            .object({
              host: z.string().min(1),
              action: z.enum(['allow', 'deny']),
            })
            .strict(),
        })
        .strict(),
    })
    .strict(),
]);

const McpElicitationPolicySchema = z.union([
  z.enum(['accept', 'decline', 'cancel']),
  z
    .object({
      action: z.enum(['accept', 'decline', 'cancel']),
      content: z.unknown().optional(),
      _meta: z.unknown().optional(),
    })
    .strict(),
]);

const CollaborationModeSchema = z
  .object({
    mode: z.enum(['plan', 'default']),
    settings: z
      .object({
        model: z.string().min(1),
        reasoning_effort: CodexAppServerReasoningEffortSchema.nullable(),
        developer_instructions: z.string().nullable(),
      })
      .strict(),
  })
  .strict();

const ServerRequestPolicySchema = z
  .object({
    command_execution: CommandExecutionApprovalDecisionSchema.optional(),
    file_change: z.enum(['accept', 'acceptForSession', 'decline', 'cancel']).optional(),
    permissions: z
      .object({
        permissions: z.record(z.string(), z.unknown()).optional(),
        scope: z.enum(['turn', 'session']).optional(),
      })
      .optional(),
    user_input: z
      .union([
        z.enum(['empty', 'first-option']),
        z.record(z.string(), z.union([z.string(), z.array(z.string())])),
      ])
      .optional(),
    mcp_elicitation: McpElicitationPolicySchema.optional(),
    dynamic_tools: z
      .record(
        z.string(),
        z.object({
          success: z.boolean().optional(),
          text: z.string().optional(),
          contentItems: z
            .array(
              z.union([
                z.object({ type: z.literal('inputText'), text: z.string() }),
                z.object({ type: z.literal('inputImage'), imageUrl: z.string() }),
              ]),
            )
            .optional(),
        }),
      )
      .optional(),
  })
  .strict();

const CodexAppServerConfigShape = {
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
  model_provider: z.string().min(1).optional(),
  service_tier: z.enum(['fast', 'flex']).optional(),
  sandbox_mode: z.enum(['read-only', 'workspace-write', 'danger-full-access']).optional(),
  sandbox_policy: z.record(z.string(), z.unknown()).optional(),
  network_access_enabled: z.boolean().optional(),
  approval_policy: CodexAppServerApprovalPolicySchema.optional(),
  approvals_reviewer: z.enum(['user', 'guardian_subagent']).optional(),
  model_reasoning_effort: CodexAppServerReasoningEffortSchema.optional(),
  reasoning_summary: z.enum(['auto', 'concise', 'detailed', 'none']).optional(),
  personality: z.enum(['none', 'friendly', 'pragmatic']).optional(),
  base_instructions: z.string().min(1).optional(),
  developer_instructions: z.string().min(1).optional(),
  collaboration_mode: CollaborationModeSchema.optional(),
  output_schema: z.record(z.string(), z.unknown()).optional(),
  thread_id: z.string().min(1).optional(),
  persist_threads: z.boolean().optional(),
  thread_pool_size: z.number().int().positive().optional(),
  thread_cleanup: z.enum(['unsubscribe', 'archive', 'none']).optional(),
  ephemeral: z.boolean().optional(),
  persist_extended_history: z.boolean().optional(),
  experimental_raw_events: z.boolean().optional(),
  experimental_api: z.boolean().optional(),
  include_raw_events: z.boolean().optional(),
  cli_config: z.record(z.string(), z.unknown()).optional(),
  cli_env: z.record(z.string(), CodexCliEnvValueSchema).optional(),
  inherit_process_env: z.boolean().optional(),
  reuse_server: z.boolean().optional(),
  deep_tracing: z.boolean().optional(),
  request_timeout_ms: z.number().int().positive().optional(),
  startup_timeout_ms: z.number().int().positive().optional(),
  turn_timeout_ms: z.number().int().positive().optional(),
  server_request_policy: ServerRequestPolicySchema.optional(),
} as const;

const CodexAppServerConfigSchema = z.object(CodexAppServerConfigShape).strict();
const CodexAppServerMergedPromptConfigSchema = z.object(CodexAppServerConfigShape).strip();

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function parseCodexAppServerConfig(
  config: CodexAppServerConfig | undefined,
  options: { stripUnknownKeys?: boolean } = {},
): CodexAppServerConfig {
  const schema = options.stripUnknownKeys
    ? CodexAppServerMergedPromptConfigSchema
    : CodexAppServerConfigSchema;

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
      throw new Error(`Invalid OpenAI Codex app-server config: ${issues}`);
    }

    throw error;
  }
}

function mergeOptionalRecord<T extends Record<string, unknown>>(
  base: T | undefined,
  override: T | undefined,
): T | undefined {
  if (!base && !override) {
    return undefined;
  }
  return {
    ...(base ?? {}),
    ...(override ?? {}),
  } as T;
}

function mergeServerRequestPolicy(
  base: CodexAppServerRequestPolicy | undefined,
  override: CodexAppServerRequestPolicy | undefined,
): CodexAppServerRequestPolicy | undefined {
  if (!base && !override) {
    return undefined;
  }

  const merged: CodexAppServerRequestPolicy = {
    ...(base ?? {}),
    ...(override ?? {}),
  };
  const permissions = mergeOptionalRecord(base?.permissions, override?.permissions);
  const dynamicTools = mergeOptionalRecord(base?.dynamic_tools, override?.dynamic_tools);

  if (permissions) {
    merged.permissions = permissions;
  } else {
    delete merged.permissions;
  }
  if (dynamicTools) {
    merged.dynamic_tools = dynamicTools;
  } else {
    delete merged.dynamic_tools;
  }

  return merged;
}

function mergeCodexAppServerConfig(
  base: CodexAppServerConfig,
  override: CodexAppServerConfig | undefined,
): CodexAppServerConfig {
  if (!override) {
    return { ...base };
  }

  return {
    ...base,
    ...override,
    cli_config: mergeOptionalRecord(base.cli_config, override.cli_config),
    cli_env: mergeOptionalRecord(base.cli_env, override.cli_env),
    server_request_policy: mergeServerRequestPolicy(
      base.server_request_policy,
      override.server_request_policy,
    ),
  };
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function flattenConfig(
  value: Record<string, unknown>,
  prefix = '',
): Array<{ key: string; value: unknown }> {
  const entries: Array<{ key: string; value: unknown }> = [];

  for (const [key, entryValue] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(entryValue)) {
      entries.push(...flattenConfig(entryValue, nextKey));
    } else if (entryValue !== undefined) {
      entries.push({ key: nextKey, value: entryValue });
    }
  }

  return entries;
}

function toTomlLiteral(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => toTomlLiteral(item)).join(', ')}]`;
  }
  if (value === null) {
    return '""';
  }
  return JSON.stringify(value);
}

function getJsonRpcErrorMessage(message: JsonRpcMessage): string {
  if (typeof message.error?.message === 'string' && message.error.message) {
    return message.error.message;
  }
  return 'Unknown app-server error';
}

function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

class CodexAppServerConnection {
  readonly instanceId: string;

  private process: ChildProcessWithoutNullStreams;
  private lineInterface: readline.Interface;
  private nextRequestId = 1;
  private pending = new Map<JsonRpcId, PendingRequest>();
  private closed = false;
  private stderrChunks: string[] = [];
  private stderrTotalLength = 0;
  private bufferedJsonRpcLines: string[] = [];
  private closePromise: Promise<void> | null = null;

  constructor(private readonly options: AppServerConnectionOptions) {
    this.instanceId = options.connectionInstanceId;
    this.process = spawn(options.command, options.args, {
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.lineInterface = readline.createInterface({ input: this.process.stdout });
    this.lineInterface.on('line', (line) => this.handleLine(line));
    this.process.stderr.on('data', (chunk: Buffer) => this.recordStderr(chunk));
    this.process.stdin.on('error', (error) => {
      logger.debug('[CodexAppServer] stdin error', { error: error.message });
    });
    this.process.on('error', (error) => this.handleProcessFailure(error));
    this.process.on('exit', (code, signal) => {
      if (this.closed) {
        this.rejectPending(new Error('codex app-server process closed'));
      } else {
        this.handleProcessFailure(
          new Error(
            `codex app-server exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`,
          ),
        );
      }
    });
  }

  async initialize(config: CodexAppServerConfig): Promise<void> {
    await this.request(
      'initialize',
      {
        clientInfo: {
          name: 'promptfoo_codex_app_server',
          title: 'Promptfoo Codex App Server Provider',
          version: VERSION,
        },
        capabilities: {
          experimentalApi: config.experimental_api ?? true,
        },
      },
      { timeoutMs: this.options.startupTimeoutMs },
    );
    this.notify('initialized', {});
  }

  request(
    method: string,
    params?: unknown,
    options: {
      timeoutMs?: number;
      abortSignal?: AbortSignal;
      onResponse?: (result: unknown) => void;
    } = {},
  ): Promise<any> {
    if (this.closed) {
      return Promise.reject(new Error('codex app-server connection is closed'));
    }
    if (options.abortSignal?.aborted) {
      return Promise.reject(createAbortError(`codex app-server request aborted: ${method}`));
    }

    const id = this.nextRequestId++;
    const message: JsonRpcMessage = { method, id };
    if (params !== undefined) {
      message.params = params;
    }

    const timeoutMs = options.timeoutMs ?? this.options.requestTimeoutMs;
    return new Promise((resolve, reject) => {
      const pendingRequest: PendingRequest = {
        method,
        resolve,
        reject,
        abortSignal: options.abortSignal,
        onResponse: options.onResponse,
      };

      pendingRequest.timeout = setTimeout(() => {
        const error = new Error(`codex app-server request timed out: ${method}`);
        this.pending.delete(id);
        if (options.abortSignal && pendingRequest.abortListener) {
          options.abortSignal.removeEventListener('abort', pendingRequest.abortListener);
        }
        reject(error);
        this.closeAfterRequestTimeout(method, error);
      }, timeoutMs);

      if (options.abortSignal) {
        pendingRequest.abortListener = () => {
          const error = createAbortError(`codex app-server request aborted: ${method}`);
          this.pending.delete(id);
          if (pendingRequest.timeout) {
            clearTimeout(pendingRequest.timeout);
          }
          reject(error);
          logger.debug('[CodexAppServer] JSON-RPC request aborted', {
            error: error.message,
            method,
          });
        };
        options.abortSignal.addEventListener('abort', pendingRequest.abortListener, { once: true });
      }

      this.pending.set(id, pendingRequest);
      this.send(message);
    });
  }

  notify(method: string, params?: unknown): void {
    const message: JsonRpcMessage = { method };
    if (params !== undefined) {
      message.params = params;
    }
    this.send(message);
  }

  getStderr(): string {
    return this.stderrChunks.join('').slice(-10_000);
  }

  async close(): Promise<void> {
    if (this.closePromise !== null) {
      return this.closePromise;
    }

    this.closePromise = new Promise<void>((resolve) => {
      this.closed = true;
      this.rejectPending(new Error('codex app-server connection closed'));
      this.lineInterface.close();

      const finish = () => resolve();
      const killTimer = setTimeout(() => {
        try {
          if (!this.process.killed) {
            this.process.kill('SIGKILL');
          }
        } catch {
          // Process may have already exited (ESRCH)
        }
        finish();
      }, 1_000);

      this.process.once('exit', () => {
        clearTimeout(killTimer);
        finish();
      });

      if (this.process.killed || this.process.exitCode !== null) {
        clearTimeout(killTimer);
        finish();
        return;
      }

      try {
        this.process.stdin.end();
        this.process.kill('SIGTERM');
      } catch {
        // Process may have already exited (ESRCH)
        clearTimeout(killTimer);
        finish();
      }
    });

    return this.closePromise;
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed && this.bufferedJsonRpcLines.length === 0) {
      return;
    }

    const candidateLines =
      this.bufferedJsonRpcLines.length > 0 ? [...this.bufferedJsonRpcLines, line] : [trimmed];
    const candidate = candidateLines.join('\\n');
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(candidate) as JsonRpcMessage;
    } catch (error) {
      if (this.shouldBufferJsonRpcLine(error, trimmed)) {
        this.bufferedJsonRpcLines = candidateLines;
        if (candidate.length > MAX_BUFFERED_JSON_RPC_CHARS) {
          logger.warn('[CodexAppServer] Dropping oversized partial JSON-RPC message', {
            error,
            bufferedChars: candidate.length,
          });
          this.bufferedJsonRpcLines = [];
        }
        return;
      }

      logger.warn('[CodexAppServer] Failed to parse JSON-RPC line', { error, line: candidate });
      this.bufferedJsonRpcLines = [];
      return;
    }

    this.bufferedJsonRpcLines = [];
    this.handleMessage(message);
  }

  private shouldBufferJsonRpcLine(error: unknown, trimmedLine: string): boolean {
    if (this.bufferedJsonRpcLines.length > 0) {
      return true;
    }
    if (!trimmedLine.startsWith('{')) {
      return false;
    }

    const message = error instanceof Error ? error.message : String(error);
    return /Unterminated string|Unexpected end of JSON input|Bad control character/i.test(message);
  }

  private handleMessage(message: JsonRpcMessage): void {
    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
      this.handleResponse(message);
      return;
    }

    if (message.id !== undefined && message.method) {
      void this.handleServerRequest(message);
      return;
    }

    if (message.method) {
      this.options.onNotification(message);
      return;
    }

    logger.debug('[CodexAppServer] Ignoring unknown JSON-RPC message shape', { message });
  }

  private handleResponse(message: JsonRpcMessage): void {
    const pendingRequest = this.pending.get(message.id as JsonRpcId);
    if (!pendingRequest) {
      logger.debug('[CodexAppServer] Received response for unknown request', { id: message.id });
      return;
    }

    this.pending.delete(message.id as JsonRpcId);
    if (pendingRequest.timeout) {
      clearTimeout(pendingRequest.timeout);
    }
    if (pendingRequest.abortSignal && pendingRequest.abortListener) {
      pendingRequest.abortSignal.removeEventListener('abort', pendingRequest.abortListener);
    }

    if (message.error) {
      pendingRequest.reject(new Error(getJsonRpcErrorMessage(message)));
      return;
    }
    try {
      pendingRequest.onResponse?.(message.result);
    } catch (error) {
      pendingRequest.reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    pendingRequest.resolve(message.result);
  }

  private async handleServerRequest(message: JsonRpcMessage): Promise<void> {
    try {
      const result = await this.options.onServerRequest(message);
      this.send({ id: message.id, result });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      try {
        this.send({
          id: message.id,
          error: {
            code: -32_000,
            message: errorMessage,
          },
        });
      } catch (sendError) {
        logger.debug('[CodexAppServer] Failed to send error response for server request', {
          error: sendError,
          originalError: errorMessage,
          method: message.method,
        });
      }
    }
  }

  private recordStderr(chunk: Buffer): void {
    const text = chunk.toString('utf8');
    this.stderrChunks.push(text);
    this.stderrTotalLength += text.length;
    if (this.stderrTotalLength > 20_000) {
      const truncated = this.getStderr();
      this.stderrChunks = [truncated];
      this.stderrTotalLength = truncated.length;
    }
    logger.debug('[CodexAppServer] stderr', { text });
  }

  private handleProcessFailure(error: Error): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.rejectPending(error);
    logger.error('[CodexAppServer] Process failure', {
      error: error.message,
      stderr: this.getStderr(),
    });
    this.options.onClose(error);
  }

  private closeAfterRequestTimeout(method: string, error: Error): void {
    if (this.closed) {
      return;
    }

    logger.warn('[CodexAppServer] Closing app-server after JSON-RPC request timeout', {
      error: error.message,
      method,
    });
    this.options.onClose(error);
    void this.close().catch((closeError) => {
      logger.debug('[CodexAppServer] Error closing app-server after request timeout', {
        error: closeError,
      });
    });
  }

  private rejectPending(error: Error): void {
    for (const [id, pendingRequest] of this.pending) {
      if (pendingRequest.timeout) {
        clearTimeout(pendingRequest.timeout);
      }
      if (pendingRequest.abortSignal && pendingRequest.abortListener) {
        pendingRequest.abortSignal.removeEventListener('abort', pendingRequest.abortListener);
      }
      pendingRequest.reject(error);
      this.pending.delete(id);
    }
  }

  private send(message: JsonRpcMessage): void {
    if (this.closed) {
      throw new Error('codex app-server connection is closed');
    }
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }
}

export class OpenAICodexAppServerProvider implements ApiProvider {
  config: CodexAppServerConfig;
  env?: EnvOverrides;
  apiKey?: string;

  private providerId = 'openai:codex-app-server';
  private connections = new Map<string, CodexAppServerConnection>();
  private connectionPromises = new Map<string, Promise<CodexAppServerConnection>>();
  private initializingConnections = new Set<CodexAppServerConnection>();
  private threads = new Map<string, ThreadHandle>();
  private threadPromises = new Map<string, Promise<ThreadHandle>>();
  private threadPromiseConnectionInstances = new Map<string, string>();
  private protectedThreadCounts = new Map<string, number>();
  private threadRunQueues = new Map<string, Promise<void>>();
  private activeTurnsByThread = new Map<string, CodexAppServerTurnState>();
  private activeTurnsByTurn = new Map<string, CodexAppServerTurnState>();
  private validatedWorkingDirs = new Set<string>();
  private ignoredProviderEnvWarningShown = false;
  private omittedProcessEnvWarningShown = false;
  private deepTracingWarningShown = false;

  constructor(
    options: {
      id?: string;
      config?: CodexAppServerConfig;
      env?: EnvOverrides;
    } = {},
  ) {
    this.config = parseCodexAppServerConfig(options.config);
    this.env = options.env;
    this.apiKey = this.getApiKey();
    this.providerId = options.id ?? this.providerId;
    providerRegistry.register(this);
  }

  id(): string {
    return this.providerId;
  }

  getApiKey(config: CodexAppServerConfig = this.config): string | undefined {
    return (
      config.apiKey ||
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
    return '[OpenAI Codex App Server Provider]';
  }

  async cleanup(): Promise<void> {
    this.resolveActiveTurns(new Error('codex app-server provider cleanup interrupted active turn'));
    this.threads.clear();
    this.threadPromises.clear();
    this.threadPromiseConnectionInstances.clear();
    this.threadRunQueues.clear();
    this.activeTurnsByThread.clear();
    this.activeTurnsByTurn.clear();
    this.protectedThreadCounts.clear();
    this.validatedWorkingDirs.clear();

    const connections = Array.from(
      new Set([...this.connections.values(), ...this.initializingConnections]),
    );
    this.connections.clear();
    this.connectionPromises.clear();
    this.initializingConnections.clear();

    await Promise.all(
      connections.map((connection) =>
        connection.close().catch((error) => {
          logger.warn('[CodexAppServer] Error during cleanup', { error });
        }),
      ),
    );
  }

  async shutdown(): Promise<void> {
    try {
      await this.cleanup();
    } finally {
      providerRegistry.unregister(this);
    }
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const mergedConfig = mergeCodexAppServerConfig(
      this.config,
      context?.prompt?.config as CodexAppServerConfig | undefined,
    );
    const config = renderVarsInObject(mergedConfig, context?.vars) as CodexAppServerConfig;
    const requestedModel =
      typeof config.model === 'string' && config.model ? config.model : undefined;

    return withGenAISpan(
      this.buildSpanContext(prompt, context, requestedModel),
      () => this.callApiInternal(prompt, context, callOptions, config),
      (response) => this.extractSpanResult(response, requestedModel),
    );
  }

  private buildSpanContext(
    prompt: string,
    context: CallApiContextParams | undefined,
    requestedModel: string | undefined,
  ): GenAISpanContext {
    return {
      system: 'openai',
      operationName: 'chat',
      model: requestedModel ?? 'codex-app-server',
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

  private extractSpanResult(
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
    if (requestedModel) {
      result.responseModel = requestedModel;
    }
    if (response.cached !== undefined) {
      result.cacheHit = response.cached;
    }
    if (response.output !== undefined) {
      result.responseBody =
        typeof response.output === 'string' ? response.output : JSON.stringify(response.output);
    }
    if (response.metadata?.codexAppServer?.itemCounts) {
      result.additionalAttributes = {
        ...result.additionalAttributes,
        'codex.app_server.items.breakdown': JSON.stringify(
          response.metadata.codexAppServer.itemCounts,
        ),
      };
    }
    return result;
  }

  private async callApiInternal(
    prompt: string,
    context: CallApiContextParams | undefined,
    callOptions: CallApiOptionsParams | undefined,
    rawConfig: CodexAppServerConfig,
  ): Promise<ProviderResponse> {
    let config: CodexAppServerConfig;
    try {
      config = parseCodexAppServerConfig(rawConfig, { stripUnknownKeys: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error calling OpenAI Codex app-server', { error: errorMessage });
      return { error: `Error calling OpenAI Codex app-server: ${errorMessage}` };
    }

    if (callOptions?.abortSignal?.aborted) {
      return { error: 'OpenAI Codex app-server call aborted before it started' };
    }

    const workingDirectory = this.resolveWorkingDirectory(config);
    const resolvedConfig: CodexAppServerConfig = {
      approval_policy: 'never',
      sandbox_mode: 'read-only',
      network_access_enabled: false,
      ephemeral: true,
      thread_cleanup: 'unsubscribe',
      reuse_server: true,
      ...config,
      working_dir: workingDirectory,
      additional_directories: this.resolveAdditionalDirectories(config),
    };

    const currentTraceparent = getTraceparent();
    const apiKey = this.getApiKey(resolvedConfig);
    const env = this.prepareEnvironment(resolvedConfig, currentTraceparent, apiKey);
    const promptInput = this.parsePromptInput(prompt);
    const connectionKey = this.generateConnectionKey(env, resolvedConfig);
    const useReusableConnection =
      resolvedConfig.reuse_server !== false && !resolvedConfig.deep_tracing;
    let localConnection: CodexAppServerConnection | undefined;

    try {
      this.validateWorkingDirectory(
        resolvedConfig.working_dir as string,
        resolvedConfig.skip_git_repo_check,
      );
      this.warnOnceForDeepTracingThreadOptions(resolvedConfig);

      const connection = useReusableConnection
        ? await this.getOrCreateConnection(connectionKey, env, resolvedConfig)
        : await this.createConnection(connectionKey, env, resolvedConfig);
      if (!useReusableConnection) {
        localConnection = connection;
      }

      const promptCacheBasis = context?.prompt?.raw ?? prompt;
      const threadHandle = await this.getOrCreateThread(
        connection,
        connectionKey,
        promptCacheBasis,
        resolvedConfig,
        useReusableConnection,
        callOptions,
      );
      this.protectThread(threadHandle.threadId);
      let turnStarted = false;
      try {
        const queueKey = this.getThreadRunQueueKey(resolvedConfig, threadHandle);

        return await this.runSerializedThreadTurn(queueKey, callOptions?.abortSignal, async () => {
          turnStarted = true;
          const state = this.createTurnState(
            connectionKey,
            connection.instanceId,
            threadHandle.threadId,
            promptInput,
            resolvedConfig,
            env,
          );
          this.registerTurnState(state);
          try {
            const turnResponse = await connection.request(
              'turn/start',
              this.buildTurnStartParams(threadHandle.threadId, promptInput, resolvedConfig),
              {
                abortSignal: callOptions?.abortSignal,
                timeoutMs: this.getRequestTimeoutMs(resolvedConfig),
                onResponse: (response) => {
                  const turnId = (response as any)?.turn?.id;
                  if (typeof turnId === 'string') {
                    this.updateTurnStateId(state, turnId);
                  }
                },
              },
            );

            if (typeof turnResponse?.turn?.id === 'string') {
              this.updateTurnStateId(state, turnResponse.turn.id);
            }

            await this.waitForTurnCompletion(connection, state, resolvedConfig, callOptions);
            return this.buildProviderResponse(state, threadHandle, resolvedConfig);
          } finally {
            this.unregisterTurnState(state);
            await this.cleanupThreadAfterTurn(connection, threadHandle, resolvedConfig);
          }
        });
      } finally {
        this.unprotectThread(threadHandle.threadId);
        if (!turnStarted) {
          await this.cleanupThreadAfterTurn(connection, threadHandle, resolvedConfig, {
            skipIfActiveTurn: true,
          });
        }
        this.scheduleThreadPoolEnforcement(connection, connectionKey, resolvedConfig);
      }
    } catch (error: unknown) {
      const isAbort =
        (error instanceof Error && error.name === 'AbortError') ||
        callOptions?.abortSignal?.aborted;

      if (isAbort) {
        logger.warn('OpenAI Codex app-server call aborted');
        return { error: 'OpenAI Codex app-server call aborted' };
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error calling OpenAI Codex app-server', { error: errorMessage });
      return { error: `Error calling OpenAI Codex app-server: ${errorMessage}` };
    } finally {
      if (localConnection) {
        await localConnection.close().catch((error) => {
          logger.debug('[CodexAppServer] Error closing local connection', { error });
        });
      }
    }
  }

  private resolveWorkingDirectory(config: CodexAppServerConfig): string {
    const basePath = config.basePath || cliState.basePath || process.cwd();
    if (!config.working_dir) {
      return process.cwd();
    }
    return path.resolve(basePath, config.working_dir);
  }

  private resolveAdditionalDirectories(config: CodexAppServerConfig): string[] | undefined {
    if (!config.additional_directories?.length) {
      return undefined;
    }
    const basePath = config.basePath || cliState.basePath || process.cwd();
    return config.additional_directories.map((directory) => path.resolve(basePath, directory));
  }

  private prepareEnvironment(
    config: CodexAppServerConfig,
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
        '[CodexAppServer] Ignoring promptfoo-level env overrides for the Codex app-server process. ' +
          'Move these keys into config.cli_env if Codex shell commands need them.',
        { envKeys: ignoredProviderEnvKeys },
      );
      this.ignoredProviderEnvWarningShown = true;
    }

    if (!inheritProcessEnv && !this.omittedProcessEnvWarningShown) {
      const omittedProcessEnvKeys = this.getOmittedOptionalProcessEnvKeys(config, env);
      if (omittedProcessEnvKeys.length > 0) {
        logger.warn(
          '[CodexAppServer] Optional Codex app-server process env vars are not inherited by default. ' +
            'Move these keys into config.cli_env or set inherit_process_env: true if Codex commands need them.',
          { envKeys: omittedProcessEnvKeys },
        );
        this.omittedProcessEnvWarningShown = true;
      }
    }

    const sortedEnv: Record<string, string> = {};
    for (const key of Object.keys(env).sort()) {
      if (env[key] !== undefined) {
        sortedEnv[key] = env[key];
      }
    }

    if (apiKey) {
      sortedEnv.OPENAI_API_KEY = apiKey;
      sortedEnv.CODEX_API_KEY = apiKey;
    }

    if (config.base_url) {
      sortedEnv.OPENAI_BASE_URL = config.base_url;
      sortedEnv.OPENAI_API_BASE_URL = config.base_url;
    }

    if (config.deep_tracing) {
      if (!sortedEnv.OTEL_EXPORTER_OTLP_ENDPOINT) {
        sortedEnv.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:4318';
      }
      if (!sortedEnv.OTEL_EXPORTER_OTLP_PROTOCOL) {
        sortedEnv.OTEL_EXPORTER_OTLP_PROTOCOL = 'http/json';
      }
      if (!sortedEnv.OTEL_SERVICE_NAME) {
        sortedEnv.OTEL_SERVICE_NAME = 'codex-app-server';
      }
      if (!sortedEnv.OTEL_TRACES_EXPORTER) {
        sortedEnv.OTEL_TRACES_EXPORTER = 'otlp';
      }
      if (traceparent) {
        sortedEnv.TRACEPARENT = traceparent;
      }
    } else {
      delete sortedEnv.TRACEPARENT;
    }

    return sortedEnv;
  }

  private getOmittedOptionalProcessEnvKeys(
    config: CodexAppServerConfig,
    env: Record<string, string>,
  ): string[] {
    const shouldWarnForSshEnv = config.network_access_enabled === true;
    return COMMON_OPTIONAL_PROCESS_ENV_KEYS.filter(
      (key) =>
        typeof process.env[key] === 'string' &&
        !(key in env) &&
        (shouldWarnForSshEnv || (key !== 'SSH_AUTH_SOCK' && key !== 'GIT_SSH_COMMAND')),
    );
  }

  private buildAppServerArgs(config: CodexAppServerConfig): string[] {
    const args = ['app-server', '--listen', 'stdio://'];
    const cliConfig = this.getResolvedCliConfig(config);
    for (const { key, value } of flattenConfig(cliConfig)) {
      args.push('-c', `${key}=${toTomlLiteral(value)}`);
    }
    return args;
  }

  private getResolvedCliConfig(config: CodexAppServerConfig): Record<string, unknown> {
    return {
      ...(config.cli_config ?? {}),
    };
  }

  private getRequestTimeoutMs(config: CodexAppServerConfig): number {
    return config.request_timeout_ms ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  private async getOrCreateConnection(
    connectionKey: string,
    env: Record<string, string>,
    config: CodexAppServerConfig,
  ): Promise<CodexAppServerConnection> {
    const existing = this.connections.get(connectionKey);
    if (existing) {
      return existing;
    }

    const pending = this.connectionPromises.get(connectionKey);
    if (pending) {
      return pending;
    }

    let connectionPromise: Promise<CodexAppServerConnection>;
    connectionPromise = this.createConnection(connectionKey, env, config)
      .then((connection) => {
        if (this.connectionPromises.get(connectionKey) !== connectionPromise) {
          void connection.close().catch((error) => {
            logger.debug('[CodexAppServer] Error closing stale initialized connection', { error });
          });
          throw new Error('codex app-server connection was closed during cleanup');
        }
        this.connections.set(connectionKey, connection);
        return connection;
      })
      .finally(() => {
        this.connectionPromises.delete(connectionKey);
      });
    this.connectionPromises.set(connectionKey, connectionPromise);
    return connectionPromise;
  }

  private async createConnection(
    connectionKey: string,
    env: Record<string, string>,
    config: CodexAppServerConfig,
  ): Promise<CodexAppServerConnection> {
    const connectionInstanceId = `${connectionKey}:${crypto.randomUUID()}`;
    const connection = new CodexAppServerConnection({
      connectionInstanceId,
      command: config.codex_path_override ?? 'codex',
      args: this.buildAppServerArgs(config),
      env,
      requestTimeoutMs: this.getRequestTimeoutMs(config),
      startupTimeoutMs: config.startup_timeout_ms ?? DEFAULT_STARTUP_TIMEOUT_MS,
      onNotification: (message) => this.handleNotification(message),
      onServerRequest: (message) => this.handleServerRequest(message, config),
      onClose: (error) => this.handleConnectionClose(connectionKey, connectionInstanceId, error),
    });

    this.initializingConnections.add(connection);
    try {
      await connection.initialize(config);
      return connection;
    } catch (error) {
      await connection.close().catch((closeError) => {
        logger.debug('[CodexAppServer] Error closing app-server after failed initialization', {
          error: closeError,
        });
      });
      throw error;
    } finally {
      this.initializingConnections.delete(connection);
    }
  }

  private handleConnectionClose(
    connectionKey: string,
    connectionInstanceId: string,
    error: Error,
  ): void {
    logger.warn('[CodexAppServer] Connection closed', { connectionKey, error: error.message });
    const cachedConnection = this.connections.get(connectionKey);
    if (cachedConnection?.instanceId === connectionInstanceId) {
      this.connections.delete(connectionKey);
      this.connectionPromises.delete(connectionKey);
      for (const [threadCacheKey, handle] of this.threads) {
        if (handle.connectionKey === connectionKey) {
          this.threads.delete(threadCacheKey);
        }
      }
      for (const [threadCacheKey] of this.threadPromises) {
        if (this.threadPromiseConnectionInstances.get(threadCacheKey) === connectionInstanceId) {
          this.threadPromises.delete(threadCacheKey);
          this.threadPromiseConnectionInstances.delete(threadCacheKey);
        }
      }
    }

    this.resolveActiveTurns(error, (state) => state.connectionInstanceId === connectionInstanceId);
  }

  private resolveActiveTurns(
    error: Error,
    predicate: (state: CodexAppServerTurnState) => boolean = () => true,
  ): void {
    for (const state of new Set(this.activeTurnsByThread.values())) {
      if (!predicate(state)) {
        continue;
      }
      state.error = error.message;
      state.completed.resolve();
    }
  }

  private generateConnectionKey(env: Record<string, string>, config: CodexAppServerConfig): string {
    const stableEnv = { ...env };
    delete stableEnv.TRACEPARENT;
    const keyData = {
      env: stableEnv,
      codex_path_override: config.codex_path_override,
      cli_config: this.getResolvedCliConfig(config),
      experimental_api: config.experimental_api,
    };
    const hash = crypto.createHash('sha256').update(JSON.stringify(keyData)).digest('hex');
    return `openai:codex-app-server:connection:${hash}`;
  }

  private generateThreadCacheKey(
    connectionKey: string,
    promptCacheBasis: string,
    config: CodexAppServerConfig,
  ): string {
    const keyData = {
      connectionKey,
      prompt: promptCacheBasis,
      working_dir: config.working_dir,
      additional_directories: config.additional_directories,
      model: config.model,
      model_provider: config.model_provider,
      service_tier: config.service_tier,
      sandbox_mode: config.sandbox_mode,
      sandbox_policy: config.sandbox_policy,
      network_access_enabled: config.network_access_enabled,
      approval_policy: config.approval_policy,
      approvals_reviewer: config.approvals_reviewer,
      model_reasoning_effort: config.model_reasoning_effort,
      reasoning_summary: config.reasoning_summary,
      personality: config.personality,
      base_instructions: config.base_instructions,
      developer_instructions: config.developer_instructions,
      collaboration_mode: config.collaboration_mode,
      output_schema: config.output_schema,
      base_url: config.base_url,
      ephemeral: config.ephemeral,
      experimental_raw_events: config.experimental_raw_events,
      persist_extended_history: config.persist_extended_history,
    };
    const hash = crypto.createHash('sha256').update(JSON.stringify(keyData)).digest('hex');
    return `openai:codex-app-server:thread:${hash}`;
  }

  private async getOrCreateThread(
    connection: CodexAppServerConnection,
    connectionKey: string,
    promptCacheBasis: string,
    config: CodexAppServerConfig,
    allowThreadPersistence: boolean,
    callOptions?: CallApiOptionsParams,
  ): Promise<ThreadHandle> {
    const canPersistThread = allowThreadPersistence && config.persist_threads === true;

    if (config.thread_id) {
      const cacheKey = canPersistThread
        ? `${connectionKey}:thread_id:${config.thread_id}`
        : undefined;
      const cachedOrPending = this.getCachedOrPendingThread(cacheKey);
      if (cachedOrPending !== undefined) {
        return this.waitForThreadHandle(cachedOrPending, callOptions?.abortSignal);
      }

      this.throwIfThreadWaitAborted(callOptions?.abortSignal);
      const threadPromise = this.cacheThreadPromise(cacheKey, connection.instanceId, async () => {
        const response = await connection.request(
          'thread/resume',
          this.buildThreadResumeParams(config.thread_id as string, config),
          {
            timeoutMs: this.getRequestTimeoutMs(config),
          },
        );
        const handle = {
          connectionKey,
          threadId: response?.thread?.id ?? config.thread_id,
          response,
          cacheKey,
          persistent: canPersistThread,
        };
        if (cacheKey) {
          this.threads.set(cacheKey, handle);
        }
        return handle;
      });
      return cacheKey
        ? this.waitForThreadHandle(threadPromise, callOptions?.abortSignal)
        : this.waitForThreadHandle(threadPromise, callOptions?.abortSignal, {
            onAbortResolvedThread: (threadHandle) =>
              this.cleanupThreadAfterTurn(connection, threadHandle, config, {
                skipIfProtected: true,
              }),
          });
    }

    const cacheKey = canPersistThread
      ? this.generateThreadCacheKey(connectionKey, promptCacheBasis, config)
      : undefined;
    const cachedOrPending = this.getCachedOrPendingThread(cacheKey);
    if (cachedOrPending !== undefined) {
      return this.waitForThreadHandle(cachedOrPending, callOptions?.abortSignal);
    }

    this.throwIfThreadWaitAborted(callOptions?.abortSignal);
    const threadPromise = this.cacheThreadPromise(cacheKey, connection.instanceId, async () => {
      const poolSize = config.thread_pool_size ?? 1;
      if (cacheKey && this.threads.size >= poolSize) {
        await this.evictOldestInactiveCachedThread(
          connection,
          connectionKey,
          this.getRequestTimeoutMs(config),
        );
      }

      const response = await connection.request(
        'thread/start',
        this.buildThreadStartParams(config),
        {
          timeoutMs: this.getRequestTimeoutMs(config),
        },
      );
      const threadId = response?.thread?.id;
      if (typeof threadId !== 'string' || !threadId) {
        throw new Error('codex app-server did not return a thread id');
      }

      const handle = {
        connectionKey,
        threadId,
        response,
        cacheKey,
        persistent: canPersistThread,
      };
      if (cacheKey) {
        this.threads.set(cacheKey, handle);
      }
      return handle;
    });
    return cacheKey
      ? this.waitForThreadHandle(threadPromise, callOptions?.abortSignal)
      : this.waitForThreadHandle(threadPromise, callOptions?.abortSignal, {
          onAbortResolvedThread: (threadHandle) =>
            this.cleanupThreadAfterTurn(connection, threadHandle, config, {
              skipIfProtected: true,
            }),
        });
  }

  private getCachedOrPendingThread(
    cacheKey: string | undefined,
  ): ThreadHandle | Promise<ThreadHandle> | undefined {
    if (!cacheKey) {
      return undefined;
    }
    return this.threads.get(cacheKey) ?? this.threadPromises.get(cacheKey);
  }

  private cacheThreadPromise(
    cacheKey: string | undefined,
    connectionInstanceId: string,
    createThread: () => Promise<ThreadHandle>,
  ): Promise<ThreadHandle> {
    if (!cacheKey) {
      return createThread();
    }

    let threadPromise: Promise<ThreadHandle>;
    threadPromise = createThread().finally(() => {
      if (this.threadPromises.get(cacheKey) === threadPromise) {
        this.threadPromises.delete(cacheKey);
        this.threadPromiseConnectionInstances.delete(cacheKey);
      }
    });
    this.threadPromises.set(cacheKey, threadPromise);
    this.threadPromiseConnectionInstances.set(cacheKey, connectionInstanceId);
    return threadPromise;
  }

  private throwIfThreadWaitAborted(abortSignal: AbortSignal | undefined): void {
    if (abortSignal?.aborted) {
      throw createAbortError('Codex app-server thread wait aborted');
    }
  }

  private async waitForThreadHandle(
    thread: ThreadHandle | Promise<ThreadHandle>,
    abortSignal: AbortSignal | undefined,
    options: {
      abortMessage?: string;
      onAbortResolvedThread?: (threadHandle: ThreadHandle) => Promise<void>;
    } = {},
  ): Promise<ThreadHandle> {
    const threadPromise = Promise.resolve(thread);
    if (!abortSignal) {
      return threadPromise;
    }

    let abortCleanupScheduled = false;
    const scheduleAbortCleanup = () => {
      if (abortCleanupScheduled) {
        return;
      }
      abortCleanupScheduled = true;
      void threadPromise
        .then(async (threadHandle) => {
          if (options.onAbortResolvedThread) {
            await options.onAbortResolvedThread(threadHandle);
          }
        })
        .catch((error) => {
          logger.debug('[CodexAppServer] Thread request finished with error after abort', {
            error,
          });
        });
    };

    const createThreadAbortError = () =>
      createAbortError(options.abortMessage ?? 'Codex app-server thread wait aborted');

    if (abortSignal.aborted) {
      scheduleAbortCleanup();
      throw createThreadAbortError();
    }

    let abortListener: (() => void) | undefined;
    const abortPromise = new Promise<ThreadHandle>((_, reject) => {
      abortListener = () => {
        scheduleAbortCleanup();
        reject(createThreadAbortError());
      };
      abortSignal.addEventListener('abort', abortListener, { once: true });
    });

    try {
      return await Promise.race([threadPromise, abortPromise]);
    } finally {
      if (abortListener) {
        abortSignal.removeEventListener('abort', abortListener);
      }
    }
  }

  private scheduleThreadPoolEnforcement(
    fallbackConnection: CodexAppServerConnection,
    fallbackConnectionKey: string,
    config: CodexAppServerConfig,
  ): void {
    if (!config.persist_threads || config.thread_id) {
      return;
    }

    void this.enforceThreadPoolLimit(fallbackConnection, fallbackConnectionKey, config).catch(
      (error) => {
        logger.debug('[CodexAppServer] Error enforcing thread pool limit', { error });
      },
    );
  }

  private async enforceThreadPoolLimit(
    fallbackConnection: CodexAppServerConnection,
    fallbackConnectionKey: string,
    config: CodexAppServerConfig,
  ): Promise<void> {
    const poolSize = config.thread_pool_size ?? 1;
    while (this.threads.size > poolSize) {
      const evicted = await this.evictOldestInactiveCachedThread(
        fallbackConnection,
        fallbackConnectionKey,
        this.getRequestTimeoutMs(config),
      );
      if (!evicted) {
        return;
      }
    }
  }

  private async evictOldestInactiveCachedThread(
    fallbackConnection: CodexAppServerConnection,
    fallbackConnectionKey: string,
    timeoutMs: number,
  ): Promise<boolean> {
    for (const [cacheKey, handle] of this.threads) {
      if (this.isThreadProtected(handle.threadId)) {
        continue;
      }
      await this.evictCachedThread(fallbackConnection, fallbackConnectionKey, cacheKey, timeoutMs);
      return true;
    }

    logger.debug('[CodexAppServer] Thread pool is full, but all cached threads are active');
    return false;
  }

  private async evictCachedThread(
    fallbackConnection: CodexAppServerConnection,
    fallbackConnectionKey: string,
    cacheKey: string,
    timeoutMs: number,
  ): Promise<void> {
    const evicted = this.threads.get(cacheKey);
    this.threads.delete(cacheKey);
    if (!evicted) {
      return;
    }

    const connection =
      this.connections.get(evicted.connectionKey) ??
      (evicted.connectionKey === fallbackConnectionKey ? fallbackConnection : undefined);
    if (!connection) {
      logger.debug('[CodexAppServer] Evicted cached thread without an active connection', {
        threadId: evicted.threadId,
      });
      return;
    }

    try {
      await connection.request('thread/unsubscribe', { threadId: evicted.threadId }, { timeoutMs });
    } catch (error) {
      logger.warn('[CodexAppServer] Failed to unsubscribe evicted cached thread', {
        error,
        threadId: evicted.threadId,
      });
    }
  }

  private buildThreadStartParams(config: CodexAppServerConfig): Record<string, unknown> {
    return {
      ...(config.model ? { model: config.model } : {}),
      ...(config.model_provider ? { modelProvider: config.model_provider } : {}),
      ...(config.service_tier ? { serviceTier: config.service_tier } : {}),
      ...(config.working_dir ? { cwd: config.working_dir } : {}),
      approvalPolicy: config.approval_policy ?? 'never',
      ...(config.approvals_reviewer ? { approvalsReviewer: config.approvals_reviewer } : {}),
      sandbox: config.sandbox_mode ?? 'read-only',
      ...(Object.keys(config.cli_config ?? {}).length > 0 ? { config: config.cli_config } : {}),
      serviceName: 'promptfoo',
      ...(config.base_instructions ? { baseInstructions: config.base_instructions } : {}),
      ...(config.developer_instructions
        ? { developerInstructions: config.developer_instructions }
        : {}),
      ...(config.personality ? { personality: config.personality } : {}),
      ...(config.base_url
        ? { config: { ...(config.cli_config ?? {}), base_url: config.base_url } }
        : {}),
      ephemeral: config.ephemeral ?? true,
      experimentalRawEvents: config.experimental_raw_events ?? false,
      persistExtendedHistory: config.persist_extended_history ?? false,
    };
  }

  private buildThreadResumeParams(
    threadId: string,
    config: CodexAppServerConfig,
  ): Record<string, unknown> {
    return {
      threadId,
      ...(config.model ? { model: config.model } : {}),
      ...(config.model_provider ? { modelProvider: config.model_provider } : {}),
      ...(config.service_tier ? { serviceTier: config.service_tier } : {}),
      ...(config.working_dir ? { cwd: config.working_dir } : {}),
      approvalPolicy: config.approval_policy ?? 'never',
      ...(config.approvals_reviewer ? { approvalsReviewer: config.approvals_reviewer } : {}),
      sandbox: config.sandbox_mode ?? 'read-only',
      ...(Object.keys(config.cli_config ?? {}).length > 0 ? { config: config.cli_config } : {}),
      ...(config.base_instructions ? { baseInstructions: config.base_instructions } : {}),
      ...(config.developer_instructions
        ? { developerInstructions: config.developer_instructions }
        : {}),
      ...(config.personality ? { personality: config.personality } : {}),
      persistExtendedHistory: config.persist_extended_history ?? false,
    };
  }

  private buildTurnStartParams(
    threadId: string,
    input: CodexAppServerUserInput[],
    config: CodexAppServerConfig,
  ): Record<string, unknown> {
    return {
      threadId,
      input,
      ...(config.working_dir ? { cwd: config.working_dir } : {}),
      approvalPolicy: config.approval_policy ?? 'never',
      ...(config.approvals_reviewer ? { approvalsReviewer: config.approvals_reviewer } : {}),
      ...(config.sandbox_policy || config.network_access_enabled !== undefined
        ? { sandboxPolicy: this.buildSandboxPolicy(config) }
        : {}),
      ...(config.model ? { model: config.model } : {}),
      ...(config.service_tier ? { serviceTier: config.service_tier } : {}),
      ...(config.model_reasoning_effort ? { effort: config.model_reasoning_effort } : {}),
      ...(config.reasoning_summary ? { summary: config.reasoning_summary } : {}),
      ...(config.personality ? { personality: config.personality } : {}),
      ...(config.collaboration_mode ? { collaborationMode: config.collaboration_mode } : {}),
      ...(config.output_schema ? { outputSchema: config.output_schema } : {}),
    };
  }

  private buildSandboxPolicy(config: CodexAppServerConfig): Record<string, unknown> {
    if (config.sandbox_policy) {
      return config.sandbox_policy;
    }

    const networkAccess = config.network_access_enabled === true;
    switch (config.sandbox_mode ?? 'read-only') {
      case 'danger-full-access':
        return { type: 'dangerFullAccess' };
      case 'workspace-write':
        return {
          type: 'workspaceWrite',
          writableRoots: [
            config.working_dir as string,
            ...(config.additional_directories ?? []),
          ].filter(Boolean),
          readOnlyAccess: { type: 'fullAccess' },
          networkAccess,
          excludeTmpdirEnvVar: false,
          excludeSlashTmp: false,
        };
      case 'read-only':
      default:
        return {
          type: 'readOnly',
          access: { type: 'fullAccess' },
          networkAccess,
        };
    }
  }

  private parsePromptInput(prompt: string): CodexAppServerUserInput[] {
    let parsedPrompt: unknown;
    try {
      parsedPrompt = JSON.parse(prompt);
    } catch {
      // Non-JSON prompts are treated as plain text
      return [{ type: 'text', text: prompt, text_elements: [] }];
    }

    if (!Array.isArray(parsedPrompt) || parsedPrompt.length === 0) {
      return [{ type: 'text', text: prompt, text_elements: [] }];
    }

    const input: CodexAppServerUserInput[] = [];
    for (const item of parsedPrompt) {
      if (!this.isPromptInputItem(item)) {
        return [{ type: 'text', text: prompt, text_elements: [] }];
      }
      input.push(this.normalizePromptInputItem(item));
    }
    return input;
  }

  private isPromptInputItem(item: unknown): item is CodexAppServerPromptInputItem {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return false;
    }

    if ('type' in item && item.type === 'text') {
      return 'text' in item && typeof item.text === 'string';
    }
    if ('type' in item && item.type === 'image') {
      return 'url' in item && typeof item.url === 'string';
    }
    if ('type' in item && (item.type === 'local_image' || item.type === 'localImage')) {
      return 'path' in item && typeof item.path === 'string';
    }
    if ('type' in item && (item.type === 'skill' || item.type === 'mention')) {
      return (
        'name' in item &&
        typeof item.name === 'string' &&
        'path' in item &&
        typeof item.path === 'string'
      );
    }
    return false;
  }

  private normalizePromptInputItem(item: CodexAppServerPromptInputItem): CodexAppServerUserInput {
    switch (item.type) {
      case 'text':
        return { type: 'text', text: item.text, text_elements: [] };
      case 'image':
        return { type: 'image', url: item.url };
      case 'local_image':
      case 'localImage':
        return { type: 'localImage', path: item.path };
      case 'skill':
        return { type: 'skill', name: item.name, path: item.path };
      case 'mention':
        return { type: 'mention', name: item.name, path: item.path };
    }
  }

  private formatPromptInputForTrace(input: CodexAppServerUserInput[]): string {
    return input
      .map((item) => {
        switch (item.type) {
          case 'text':
            return item.text;
          case 'image':
            return `[image: ${item.url}]`;
          case 'localImage':
            return `[local_image: ${item.path}]`;
          case 'skill':
            return `[skill: ${item.name} ${item.path}]`;
          case 'mention':
            return `[mention: ${item.name} ${item.path}]`;
        }
      })
      .join('\n');
  }

  private createTurnState(
    connectionKey: string,
    connectionInstanceId: string,
    threadId: string,
    promptInput: CodexAppServerUserInput[],
    config: CodexAppServerConfig,
    appServerEnv: Record<string, string>,
  ): CodexAppServerTurnState {
    return {
      connectionKey,
      connectionInstanceId,
      threadId,
      config,
      appServerEnv,
      promptInput,
      items: [],
      itemStarts: [],
      notifications: [],
      notificationCount: 0,
      serverRequests: [],
      agentMessageDeltas: [],
      agentMessageDeltasByItemId: new Map(),
      completed: createDeferred<void>(),
      activeSpans: new Map(),
      itemStartTimes: new Map(),
      lastEventTime: Date.now(),
    };
  }

  private registerTurnState(state: CodexAppServerTurnState): void {
    this.activeTurnsByThread.set(state.threadId, state);
    if (state.turnId) {
      this.activeTurnsByTurn.set(state.turnId, state);
    }
  }

  private updateTurnStateId(state: CodexAppServerTurnState, turnId: string): void {
    if (state.turnId && state.turnId !== turnId) {
      this.activeTurnsByTurn.delete(state.turnId);
    }
    state.turnId = turnId;
    this.activeTurnsByTurn.set(turnId, state);
  }

  private unregisterTurnState(state: CodexAppServerTurnState): void {
    this.activeTurnsByThread.delete(state.threadId);
    if (state.turnId) {
      this.activeTurnsByTurn.delete(state.turnId);
    }
    this.endUnclosedItemSpans(state);
  }

  private protectThread(threadId: string): void {
    this.protectedThreadCounts.set(threadId, (this.protectedThreadCounts.get(threadId) ?? 0) + 1);
  }

  private unprotectThread(threadId: string): void {
    const count = this.protectedThreadCounts.get(threadId);
    if (!count || count <= 1) {
      this.protectedThreadCounts.delete(threadId);
      return;
    }
    this.protectedThreadCounts.set(threadId, count - 1);
  }

  private isThreadProtected(threadId: string): boolean {
    return (
      this.activeTurnsByThread.has(threadId) || (this.protectedThreadCounts.get(threadId) ?? 0) > 0
    );
  }

  private getTurnState(
    threadId?: string,
    turnId?: string | null,
  ): CodexAppServerTurnState | undefined {
    if (turnId) {
      return this.activeTurnsByTurn.get(turnId);
    }
    if (threadId) {
      return this.activeTurnsByThread.get(threadId);
    }
    return undefined;
  }

  private handleNotification(message: JsonRpcMessage): void {
    const params = message.params ?? {};
    const state = this.getTurnState(params.threadId, params.turnId);
    if (!state) {
      logger.debug('[CodexAppServer] Notification without active turn', { method: message.method });
      return;
    }

    state.notificationCount += 1;
    if (state.config.include_raw_events) {
      state.notifications.push(message);
    }
    const eventTime = Date.now();

    switch (message.method) {
      case 'turn/started':
        if (typeof params.turn?.id === 'string') {
          this.updateTurnStateId(state, params.turn.id);
        }
        break;
      case 'item/started':
        this.handleItemStarted(state, params.item, eventTime);
        break;
      case 'item/completed':
        this.handleItemCompleted(state, params.item, eventTime);
        break;
      case 'item/agentMessage/delta':
        this.handleAgentMessageDelta(state, params);
        break;
      case 'thread/tokenUsage/updated':
        state.rawTokenUsage = params.tokenUsage;
        state.tokenUsage = this.buildTokenUsage(params.tokenUsage);
        break;
      case 'turn/completed':
        state.turn = params.turn;
        if (params.turn?.status === 'failed') {
          state.error = params.turn?.error?.message ?? 'Codex app-server turn failed';
        }
        state.completed.resolve();
        break;
      case 'error':
        if (params.willRetry === true) {
          logger.debug('[CodexAppServer] Retryable error received', {
            error: params.error?.message,
            threadId: params.threadId,
            turnId: params.turnId,
          });
          break;
        }
        state.error = params.error?.message ?? 'Codex app-server error';
        state.completed.resolve();
        break;
    }

    state.lastEventTime = eventTime;
  }

  private handleItemStarted(state: CodexAppServerTurnState, item: any, eventTime: number): void {
    if (!item) {
      return;
    }
    state.itemStarts.push(item);
    if (!item.id) {
      return;
    }

    const itemId = String(item.id);
    const span = this.startItemSpan(item, itemId);
    state.activeSpans.set(itemId, span);
    state.itemStartTimes.set(itemId, eventTime);
  }

  private handleItemCompleted(state: CodexAppServerTurnState, item: any, eventTime: number): void {
    if (!item) {
      return;
    }

    state.items.push(item);
    const itemId = item.id ? String(item.id) : crypto.randomUUID();
    const span =
      state.activeSpans.get(itemId) ?? this.startItemSpan(item, itemId, state.lastEventTime);
    const startTime = state.itemStartTimes.get(itemId) ?? state.lastEventTime;
    this.applyItemCompletionAttributes(span, item, eventTime, startTime);
    span.end();
    state.activeSpans.delete(itemId);
    state.itemStartTimes.delete(itemId);
  }

  private handleAgentMessageDelta(state: CodexAppServerTurnState, params: any): void {
    if (typeof params.delta !== 'string') {
      return;
    }
    state.agentMessageDeltas.push(params.delta);
    if (typeof params.itemId === 'string') {
      const existing = state.agentMessageDeltasByItemId.get(params.itemId) ?? '';
      state.agentMessageDeltasByItemId.set(params.itemId, existing + params.delta);
    }
  }

  private async handleServerRequest(
    message: JsonRpcMessage,
    config: CodexAppServerConfig,
  ): Promise<unknown> {
    const params = message.params ?? {};
    const state = this.getTurnState(params.threadId ?? params.conversationId, params.turnId);
    const record: ServerRequestRecord = {
      id: message.id as JsonRpcId,
      method: message.method ?? 'unknown',
      params: this.sanitizeForMetadata(params),
    };

    try {
      const response = this.buildServerRequestResponse(message, state?.config ?? config);
      record.response = this.sanitizeForMetadata(response);
      state?.serverRequests.push(record);
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      record.error = errorMessage;
      state?.serverRequests.push(record);
      throw error;
    }
  }

  private buildServerRequestResponse(
    message: JsonRpcMessage,
    config: CodexAppServerConfig,
  ): unknown {
    const policy = config.server_request_policy ?? {};

    switch (message.method) {
      case 'item/commandExecution/requestApproval':
        return { decision: policy.command_execution ?? 'decline' };
      case 'execCommandApproval':
        return this.buildLegacyApprovalResponse(policy.command_execution);
      case 'item/fileChange/requestApproval':
        return { decision: policy.file_change ?? 'decline' };
      case 'applyPatchApproval':
        return this.buildLegacyApprovalResponse(policy.file_change);
      case 'item/permissions/requestApproval':
        return {
          permissions: policy.permissions?.permissions ?? {},
          scope: policy.permissions?.scope ?? 'turn',
        };
      case 'item/tool/requestUserInput':
        return this.buildUserInputResponse(message.params, policy.user_input ?? 'empty');
      case 'mcpServer/elicitation/request':
        return this.buildMcpElicitationResponse(policy.mcp_elicitation);
      case 'item/tool/call':
        return this.buildDynamicToolResponse(message.params, policy.dynamic_tools);
      case 'account/chatgptAuthTokens/refresh':
        throw new Error('ChatGPT auth token refresh requests are not supported by promptfoo');
      default:
        throw new Error(`Unsupported codex app-server request: ${message.method ?? 'unknown'}`);
    }
  }

  private buildLegacyApprovalResponse(
    decision:
      | CodexAppServerCommandExecutionApprovalDecision
      | CodexAppServerFileChangeApprovalDecision = 'decline',
  ): { decision: string } {
    if (typeof decision !== 'string') {
      return { decision: 'denied' };
    }

    switch (decision) {
      case 'accept':
        return { decision: 'approved' };
      case 'acceptForSession':
        return { decision: 'approved_for_session' };
      case 'cancel':
        return { decision: 'abort' };
      case 'decline':
        return { decision: 'denied' };
    }
  }

  private buildMcpElicitationResponse(policy: CodexAppServerMcpElicitationPolicy = 'decline'): {
    action: 'accept' | 'decline' | 'cancel';
    content: unknown;
    _meta: unknown;
  } {
    if (typeof policy === 'string') {
      return { action: policy, content: null, _meta: null };
    }

    return {
      action: policy.action,
      content: policy.content ?? null,
      _meta: policy._meta ?? null,
    };
  }

  private buildUserInputResponse(
    params: any,
    policy: CodexAppServerUserInputPolicy,
  ): { answers: Record<string, { answers: string[] }> } {
    const answers: Record<string, { answers: string[] }> = {};
    const questions = Array.isArray(params?.questions) ? params.questions : [];

    for (const question of questions) {
      if (!question?.id || typeof question.id !== 'string') {
        continue;
      }

      if (policy === 'empty') {
        answers[question.id] = { answers: [] };
        continue;
      }

      if (policy === 'first-option') {
        const firstLabel =
          Array.isArray(question.options) && typeof question.options[0]?.label === 'string'
            ? question.options[0].label
            : '';
        answers[question.id] = { answers: firstLabel ? [firstLabel] : [] };
        continue;
      }

      const configuredAnswer = policy[question.id];
      answers[question.id] = {
        answers: Array.isArray(configuredAnswer)
          ? configuredAnswer
          : configuredAnswer
            ? [configuredAnswer]
            : [],
      };
    }

    return { answers };
  }

  private buildDynamicToolResponse(
    params: any,
    tools: Record<string, CodexAppServerDynamicToolResponse> | undefined,
  ): {
    contentItems: Array<
      { type: 'inputText'; text: string } | { type: 'inputImage'; imageUrl: string }
    >;
    success: boolean;
  } {
    const configured = typeof params?.tool === 'string' ? tools?.[params.tool] : undefined;
    if (!configured) {
      return {
        contentItems: [{ type: 'inputText', text: 'No dynamic tool response configured.' }],
        success: false,
      };
    }

    return {
      contentItems: configured.contentItems ?? [{ type: 'inputText', text: configured.text ?? '' }],
      success: configured.success ?? true,
    };
  }

  private async waitForTurnCompletion(
    connection: CodexAppServerConnection,
    state: CodexAppServerTurnState,
    config: CodexAppServerConfig,
    callOptions?: CallApiOptionsParams,
  ): Promise<void> {
    const interruptTurn = () => {
      if (!state.turnId) {
        return;
      }
      void connection
        .request(
          'turn/interrupt',
          { threadId: state.threadId, turnId: state.turnId },
          { timeoutMs: 5_000 },
        )
        .catch((error) => {
          logger.debug('[CodexAppServer] Error interrupting turn', { error });
        });
    };
    let timeout: NodeJS.Timeout | undefined;
    let abortListener: (() => void) | undefined;

    const timeoutPromise = config.turn_timeout_ms
      ? new Promise<void>((_, reject) => {
          timeout = setTimeout(() => {
            interruptTurn();
            reject(new Error(`codex app-server turn timed out after ${config.turn_timeout_ms}ms`));
          }, config.turn_timeout_ms);
        })
      : undefined;

    const abortPromise = callOptions?.abortSignal
      ? new Promise<void>((_, reject) => {
          abortListener = () => {
            interruptTurn();
            reject(createAbortError('OpenAI Codex app-server call aborted'));
          };
          callOptions.abortSignal?.addEventListener('abort', abortListener, { once: true });
        })
      : undefined;

    try {
      await Promise.race(
        [state.completed.promise, timeoutPromise, abortPromise].filter(
          (promise): promise is Promise<void> => Boolean(promise),
        ),
      );
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (abortListener && callOptions?.abortSignal) {
        callOptions.abortSignal.removeEventListener('abort', abortListener);
      }
    }

    if (state.error) {
      throw new Error(state.error);
    }
  }

  private async cleanupThreadAfterTurn(
    connection: CodexAppServerConnection,
    threadHandle: ThreadHandle,
    config: CodexAppServerConfig,
    options: { skipIfActiveTurn?: boolean; skipIfProtected?: boolean } = {},
  ): Promise<void> {
    if (threadHandle.persistent || config.thread_cleanup === 'none') {
      return;
    }
    if (options.skipIfProtected && this.isThreadProtected(threadHandle.threadId)) {
      return;
    }
    if (options.skipIfActiveTurn && this.activeTurnsByThread.has(threadHandle.threadId)) {
      return;
    }
    if (config.thread_id && (this.protectedThreadCounts.get(threadHandle.threadId) ?? 0) > 1) {
      return;
    }
    if (config.thread_id && config.thread_cleanup === 'archive') {
      return;
    }

    try {
      if (config.thread_cleanup === 'archive') {
        await connection.request(
          'thread/archive',
          { threadId: threadHandle.threadId },
          { timeoutMs: this.getRequestTimeoutMs(config) },
        );
      } else {
        await connection.request(
          'thread/unsubscribe',
          { threadId: threadHandle.threadId },
          { timeoutMs: this.getRequestTimeoutMs(config) },
        );
      }
    } catch (error) {
      logger.warn('[CodexAppServer] Error cleaning up thread after turn', {
        threadId: threadHandle.threadId,
        error,
      });
    }
  }

  private getThreadRunQueueKey(
    config: CodexAppServerConfig,
    threadHandle: ThreadHandle,
  ): string | undefined {
    if (config.thread_id) {
      return `thread_id:${threadHandle.threadId}`;
    }
    if (config.deep_tracing) {
      return undefined;
    }
    if (threadHandle.persistent && threadHandle.cacheKey) {
      return threadHandle.cacheKey;
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
      throw createAbortError('Codex app-server thread turn wait aborted');
    }

    let onAbort: (() => void) | undefined;
    const abortPromise = new Promise<void>((_, reject) => {
      onAbort = () => reject(createAbortError('Codex app-server thread turn wait aborted'));
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

  private buildProviderResponse(
    state: CodexAppServerTurnState,
    threadHandle: ThreadHandle,
    config: CodexAppServerConfig,
  ): ProviderResponse {
    const output = this.getFinalOutput(state);
    const normalizedItems = state.items.map((item) => this.normalizeItemForMetadata(item));
    const raw = {
      output,
      thread: this.sanitizeForMetadata(threadHandle.response?.thread),
      turn: this.sanitizeForMetadata(state.turn),
      items: normalizedItems,
      tokenUsage: this.sanitizeForMetadata(state.rawTokenUsage),
      serverRequests: state.serverRequests,
      ...(config.include_raw_events
        ? { notifications: this.sanitizeForMetadata(state.notifications) }
        : {}),
    };
    const metadata = this.buildResponseMetadata(state, threadHandle, config, normalizedItems);

    return {
      output,
      tokenUsage: state.tokenUsage,
      cost: this.calculateResponseCost(state.tokenUsage, config.model),
      metadata,
      raw: JSON.stringify(raw),
      sessionId: threadHandle.threadId,
    };
  }

  private getFinalOutput(state: CodexAppServerTurnState): string {
    const completedAgentMessages = state.items
      .filter((item) => item?.type === 'agentMessage' && typeof item.text === 'string')
      .map((item) => item.text);

    if (completedAgentMessages.length > 0) {
      return completedAgentMessages[completedAgentMessages.length - 1];
    }

    const deltaMessages = Array.from(state.agentMessageDeltasByItemId.values()).filter(Boolean);
    if (deltaMessages.length > 0) {
      return deltaMessages[deltaMessages.length - 1];
    }

    return state.agentMessageDeltas.join('');
  }

  private buildResponseMetadata(
    state: CodexAppServerTurnState,
    threadHandle: ThreadHandle,
    config: CodexAppServerConfig,
    normalizedItems: Record<string, unknown>[],
  ): ProviderResponse['metadata'] {
    const skillMetadata = this.buildSkillMetadata(
      state.items,
      this.getSkillRootPrefixes(config, state.appServerEnv),
    );
    return {
      codexAppServer: {
        threadId: threadHandle.threadId,
        turnId: state.turnId,
        model: config.model,
        modelProvider: config.model_provider,
        cwd: config.working_dir,
        sandboxMode: config.sandbox_mode ?? 'read-only',
        approvalPolicy: config.approval_policy ?? 'never',
        itemCounts: this.getItemCounts(state.items),
        items: normalizedItems,
        serverRequests: state.serverRequests,
        notificationCount: state.notificationCount,
      },
      ...(skillMetadata?.skillCalls.length ? { skillCalls: skillMetadata.skillCalls } : {}),
      ...(skillMetadata &&
      skillMetadata.attemptedSkillCalls.length > skillMetadata.skillCalls.length
        ? { attemptedSkillCalls: skillMetadata.attemptedSkillCalls }
        : {}),
    };
  }

  private normalizeItemForMetadata(item: any): Record<string, unknown> {
    const base: Record<string, unknown> = {
      id: item?.id,
      type: item?.type,
      status: item?.status,
    };

    switch (item?.type) {
      case 'commandExecution':
        return this.sanitizeForMetadata({
          ...base,
          command: item.command,
          cwd: item.cwd,
          exitCode: item.exitCode,
          durationMs: item.durationMs,
          aggregatedOutput: item.aggregatedOutput,
        }) as Record<string, unknown>;
      case 'fileChange':
        return this.sanitizeForMetadata({
          ...base,
          changes: item.changes,
        }) as Record<string, unknown>;
      case 'mcpToolCall':
        return this.sanitizeForMetadata({
          ...base,
          server: item.server,
          tool: item.tool,
          arguments: item.arguments,
          result: item.result,
          error: item.error,
          durationMs: item.durationMs,
        }) as Record<string, unknown>;
      case 'dynamicToolCall':
        return this.sanitizeForMetadata({
          ...base,
          tool: item.tool,
          arguments: item.arguments,
          success: item.success,
          contentItems: item.contentItems,
          durationMs: item.durationMs,
        }) as Record<string, unknown>;
      case 'webSearch':
        return this.sanitizeForMetadata({
          ...base,
          query: item.query,
          action: item.action,
        }) as Record<string, unknown>;
      case 'agentMessage':
        return this.sanitizeForMetadata({ ...base, text: item.text }) as Record<string, unknown>;
      case 'reasoning':
        return this.sanitizeForMetadata({
          ...base,
          summary: item.summary,
          content: item.content,
        }) as Record<string, unknown>;
      default:
        return this.sanitizeForMetadata(base) as Record<string, unknown>;
    }
  }

  private buildTokenUsage(rawTokenUsage: any): ProviderResponse['tokenUsage'] {
    const usage = rawTokenUsage?.last ?? rawTokenUsage?.total ?? rawTokenUsage;
    if (!usage) {
      return undefined;
    }
    const prompt = usage.inputTokens ?? usage.input_tokens;
    const completion = usage.outputTokens ?? usage.output_tokens;
    const cached = usage.cachedInputTokens ?? usage.cached_input_tokens ?? 0;
    if (typeof prompt !== 'number' || typeof completion !== 'number') {
      return undefined;
    }
    return {
      prompt,
      completion,
      total: prompt + completion,
      cached,
    };
  }

  private calculateResponseCost(
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
    return (
      uncachedInputTokens * (pricing.input / 1_000_000) +
      cachedTokens * (pricing.cache_read / 1_000_000) +
      (tokenUsage.completion || 0) * (pricing.output / 1_000_000)
    );
  }

  private getItemCounts(items: any[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of items) {
      const type = typeof item?.type === 'string' ? item.type : 'unknown';
      counts[type] = (counts[type] ?? 0) + 1;
    }
    return counts;
  }

  private validateWorkingDirectory(workingDir: string, skipGitCheck = false): void {
    const cacheKey = `${workingDir}:${skipGitCheck}`;
    if (this.validatedWorkingDirs.has(cacheKey)) {
      return;
    }

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

        Codex app-server requires a Git repository by default to prevent unrecoverable errors.

        To bypass this check, set skip_git_repo_check: true in your provider config.`,
      );
    }

    this.validatedWorkingDirs.add(cacheKey);
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

  private warnOnceForDeepTracingThreadOptions(config: CodexAppServerConfig): void {
    if (
      !config.deep_tracing ||
      this.deepTracingWarningShown ||
      (!config.persist_threads && (config.thread_pool_size ?? 0) <= 1)
    ) {
      return;
    }

    logger.warn(
      '[CodexAppServer] deep_tracing requires a fresh app-server process per call. ' +
        'Persistent thread pooling options (persist_threads, thread_pool_size) are ignored when deep_tracing is enabled. ' +
        'Explicit thread_id values are still resumed and serialized.',
    );
    this.deepTracingWarningShown = true;
  }

  private startItemSpan(item: any, itemId: string, startTime?: number): Span {
    return trace.getTracer('promptfoo.codex-app-server').startSpan(this.getSpanNameForItem(item), {
      kind: SpanKind.INTERNAL,
      ...(startTime === undefined ? {} : { startTime }),
      attributes: {
        'codex.app_server.item.id': itemId,
        'codex.app_server.item.type': item?.type ?? 'unknown',
        ...this.getAttributesForItem(item),
      },
    });
  }

  private applyItemCompletionAttributes(
    span: Span,
    item: any,
    eventTime: number,
    startTime: number,
  ): void {
    for (const [key, value] of Object.entries(this.getCompletionAttributesForItem(item))) {
      span.setAttribute(key, value);
    }
    span.setAttribute('codex.app_server.duration_ms', eventTime - startTime);
    if (this.isItemError(item)) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: this.getItemErrorMessage(item) });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }
  }

  private endUnclosedItemSpans(state: CodexAppServerTurnState): void {
    for (const [itemId, span] of state.activeSpans) {
      logger.warn('[CodexAppServer] Item span not properly closed', { itemId });
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Span not properly closed' });
      span.end();
    }
    state.activeSpans.clear();
    state.itemStartTimes.clear();
  }

  private getSpanNameForItem(item: any): string {
    switch (item?.type) {
      case 'commandExecution': {
        const cmd =
          typeof item.command === 'string' ? item.command.split(' ')[0] || 'command' : 'command';
        return `exec ${cmd}`;
      }
      case 'fileChange':
        return 'file change';
      case 'mcpToolCall':
        return `mcp ${item.server ?? 'unknown'}/${item.tool ?? 'unknown'}`;
      case 'dynamicToolCall':
        return `tool ${item.tool ?? 'unknown'}`;
      case 'agentMessage':
        return 'agent response';
      case 'reasoning':
        return 'reasoning';
      case 'webSearch':
        return 'web search';
      default:
        return `codex.app_server.${item?.type ?? 'unknown'}`;
    }
  }

  private getAttributesForItem(item: any): Record<string, string | number | boolean> {
    const attrs: Record<string, string | number | boolean> = {};
    if (item?.type === 'commandExecution' && typeof item.command === 'string') {
      attrs['codex.command'] =
        this.sanitizeTraceText(item.command, 'Codex app-server command trace attribute') ?? '';
    }
    if (item?.type === 'mcpToolCall') {
      if (typeof item.server === 'string') {
        attrs['codex.mcp.server'] = item.server;
      }
      if (typeof item.tool === 'string') {
        attrs['codex.mcp.tool'] = item.tool;
      }
    }
    if (item?.type === 'dynamicToolCall' && typeof item.tool === 'string') {
      attrs['codex.tool.name'] = item.tool;
    }
    if (item?.type === 'webSearch' && typeof item.query === 'string') {
      attrs['codex.search.query'] =
        this.sanitizeTraceText(item.query, 'Codex app-server web search trace attribute') ?? '';
    }
    return attrs;
  }

  private getCompletionAttributesForItem(item: any): Record<string, string | number | boolean> {
    const attrs: Record<string, string | number | boolean> = {};
    if (typeof item?.status === 'string') {
      attrs['codex.status'] = item.status;
    }
    if (item?.type === 'commandExecution') {
      if (typeof item.exitCode === 'number') {
        attrs['codex.exit_code'] = item.exitCode;
      }
      if (typeof item.aggregatedOutput === 'string') {
        attrs['codex.output'] =
          this.sanitizeTraceText(
            item.aggregatedOutput,
            'Codex app-server command output trace attribute',
          ) ?? '';
      }
    }
    if (item?.type === 'agentMessage' && typeof item.text === 'string') {
      attrs['codex.message'] =
        this.sanitizeTraceText(item.text, 'Codex app-server message trace attribute') ?? '';
    }
    return attrs;
  }

  private isItemError(item: any): boolean {
    return (
      item?.status === 'failed' ||
      item?.status === 'declined' ||
      item?.error !== undefined ||
      (item?.type === 'commandExecution' &&
        typeof item.exitCode === 'number' &&
        item.exitCode !== 0)
    );
  }

  private getItemErrorMessage(item: any): string {
    return (
      (typeof item?.error?.message === 'string' ? item.error.message : null) ||
      (item?.type === 'commandExecution' && item.exitCode !== 0
        ? `Command exited with code ${item.exitCode}`
        : null) ||
      'Item failed'
    );
  }

  private getSkillRootPrefixes(
    config: CodexAppServerConfig,
    appServerEnv: Record<string, string>,
  ): string[] {
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

    addPrefix(appServerEnv.CODEX_HOME);
    addPrefix('/etc/codex');
    if (config.working_dir) {
      const resolvedWorkingDir = path.resolve(config.working_dir).replace(/\\/g, '/');
      addPrefix(path.posix.join(resolvedWorkingDir, '.agents'));
      const gitRoot = this.findGitRepositoryRoot(resolvedWorkingDir);
      if (gitRoot) {
        addPrefix(path.posix.join(gitRoot.replace(/\\/g, '/'), '.agents'));
      }
    }
    const homeDir = appServerEnv.HOME || appServerEnv.USERPROFILE;
    if (homeDir) {
      addPrefix(path.posix.join(homeDir.replace(/\\/g, '/'), '.codex'));
    }
    return Array.from(prefixes);
  }

  private buildSkillMetadata(
    items: any[],
    skillRootPrefixes: readonly string[],
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

  private extractSkillCallsFromItems(
    items: any[],
    skillRootPrefixes: readonly string[],
    options: { requireSuccessfulCommand?: boolean } = {},
  ): SkillCallEntry[] {
    const skillCalls = new Map<string, { name: string; path: string }>();
    for (const item of items) {
      if (item?.type !== 'commandExecution') {
        continue;
      }
      if (options.requireSuccessfulCommand && !this.isSuccessfulCommandExecution(item)) {
        continue;
      }
      if (typeof item.command !== 'string' || !item.command.trim()) {
        continue;
      }

      for (const skillPath of this.extractSkillPathCandidates(item.command, skillRootPrefixes)) {
        skillCalls.set(skillPath.path, skillPath);
      }
    }

    return Array.from(skillCalls.values()).map((skillCall) => ({
      name: skillCall.name,
      path: skillCall.path,
      source: 'heuristic',
    }));
  }

  private isSuccessfulCommandExecution(item: any): boolean {
    if (item?.type !== 'commandExecution') {
      return false;
    }
    if (typeof item.status === 'string' && item.status !== 'completed') {
      return false;
    }
    if (typeof item.exitCode === 'number' && item.exitCode !== 0) {
      return false;
    }
    return true;
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
      if (repoMatch && this.isValidSkillName(repoMatch[1])) {
        matches.set(normalizedPath, { name: repoMatch[1], path: normalizedPath });
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
      if (customRootMatch && this.isValidSkillName(customRootMatch[1])) {
        matches.set(normalizedPath, { name: customRootMatch[1], path: normalizedPath });
      }
    }
    return Array.from(matches.values());
  }

  private isValidSkillName(name: string): boolean {
    return /^[A-Za-z0-9._:-]+$/.test(name);
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
    } catch (error) {
      logger.debug('[CodexAppServer] Failed to stringify sanitized trace text', { error });
      return undefined;
    }
  }

  private sanitizeForMetadata(value: unknown): unknown {
    return this.redactTracePii(sanitizeObject(value, { context: 'Codex app-server metadata' }));
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
}
