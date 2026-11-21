import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { z } from 'zod';
import cliState from '../cliState';
import logger from '../logger';
import { extractProviderResponseAttributes, withGenAISpan } from '../tracing/genaiTracer';
import { REDACTED } from '../util/sanitizer';
import { escapeRegExp } from '../util/text';
import { getProjectPathCheck, resolveAgentExecutable } from './agentExecutable';
import { resolveAgenticWorkingDir } from './agentic-utils';
import { isAgentWorkspace } from './agentWorkspace';
import { hasAgentEnvOverride } from './env';
import { providerRegistry } from './providerRegistry';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/providers';

const MuseCodeConfigSchema = z.object({
  basePath: z.string().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  provider: z.unknown().optional(),
  linkedTargetId: z.string().optional(),
  muse_path: z.string().min(1).optional(),
  working_dir: z.string().min(1).optional(),
  model: z
    .string()
    .regex(/^[a-zA-Z0-9][\w.:/-]*$/)
    .optional(),
  reasoning_effort: z.enum(['minimal', 'low', 'medium', 'high', 'xhigh', 'ultra']).optional(),
  approval_mode: z.enum(['untrusted', 'on-request', 'never']).optional(),
  approval_judge: z.boolean().optional(),
  sandbox_network: z.enum(['proxy-only', 'restricted', 'enabled']).optional(),
  disable_sandbox: z.boolean().optional(),
  disable_shell: z.boolean().optional(),
  disable_write: z.boolean().optional(),
  disable_web_tools: z.boolean().optional(),
  trust_workspace: z.boolean().optional(),
  no_foreign_personal_context: z.boolean().optional(),
  no_session_log: z.boolean().optional(),
  session_id: z.uuid().toLowerCase().optional(),
  max_model_steps: z.number().int().positive().optional(),
  timeout_ms: z.number().int().positive().max(2_147_483_647).optional(),
  max_output_bytes: z.number().int().positive().optional(),
});

type MuseCodeConfig = z.infer<typeof MuseCodeConfigSchema>;

const variable = /^{{\s*(\w+)\s*}}$/;
const TemplateStringSchema = z.string().regex(variable);
const TurnSchema = z.strictObject({
  model: MuseCodeConfigSchema.shape.model.or(TemplateStringSchema),
  reasoning_effort: MuseCodeConfigSchema.shape.reasoning_effort.or(TemplateStringSchema),
  session_id: MuseCodeConfigSchema.shape.session_id.or(TemplateStringSchema),
});
const MuseCodeInputSchema = MuseCodeConfigSchema.extend(TurnSchema.shape).strict();

type MuseCodeInputConfig = z.infer<typeof MuseCodeInputSchema>;

// Muse Code 1.0.2 emits versioned journal envelopes, not Codex's item.* events.
const MuseEventSchema = z
  .object({
    schema_version: z.literal(1),
    stream: z.object({ kind: z.string(), id: z.string() }),
    payload_type: z.string(),
    payload: z.record(z.string(), z.unknown()),
  })
  .passthrough();

type MuseEvent = z.infer<typeof MuseEventSchema>;

interface ProcessResult {
  stdout: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error?: string;
}

const PROCESS_ENV_KEYS = [
  'PATH',
  'Path',
  'HOME',
  'USER',
  'USERNAME',
  'USERPROFILE',
  'TMPDIR',
  'TMP',
  'TEMP',
  'SystemRoot',
  'LANG',
  'LC_ALL',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'MUSE_AUTH_PATH',
  'META_API_KEY',
] as const;

const CLI_NOT_FOUND_MESSAGE =
  'Muse Code CLI was not found. Install it outside the project and include a trusted directory in PATH. See https://dev.meta.ai/docs/muse-code or set muse_path / MUSE_CLI_PATH.';

function getRunId(event: MuseEvent): string | undefined {
  const stream = event.payload.run_stream;
  if (stream && typeof stream === 'object' && 'id' in stream && typeof stream.id === 'string') {
    return stream.id;
  }
  return undefined;
}

