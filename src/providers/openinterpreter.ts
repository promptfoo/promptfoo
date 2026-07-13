import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';

import { z } from 'zod';
import cliState from '../cliState';
import { OpenAICodexAppServerProvider } from './openai/codex-app-server';
import { providerRegistry } from './providerRegistry';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  EnvOverrides,
  ProviderResponse,
} from '../types/index';
import type { CodexAppServerConfig } from './openai/codex-app-server';

const OPEN_INTERPRETER_HARNESSES = [
  'native',
  'claude-code',
  'claude-code-bare',
  'zcode',
  'kimi-cli',
  'qwen-code',
  'deepseek-tui',
  'swe-agent',
  'minimal',
] as const;

const OpenInterpreterConfigSchema = z
  .object({
    interpreter_path: z.string().min(1).optional(),
    interpreter_home: z.string().min(1).optional(),
    harness: z.enum(OPEN_INTERPRETER_HARNESSES).optional(),
    harness_guidance: z.boolean().optional(),
    allow_remote_images: z.boolean().optional(),
  })
  .passthrough();

export interface OpenInterpreterConfig extends Omit<CodexAppServerConfig, 'codex_path_override'> {
  /** Path to the Open Interpreter binary. Defaults to `interpreter` on PATH. */
  interpreter_path?: string;
  /** Existing Open Interpreter home to use for saved auth and configuration. */
  interpreter_home?: string;
  /** Open Interpreter harness emulation mode. */
  harness?: (typeof OPEN_INTERPRETER_HARNESSES)[number];
  /** Include the harness-specific reliability guidance block. */
  harness_guidance?: boolean;
  /** Permit public HTTP(S) image URLs in structured prompt inputs. */
  allow_remote_images?: boolean;
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

function parseOpenInterpreterConfig(
  config: OpenInterpreterConfig | undefined,
): OpenInterpreterConfig {
  try {
    return OpenInterpreterConfigSchema.parse(config ?? {}) as OpenInterpreterConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map(
          (issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`,
        )
        .join('; ');
      throw new Error(`Invalid Open Interpreter config: ${issues}`);
    }
    throw error;
  }
}

function mergeCliConfig(config: OpenInterpreterConfig): Record<string, unknown> {
  const configured = config.cli_config ?? {};
  const analytics = isRecord(configured.analytics) ? configured.analytics : {};
  const feedback = isRecord(configured.feedback) ? configured.feedback : {};
  const features = isRecord(configured.features) ? configured.features : {};

  return {
    ...configured,
    analytics: { enabled: false, ...analytics },
    feedback: { enabled: false, ...feedback },
    features: { memories: false, ...features },
    ...(config.harness ? { harness: config.harness } : {}),
    ...(config.harness_guidance === undefined ? {} : { harness_guidance: config.harness_guidance }),
  };
}

function toCodexAppServerConfig(
  config: OpenInterpreterConfig,
  options: { interpreterHome?: string; temporaryWorkspace?: string; defaults: boolean },
): CodexAppServerConfig {
  const {
    interpreter_path,
    interpreter_home: _interpreterHome,
    harness: _harness,
    harness_guidance: _harnessGuidance,
    allow_remote_images: _allowRemoteImages,
    ...appServerConfig
  } = config;

  return {
    ...appServerConfig,
    ...(options.defaults
      ? {
          codex_path_override: interpreter_path ?? 'interpreter',
          working_dir: config.working_dir ?? options.temporaryWorkspace,
          skip_git_repo_check:
            config.skip_git_repo_check ?? (config.working_dir ? undefined : true),
          sandbox_mode: config.sandbox_mode ?? 'read-only',
          approval_policy: config.approval_policy ?? 'untrusted',
          ephemeral: config.ephemeral ?? !config.thread_id,
          reuse_server: config.reuse_server ?? false,
          turn_timeout_ms: config.turn_timeout_ms ?? 120_000,
        }
      : interpreter_path
        ? { codex_path_override: interpreter_path }
        : {}),
    cli_env: {
      ...(config.cli_env ?? {}),
      ...(options.interpreterHome ? { INTERPRETER_HOME: options.interpreterHome } : {}),
    },
    cli_config: mergeCliConfig(config),
  };
}

function isWithinDirectory(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..');
}

function existingRealPath(candidate: string): string {
  try {
    return fs.realpathSync(candidate);
  } catch {
    return candidate;
  }
}

function isPrivateIpv4(first: number, second: number): boolean {
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 198 && (second === 18 || second === 19))
  );
}

function isPrivateHost(hostname: string): boolean {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\.+$/, '');
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local')
  ) {
    return true;
  }

  if (net.isIPv4(normalized)) {
    const [first, second] = normalized.split('.').map(Number);
    return isPrivateIpv4(first, second);
  }

  if (net.isIPv6(normalized)) {
    if (normalized.startsWith('::ffff:')) {
      const highWord = Number.parseInt(normalized.slice('::ffff:'.length).split(':')[0], 16);
      if (Number.isFinite(highWord)) {
        return isPrivateIpv4(highWord >> 8, highWord & 0xff);
      }
    }
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      /^fe[89ab]/.test(normalized)
    );
  }

  return false;
}

function normalizeChatMessages(prompt: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(prompt);
  } catch {
    return prompt;
  }

  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    !parsed.every(
      (message): message is ChatMessage =>
        isRecord(message) &&
        typeof message.role === 'string' &&
        typeof message.content === 'string',
    )
  ) {
    return prompt;
  }

  return parsed.map((message) => `[${message.role}]\n${message.content}`).join('\n\n');
}

export class OpenInterpreterProvider implements ApiProvider {
  readonly config: OpenInterpreterConfig;
  readonly env?: EnvOverrides;

  private readonly providerId: string;
  private readonly delegate: OpenAICodexAppServerProvider;
  private readonly temporaryHome?: string;
  private readonly temporaryWorkspace?: string;
  private readonly interpreterHome: string;

  constructor(options: OpenInterpreterProviderOptions = {}) {
    this.config = parseOpenInterpreterConfig(options.config);
    this.env = options.env;
    this.providerId = options.id ?? 'openinterpreter';

    const configuredHome =
      this.config.interpreter_home ??
      (typeof this.config.cli_env?.INTERPRETER_HOME === 'string'
        ? this.config.cli_env.INTERPRETER_HOME
        : undefined);
    if (configuredHome) {
      this.interpreterHome = path.resolve(configuredHome);
      try {
        if (!fs.statSync(this.interpreterHome).isDirectory()) {
          throw new Error('not a directory');
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Open Interpreter home ${this.interpreterHome} does not exist or is not accessible: ${reason}`,
        );
      }
    } else {
      this.temporaryHome = fs.mkdtempSync(
        path.join(os.tmpdir(), 'promptfoo-openinterpreter-home-'),
      );
      this.interpreterHome = this.temporaryHome;
    }

    if (!this.config.working_dir) {
      this.temporaryWorkspace = fs.mkdtempSync(
        path.join(os.tmpdir(), 'promptfoo-openinterpreter-workspace-'),
      );
    }

    try {
      this.delegate = new OpenAICodexAppServerProvider({
        id: this.providerId,
        config: toCodexAppServerConfig(this.config, {
          defaults: true,
          interpreterHome: this.interpreterHome,
          temporaryWorkspace: this.temporaryWorkspace,
        }),
        env: this.env,
      });
    } catch (error) {
      this.removeTemporaryState();
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        message.replace(
          'Invalid OpenAI Codex app-server config',
          'Invalid Open Interpreter config',
        ),
      );
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
    let promptConfig: OpenInterpreterConfig | undefined;
    try {
      promptConfig = context?.prompt?.config
        ? parseOpenInterpreterConfig(context.prompt.config as OpenInterpreterConfig)
        : undefined;
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
    const effectiveConfig = { ...this.config, ...(promptConfig ?? {}) };
    const normalizedPrompt = normalizeChatMessages(prompt);
    const validationError = this.validateStructuredPrompt(normalizedPrompt, effectiveConfig);
    if (validationError) {
      return { error: validationError };
    }

    const mappedContext: CallApiContextParams | undefined =
      promptConfig && context
        ? {
            ...context,
            prompt: {
              ...context.prompt,
              config: toCodexAppServerConfig(promptConfig, {
                defaults: false,
                interpreterHome: promptConfig.interpreter_home
                  ? path.resolve(promptConfig.interpreter_home)
                  : undefined,
              }),
            },
          }
        : context;

    const response = await this.delegate.callApi(normalizedPrompt, mappedContext, callOptions);
    if (response.error) {
      if (/spawn\s+.*interpreter.*ENOENT/i.test(response.error)) {
        return {
          ...response,
          error:
            `Open Interpreter CLI was not found at ${this.config.interpreter_path ?? 'interpreter'}. ` +
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

    const codexMetadata = response.metadata?.codexAppServer;
    return {
      ...response,
      metadata: {
        ...(response.metadata ?? {}),
        openInterpreter: {
          ...(isRecord(codexMetadata) ? codexMetadata : {}),
          harness: effectiveConfig.harness,
        },
      },
    };
  }

  async cleanup(): Promise<void> {
    try {
      await this.delegate.cleanup();
    } finally {
      this.removeTemporaryState();
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.delegate.shutdown();
    } finally {
      this.removeTemporaryState();
      providerRegistry.unregister(this);
    }
  }

  private validateStructuredPrompt(
    prompt: string,
    config: OpenInterpreterConfig,
  ): string | undefined {
    let parsed: unknown;
    try {
      parsed = JSON.parse(prompt);
    } catch {
      return undefined;
    }
    if (!Array.isArray(parsed)) {
      return undefined;
    }

    const basePath = config.basePath || cliState.basePath || process.cwd();
    const workingDir = path.resolve(basePath, config.working_dir ?? this.temporaryWorkspace ?? '.');
    const roots = [
      workingDir,
      ...(config.additional_directories ?? []).map((dir) => path.resolve(basePath, dir)),
    ].map(existingRealPath);

    for (const item of parsed) {
      if (!isRecord(item) || typeof item.type !== 'string') {
        continue;
      }
      if (
        (item.type === 'local_image' ||
          item.type === 'localImage' ||
          item.type === 'skill' ||
          item.type === 'mention') &&
        typeof item.path === 'string'
      ) {
        const candidate = existingRealPath(path.resolve(workingDir, item.path));
        if (!roots.some((root) => isWithinDirectory(root, candidate))) {
          return 'Open Interpreter structured input path is outside the configured workspace.';
        }
      }
      if (item.type === 'image' && typeof item.url === 'string') {
        if (!config.allow_remote_images) {
          return 'Open Interpreter remote image inputs are disabled by default. Set allow_remote_images: true to permit public HTTP(S) image URLs.';
        }
        try {
          const url = new URL(item.url);
          if (
            !['http:', 'https:'].includes(url.protocol) ||
            url.username ||
            url.password ||
            isPrivateHost(url.hostname)
          ) {
            return 'Open Interpreter rejected a non-public image URL or a URL containing credentials.';
          }
        } catch {
          return 'Open Interpreter received an invalid image URL.';
        }
      }
    }

    return undefined;
  }

  private removeTemporaryState(): void {
    if (this.temporaryWorkspace) {
      fs.rmSync(this.temporaryWorkspace, { recursive: true, force: true });
    }
    if (this.temporaryHome) {
      fs.rmSync(this.temporaryHome, { recursive: true, force: true });
    }
  }
}
