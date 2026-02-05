import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import dedent from 'dedent';
import cliState from '../cliState';
import { getEnvString } from '../envars';
import { importModule, resolvePackageEntryPoint } from '../esm';
import logger from '../logger';
import { cacheResponse, getCachedResponse, initializeAgenticCache } from './agentic-utils';
import { ANTHROPIC_MODELS } from './anthropic/util';
import { transformMCPConfigToClaudeCode } from './mcp/transform';
import { MCPConfig } from './mcp/types';
import type {
  AgentDefinition,
  CanUseTool,
  HookCallbackMatcher,
  HookEvent,
  OutputFormat,
  PermissionResult,
  Options as QueryOptions,
  SandboxSettings,
  SettingSource,
  SpawnedProcess,
  SpawnOptions,
} from '@anthropic-ai/claude-agent-sdk';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../types/index';

/**
 * Claude Agent SDK Provider
 *
 * This provider requires the @anthropic-ai/claude-agent-sdk package to be installed separately:
 *   npm install @anthropic-ai/claude-agent-sdk
 *
 * Two default configurations:
 * - No working_dir: Runs in temp directory with no tools - behaves like plain chat API
 * - With working_dir: Runs in specified directory with read-only file tools (Read/Grep/Glob/LS)
 *
 * User can override tool permissions with 'custom_allowed_tools', 'append_allowed_tools', 'disallowed_tools', and 'permission_mode'.
 *
 * For side effects (file writes, system calls, etc.), user can override permissions and use a custom working directory. They're then responsible for setup/teardown and security considerations.
 *
 * MCP server connection details are passed through from config. strict_mcp_config is true by default to only allow explicitly configured MCP servers.
 */

// When a working directory is provided, we allow read-only tools by default (when no working directory is provided, default to no tools)
export const FS_READONLY_ALLOWED_TOOLS = ['Read', 'Grep', 'Glob', 'LS'].sort(); // sort and export for tests

// Claude Agent SDK supports these model aliases in addition to full model names
// See: https://docs.anthropic.com/en/docs/claude-agent-sdk/model-config
export const CLAUDE_CODE_MODEL_ALIASES = [
  'default',
  'sonnet',
  'opus',
  'haiku',
  'sonnet[1m]',
  'opusplan',
];

/**
 * Helper to load the Claude Agent SDK ESM module
 * Uses resolvePackageEntryPoint to handle ESM-only packages with restrictive exports
 */
async function loadClaudeCodeSDK(): Promise<typeof import('@anthropic-ai/claude-agent-sdk')> {
  const basePath =
    cliState.basePath && path.isAbsolute(cliState.basePath) ? cliState.basePath : process.cwd();

  const claudeCodePath = resolvePackageEntryPoint('@anthropic-ai/claude-agent-sdk', basePath);

  if (!claudeCodePath) {
    throw new Error(
      dedent`The @anthropic-ai/claude-agent-sdk package is required but not installed.

      To use the Claude Agent SDK provider, install it with:
        npm install @anthropic-ai/claude-agent-sdk

      For more information, see: https://www.promptfoo.dev/docs/providers/claude-agent-sdk/`,
    );
  }

  try {
    return importModule(claudeCodePath);
  } catch (err) {
    logger.error(`Failed to load Claude Agent SDK: ${err}`);
    if ((err as any).stack) {
      logger.error((err as any).stack);
    }
    throw new Error(
      dedent`Failed to load @anthropic-ai/claude-agent-sdk.

      The package was found but could not be loaded. This may be due to:
      - Incompatible Node.js version (requires Node.js 20+)
      - Corrupted installation

      Try reinstalling:
        npm install @anthropic-ai/claude-agent-sdk

      For more information, see: https://www.promptfoo.dev/docs/providers/claude-agent-sdk/`,
    );
  }
}

export interface ClaudeCodeOptions {
  apiKey?: string;

  /**
   * 'working_dir' allows user to point to a pre-prepared directory with desired files/directories in place
   * If not supplied, we'll use an empty temp dir for isolation
   */
  working_dir?: string;

  /**
   * 'model' and 'fallback_model' are optional
   * if not supplied, Claude Agent SDK uses default models
   */
  model?: string;
  fallback_model?: string;

