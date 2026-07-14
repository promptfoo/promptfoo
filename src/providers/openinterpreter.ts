import fs from 'fs';
import os from 'os';
import path from 'path';

import { z } from 'zod';
import cliState from '../cliState';
import { renderVarsInObject } from '../util/render';
import {
  CodexAppServerConfigSchema,
  OpenAICodexAppServerProvider,
} from './openai/codex-app-server';
import { providerRegistry } from './providerRegistry';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../types/index';
import type { CodexAppServerConfig } from './openai/codex-app-server';

const MAX_INLINE_IMAGE_CHARS = 5_000_000;
const FRAMEWORK_PROMPT_OPTION_KEYS = new Set([
  'prefix',
  'suffix',
  'postprocess',
  'transform',
  'transformVars',
  'storeOutputAs',
  'rubricPrompt',
  'provider',
  'factuality',
  'disableVarExpansion',
  'disableConversationVar',
  'disableDefaultAsserts',
  'runSerially',
  'repeat',
]);
const NUMERIC_PROMPT_OPTION_KEYS = new Set([
  'thread_pool_size',
  'request_timeout_ms',
  'startup_timeout_ms',
  'turn_timeout_ms',
]);
const BOOLEAN_PROMPT_OPTION_KEYS = new Set([
  'skip_git_repo_check',
  'network_access_enabled',
  'persist_threads',
  'ephemeral',
  'persist_extended_history',
  'experimental_raw_events',
  'experimental_api',
  'include_raw_events',
  'inherit_process_env',
  'reuse_server',
  'deep_tracing',
  'harness_guidance',
]);
const ENUM_PROMPT_OPTION_KEYS = new Set([
  'service_tier',
  'sandbox_mode',
  'approval_policy',
  'approvals_reviewer',
  'model_reasoning_effort',
  'reasoning_summary',
  'personality',
  'thread_cleanup',
]);
const TYPED_PROMPT_OPTION_KEYS = new Set([
  ...NUMERIC_PROMPT_OPTION_KEYS,
  ...BOOLEAN_PROMPT_OPTION_KEYS,
  ...ENUM_PROMPT_OPTION_KEYS,
]);
const NESTED_TYPED_PROMPT_OPTION_KEYS = new Set([
  'approval_policy',
  'collaboration_mode',
  'server_request_policy',
]);
const NESTED_BOOLEAN_PROMPT_OPTION_KEYS = new Set([
  'sandbox_approval',
  'rules',
  'skill_approval',
  'request_permissions',
  'mcp_elicitations',
  'strict_auto_review',
  'success',
]);

const OpenInterpreterConfigSchema = CodexAppServerConfigSchema.omit({
  codex_path_override: true,
})
  .extend({
    interpreter_path: z.string().min(1).optional(),
    interpreter_home: z.string().min(1).optional(),
    harness: z.string().min(1).optional(),
    harness_guidance: z.boolean().optional(),
  })
  .strict();

export interface OpenInterpreterConfig extends Omit<CodexAppServerConfig, 'codex_path_override'> {
  interpreter_path?: string;
  interpreter_home?: string;
  harness?: string;
  harness_guidance?: boolean;
}

interface OpenInterpreterProviderOptions {
  id?: string;
  config?: OpenInterpreterConfig;
  env?: EnvOverrides;
}

interface ChatMessage {
  role: string;
  content: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function containsTemplate(value: unknown): boolean {
  if (typeof value === 'string') {
    return (
      (value.includes('{{') && value.includes('}}')) ||
      (value.includes('{%') && value.includes('%}'))
    );
  }
  if (Array.isArray(value)) {
    return value.some(containsTemplate);
  }
  return isRecord(value) && Object.values(value).some(containsTemplate);
}

function coerceRenderedPromptOption(key: string, value: unknown, nestedTyped = false): unknown {
  if (NUMERIC_PROMPT_OPTION_KEYS.has(key) && typeof value === 'string' && value.trim()) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }
  }
  if (
    (BOOLEAN_PROMPT_OPTION_KEYS.has(key) ||
      (nestedTyped && NESTED_BOOLEAN_PROMPT_OPTION_KEYS.has(key))) &&
    (value === 'true' || value === 'false')
  ) {
    return value === 'true';
  }
  if (Array.isArray(value) && nestedTyped) {
    return value.map((entry) => coerceRenderedPromptOption(key, entry, true));
  }
  if (isRecord(value) && nestedTyped) {
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nestedValue]) => [
        nestedKey,
        coerceRenderedPromptOption(nestedKey, nestedValue, true),
      ]),
    );
  }
  return value;
}

