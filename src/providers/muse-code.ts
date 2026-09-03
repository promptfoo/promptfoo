import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { z } from 'zod';
import cliState from '../cliState';
import { getEnvString } from '../envars';
import logger from '../logger';
import { extractProviderResponseAttributes, withGenAISpan } from '../tracing/genaiTracer';
import { renderVarsInObject } from '../util/render';
import { collectEnvCredentials, REDACTED } from '../util/sanitizer';
import { escapeRegExp } from '../util/text';
import { resolveAgenticWorkingDir } from './agentic-utils';
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
  apiKey: z.string().min(1).optional(),
  muse_path: z.string().min(1).optional(),
  working_dir: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  base_url: z
    .url()
    .refine((value) => collectEnvCredentials({}, value).length === 0, {
      message: 'base_url must not contain credentials; use apiKey or META_API_KEY instead',
    })
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
  session_id: z.uuid().optional(),
  max_model_steps: z.number().int().positive().optional(),
  timeout_ms: z.number().int().positive().max(2_147_483_647).optional(),
  max_output_bytes: z.number().int().positive().optional(),
  env: z.record(z.string(), z.string()).optional(),
});

type MuseCodeConfig = z.infer<typeof MuseCodeConfigSchema>;

const TemplateStringSchema = z.string().regex(/{{[\s\S]*?}}|{%[\s\S]*?%}|{#[\s\S]*?#}/);
// Preserve per-test templates during construction; validate their resolved values in callApi.
const MuseCodeInputSchema = MuseCodeConfigSchema.extend({
  base_url: MuseCodeConfigSchema.shape.base_url.or(TemplateStringSchema),
  reasoning_effort: MuseCodeConfigSchema.shape.reasoning_effort.or(TemplateStringSchema),
  approval_mode: MuseCodeConfigSchema.shape.approval_mode.or(TemplateStringSchema),
  sandbox_network: MuseCodeConfigSchema.shape.sandbox_network.or(TemplateStringSchema),
  session_id: MuseCodeConfigSchema.shape.session_id.or(TemplateStringSchema),
}).strict();

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
  stderr: string;
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
  'SHELL',
  'COMSPEC',
  'SystemRoot',
  'PATHEXT',
  'LANG',
  'LC_ALL',
  'TERM',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'MUSE_AUTH_PATH',
] as const;

const CLI_NOT_FOUND_MESSAGE =
  'Muse Code CLI was not found. Install it from https://dev.meta.ai/docs/muse-code or set muse_path / MUSE_CLI_PATH.';

async function getProjectRoots(workspace: string, basePath?: string): Promise<string[]> {
  const projectRoots = new Set(
    [workspace, basePath ?? process.cwd(), process.cwd()].map((root) => path.resolve(root)),
  );
  for (const root of [...projectRoots]) {
    projectRoots.add(await fs.realpath(root));
  }
  const visited = new Set<string>();
  for (const root of [...projectRoots]) {
    let directory = root;
    while (!visited.has(directory)) {
      visited.add(directory);
      try {
        // Git worktrees use a file here. Inspect every ancestor so a nested
        // marker cannot hide a repository bin above the selected workspace.
        await fs.lstat(path.join(directory, '.git'));
        projectRoots.add(directory);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT' && code !== 'ENOTDIR') {
          throw error;
        }
      }
      const parent = path.dirname(directory);
      if (parent === directory) {
        break;
      }
      directory = parent;
    }
  }
  return [...projectRoots];
}