  max_turns?: number;
  max_thinking_tokens?: number;

  mcp?: MCPConfig;
  strict_mcp_config?: boolean; // only allow MCP servers that are explicitly configured—no discovery; true by default

  /**
   * Permission mode for controlling how tool executions are handled:
   * - 'default' - Standard behavior, prompts for dangerous operations
   * - 'plan' - Planning mode, no actual tool execution
   * - 'acceptEdits' - Auto-accept file edit operations
   * - 'bypassPermissions' - Bypass all permission checks (requires allow_dangerously_skip_permissions)
   * - 'dontAsk' - Don't prompt for permissions, deny if not pre-approved
   * - 'delegate' - Delegate mode, restricts team leader to only Teammate and Task tools
   */
  permission_mode?:
    | 'default'
    | 'plan'
    | 'acceptEdits'
    | 'bypassPermissions'
    | 'dontAsk'
    | 'delegate';

  /**
   * User can set a custom system prompt, or append to the default Claude Agent SDK system prompt
   */
  custom_system_prompt?: string;
  append_system_prompt?: string;

  /**
   * Since we run CC by default with a readonly set of allowed_tools, user can either fully replace the list ('custom_allowed_tools'), append to it ('append_allowed_tools'), or allow all tools ('allow_all_tools')
   */
  custom_allowed_tools?: string[];
  append_allowed_tools?: string[];
  allow_all_tools?: boolean;

  /**
   * 'disallowed_tools' is passed through as is; it always takes precedence over 'allowed_tools'
   */
  disallowed_tools?: string[];

  /**
   * 'setting_sources' controls where the Claude Agent SDK looks for settings, CLAUDE.md, and slash commands—accepts 'user', 'project', and 'local'
   * if not supplied, it won't look for any settings, CLAUDE.md, or slash commands
   */
  setting_sources?: SettingSource[];

  /**
   * 'plugins' allows loading Claude Code plugins from local file system paths
   * Each plugin must be a directory containing .claude-plugin/plugin.json manifest
   */
  plugins?: Array<{ type: 'local'; path: string }>;

  /**
   * Maximum budget in USD for this session. When exceeded, the SDK will stop with error_max_budget_usd.
   * Useful for cost control in automated evaluations.
   */
  max_budget_usd?: number;

  /**
   * Additional directories the agent can access beyond the working directory.
   * Useful when the agent needs to read files from multiple locations.
   */
  additional_directories?: string[];

  /**
   * Session ID to resume a previous conversation. The agent will continue from where it left off.
   * Use with 'fork_session' to branch instead of continuing the same session.
   */
  resume?: string;

  /**
   * When true and 'resume' is set, creates a new session branching from the resumed point
   * instead of continuing the original session.
   */
  fork_session?: boolean;

  /**
   * When resuming, only restore messages up to this message UUID.
   * Allows resuming from a specific point in the conversation history.
   */
  resume_session_at?: string;

  /**
   * When true, continues from the previous conversation without requiring a resume session ID.
   */
  continue?: boolean;

  /**
   * Programmatic agent definitions. Allows defining custom subagents inline without filesystem dependencies.
   * Keys are agent names, values are agent definitions with description, tools, and prompt.
   */
  agents?: Record<string, AgentDefinition>;

  /**
   * Output format specification for structured outputs.
   * When set, the agent will return validated JSON matching the provided schema.
   */
  output_format?: OutputFormat;

  /**
   * Hooks for intercepting events during agent execution.
   * Allows custom logic at various points like PreToolUse, PostToolUse, etc.
   */
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;

  /**
   * When true, includes partial/streaming messages in the response.
   * Useful for debugging or when you need to see intermediate outputs.
   */
  include_partial_messages?: boolean;

  /**
   * Enable beta features. Currently supports:
   * - 'context-1m-2025-08-07' - Enable 1M token context window (Sonnet 4/4.5 only)
   *
   * @see https://docs.anthropic.com/en/api/beta-headers
   */
  betas?: 'context-1m-2025-08-07'[];