function parseResponse(result: ProcessResult): ProviderResponse {
  if (result.error) {
    return { error: result.error };
  }

  const processError =
    result.exitCode === 0
      ? undefined
      : `Muse Code exited with ${result.signal ? `signal ${result.signal}` : `code ${result.exitCode}`}`;
  let events: MuseEvent[];
  try {
    events = result.stdout
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => MuseEventSchema.parse(JSON.parse(line)));
  } catch {
    return { error: processError ?? 'Muse Code returned invalid or unsupported JSONL events' };
  }

  const sessionId = events.find((event) => event.stream.kind === 'session')?.stream.id;
  if (sessionId && !z.uuid().safeParse(sessionId).success) {
    return { error: 'Muse Code returned an invalid session ID' };
  }
  const sessionEvents = events
    .filter((event) => event.stream.kind === 'session' && event.stream.id === sessionId)
    .reverse();
  const linkedRun = sessionEvents.find((event) => event.payload_type === 'session.run.linked');
  const runId = linkedRun && getRunId(linkedRun);
  const terminal = runId
    ? sessionEvents.find(
        (event) => event.payload_type.startsWith('run.terminal.') && getRunId(event) === runId,
      )
    : undefined;
  const response: ProviderResponse = {
    sessionId: sessionId?.toLowerCase(),
    metadata: { runId },
  };

  if (processError) {
    return { ...response, error: processError };
  }
  if (!terminal) {
    return { ...response, error: 'Muse Code exited without a terminal event for the current run' };
  }
  if (
    terminal.payload_type !== 'run.terminal.completed' ||
    terminal.payload.terminal !== 'completed'
  ) {
    const reason =
      typeof terminal.payload.reason === 'string' ? terminal.payload.reason : terminal.payload_type;
    return { ...response, error: `Muse Code run failed: ${reason}` };
  }
  if (typeof terminal.payload.text !== 'string') {
    return { ...response, error: 'Muse Code completed without final response text' };
  }
  return { ...response, output: terminal.payload.text };
}

function redactCredentials(response: ProviderResponse, credentials: Set<string>): ProviderResponse {
  if (!credentials.size) {
    return response;
  }
  const pattern = new RegExp(
    [...credentials]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join('|'),
    'g',
  );
  return JSON.parse(
    JSON.stringify(response, (_key, value) =>
      typeof value === 'string' ? value.replace(pattern, REDACTED) : value,
    ),
  );
}

const processSettings = ['META_API_KEY', 'MUSE_AUTH_PATH', 'MUSE_CLI_PATH'];
const overrideError =
  'Muse Code does not accept inline credentials or child env. Use a stored login or set META_API_KEY, MUSE_AUTH_PATH and MUSE_CLI_PATH in the process environment.';

// Canonical paths prevent separate provider instances from writing to the same workspace.
const activeWorkspaces = new Set<string>();

/** Runs Meta's installed Muse Code CLI. Each call starts a new session unless explicitly resumed. */
export class MuseCodeProvider implements ApiProvider {
  readonly supportsAgenticGrading = true;
  readonly handlesOwnRetries = true;
  config: MuseCodeInputConfig;
  private readonly providerId: string;
  private readonly calls = new Map<AbortController, Promise<ProviderResponse>>();
  private readonly activeSessions = new Set<string>();
  private readonly sessions = new Map<string, { workspace: string; credentials: Set<string> }>();