function parseOpenInterpreterConfig(
  config: OpenInterpreterConfig | undefined,
): OpenInterpreterConfig {
  const parsed = OpenInterpreterConfigSchema.safeParse(config ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid Open Interpreter config: ${issues}`);
  }

  return parsed.data as OpenInterpreterConfig;
}

function parseOpenInterpreterPromptConfig(
  config: unknown,
  vars?: CallApiContextParams['vars'],
  stripFrameworkOptions = true,
): OpenInterpreterConfig {
  if (!isRecord(config)) {
    return parseOpenInterpreterConfig(config as OpenInterpreterConfig);
  }

  const renderableConfig = Object.fromEntries(
    Object.entries(config).filter(
      ([key]) => !stripFrameworkOptions || !FRAMEWORK_PROMPT_OPTION_KEYS.has(key),
    ),
  );
  const providerConfig = Object.fromEntries(
    Object.entries(renderVarsInObject(renderableConfig, vars)).map(([key, value]) => [
      key,
      coerceRenderedPromptOption(key, value, NESTED_TYPED_PROMPT_OPTION_KEYS.has(key)),
    ]),
  );

  return parseOpenInterpreterConfig(providerConfig as OpenInterpreterConfig);
}

function parseInitialOpenInterpreterConfig(
  config: OpenInterpreterConfig | undefined,
): OpenInterpreterConfig {
  if (!isRecord(config)) {
    return parseOpenInterpreterConfig(config);
  }

  const initialConfig = Object.fromEntries(
    Object.entries(config).filter(
      ([key, value]) =>
        !(
          (TYPED_PROMPT_OPTION_KEYS.has(key) || NESTED_TYPED_PROMPT_OPTION_KEYS.has(key)) &&
          containsTemplate(value)
        ),
    ),
  );
  if (containsTemplate(initialConfig.interpreter_home)) {
    delete initialConfig.interpreter_home;
  }
  if (isRecord(initialConfig.cli_env) && containsTemplate(initialConfig.cli_env.INTERPRETER_HOME)) {
    const cliEnv = { ...initialConfig.cli_env };
    delete cliEnv.INTERPRETER_HOME;
    initialConfig.cli_env = cliEnv;
  }
  return parseOpenInterpreterConfig(initialConfig as OpenInterpreterConfig);
}

function validateThreadPersistence(config: OpenInterpreterConfig): void {
  if (config.persist_threads && !config.working_dir) {
    throw new Error(
      'Invalid Open Interpreter config: persist_threads requires an explicit working_dir.',
    );
  }
  if (config.persist_threads && config.reuse_server === false) {
    throw new Error(
      'Invalid Open Interpreter config: persist_threads cannot be combined with reuse_server: false.',
    );
  }
}

function getBasePath(config: OpenInterpreterConfig): string {
  // Match the delegate's resolution chain (see resolveAgenticWorkingDir) so path
  // validation and the agent's actual working directory use the same root.
  return config.basePath || cliState.basePath || process.cwd();
}

function resolveInterpreterPath(config: OpenInterpreterConfig): string {
  const interpreterPath = config.interpreter_path ?? 'interpreter';
  return /[\\/]/.test(interpreterPath)
    ? path.resolve(getBasePath(config), interpreterPath)
    : interpreterPath;
}

function resolveInterpreterHome(config: OpenInterpreterConfig): string | undefined {
  const configured = config.interpreter_home ?? config.cli_env?.INTERPRETER_HOME;
  if (typeof configured !== 'string') {
    return undefined;
  }

  const interpreterHome = path.resolve(getBasePath(config), configured);
  try {
    if (!fs.statSync(interpreterHome).isDirectory()) {
      throw new Error('not a directory');
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Open Interpreter home ${interpreterHome} does not exist or is not accessible: ${reason}`,
    );
  }
  return interpreterHome;
}

function mergeRecords(
  base: Record<string, unknown> | undefined,
  override: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const merged = { ...(base ?? {}), ...(override ?? {}) };
  for (const [key, value] of Object.entries(override ?? {})) {
    const original = base?.[key];
    if (isRecord(original) && isRecord(value)) {
      merged[key] = mergeRecords(original, value);
    }
  }
  return merged;
}