  /**
   * Sandbox settings for command execution isolation.
   * When enabled, commands are executed in a sandboxed environment that restricts
   * filesystem and network access. This provides an additional security layer.
   *
   * Available options:
   * - `enabled` - Enable/disable sandboxing
   * - `autoAllowBashIfSandboxed` - Auto-allow bash commands when sandboxed
   * - `allowUnsandboxedCommands` - Allow commands that can't be sandboxed
   * - `enableWeakerNestedSandbox` - Enable weaker sandbox for nested environments
   * - `excludedCommands` - Commands to exclude from sandboxing
   * - `ignoreViolations` - Map of command patterns to violation types to ignore
   * - `network` - Network configuration:
   *   - `allowedDomains` - Domains the sandbox can access
   *   - `allowLocalBinding` - Allow binding to localhost
   *   - `allowUnixSockets` - Specific Unix sockets to allow
   *   - `allowAllUnixSockets` - Allow all Unix socket connections
   *   - `httpProxyPort` - HTTP proxy port for network access
   *   - `socksProxyPort` - SOCKS proxy port for network access
   * - `ripgrep` - Custom ripgrep configuration:
   *   - `command` - Path to ripgrep executable
   *   - `args` - Additional arguments for ripgrep
   *
   * @example Enable sandboxing with auto-allow
   * ```yaml
   * sandbox:
   *   enabled: true
   *   autoAllowBashIfSandboxed: true
   * ```
   *
   * @example Configure network options with proxy
   * ```yaml
   * sandbox:
   *   enabled: true
   *   network:
   *     allowLocalBinding: true
   *     allowedDomains:
   *       - api.example.com
   *     httpProxyPort: 8080
   *     socksProxyPort: 1080
   * ```
   *
   * @example Exclude specific commands and configure ripgrep
   * ```yaml
   * sandbox:
   *   enabled: true
   *   excludedCommands:
   *     - docker
   *     - podman
   *   ripgrep:
   *     command: /usr/local/bin/rg
   *     args: ['--hidden']
   * ```
   *
   * @see https://docs.anthropic.com/en/docs/claude-code/settings#sandbox-settings
   */
  sandbox?: SandboxSettings;

  /**
   * Must be set to true when using permission_mode: 'bypassPermissions'.
   * This is a safety measure to ensure intentional bypassing of permissions.
   */
  allow_dangerously_skip_permissions?: boolean;

  /**
   * MCP tool name to use for permission prompts. When set, permission requests
   * will be routed through this MCP tool instead of the default handler.
   */
  permission_prompt_tool_name?: string;

  /**
   * Callback for stderr output from the Claude Code process.
   * Useful for debugging and logging.
   *
   * Note: This option is only available when using the provider programmatically,
   * not via YAML config.
   */
  stderr?: (data: string) => void;

  /**
   * JavaScript runtime to use for executing Claude Code.
   * Auto-detected if not specified.
   */
  executable?: 'bun' | 'deno' | 'node';

  /**
   * Additional arguments to pass to the JavaScript runtime executable.
   */
  executable_args?: string[];

  /**
   * Additional CLI arguments to pass to Claude Code.
   * Keys are argument names (without --), values are argument values.
   * Use null for boolean flags.
   *
   * @example
   * ```yaml
   * extra_args:
   *   verbose: null  # Adds --verbose flag
   *   timeout: "30"  # Adds --timeout 30
   * ```
   */
  extra_args?: Record<string, string | null>;

  /**
   * Path to the Claude Code executable. Uses the built-in executable if not specified.
   * Useful for testing with custom builds or specific versions.
   */
  path_to_claude_code_executable?: string;

  /**
   * Specify the base set of available built-in tools.
   * - `string[]` - Array of specific tool names (e.g., `['Bash', 'Read', 'Edit']`)
   * - `[]` (empty array) - Disable all built-in tools
   * - `{ type: 'preset', preset: 'claude_code' }` - Use all default Claude Code tools
   *
   * This is different from 'custom_allowed_tools' - 'tools' specifies the base set,
   * while 'allowedTools' filters from that base.
   *
   * @example Use all default tools
   * ```yaml
   * tools:
   *   type: preset
   *   preset: claude_code
   * ```
   *
   * @example Use only specific tools
   * ```yaml
   * tools:
   *   - Bash
   *   - Read
   *   - Edit
   * ```
   */
  tools?: string[] | { type: 'preset'; preset: 'claude_code' };