  constructor(options: ProviderOptions = {}) {
    if (
      options.config?.apiKey !== undefined ||
      options.config?.env !== undefined ||
      hasAgentEnvOverride(processSettings, options.env)
    ) {
      throw new Error(overrideError);
    }
    this.config = MuseCodeInputSchema.parse(options.config ?? {});
    for (const key of ['basePath', 'working_dir', 'muse_path'] as const) {
      if (/{[{%#]/.test(this.config[key] ?? '')) {
        throw new Error(`Muse Code ${key} must be a static provider setting`);
      }
    }
    this.providerId = options.id ?? 'muse-code';
    providerRegistry.register(this);
  }

  id(): string {
    return this.providerId;
  }

  toString(): string {
    return '[Muse Code Provider]';
  }

  toJSON() {
    return { provider: this.id() };
  }

  // Muse Code can authenticate with a stored login instead of an explicit API key.
  requiresApiKey(): boolean {
    return false;
  }

  private buildEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const key of PROCESS_ENV_KEYS) {
      if (process.env[key] !== undefined) {
        env[key] = process.env[key];
      }
    }
    env.MUSE_NO_AUTO_UPDATE = '1';
    return env;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (options?.abortSignal?.aborted) {
      return { error: 'Muse Code call aborted before it started' };
    }
    if (hasAgentEnvOverride(processSettings)) {
      return { error: overrideError };
    }
    let config: MuseCodeConfig;
    try {
      // Only turn settings can come from test data. Promptfoo also attaches
      // an optional live provider instance, which must never be rendered.
      const {
        provider: _provider,
        prefix: _prefix,
        suffix: _suffix,
        working_dir,
        ...overrides
      } = context?.prompt?.config ?? {};
      if (
        working_dir !== undefined &&
        !(context?.isGrading && typeof working_dir === 'string' && isAgentWorkspace(working_dir))
      ) {
        throw new Error('Set working_dir in the Muse Code provider configuration');
      }
      const { model, reasoning_effort, session_id } = this.config;
      const turn = TurnSchema.parse({ model, reasoning_effort, session_id, ...overrides });
      const resolve = (value?: string) => {
        const match = value?.match(variable);
        return match ? (context?.vars[match[1]] ?? '') : value;
      };
      config = MuseCodeConfigSchema.parse({
        ...this.config,
        working_dir: working_dir ?? this.config.working_dir,
        model: resolve(turn.model),
        reasoning_effort: resolve(turn.reasoning_effort),
        session_id: resolve(turn.session_id),
      });
      if (config.no_session_log === false && !config.working_dir) {
        throw new Error('no_session_log: false requires working_dir to retain a usable session');
      }
      if (config.session_id && config.no_session_log) {
        throw new Error('session_id cannot be combined with no_session_log');
      }
      if (config.session_id && !config.working_dir) {
        throw new Error('session_id requires working_dir to keep the session workspace stable');
      }
      if (config.session_id && !this.sessions.has(config.session_id)) {
        throw new Error('session_id can only resume a session started by this provider instance');
      }
    } catch (error) {
      return {
        error: `Invalid Muse Code config: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    if (config.session_id && this.activeSessions.has(config.session_id)) {
      return {
        error:
          'Muse Code session_id is already in use. Set evaluateOptions.maxConcurrency to 1 when resuming a session.',
      };
    }
    if (config.session_id) {
      this.activeSessions.add(config.session_id);
    }

    const controller = new AbortController();
    const signal = options?.abortSignal
      ? AbortSignal.any([controller.signal, options.abortSignal])
      : controller.signal;
    const call = withGenAISpan(
      {
        system: 'meta',
        operationName: 'invoke_agent',
        model: config.model ?? 'Muse Code',
        agentName: 'Muse Code',
        providerId: this.id(),
        evalId: context?.evaluationId,
        testIndex: context?.testIdx,
        promptLabel: context?.prompt?.label,
        traceparent: context?.traceparent,
        requestBody: prompt,
      },
      () => this.run(prompt, config, signal),
      extractProviderResponseAttributes,
    );
    this.calls.set(controller, call);
    try {
      return await call;
    } finally {
      this.calls.delete(controller);
      if (config.session_id) {
        this.activeSessions.delete(config.session_id);
      }
    }
  }

  private buildArgs(config: MuseCodeConfig, workspace: string, promptFile: string): string[] {
    const args = [
      'exec',
      '--json',
      '--workspace',
      workspace,
      '--prompt-file',
      promptFile,
      '--user-input-auto-resolve',
    ];
    const values = {
      model: config.model,
      'reasoning-effort': config.reasoning_effort,
      'approval-mode': config.approval_mode,
      'approval-judge':
        config.approval_judge === undefined ? undefined : config.approval_judge ? 'on' : 'off',
      'sandbox-network': config.sandbox_network ?? 'restricted',
      'session-id': config.session_id,
      'max-model-steps': config.max_model_steps,
    };
    for (const [flag, value] of Object.entries(values)) {
      if (value !== undefined) {
        args.push(`--${flag}`, String(value));
      }
    }
    const flags = {
      'disable-sandbox': config.disable_sandbox,
      'disable-shell': config.disable_shell !== false,
      'disable-write': config.disable_write !== false,
      'disable-web-tools': config.disable_web_tools !== false,
      'trust-workspace': config.trust_workspace,
      'no-foreign-personal-context': config.no_foreign_personal_context !== false,
      'no-session-log': config.no_session_log ?? !config.session_id,
    };
    for (const [flag, enabled] of Object.entries(flags)) {
      if (enabled) {
        args.push(`--${flag}`);
      }
    }
    return args;
  }

  private async run(
    prompt: string,
    config: MuseCodeConfig,
    signal: AbortSignal,
  ): Promise<ProviderResponse> {
    let tempDir: string | undefined;
    let lockedWorkspace: string | undefined;
    const env = this.buildEnv();
    const session = config.session_id ? this.sessions.get(config.session_id) : undefined;
    const credentials = session?.credentials ?? new Set<string>();
    if (env.META_API_KEY) {
      credentials.add(env.META_API_KEY);
    }
    try {
      signal.throwIfAborted();
      const basePath = config.basePath ?? cliState.basePath;
      let workspace = resolveAgenticWorkingDir(config.working_dir, basePath);
      if (workspace) {
        workspace = await fs.realpath(workspace);
        if (!(await fs.stat(workspace)).isDirectory()) {
          throw new Error(`working_dir is not a directory: ${workspace}`);
        }
      }
      if (session && session.workspace !== workspace) {
        throw new Error('session_id requires its original working_dir');
      }
      if (
        workspace &&
        (config.disable_shell === false || config.disable_write === false || config.trust_workspace)
      ) {
        if (activeWorkspaces.has(workspace)) {
          throw new Error(
            'working_dir is already in use. Set evaluateOptions.maxConcurrency to 1 for calls that can modify the same workspace.',
          );
        }
        activeWorkspaces.add(workspace);
        lockedWorkspace = workspace;
      }
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-muse-code-'));
      if (!workspace) {
        workspace = path.join(tempDir, 'workspace');
        await fs.mkdir(workspace);
      }
      const promptFile = path.join(tempDir, 'prompt.txt');
      await fs.writeFile(promptFile, prompt, { mode: 0o600 });
      signal.throwIfAborted();
      const configuredPath = config.muse_path ?? process.env.MUSE_CLI_PATH ?? 'muse';
      const isLocal = await getProjectPathCheck(workspace, basePath);
      const command = await resolveAgentExecutable(configuredPath, env, isLocal, basePath);
      if (!command) {
        throw new Error(CLI_NOT_FOUND_MESSAGE);
      }
      signal.throwIfAborted();
      const result = await this.execute(
        command,
        this.buildArgs(config, workspace, promptFile),
        workspace,
        config,
        signal,
        env,
      );
      // Redact credentials from the actual child environment before tracing or persistence.
      const response = parseResponse(result);
      if (
        response.sessionId &&
        config.working_dir &&
        (config.session_id || config.no_session_log === false)
      ) {
        this.sessions.set(response.sessionId, { workspace, credentials });
      }
      return redactCredentials(response, credentials);
    } catch (error) {
      return redactCredentials(
        {
          error: signal.aborted
            ? 'Muse Code call aborted'
            : `Muse Code: ${error instanceof Error ? error.message : String(error)}`,
        },
        credentials,
      );
    } finally {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch((error) => {
          logger.warn('[MuseCode] Failed to remove temporary workspace', { error });
        });
      }
      if (lockedWorkspace) {
        activeWorkspaces.delete(lockedWorkspace);
      }
    }
  }

  private execute(
    command: string,
    args: string[],
    workspace: string,
    config: MuseCodeConfig,
    signal: AbortSignal,
    env: NodeJS.ProcessEnv,
  ): Promise<ProcessResult> {
    return new Promise((resolve) => {
      const detached = process.platform !== 'win32';
      const child = spawn(command, args, {
        cwd: workspace,
        env,
        detached,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });
      let stdout = '';
      let bytes = 0;
      let error: string | undefined;
      let settled = false;
      let exited = false;
      let exitCode: number | null = null;
      let exitSignal: NodeJS.Signals | null = null;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const kill = (killSignal: NodeJS.Signals) => {
        if (!child.pid) {
          return;
        }
        try {
          if (detached) {
            process.kill(-child.pid, killSignal);
          } else {
            child.kill(killSignal);
          }
        } catch (killError) {
          if ((killError as NodeJS.ErrnoException).code !== 'ESRCH') {
            logger.debug('[MuseCode] Failed to stop process', { error: killError });
          }
        }
      };
      const finish = (code: number | null, processSignal: NodeJS.Signals | null) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        clearTimeout(killTimer);
        signal.removeEventListener('abort', onAbort);
        resolve({ stdout, exitCode: code, signal: processSignal, error });
      };
      const boundCleanup = () => {
        if (killTimer) {
          return;
        }
        killTimer = setTimeout(() => {
          if (!exited) {
            kill('SIGKILL');
          }
          error ??= 'Muse Code output pipes did not close after termination';
          // A descendant can escape the process group while retaining these pipes.
          child.stdout!.destroy();
          child.stderr!.destroy();
          finish(exitCode, exitSignal);
        }, 1000);
      };
      const stop = (message: string) => {
        if (error || settled) {
          return;
        }
        error = message;
        kill('SIGTERM');
        boundCleanup();
      };
      const onAbort = () => stop('Muse Code call aborted');
      const timeoutMs = config.timeout_ms ?? 300_000;
      const timer = setTimeout(() => stop(`Muse Code timed out after ${timeoutMs}ms`), timeoutMs);
      const collect = (chunk: string, stream: 'stdout' | 'stderr') => {
        if (error || settled) {
          return;
        }
        bytes += Buffer.byteLength(chunk);
        if (bytes > (config.max_output_bytes ?? 10 * 1024 * 1024)) {
          stop('Muse Code exceeded max_output_bytes');
        } else if (stream === 'stdout') {
          stdout += chunk;
        }
      };
      child.stdout!.setEncoding('utf8').on('data', (chunk: string) => collect(chunk, 'stdout'));
      child.stderr!.setEncoding('utf8').on('data', (chunk: string) => collect(chunk, 'stderr'));
      child.on('error', (spawnError: NodeJS.ErrnoException) => {
        stop(
          spawnError.code === 'ENOENT'
            ? CLI_NOT_FOUND_MESSAGE
            : `Muse Code process error: ${spawnError.message}`,
        );
      });
      child.once('exit', (code, processSignal) => {
        if (settled) {
          return;
        }
        exited = true;
        exitCode = code;
        exitSignal = processSignal;
        // Background tools can keep inherited pipes open after the CLI exits.
        // Stop them before waiting for `close`, which requires those pipes to close.
        if (detached) {
          kill('SIGKILL');
        }
        boundCleanup();
      });
      child.once('close', finish);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) {
        onAbort();
      }
    });
  }

  async cleanup(): Promise<void> {
    const calls = Array.from(this.calls);
    for (const [controller] of calls) {
      controller.abort();
    }
    await Promise.allSettled(calls.map(([, call]) => call));
  }

  async shutdown(): Promise<void> {
    try {
      await this.cleanup();
    } finally {
      this.sessions.clear();
      providerRegistry.unregister(this);
    }
  }
}