async function resolveMuseExecutable(
  configuredPath: string,
  env: NodeJS.ProcessEnv,
  workspace: string,
  basePath?: string,
): Promise<string> {
  if (configuredPath.includes('/') || configuredPath.includes('\\')) {
    return resolveAgenticWorkingDir(configuredPath, basePath)!;
  }

  const projectRoots = await getProjectRoots(workspace, basePath);
  const isInProject = (candidate: string) =>
    projectRoots.some((root) => {
      const relative = path.relative(root, candidate);
      return (
        !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`)
      );
    });

  const names =
    process.platform === 'win32' && !path.extname(configuredPath)
      ? [`${configuredPath}.exe`, configuredPath]
      : [configuredPath];
  for (const directory of (env.PATH ?? env.Path ?? '').split(path.delimiter)) {
    // Never let changing the child cwd redirect PATH lookup into the target repository.
    if (!path.isAbsolute(directory) || isInProject(directory)) {
      continue;
    }
    let resolvedDirectory: string;
    try {
      resolvedDirectory = await fs.realpath(directory);
    } catch {
      continue;
    }
    if (isInProject(resolvedDirectory)) {
      continue;
    }
    for (const name of names) {
      try {
        const candidate = await fs.realpath(path.join(resolvedDirectory, name));
        if (isInProject(candidate)) {
          continue;
        }
        await fs.access(candidate, fsConstants.X_OK);
        if ((await fs.stat(candidate)).isFile()) {
          return candidate;
        }
      } catch {
        // Continue searching when a PATH entry is missing or not executable.
      }
    }
  }
  throw new Error(CLI_NOT_FOUND_MESSAGE);
}

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
      : `Muse Code exited with ${result.signal ? `signal ${result.signal}` : `code ${result.exitCode}`}${result.stderr.trim() ? `: ${result.stderr.trim()}` : ''}`;
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
    sessionId,
    raw: events,
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

function redactCredentials(response: ProviderResponse, credentials: string[]): ProviderResponse {
  if (!credentials.length) {
    return response;
  }
  const pattern = new RegExp(
    credentials
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join('|'),
    'g',
  );
  const redact = (value: string) => value.replace(pattern, REDACTED);
  return JSON.parse(
    JSON.stringify(response, (_key, value) => {
      if (typeof value === 'string') {
        return redact(value);
      }
      // Keep the provider's response field names even for an invalid, short credential.
      if (value !== response && value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [redact(key), item]));
      }
      return value;
    }),
  );
}

/** Runs Meta's installed Muse Code CLI. Each call starts a new session unless explicitly resumed. */
export class MuseCodeProvider implements ApiProvider {
  readonly supportsAgenticGrading = true;
  config: MuseCodeInputConfig;
  private readonly providerId: string;
  private readonly env: ProviderOptions['env'];
  private readonly calls = new Map<AbortController, Promise<ProviderResponse>>();
  private readonly activeSessions = new Set<string>();

  constructor(options: ProviderOptions = {}) {
    this.config = MuseCodeInputSchema.parse(options.config ?? {});
    this.providerId = options.id ?? 'muse-code';
    this.env = options.env;
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

  getApiKey(config: MuseCodeInputConfig = this.config): string | undefined {
    return (
      config.apiKey ??
      config.env?.META_API_KEY ??
      this.env?.META_API_KEY ??
      getEnvString('META_API_KEY')
    );
  }

  private buildEnv(config: MuseCodeConfig): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { MUSE_NO_AUTO_UPDATE: '1' };
    for (const key of PROCESS_ENV_KEYS) {
      if (process.env[key] !== undefined) {
        env[key] = process.env[key];
      }
    }
    Object.assign(env, config.env);
    const apiKey = this.getApiKey(config);
    if (apiKey !== undefined) {
      env.META_API_KEY = apiKey;
    }
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
    const merged = { ...this.config, ...context?.prompt?.config };
    // Promptfoo can attach a live provider instance here; do not recursively render it.
    delete merged.provider;
    let config: MuseCodeConfig;
    try {
      config = MuseCodeConfigSchema.parse(renderVarsInObject(merged, context?.vars));
      if (config.session_id && config.no_session_log) {
        throw new Error('session_id cannot be combined with no_session_log');
      }
      if (config.session_id && !config.working_dir) {
        throw new Error('session_id requires working_dir to keep the session workspace stable');
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
      'base-url': config.base_url,
      'reasoning-effort': config.reasoning_effort,
      'approval-mode': config.approval_mode,
      'approval-judge':
        config.approval_judge === undefined ? undefined : config.approval_judge ? 'on' : 'off',
      'sandbox-network': config.sandbox_network,
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
      'disable-shell': config.disable_shell,
      'disable-write': config.disable_write,
      'disable-web-tools': config.disable_web_tools,
      'trust-workspace': config.trust_workspace,
      'no-foreign-personal-context': config.no_foreign_personal_context,
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
    const env = this.buildEnv(config);
    const credentials = collectEnvCredentials(env, config.base_url);
    try {
      signal.throwIfAborted();
      const basePath = config.basePath ?? cliState.basePath;
      let workspace = resolveAgenticWorkingDir(config.working_dir, basePath);
      if (workspace && !(await fs.stat(workspace)).isDirectory()) {
        throw new Error(`working_dir is not a directory: ${workspace}`);
      }
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-muse-code-'));
      if (!workspace) {
        workspace = path.join(tempDir, 'workspace');
        await fs.mkdir(workspace);
      }
      const promptFile = path.join(tempDir, 'prompt.txt');
      await fs.writeFile(promptFile, prompt, { mode: 0o600 });
      signal.throwIfAborted();
      const configuredPath =
        config.muse_path ?? this.env?.MUSE_CLI_PATH ?? getEnvString('MUSE_CLI_PATH') ?? 'muse';
      const command = await resolveMuseExecutable(configuredPath, env, workspace, basePath);
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
      return redactCredentials(parseResponse(result), credentials);
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
      let stderr = '';
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
        resolve({ stdout, stderr, exitCode: code, signal: processSignal, error });
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
        } else {
          stderr += chunk;
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
      providerRegistry.unregister(this);
    }
  }
}