  /**
   * Enable file checkpointing to track file changes during the session.
   * When enabled, files can be rewound to their state at any user message
   * using the Query.rewindFiles() method.
   *
   * File checkpointing creates backups of files before they are modified,
   * allowing restoration to previous states.
   *
   * @default false
   */
  enable_file_checkpointing?: boolean;

  /**
   * When false, disables session persistence to disk. Sessions will not be
   * saved to ~/.claude/projects/ and cannot be resumed later. Useful for
   * ephemeral or automated workflows where session history is not needed.
   *
   * @default true
   */
  persist_session?: boolean;

  /**
   * Custom function to spawn the Claude Code process.
   * Use this to run Claude Code in VMs, containers, or remote environments.
   *
   * When provided, this function is called instead of the default local spawn.
   *
   * Note: This option is only available when using the provider programmatically,
   * not via YAML config.
   *
   * @example
   * ```typescript
   * spawn_claude_code_process: (options) => {
   *   // Custom spawn logic for VM execution
   *   // options contains: command, args, cwd, env, signal
   *   return myVMProcess; // Must satisfy SpawnedProcess interface
   * }
   * ```
   */
  spawn_claude_code_process?: (options: SpawnOptions) => SpawnedProcess;

  /**
   * Configuration for handling AskUserQuestion tool in automated evaluations.
   * Since there's no human to answer questions, this provides automated responses.
   *
   * @example
   * ```yaml
   * ask_user_question:
   *   behavior: first_option  # Always select the first option
   * ```
   */
  ask_user_question?: {
    /**
     * Default behavior for answering questions:
     * - 'first_option': Always select the first option (default)
     * - 'random': Randomly select from available options
     * - 'deny': Deny the tool use (agent cannot ask questions)
     */
    behavior?: 'first_option' | 'random' | 'deny';
  };
}

/**
 * Type for AskUserQuestion tool input from the SDK
 */
interface AskUserQuestionToolInput {
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string }>;
    multiSelect: boolean;
  }>;
  answers?: Record<string, string>;
}

/**
 * Creates a canUseTool callback for handling AskUserQuestion tool in automated evaluations.
 * This provides automated responses to questions that would normally require user input.
 *
 * The callback wraps an optional user-provided canUseTool and handles AskUserQuestion specifically,
 * deferring to the wrapped callback for all other tools.
 */
function createAskUserQuestionCanUseTool(
  behavior: 'first_option' | 'random' | 'deny' = 'first_option',
  wrappedCanUseTool?: CanUseTool,
): CanUseTool {
  return async (toolName, input, options): Promise<PermissionResult> => {
    // Only handle AskUserQuestion tool
    if (toolName !== 'AskUserQuestion') {
      // Defer to wrapped callback or allow by default
      if (wrappedCanUseTool) {
        return wrappedCanUseTool(toolName, input, options);
      }
      return { behavior: 'allow', updatedInput: input };
    }

    // Deny the tool use if configured to do so
    if (behavior === 'deny') {
      return {
        behavior: 'deny',
        message: 'AskUserQuestion is disabled in automated evaluation mode',
      };
    }

    const toolInput = input as unknown as AskUserQuestionToolInput;
    const answers: Record<string, string> = {};

    // Generate answers for each question based on the configured behavior
    for (const question of toolInput.questions) {
      if (!question.options || question.options.length === 0) {
        continue;
      }

      let selectedLabels: string[];
      if (behavior === 'random') {
        const randomIndex = Math.floor(Math.random() * question.options.length);
        selectedLabels = [question.options[randomIndex].label];
      } else {
        // first_option (default)
        selectedLabels = [question.options[0].label];
      }

      // Multi-select answers are comma-separated strings per SDK documentation
      answers[question.question] = selectedLabels.join(', ');
    }

    return {
      behavior: 'allow',
      updatedInput: {
        questions: toolInput.questions, // Pass through original questions
        answers,
      },
    };
  };
}

export class ClaudeCodeSDKProvider implements ApiProvider {
  static ANTHROPIC_MODELS = ANTHROPIC_MODELS;
  static ANTHROPIC_MODELS_NAMES = ANTHROPIC_MODELS.map((model) => model.id);