function toCodexAppServerConfig(
  config: OpenInterpreterConfig,
  interpreterHome: string,
  temporaryWorkspace?: string,
): CodexAppServerConfig {
  const {
    interpreter_path: _interpreterPath,
    interpreter_home: _interpreterHome,
    harness,
    harness_guidance,
    ...appServerConfig
  } = config;
  const cliConfig = config.cli_config ?? {};
  const analytics = isRecord(cliConfig.analytics) ? cliConfig.analytics : {};
  const feedback = isRecord(cliConfig.feedback) ? cliConfig.feedback : {};
  const features = isRecord(cliConfig.features) ? cliConfig.features : {};

  return {
    ...appServerConfig,
    codex_path_override: resolveInterpreterPath(config),
    working_dir: config.working_dir ?? temporaryWorkspace,
    skip_git_repo_check: config.skip_git_repo_check ?? (temporaryWorkspace ? true : undefined),
    sandbox_mode: config.sandbox_mode ?? 'read-only',
    approval_policy: config.approval_policy ?? 'untrusted',
    ephemeral: config.ephemeral ?? !config.thread_id,
    reuse_server: config.reuse_server ?? Boolean(config.persist_threads),
    turn_timeout_ms: config.turn_timeout_ms ?? 120_000,
    cli_env: { ...(config.cli_env ?? {}), INTERPRETER_HOME: interpreterHome },
    cli_config: {
      ...cliConfig,
      analytics: { enabled: false, ...analytics },
      feedback: { enabled: false, ...feedback },
      features: { memories: false, ...features },
      ...(harness === undefined ? {} : { harness: harness === 'native' ? '' : harness }),
      ...(harness_guidance === undefined ? {} : { harness_guidance }),
    },
  };
}

function existingRealPath(candidate: string): string {
  try {
    return fs.realpathSync(candidate);
  } catch {
    return candidate;
  }
}

function isWithinDirectory(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function isVirtualMention(item: Record<string, unknown>): boolean {
  return (
    item.type === 'mention' && typeof item.path === 'string' && /^(app|plugin):\/\//.test(item.path)
  );
}

function normalizePrompt(
  prompt: string,
  config: OpenInterpreterConfig,
  temporaryWorkspace?: string,
): { prompt: string; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(prompt);
  } catch {
    return { prompt };
  }
  if (!Array.isArray(parsed)) {
    return { prompt };
  }

  if (
    parsed.length > 0 &&
    parsed.every(
      (message): message is ChatMessage =>
        isRecord(message) &&
        typeof message.role === 'string' &&
        typeof message.content === 'string',
    )
  ) {
    return {
      prompt: parsed.map((message) => `[${message.role}]\n${message.content}`).join('\n\n'),
    };
  }

  const basePath = getBasePath(config);
  const workingDir = path.resolve(basePath, config.working_dir ?? (temporaryWorkspace as string));
  const roots = [
    workingDir,
    ...(config.additional_directories ?? []).map((directory) => path.resolve(basePath, directory)),
  ].map(existingRealPath);
  let inlineImageChars = 0;

  for (const item of parsed) {
    if (!isRecord(item) || typeof item.type !== 'string') {
      continue;
    }

    if (isVirtualMention(item)) {
      continue;
    }

    if (
      ['local_image', 'localImage', 'skill', 'mention'].includes(item.type) &&
      typeof item.path === 'string'
    ) {
      let candidate: string;
      try {
        candidate = fs.realpathSync(path.resolve(workingDir, item.path));
      } catch {
        return {
          prompt,
          error: 'Open Interpreter structured input path does not exist or is not accessible.',
        };
      }
      if (!roots.some((root) => isWithinDirectory(root, candidate))) {
        return {
          prompt,
          error: 'Open Interpreter structured input path is outside the configured workspace.',
        };
      }
      item.path = candidate;
    }

    if (item.type === 'image' && typeof item.url === 'string') {
      if (!/^data:/i.test(item.url)) {
        return {
          prompt,
          error:
            'Open Interpreter image inputs require an inline data URL; remote image URLs are not supported.',
        };
      }
      inlineImageChars += item.url.length;
      if (inlineImageChars > MAX_INLINE_IMAGE_CHARS) {
        return {
          prompt,
          error: `Open Interpreter inline image inputs exceeded ${MAX_INLINE_IMAGE_CHARS} characters.`,
        };
      }
    }
  }

  return { prompt: JSON.stringify(parsed) };
}

export class OpenInterpreterProvider implements ApiProvider {
  readonly config: OpenInterpreterConfig;
  readonly env?: EnvOverrides;

  private readonly providerId: string;
  private readonly delegate: OpenAICodexAppServerProvider;
  private readonly temporaryHome?: string;
  private readonly interpreterHome: string;

  constructor(options: OpenInterpreterProviderOptions = {}) {
    const initialConfig = parseInitialOpenInterpreterConfig(options.config);
    this.config = { ...initialConfig, ...(options.config ?? {}) };
    validateThreadPersistence(initialConfig);
    this.env = options.env;
    this.providerId = options.id ?? 'openinterpreter';

    const configuredHome = resolveInterpreterHome(initialConfig);
    if (configuredHome) {
      this.interpreterHome = configuredHome;
    } else {
      this.temporaryHome = fs.mkdtempSync(
        path.join(os.tmpdir(), 'promptfoo-openinterpreter-home-'),
      );
      this.interpreterHome = this.temporaryHome;
    }

    try {
      this.delegate = new OpenAICodexAppServerProvider({
        id: this.providerId,
        config: toCodexAppServerConfig(initialConfig, this.interpreterHome),
        env: this.env,
      });
    } catch (error) {
      this.removeTemporaryHome();
      throw error;
    }

    providerRegistry.unregister(this.delegate);
    providerRegistry.register(this);
  }