  config: ClaudeCodeOptions;
  env?: EnvOverrides;
  apiKey?: string;

  // Only SDK and Anthropic are supported for now
  // Could later potentially support Claude Agent SDK via external CLI calls, as well as Bedrock/Vertex providers
  private providerId = 'anthropic:claude-agent-sdk';
  private claudeCodeModule?: typeof import('@anthropic-ai/claude-agent-sdk');

  constructor(
    options: {
      id?: string;
      config?: ClaudeCodeOptions;
      env?: EnvOverrides;
    } = {},
  ) {
    const { config, env, id } = options;
    this.config = config ?? {};
    this.env = env;
    this.apiKey = this.getApiKey();
    this.providerId = id ?? this.providerId;

    if (
      this.config.model &&
      !ClaudeCodeSDKProvider.ANTHROPIC_MODELS_NAMES.includes(this.config.model) &&
      !CLAUDE_CODE_MODEL_ALIASES.includes(this.config.model)
    ) {
      logger.warn(`Using unknown model for Claude Agent SDK: ${this.config.model}`);
    }

    if (
      this.config.fallback_model &&
      !ClaudeCodeSDKProvider.ANTHROPIC_MODELS_NAMES.includes(this.config.fallback_model) &&
      !CLAUDE_CODE_MODEL_ALIASES.includes(this.config.fallback_model)
    ) {
      logger.warn(
        `Using unknown model for Claude Agent SDK fallback: ${this.config.fallback_model}`,
      );
    }
  }

  id(): string {
    return this.providerId;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Merge configs from the provider and the prompt
    const config: ClaudeCodeOptions = {
      ...this.config,
      ...context?.prompt?.config,
    };

    // Set up env for the Claude Agent SDK call
    // Pass through entire environment like claude-agent-sdk CLI does, with EnvOverrides taking precedence
    // Sort keys for stable cache key generation
    const env: Record<string, string> = {};
    for (const key of Object.keys(process.env).sort()) {
      if (process.env[key] !== undefined) {
        env[key] = process.env[key];
      }
    }

    // EnvOverrides take precedence over process.env
    if (this.env) {
      for (const key of Object.keys(this.env).sort()) {
        const value = this.env[key as keyof typeof this.env];
        if (value !== undefined) {
          env[key] = value;
        }
      }
    }

    // Ensure API key is available to Claude Agent SDK
    if (this.apiKey) {
      env.ANTHROPIC_API_KEY = this.apiKey;
    }

    // Could potentially do more to validate credentials for Bedrock/Vertex here, but Anthropic key is the main use case
    if (!this.apiKey && !(env.CLAUDE_CODE_USE_BEDROCK || env.CLAUDE_CODE_USE_VERTEX)) {
      throw new Error(
        dedent`Anthropic API key is not set. Set the ANTHROPIC_API_KEY environment variable or add "apiKey" to the provider config.

        Use CLAUDE_CODE_USE_BEDROCK or CLAUDE_CODE_USE_VERTEX environment variables to use Bedrock or Vertex instead.`,
      );
    }

    // Set up allowed tools for the Claude Agent SDK call
    // Check for conflicting config options (may want a zod schema in the future)
    if (
      config.allow_all_tools &&
      ('custom_allowed_tools' in config || 'append_allowed_tools' in config)
    ) {
      throw new Error(
        'Cannot specify both allow_all_tools and custom_allowed_tools or append_allowed_tools',
      );
    }
    if ('custom_allowed_tools' in config && 'append_allowed_tools' in config) {
      throw new Error('Cannot specify both custom_allowed_tools and append_allowed_tools');
    }

    // Validate that bypassPermissions mode requires the safety flag
    if (
      config.permission_mode === 'bypassPermissions' &&
      !config.allow_dangerously_skip_permissions
    ) {
      throw new Error(
        "permission_mode 'bypassPermissions' requires allow_dangerously_skip_permissions: true as a safety measure",
      );
    }

    // De-dupe and sort allowed/disallowed tools for cache key consistency
    const defaultAllowedTools = config.working_dir ? FS_READONLY_ALLOWED_TOOLS : [];

    let allowedTools = config.allow_all_tools ? undefined : defaultAllowedTools;
    if ('custom_allowed_tools' in config) {
      allowedTools = Array.from(new Set(config.custom_allowed_tools ?? [])).sort();
    } else if (config.append_allowed_tools) {
      allowedTools = Array.from(
        new Set([...defaultAllowedTools, ...config.append_allowed_tools]),
      ).sort();
    }

    const disallowedTools = config.disallowed_tools
      ? Array.from(new Set(config.disallowed_tools)).sort()
      : undefined;

    let isTempDir = false;
    let workingDir: string | undefined;

    if (config.working_dir) {
      workingDir = config.working_dir;
    } else {
      isTempDir = true;
    }

    // Create canUseTool callback for ask_user_question convenience option
    // AskUserQuestion is handled via canUseTool per SDK documentation
    let canUseTool: CanUseTool | undefined;
    if (config.ask_user_question) {
      canUseTool = createAskUserQuestionCanUseTool(config.ask_user_question.behavior);
    }

    // Just the keys we'll use to compute the cache key first
    // Lets us avoid unnecessary work and cleanup if there's a cache hit
    const cacheKeyQueryOptions: Omit<
      QueryOptions,
      'abortController' | 'mcpServers' | 'cwd' | 'stderr' | 'spawnClaudeCodeProcess'
    > = {
      maxTurns: config.max_turns,
      model: config.model,
      fallbackModel: config.fallback_model,
      strictMcpConfig: config.strict_mcp_config ?? true, // only allow MCP servers that are explicitly configured - true by default
      permissionMode: config.permission_mode,
      systemPrompt: config.custom_system_prompt
        ? config.custom_system_prompt
        : {
            type: 'preset',
            preset: 'claude_code',
            append: config.append_system_prompt,
          },
      maxThinkingTokens: config.max_thinking_tokens,
      allowedTools,
      disallowedTools,
      plugins: config.plugins,
      maxBudgetUsd: config.max_budget_usd,
      additionalDirectories: config.additional_directories,
      resume: config.resume,
      forkSession: config.fork_session,
      resumeSessionAt: config.resume_session_at,
      continue: config.continue,
      agents: config.agents,
      outputFormat: config.output_format,
      hooks: config.hooks,
      includePartialMessages: config.include_partial_messages,
      betas: config.betas,
      // New options
      sandbox: config.sandbox,
      allowDangerouslySkipPermissions: config.allow_dangerously_skip_permissions,
      permissionPromptToolName: config.permission_prompt_tool_name,
      executable: config.executable,
      executableArgs: config.executable_args,
      extraArgs: config.extra_args,
      pathToClaudeCodeExecutable: config.path_to_claude_code_executable,
      settingSources: config.setting_sources,
      tools: config.tools,
      enableFileCheckpointing: config.enable_file_checkpointing,
      persistSession: config.persist_session,
      env,
    };

    // Cache handling using shared utilities
    const cacheResult = await initializeAgenticCache(
      {
        cacheKeyPrefix: 'anthropic:claude-agent-sdk',
        workingDir: config.working_dir,
        bustCache: context?.bustCache,
      },
      {
        prompt,
        cacheKeyQueryOptions,
      },
    );

    // Check cache for existing response
    const cachedResponse = await getCachedResponse(cacheResult, 'Claude Agent SDK');
    if (cachedResponse) {
      return cachedResponse;
    }

    // Transform MCP config to Claude Agent SDK MCP servers
    const mcpServers = config.mcp ? await transformMCPConfigToClaudeCode(config.mcp) : {};

    if (workingDir) {
      // verify the working dir exists and is a directory
      let stats: fs.Stats;
      try {
        stats = fs.statSync(workingDir);
      } catch (err: any) {
        throw new Error(
          `Working dir ${config.working_dir} does not exist or isn't accessible: ${err.message}`,
        );
      }
      if (!stats.isDirectory()) {
        throw new Error(`Working dir ${config.working_dir} is not a directory`);
      }
    } else if (isTempDir) {
      // use a temp dir
      workingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-claude-agent-sdk-'));
    }

    // Make sure we didn't already abort
    if (callOptions?.abortSignal?.aborted) {
      return { error: 'Claude Agent SDK call aborted before it started' };
    }

    // Propagate abort signal to the Claude Agent SDK call
    const abortController = new AbortController();
    let abortHandler: (() => void) | undefined;
    if (callOptions?.abortSignal) {
      abortHandler = () => {
        abortController.abort(callOptions.abortSignal!.reason);
      };
      callOptions.abortSignal.addEventListener('abort', abortHandler);
    }

    // Make the Claude Agent SDK call
    const options: QueryOptions = {
      ...cacheKeyQueryOptions,
      abortController,
      mcpServers,
      cwd: workingDir,
      // Callbacks are not included in cache key since they're functions
      stderr: config.stderr,
      spawnClaudeCodeProcess: config.spawn_claude_code_process,
      canUseTool,
    };
    const queryParams = { prompt, options };

    // Log the query params for debugging
    logger.debug(
      `Calling Claude Agent SDK: ${JSON.stringify({
        prompt,
        options: {
          ...options,
          // overwrite with metadata instead of the full objects to avoid logging secrets
          mcpServers: options.mcpServers ? Object.keys(options.mcpServers) : undefined,
          env: Object.keys(env).length > 0 ? Object.keys(env) : undefined,
        },
      })}`,
    );

    try {
      // Dynamically import the ESM module once and cache it
      if (!this.claudeCodeModule) {
        this.claudeCodeModule = await loadClaudeCodeSDK();
      }

      const res = await this.claudeCodeModule.query(queryParams);

      for await (const msg of res) {
        if (msg.type == 'result') {
          const raw = JSON.stringify(msg);
          const tokenUsage: ProviderResponse['tokenUsage'] = {
            prompt: msg.usage?.input_tokens,
            completion: msg.usage?.output_tokens,
            total:
              msg.usage?.input_tokens && msg.usage?.output_tokens
                ? msg.usage?.input_tokens + msg.usage?.output_tokens
                : undefined,
          };
          const cost = msg.total_cost_usd ?? 0;
          const sessionId = msg.session_id;
          if (msg.subtype == 'success') {
            logger.debug(`Claude Agent SDK response: ${raw}`);
            // When structured output is enabled and available, use it as the output
            // Otherwise fall back to the text result
            const output = msg.structured_output !== undefined ? msg.structured_output : msg.result;
            const response: ProviderResponse = {
              output,
              tokenUsage,
              cost,
              raw,
              sessionId,
            };
            // Include structured output in metadata if available
            if (msg.structured_output !== undefined) {
              response.metadata = {
                ...response.metadata,
                structuredOutput: msg.structured_output,
              };
            }

            // Cache the response using shared utilities
            await cacheResponse(cacheResult, response, 'Claude Agent SDK');
            return response;
          } else {
            return {
              error: `Claude Agent SDK call failed: ${msg.subtype}`,
              tokenUsage,
              cost,
              raw,
              sessionId,
            };
          }
        }
      }

      return { error: "Claude Agent SDK call didn't return a result" };
    } catch (error: any) {
      const isAbort = error?.name === 'AbortError' || callOptions?.abortSignal?.aborted;

      if (isAbort) {
        logger.warn('Claude Agent SDK call aborted');
        return { error: 'Claude Agent SDK call aborted' };
      }

      logger.error(`Error calling Claude Agent SDK: ${error}`);
      return {
        error: `Error calling Claude Agent SDK: ${error}`,
      };
    } finally {
      if (isTempDir && workingDir) {
        // Clean up the temp dir
        fs.rmSync(workingDir, { recursive: true, force: true });
      }
      if (callOptions?.abortSignal && abortHandler) {
        callOptions.abortSignal.removeEventListener('abort', abortHandler);
      }
    }
  }

  toString(): string {
    return '[Anthropic Claude Agent SDK Provider]';
  }

  /**
   * For normal Claude Agent SDK support, just use the Anthropic API key
   * Users can also use Bedrock (with CLAUDE_CODE_USE_BEDROCK env var) or Vertex (with CLAUDE_CODE_USE_VERTEX env var)
   */
  getApiKey(): string | undefined {
    return this.config?.apiKey || this.env?.ANTHROPIC_API_KEY || getEnvString('ANTHROPIC_API_KEY');
  }

  async cleanup(): Promise<void> {
    // no cleanup needed
  }
}