  id(): string {
    return this.providerId;
  }

  getApiKey(): string | undefined {
    return this.delegate.getApiKey();
  }

  requiresApiKey(): boolean {
    return false;
  }

  toString(): string {
    return '[Open Interpreter Provider]';
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // cleanup() removes the temporary INTERPRETER_HOME; recreate it so the
    // provider stays usable when a long-lived process reuses it afterwards.
    if (this.temporaryHome && !fs.existsSync(this.temporaryHome)) {
      fs.mkdirSync(this.temporaryHome, { recursive: true });
    }
    let temporaryWorkspace: string | undefined;
    try {
      const promptConfig = context?.prompt?.config
        ? parseOpenInterpreterPromptConfig(context.prompt.config, context?.vars)
        : undefined;
      const renderableBaseConfig = { ...this.config };
      delete renderableBaseConfig.provider;
      const renderedBaseConfig = parseOpenInterpreterPromptConfig(
        renderableBaseConfig,
        context?.vars,
        false,
      );
      const effectiveConfig = {
        ...renderedBaseConfig,
        ...(promptConfig ?? {}),
        cli_config: mergeRecords(renderedBaseConfig.cli_config, promptConfig?.cli_config),
        cli_env: { ...(renderedBaseConfig.cli_env ?? {}), ...(promptConfig?.cli_env ?? {}) },
      } as OpenInterpreterConfig;
      validateThreadPersistence(effectiveConfig);

      if (!effectiveConfig.working_dir) {
        temporaryWorkspace = fs.mkdtempSync(
          path.join(os.tmpdir(), 'promptfoo-openinterpreter-workspace-'),
        );
      }
      const interpreterHome = resolveInterpreterHome(effectiveConfig) ?? this.interpreterHome;
      const normalized = normalizePrompt(prompt, effectiveConfig, temporaryWorkspace);
      if (normalized.error) {
        return { error: normalized.error };
      }

      const mappedConfig = toCodexAppServerConfig(
        effectiveConfig,
        interpreterHome,
        temporaryWorkspace,
      );
      const mappedContext: CallApiContextParams = {
        ...(context ?? { vars: {}, prompt: { raw: prompt, label: 'Open Interpreter' } }),
        // The config above is already rendered and validated. Prevent the delegate
        // from evaluating literal template syntax returned by a row variable.
        vars: undefined as unknown as CallApiContextParams['vars'],
        prompt: {
          ...(context?.prompt ?? { raw: prompt, label: 'Open Interpreter' }),
          config: mappedConfig,
        },
      };
      const response = await this.delegate.callApi(normalized.prompt, mappedContext, callOptions);
      if (response.error) {
        const interpreterPath = mappedConfig.codex_path_override ?? '';
        if (
          /\bspawn\b[\s\S]*\bENOENT\b/i.test(response.error) &&
          (!interpreterPath || response.error.includes(interpreterPath))
        ) {
          return {
            ...response,
            error:
              `Open Interpreter CLI was not found at ${mappedConfig.codex_path_override}. ` +
              'Install Open Interpreter or set config.interpreter_path to its executable.',
          };
        }
        return {
          ...response,
          error: response.error.replace(
            /(?:OpenAI )?Codex app-server/gi,
            'Open Interpreter app-server',
          ),
        };
      }

      // Move the delegate's trajectory metadata under openInterpreter instead of
      // duplicating it: persisting both keys doubles stored result size per row.
      const { codexAppServer: codexMetadata, ...restMetadata } = response.metadata ?? {};
      return {
        ...response,
        metadata: {
          ...restMetadata,
          openInterpreter: {
            ...(isRecord(codexMetadata) ? codexMetadata : {}),
            harness: effectiveConfig.harness,
          },
        },
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    } finally {
      if (temporaryWorkspace) {
        fs.rmSync(temporaryWorkspace, { recursive: true, force: true });
      }
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.delegate.cleanup();
    } finally {
      this.removeTemporaryHome();
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.cleanup();
    } finally {
      providerRegistry.unregister(this);
    }
  }

  private removeTemporaryHome(): void {
    if (this.temporaryHome) {
      fs.rmSync(this.temporaryHome, { recursive: true, force: true });
    }
  }
}
