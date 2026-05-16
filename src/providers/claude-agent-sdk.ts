import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Stats } from 'node:fs';

import { trace as otelTrace, SpanStatusCode } from '@opentelemetry/api';
import dedent from 'dedent';
import cliState from '../cliState';
import { getEnvString } from '../envars';
import { importModule, resolvePackageEntryPoint } from '../esm';
import logger from '../logger';
import {
  getGenAITracer,
  getTraceparent,
  sanitizeBody,
  withGenAISpan,
} from '../tracing/genaiTracer';
import {
  PROMPTFOO_RESOURCE_ATTR_PARENT_SPAN_ID,
  PROMPTFOO_RESOURCE_ATTR_TRACE_ID,
} from '../tracing/resourceAttributes';
import { safeResolve } from '../util/pathUtils';
import {
  cacheResponse,
  getCachedResponse,
  initializeAgenticCache,
  resolveAgenticWorkingDir,
} from './agentic-utils';
import { ANTHROPIC_MODELS } from './anthropic/util';
import { transformMCPConfigToClaudeCode } from './mcp/transform';
import { MCPConfig } from './mcp/types';
import type {
  AgentDefinition,
  CanUseTool,
  HookCallbackMatcher,
  HookEvent,
  OnElicitation,
  OutputFormat,
  PermissionResult,
  Options as QueryOptions,
  SandboxSettings,
  SDKMessage,
  SDKResultMessage,
  SettingSource,
  Settings,
  SpawnedProcess,
  SpawnOptions,
  ThinkingConfig,
  ToolConfig,
} from '@anthropic-ai/claude-agent-sdk';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
  SkillCallEntry,
} from '../types/index';
import type { CacheCheckResult } from './agentic-utils';

/**
 * Represents a single tool call captured during a Claude Agent SDK session.
 * Available in `response.metadata.toolCalls` after a session completes.
 */
export interface ToolCallEntry {
  id: string;
  name: string;
  input: unknown;
  output: unknown;
  is_error: boolean;
  parentToolUseId: string | null;
}

interface ToolTrackingState {
  toolCallsMap: Map<string, ToolCallEntry>;
  toolStartTimes: Map<string, number>;
}

interface StreamResultSummary {
  lastResultMsg?: SDKResultMessage;
  lastMainResultMsg?: SDKResultMessage;
  resultMsgCount: number;
}

/** Hard cap for attribute body length on synthesized tool spans. */
const TOOL_SPAN_BODY_LIMIT = 4096;

/**
 * Append promptfoo-specific resource-attribute kvs to a W3C-style
 * `OTEL_RESOURCE_ATTRIBUTES` string, removing trailing whitespace/commas from
 * the existing value and stripping any previous occurrence of our keys so the
 * producer can't double-up. Returns the new string. Exported for tests.
 */
export function appendPromptfooResourceAttrs(
  existing: string | undefined,
  traceId: string,
  parentSpanId: string,
): string {
  const incoming = `${PROMPTFOO_RESOURCE_ATTR_TRACE_ID}=${traceId},${PROMPTFOO_RESOURCE_ATTR_PARENT_SPAN_ID}=${parentSpanId}`;
  if (!existing) {
    return incoming;
  }
  const cleaned = existing
    .split(',')
    .map((pair) => pair.trim())
    .filter(
      (pair) =>
        pair.length > 0 &&
        !pair.startsWith(`${PROMPTFOO_RESOURCE_ATTR_TRACE_ID}=`) &&
        !pair.startsWith(`${PROMPTFOO_RESOURCE_ATTR_PARENT_SPAN_ID}=`),
    )
    .join(',');
  return cleaned.length > 0 ? `${cleaned},${incoming}` : incoming;
}

function stringifyForSpan(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  let raw: string | undefined;
  if (typeof value === 'string') {
    raw = value;
  } else {
    try {
      raw = JSON.stringify(value);
    } catch {
      // JSON.stringify throws on circular references / BigInts / etc.
      // Preserve the enclosing span by substituting a sentinel for just this attribute.
      return '<unserializable>';
    }
  }
  if (raw === undefined) {
    return undefined;
  }
  const sanitized = sanitizeBody(raw);
  return sanitized.length > TOOL_SPAN_BODY_LIMIT
    ? `${sanitized.slice(0, TOOL_SPAN_BODY_LIMIT - 15)}... [truncated]`
    : sanitized;
}

/**
 * Emit a child span for a single tool call. Parents to the currently active
 * span (the provider's GenAI wrapper) so the UI shows an agent → tool hierarchy
 * similar to the OpenAI Agents SDK.
 *
 * When `incomplete` is true the call never produced a matching `tool_result`
 * (aborted run, stop hook, or the stream ended mid-tool). Such spans are
 * flagged via `tool.incomplete` and marked ERROR so traces surface the gap
 * instead of silently dropping the tool.
 */
function emitToolSpan(
  entry: ToolCallEntry,
  startTimeMs: number,
  endTimeMs: number,
  isError: boolean,
  incomplete = false,
): void {
  try {
    const tracer = getGenAITracer();
    const attributes: Record<string, string | number | boolean> = {
      'tool.name': entry.name,
      'tool.is_error': isError,
    };
    if (incomplete) {
      attributes['tool.incomplete'] = true;
    }
    const input = stringifyForSpan(entry.input);
    if (input !== undefined) {
      attributes['tool.input'] = input;
    }
    const output = stringifyForSpan(entry.output);
    if (output !== undefined) {
      attributes['tool.output'] = output;
    }
    if (entry.parentToolUseId) {
      attributes['tool.parent_id'] = entry.parentToolUseId;
    }

    const span = tracer.startSpan(`tool ${entry.name}`, {
      startTime: startTimeMs,
      attributes,
    });
    span.setStatus({
      code: isError || incomplete ? SpanStatusCode.ERROR : SpanStatusCode.OK,
    });
    span.end(endTimeMs);
  } catch (err) {
    logger.warn(`[ClaudeAgentSDK] Failed to emit tool span for ${entry.name}: ${err}`);
  }
}

function deriveSkillCalls(toolCalls: ToolCallEntry[]): SkillCallEntry[] {
  return toolCalls
    .filter((toolCall) => toolCall.name === 'Skill')
    .flatMap((toolCall) => {
      const skillName =
        toolCall.input &&
        typeof toolCall.input === 'object' &&
        typeof (toolCall.input as Record<string, unknown>).skill === 'string'
          ? ((toolCall.input as Record<string, unknown>).skill as string).trim()
          : '';

      if (!skillName) {
        return [];
      }

      return [
        {
          name: skillName,
          input: toolCall.input,
          is_error: toolCall.is_error,
          source: 'tool' as const,
        },
      ];
    });
}

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
      dedent`The @anthropic-ai/claude-agent-sdk package could not be resolved from ${basePath}.

      To use the Claude Agent SDK provider, install it with:
        npm install @anthropic-ai/claude-agent-sdk

      If the package is already installed elsewhere, run promptfoo from the
      project root (or point the config at that root) so node_modules is on
      the resolution path.

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
      - Incompatible Node.js version (requires Node.js ^20.20.0 or >=22.22.0)
      - Corrupted installation

      Try reinstalling:
        npm install @anthropic-ai/claude-agent-sdk

      For more information, see: https://www.promptfoo.dev/docs/providers/claude-agent-sdk/`,
    );
  }
}

export interface ClaudeCodeOptions {
  apiKey?: string;
  apiKeyRequired?: boolean;

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
   * When true, enables caching even when MCP servers are configured.
   * Use this when your MCP tools are deterministic (e.g., code search, static knowledge bases).
   * Different MCP configurations will produce different cache keys.
   * @default false
   */
  cache_mcp?: boolean;

  /**
   * Permission mode for controlling how tool executions are handled:
   * - 'default' - Standard behavior, prompts for dangerous operations
   * - 'plan' - Planning mode, no actual tool execution
   * - 'acceptEdits' - Auto-accept file edit operations
   * - 'bypassPermissions' - Bypass all permission checks (requires allow_dangerously_skip_permissions)
   * - 'dontAsk' - Don't prompt for permissions, deny if not pre-approved
   * - 'auto' - Use a model classifier to approve or deny permission prompts
   */
  permission_mode?: 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions' | 'dontAsk' | 'auto';

  /**
   * Custom workflow instructions for plan mode. Only takes effect when
   * `permission_mode` is `'plan'`; the string replaces the default
   * code-implementation workflow body in the plan-mode system reminder.
   * The CLI still wraps it with the read-only enforcement preamble and the
   * ExitPlanMode protocol footer.
   */
  plan_mode_instructions?: string;

  /**
   * User can set a custom system prompt, or append to the default Claude Agent SDK system prompt
   */
  custom_system_prompt?: string;
  append_system_prompt?: string;

  /**
   * When `true`, strip per-user dynamic sections (working directory, auto-memory,
   * git status) from the Claude Code preset system prompt so the prompt-caching
   * prefix stays static and eligible for cross-user cache hits. The stripped
   * context is re-injected as the first user message so the model still has
   * access to it. Has no effect when `custom_system_prompt` is set.
   *
   * Useful for large eval fleets where many runs share the same system prompt
   * and the per-user dynamic context would otherwise bust the cache.
   *
   * @see https://platform.claude.com/docs/en/agent-sdk/settings
   */
  exclude_dynamic_sections?: boolean;

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
   * Filters which Skills are loaded into the main session.
   *
   * - omitted: no SDK-side filtering — the CLI's own defaults still apply
   *   (this is **not** "skills off")
   * - `'all'`: enable every discovered skill
   * - `string[]`: enable only the listed skills, matched by SKILL.md `name` /
   *   directory name, or `plugin:skill` for plugin-qualified skills
   *
   * When set, the SDK auto-allows the `Skill` tool for the session — you do
   * not need to add it to `append_allowed_tools` / `custom_allowed_tools`.
   *
   * This is a context filter, not a sandbox: unlisted skills are hidden from
   * the model's listing and rejected by the Skill tool, but their files
   * remain on disk and are reachable via Read/Bash. Do not store secrets in
   * skill files.
   *
   * Skills are discovered from the directories enabled by `setting_sources`
   * and from `plugins`; this option only narrows the set, it does not
   * discover new skills.
   *
   * @example
   * ```yaml
   * skills: all
   * skills:
   *   - pdf
   *   - docx
   * ```
   *
   * @see https://platform.claude.com/docs/en/agent-sdk/skills
   */
  skills?: string[] | 'all';

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
   * When true, forwards subagent text and thinking blocks as assistant/user
   * messages with `parent_tool_use_id` set. By default the SDK only emits
   * tool_use/tool_result blocks from subagents (enough for a heartbeat
   * counter). Enable this if you want a complete subagent transcript in
   * `metadata.toolCalls` / OTel spans.
   *
   * @default false
   */
  forward_subagent_text?: boolean;

  /**
   * When true, includes hook lifecycle events (hook_started, hook_progress, hook_response)
   * in the output stream. SessionStart and Setup hook events are always emitted regardless.
   *
   * @default false
   */
  include_hook_events?: boolean;

  /**
   * Per-tool configuration for built-in tools.
   *
   * @example
   * ```yaml
   * tool_config:
   *   askUserQuestion:
   *     previewFormat: html
   * ```
   */
  tool_config?: ToolConfig;

  /**
   * Enable AI-predicted next prompts. When true, the agent emits a prompt_suggestion
   * message after each turn with a predicted next user prompt.
   * Suggestions piggyback on the parent's prompt cache, making them nearly free.
   *
   * @default false
   */
  prompt_suggestions?: boolean;

  /**
   * Enable periodic AI-generated progress summaries for running subagents.
   * When true, subagent conversations are forked every ~30s to produce a short
   * present-tense description, emitted on task_progress events.
   *
   * @default false
   */
  agent_progress_summaries?: boolean;

  /**
   * Additional settings to apply. Accepts either a path to a settings JSON file
   * or a Settings object. These are loaded into the "flag settings" layer,
   * which has the highest priority among user-controlled settings.
   *
   * @example Path to settings file
   * ```yaml
   * settings: /path/to/settings.json
   * ```
   *
   * @example Inline settings object
   * ```yaml
   * settings:
   *   permissions:
   *     allow:
   *       - 'Bash(*)'
   * ```
   */
  settings?: string | Settings;

  /**
   * Policy-tier settings supplied by the embedding parent. Loaded into the
   * managed-settings layer (above HKCU, below IT-controlled sources), so
   * user/project settings cannot widen restrictions set here. Use this when
   * promptfoo runs inside an app that derives lockdown configuration from
   * its own enterprise policy and needs to enforce it on the SDK subprocess
   * without writing root-owned files.
   *
   * Differs from `settings` (flag layer, user-controllable) — prefer
   * `managed_settings` for fields like `sandbox.network.allowManagedDomainsOnly`.
   *
   * @example
   * ```yaml
   * managed_settings:
   *   sandbox:
   *     network:
   *       allowManagedDomainsOnly: true
   * ```
   */
  managed_settings?: Settings;

  /**
   * Callback for handling MCP elicitation requests.
   * Called when an MCP server requests user input (form fields, URL auth, etc.)
   * and no hook handles the request first. If not provided, elicitation requests
   * that aren't handled by hooks will be declined automatically.
   *
   * Note: This option is only available when using the provider programmatically,
   * not via YAML config.
   */
  on_elicitation?: OnElicitation;

  /**
   * Callback forwarded to Claude Agent SDK's `canUseTool` option.
   * Available only in programmatic configs because functions cannot be
   * represented in YAML.
   */
  can_use_tool?: CanUseTool;

  /**
   * Enable beta features. Currently supports:
   * - 'context-1m-2025-08-07' - Enable 1M token context window (Sonnet 4/4.5 only)
   *
   * @see https://docs.anthropic.com/en/api/beta-headers
   */
  betas?: 'context-1m-2025-08-07'[];

  /**
   * Controls Claude's thinking/reasoning behavior. When set, takes precedence over max_thinking_tokens.
   * - { type: 'adaptive' } - Claude decides when and how much to think (Opus 4.6+, default for supporting models)
   * - { type: 'enabled', budgetTokens?: number } - Fixed thinking token budget (older models)
   * - { type: 'disabled' } - No extended thinking
   *
   * @see https://docs.anthropic.com/en/docs/build-with-claude/adaptive-thinking
   */
  thinking?: ThinkingConfig;

  /**
   * Token budget for the task. The model will pace its tool use to stay within this budget.
   * Useful for cost-conscious evaluations.
   *
   * @example
   * ```yaml
   * task_budget:
   *   total: 50000
   * ```
   */
  task_budget?: {
    total: number;
  };

  /**
   * Controls how much effort Claude puts into its response.
   * Works with adaptive thinking to guide thinking depth.
   * - 'low' - Minimal thinking, fastest responses
   * - 'medium' - Moderate thinking
   * - 'high' - Deep reasoning (default)
   * - 'xhigh' - Extra high reasoning (Opus 4.7+); sits between 'high' and 'max'
   * - 'max' - Maximum effort
   *
   * @see https://docs.anthropic.com/en/docs/build-with-claude/effort
   */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';

  /**
   * Agent name for the main thread. When specified, the agent's system prompt,
   * tool restrictions, and model will be applied to the main conversation.
   * The agent must be defined either in the 'agents' option or in settings.
   */
  agent?: string;

  /**
   * Use a specific session ID for the conversation instead of an auto-generated one.
   * Must be a valid UUID. Cannot be used with 'continue' or 'resume' unless
   * 'fork_session' is also set.
   */
  session_id?: string;

  /**
   * Custom title for a new session. When set, the session uses this title instead
   * of auto-generating one from the first user message. Useful for locating an
   * eval run in `~/.claude/projects/` or in Claude Code's session list.
   *
   * When resuming via `resume`/`continue`, the persisted title takes precedence.
   */
  title?: string;

  /**
   * Enable debug mode for the Claude Code process.
   * When true, enables verbose debug logging (equivalent to --debug CLI flag).
   */
  debug?: boolean;

  /**
   * Write debug logs to a specific file path.
   * Implicitly enables debug mode.
   */
  debug_file?: string;

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
   * - `failIfUnavailable` - Fail closed when sandbox dependencies or platform support are missing
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
   * Environment variables to pass to the Claude Agent SDK subprocess.
   * Merged with process.env and EnvOverrides (precedence: EnvOverrides > config.env > process.env).
   *
   * Useful for forwarding OTEL settings so the SDK exports telemetry to a collector.
   *
   * @example
   * ```yaml
   * config:
   *   env:
   *     CLAUDE_CODE_ENABLE_TELEMETRY: "1"
   *     OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318"
   *     OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf"
   * ```
   */
  env?: Record<string, string>;

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
    const config = this.mergeConfig(context);
    const env = this.buildEnvironment(config);
    this.ensureCredentials(config, env);
    this.validateConfig(config);
    this.warnOnIgnoredTitle(config);

    const basePath = this.getBasePath();
    const { allowedTools, disallowedTools } = this.resolveToolPermissions(config);
    const workingDirState = this.resolveWorkingDirState(config, basePath);
    let { workingDir } = workingDirState;
    const canUseTool = this.resolveCanUseTool(config);
    const cacheKeyQueryOptions = this.buildCacheKeyQueryOptions(
      config,
      env,
      basePath,
      allowedTools,
      disallowedTools,
    );
    const cacheResult = await this.initializeClaudeCache(
      config,
      workingDir,
      context,
      prompt,
      cacheKeyQueryOptions,
    );
    const cachedResponse = await getCachedResponse(cacheResult, 'Claude Agent SDK');
    if (cachedResponse) {
      return cachedResponse;
    }

    const mcpServers = await this.loadMcpServers(config);
    workingDir = await this.prepareWorkingDir(config, workingDir, workingDirState.isTempDir);
    if (callOptions?.abortSignal?.aborted) {
      return { error: 'Claude Agent SDK call aborted before it started' };
    }

    const { abortController, abortHandler } = this.createAbortController(callOptions);
    const options = this.buildQueryOptions(
      cacheKeyQueryOptions,
      abortController,
      mcpServers,
      workingDir,
      config,
      canUseTool,
    );
    const queryParams = { prompt, options };
    this.logQueryParams(prompt, options, env);

    try {
      return await withGenAISpan(
        {
          system: 'anthropic',
          operationName: 'chat',
          model: config.model || 'default',
          providerId: this.providerId,
          traceparent: context?.traceparent,
          maxTokens: config.max_thinking_tokens,
          requestBody: prompt,
        },
        () => this.executeClaudeQuery(queryParams, env, context, cacheResult),
        (response) => this.buildTraceResponseSummary(response),
      );
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
      if (workingDirState.isTempDir && workingDir) {
        // Clean up the temp dir
        await fs.rm(workingDir, { recursive: true, force: true });
      }
      if (callOptions?.abortSignal && abortHandler) {
        callOptions.abortSignal.removeEventListener('abort', abortHandler);
      }
    }
  }

  private mergeConfig(context?: CallApiContextParams): ClaudeCodeOptions {
    return {
      ...this.config,
      ...context?.prompt?.config,
    };
  }

  private buildEnvironment(config: ClaudeCodeOptions): Record<string, string> {
    const env: Record<string, string> = {};
    this.mergeEnvironmentValues(env, process.env);
    this.mergeEnvironmentValues(env, config.env);
    this.mergeEnvironmentValues(env, this.env);
    if (this.apiKey) {
      env.ANTHROPIC_API_KEY = this.apiKey;
    }
    return env;
  }

  private mergeEnvironmentValues(
    target: Record<string, string>,
    source: Record<string, string | undefined> | EnvOverrides | undefined,
  ): void {
    if (!source) {
      return;
    }
    for (const key of Object.keys(source).sort()) {
      const value = source[key as keyof typeof source];
      if (value !== undefined) {
        target[key] = value;
      }
    }
  }

  private ensureCredentials(config: ClaudeCodeOptions, env: Record<string, string>): void {
    if (
      this.apiKey ||
      config.apiKeyRequired === false ||
      env.CLAUDE_CODE_USE_BEDROCK ||
      env.CLAUDE_CODE_USE_VERTEX
    ) {
      return;
    }

    throw new Error(
      dedent`Anthropic API key is not set. Set the ANTHROPIC_API_KEY environment variable or add "apiKey" to the provider config.

      Use CLAUDE_CODE_USE_BEDROCK or CLAUDE_CODE_USE_VERTEX environment variables to use Bedrock or Vertex instead.`,
    );
  }

  private validateConfig(config: ClaudeCodeOptions): void {
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
    if (
      config.permission_mode === 'bypassPermissions' &&
      !config.allow_dangerously_skip_permissions
    ) {
      throw new Error(
        "permission_mode 'bypassPermissions' requires allow_dangerously_skip_permissions: true as a safety measure",
      );
    }
  }

  private warnOnIgnoredTitle(config: ClaudeCodeOptions): void {
    if (!config.title || (!config.resume && !config.continue)) {
      return;
    }
    logger.warn(
      '[ClaudeAgentSDK] `title` is ignored when `resume` or `continue` is set; the persisted session title is used instead.',
    );
  }

  private getBasePath(): string {
    return cliState.basePath ? path.resolve(cliState.basePath) : process.cwd();
  }

  private resolveToolPermissions(config: ClaudeCodeOptions): {
    allowedTools: string[] | undefined;
    disallowedTools: string[] | undefined;
  } {
    const defaultAllowedTools = config.working_dir ? FS_READONLY_ALLOWED_TOOLS : [];
    const allowedTools = this.resolveAllowedTools(config, defaultAllowedTools);
    const disallowedTools = config.disallowed_tools
      ? Array.from(new Set(config.disallowed_tools)).sort()
      : undefined;
    return { allowedTools, disallowedTools };
  }

  private resolveAllowedTools(
    config: ClaudeCodeOptions,
    defaultAllowedTools: string[],
  ): string[] | undefined {
    if (config.allow_all_tools) {
      return undefined;
    }
    if ('custom_allowed_tools' in config) {
      return Array.from(new Set(config.custom_allowed_tools ?? [])).sort();
    }
    if (config.append_allowed_tools) {
      return Array.from(new Set([...defaultAllowedTools, ...config.append_allowed_tools])).sort();
    }
    return defaultAllowedTools;
  }

  private resolveWorkingDirState(
    config: ClaudeCodeOptions,
    basePath: string,
  ): { workingDir?: string; isTempDir: boolean } {
    if (!config.working_dir) {
      return { isTempDir: true };
    }
    return {
      workingDir: resolveAgenticWorkingDir(config.working_dir, basePath),
      isTempDir: false,
    };
  }

  private resolveCanUseTool(config: ClaudeCodeOptions): CanUseTool | undefined {
    if (!config.ask_user_question) {
      return config.can_use_tool;
    }
    return createAskUserQuestionCanUseTool(config.ask_user_question.behavior, config.can_use_tool);
  }

  private buildCacheKeyQueryOptions(
    config: ClaudeCodeOptions,
    env: Record<string, string>,
    basePath: string,
    allowedTools: string[] | undefined,
    disallowedTools: string[] | undefined,
  ): Omit<
    QueryOptions,
    | 'abortController'
    | 'canUseTool'
    | 'cwd'
    | 'mcpServers'
    | 'onElicitation'
    | 'spawnClaudeCodeProcess'
    | 'stderr'
    | 'title'
  > {
    return {
      maxTurns: config.max_turns,
      model: config.model,
      fallbackModel: config.fallback_model,
      strictMcpConfig: config.strict_mcp_config ?? true,
      permissionMode: config.permission_mode,
      planModeInstructions: config.plan_mode_instructions,
      systemPrompt: this.buildSystemPrompt(config),
      maxThinkingTokens: config.max_thinking_tokens,
      allowedTools,
      disallowedTools,
      plugins: config.plugins?.map((plugin) => ({
        ...plugin,
        path: safeResolve(basePath, plugin.path),
      })),
      skills: config.skills,
      maxBudgetUsd: config.max_budget_usd,
      additionalDirectories: config.additional_directories?.map((dir) =>
        safeResolve(basePath, dir),
      ),
      resume: config.resume,
      forkSession: config.fork_session,
      resumeSessionAt: config.resume_session_at,
      continue: config.continue,
      agents: config.agents,
      outputFormat: config.output_format,
      hooks: config.hooks,
      includePartialMessages: config.include_partial_messages,
      includeHookEvents: config.include_hook_events,
      forwardSubagentText: config.forward_subagent_text,
      toolConfig: config.tool_config,
      promptSuggestions: config.prompt_suggestions,
      agentProgressSummaries: config.agent_progress_summaries,
      settings: this.resolveSettings(config.settings, basePath),
      managedSettings: config.managed_settings,
      betas: config.betas,
      thinking: config.thinking,
      effort: config.effort,
      agent: config.agent,
      sessionId: config.session_id,
      debug: config.debug,
      debugFile: config.debug_file ? safeResolve(basePath, config.debug_file) : undefined,
      sandbox: config.sandbox,
      allowDangerouslySkipPermissions: config.allow_dangerously_skip_permissions,
      permissionPromptToolName: config.permission_prompt_tool_name,
      executable: config.executable,
      executableArgs: config.executable_args,
      extraArgs: config.extra_args,
      pathToClaudeCodeExecutable: config.path_to_claude_code_executable
        ? safeResolve(basePath, config.path_to_claude_code_executable)
        : undefined,
      settingSources: config.setting_sources,
      tools: config.tools,
      enableFileCheckpointing: config.enable_file_checkpointing,
      persistSession: config.persist_session,
      taskBudget: config.task_budget,
      env,
    };
  }

  private buildSystemPrompt(config: ClaudeCodeOptions): QueryOptions['systemPrompt'] {
    if (config.custom_system_prompt) {
      return config.custom_system_prompt;
    }
    return {
      type: 'preset',
      preset: 'claude_code',
      append: config.append_system_prompt,
      ...(config.exclude_dynamic_sections ? { excludeDynamicSections: true } : {}),
    };
  }

  private resolveSettings(
    settings: ClaudeCodeOptions['settings'],
    basePath: string,
  ): ClaudeCodeOptions['settings'] {
    if (typeof settings === 'string' && settings) {
      return safeResolve(basePath, settings);
    }
    return settings;
  }

  private async initializeClaudeCache(
    config: ClaudeCodeOptions,
    workingDir: string | undefined,
    context: CallApiContextParams | undefined,
    prompt: string,
    cacheKeyQueryOptions: Record<string, unknown>,
  ): Promise<CacheCheckResult> {
    if (config.can_use_tool) {
      logger.debug(
        '[ClaudeCodeSDKProvider] Bypassing cache: user-supplied can_use_tool callback present',
      );
      return { shouldCache: false, shouldReadCache: false, shouldWriteCache: false };
    }
    return initializeAgenticCache(
      {
        cacheKeyPrefix: 'anthropic:claude-agent-sdk',
        workingDir,
        bustCache: context?.bustCache,
        mcp: config.mcp?.servers?.length ? config.mcp : undefined,
        cacheMcp: config.cache_mcp,
      },
      {
        prompt,
        cacheKeyQueryOptions,
      },
    );
  }

  private async loadMcpServers(config: ClaudeCodeOptions) {
    return config.mcp ? transformMCPConfigToClaudeCode(config.mcp) : {};
  }

  private async prepareWorkingDir(
    config: ClaudeCodeOptions,
    workingDir: string | undefined,
    isTempDir: boolean,
  ): Promise<string | undefined> {
    if (workingDir) {
      await this.assertWorkingDir(config, workingDir);
      return workingDir;
    }
    if (isTempDir) {
      return fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-claude-agent-sdk-'));
    }
    return undefined;
  }

  private async assertWorkingDir(config: ClaudeCodeOptions, workingDir: string): Promise<void> {
    let stats: Stats;
    try {
      stats = await fs.stat(workingDir);
    } catch (err: any) {
      throw new Error(
        `Working dir ${config.working_dir} does not exist or isn't accessible: ${err.message}`,
      );
    }
    if (!stats.isDirectory()) {
      throw new Error(`Working dir ${config.working_dir} is not a directory`);
    }
  }

  private createAbortController(callOptions?: CallApiOptionsParams): {
    abortController: AbortController;
    abortHandler?: () => void;
  } {
    const abortController = new AbortController();
    if (!callOptions?.abortSignal) {
      return { abortController };
    }
    const abortHandler = () => {
      abortController.abort(callOptions.abortSignal!.reason);
    };
    callOptions.abortSignal.addEventListener('abort', abortHandler);
    return { abortController, abortHandler };
  }

  private buildQueryOptions(
    cacheKeyQueryOptions: Omit<
      QueryOptions,
      | 'abortController'
      | 'canUseTool'
      | 'cwd'
      | 'mcpServers'
      | 'onElicitation'
      | 'spawnClaudeCodeProcess'
      | 'stderr'
      | 'title'
    >,
    abortController: AbortController,
    mcpServers: QueryOptions['mcpServers'],
    workingDir: string | undefined,
    config: ClaudeCodeOptions,
    canUseTool: CanUseTool | undefined,
  ): QueryOptions {
    return {
      ...cacheKeyQueryOptions,
      abortController,
      mcpServers,
      cwd: workingDir,
      stderr: config.stderr,
      spawnClaudeCodeProcess: config.spawn_claude_code_process,
      canUseTool,
      onElicitation: config.on_elicitation,
      title: config.title,
    };
  }

  private logQueryParams(prompt: string, options: QueryOptions, env: Record<string, string>): void {
    logger.debug(
      `Calling Claude Agent SDK: ${JSON.stringify({
        prompt,
        options: {
          ...options,
          mcpServers: options.mcpServers ? Object.keys(options.mcpServers) : undefined,
          env: Object.keys(env).length > 0 ? Object.keys(env) : undefined,
        },
      })}`,
    );
  }

  private async executeClaudeQuery(
    queryParams: { prompt: string; options: QueryOptions },
    env: Record<string, string>,
    context: CallApiContextParams | undefined,
    cacheResult: CacheCheckResult,
  ): Promise<ProviderResponse> {
    this.propagateTraceContext(env, context?.traceparent);
    await this.ensureClaudeCodeModule();
    const res = await this.claudeCodeModule!.query(queryParams);
    const toolState = this.createToolTrackingState();
    const streamSummary = await this.consumeClaudeStream(res, toolState);
    this.drainOrphanToolSpans(toolState);

    const finalMsg = streamSummary.lastMainResultMsg ?? streamSummary.lastResultMsg;
    if (!finalMsg) {
      return { error: "Claude Agent SDK call didn't return a result" };
    }

    this.warnOnAmbiguousResultSelection(finalMsg, streamSummary);
    this.markAbortedTerminalReason(finalMsg);
    return this.buildClaudeResponse(finalMsg, toolState, cacheResult);
  }

  private propagateTraceContext(env: Record<string, string>, fallbackTraceparent?: string): void {
    const zeroTraceId = '00000000000000000000000000000000';
    const activeTraceparent = getTraceparent();
    const activeValid =
      activeTraceparent && !activeTraceparent.includes(zeroTraceId) ? activeTraceparent : undefined;
    const traceparent = activeValid ?? fallbackTraceparent;
    if (traceparent && !env.TRACEPARENT) {
      env.TRACEPARENT = traceparent;
    }

    const [, traceId, parentSpanId] = traceparent ? traceparent.split('-') : [];
    if (traceId && parentSpanId) {
      env.OTEL_RESOURCE_ATTRIBUTES = appendPromptfooResourceAttrs(
        env.OTEL_RESOURCE_ATTRIBUTES,
        traceId,
        parentSpanId,
      );
    }
  }

  private async ensureClaudeCodeModule(): Promise<void> {
    if (!this.claudeCodeModule) {
      this.claudeCodeModule = await loadClaudeCodeSDK();
    }
  }

  private createToolTrackingState(): ToolTrackingState {
    return {
      toolCallsMap: new Map<string, ToolCallEntry>(),
      toolStartTimes: new Map<string, number>(),
    };
  }

  private async consumeClaudeStream(
    res: AsyncIterable<SDKMessage>,
    toolState: ToolTrackingState,
  ): Promise<StreamResultSummary> {
    const summary: StreamResultSummary = { resultMsgCount: 0 };
    for await (const msg of res) {
      if (msg.type === 'assistant') {
        this.recordAssistantToolUses(msg, toolState);
      } else if (msg.type === 'user') {
        this.recordToolResults(msg, toolState);
      } else if (msg.type === 'result') {
        this.recordResultMessage(msg, summary);
      }
    }
    return summary;
  }

  private recordAssistantToolUses(
    msg: Extract<SDKMessage, { type: 'assistant' }>,
    toolState: ToolTrackingState,
  ): void {
    for (const block of msg.message.content) {
      if (block.type !== 'tool_use') {
        continue;
      }
      toolState.toolCallsMap.set(block.id, {
        id: block.id,
        name: block.name,
        input: block.input,
        output: undefined,
        is_error: false,
        parentToolUseId: msg.parent_tool_use_id,
      });
      toolState.toolStartTimes.set(block.id, Date.now());
    }
  }

  private recordToolResults(
    msg: Extract<SDKMessage, { type: 'user' }>,
    toolState: ToolTrackingState,
  ): void {
    const content = msg.message?.content;
    if (!Array.isArray(content)) {
      return;
    }
    for (const block of content) {
      if (block.type !== 'tool_result') {
        continue;
      }
      this.applyToolResult(block, toolState);
    }
  }

  private applyToolResult(
    block: Extract<
      NonNullable<Extract<SDKMessage, { type: 'user' }>['message']>['content'][number],
      { type: 'tool_result' }
    >,
    toolState: ToolTrackingState,
  ): void {
    const entry = toolState.toolCallsMap.get(block.tool_use_id);
    if (!entry) {
      return;
    }
    entry.output = block.content;
    entry.is_error = block.is_error ?? false;
    const startMs = toolState.toolStartTimes.get(block.tool_use_id);
    if (startMs === undefined) {
      return;
    }
    emitToolSpan(entry, startMs, Date.now(), entry.is_error);
    toolState.toolStartTimes.delete(block.tool_use_id);
  }

  private recordResultMessage(msg: SDKResultMessage, summary: StreamResultSummary): void {
    summary.lastResultMsg = msg;
    summary.resultMsgCount++;
    if (msg.origin?.kind !== 'task-notification') {
      summary.lastMainResultMsg = msg;
    }
  }

  private drainOrphanToolSpans(toolState: ToolTrackingState): void {
    if (toolState.toolStartTimes.size === 0) {
      return;
    }
    const endedAt = Date.now();
    for (const [toolUseId, startMs] of toolState.toolStartTimes) {
      const entry = toolState.toolCallsMap.get(toolUseId);
      if (entry) {
        emitToolSpan(entry, startMs, endedAt, false, true);
      }
    }
    toolState.toolStartTimes.clear();
  }

  private warnOnAmbiguousResultSelection(
    finalMsg: SDKResultMessage,
    summary: StreamResultSummary,
  ): void {
    const usedPositionHeuristic =
      !summary.lastMainResultMsg || summary.lastMainResultMsg.origin === undefined;
    if (
      !usedPositionHeuristic ||
      summary.resultMsgCount <= 1 ||
      finalMsg.subtype !== 'success' ||
      finalMsg.terminal_reason !== undefined
    ) {
      return;
    }
    logger.warn(
      `[ClaudeAgentSDK] Stream produced ${summary.resultMsgCount} result messages and the last had no terminal_reason; returning it as the main-agent result, but the stream may have been truncated.`,
    );
    otelTrace.getActiveSpan()?.setStatus({
      code: SpanStatusCode.ERROR,
      message: 'stream closed without terminal_reason after multiple result messages',
    });
  }

  private markAbortedTerminalReason(finalMsg: SDKResultMessage): void {
    const abortedTerminalReason =
      typeof finalMsg.terminal_reason === 'string' &&
      (finalMsg.terminal_reason.startsWith('aborted_') ||
        finalMsg.terminal_reason === 'hook_stopped')
        ? finalMsg.terminal_reason
        : undefined;
    if (!abortedTerminalReason) {
      return;
    }
    otelTrace.getActiveSpan()?.setStatus({
      code: SpanStatusCode.ERROR,
      message: `aborted: ${abortedTerminalReason}`,
    });
  }

  private async buildClaudeResponse(
    finalMsg: SDKResultMessage,
    toolState: ToolTrackingState,
    cacheResult: CacheCheckResult,
  ): Promise<ProviderResponse> {
    const raw = JSON.stringify(finalMsg);
    const tokenUsage = this.buildTokenUsage(finalMsg);
    const cost = finalMsg.total_cost_usd ?? 0;
    const sessionId = finalMsg.session_id;
    const toolCalls = Array.from(toolState.toolCallsMap.values());
    const skillCalls = deriveSkillCalls(toolCalls);
    const metadata = this.buildResponseMetadata(finalMsg, toolCalls, skillCalls);

    if (finalMsg.subtype !== 'success') {
      return {
        error: `Claude Agent SDK call failed: ${finalMsg.subtype}`,
        tokenUsage,
        cost,
        raw,
        sessionId,
        metadata,
      };
    }

    logger.debug(`Claude Agent SDK response: ${raw}`);
    const response: ProviderResponse = {
      output:
        finalMsg.structured_output === undefined ? finalMsg.result : finalMsg.structured_output,
      tokenUsage,
      cost,
      raw,
      sessionId,
      metadata: {
        ...metadata,
        ...(finalMsg.structured_output === undefined
          ? {}
          : { structuredOutput: finalMsg.structured_output }),
      },
    };
    await cacheResponse(cacheResult, response, 'Claude Agent SDK');
    return response;
  }

  private buildTokenUsage(finalMsg: SDKResultMessage): ProviderResponse['tokenUsage'] {
    return {
      prompt: finalMsg.usage?.input_tokens,
      completion: finalMsg.usage?.output_tokens,
      total:
        finalMsg.usage?.input_tokens && finalMsg.usage?.output_tokens
          ? finalMsg.usage.input_tokens + finalMsg.usage.output_tokens
          : undefined,
    };
  }

  private buildResponseMetadata(
    finalMsg: SDKResultMessage,
    toolCalls: ToolCallEntry[],
    skillCalls: SkillCallEntry[],
  ): NonNullable<ProviderResponse['metadata']> {
    return {
      skillCalls,
      toolCalls,
      numTurns: finalMsg.num_turns,
      durationMs: finalMsg.duration_ms,
      durationApiMs: finalMsg.duration_api_ms,
      modelUsage: finalMsg.modelUsage,
      permissionDenials: finalMsg.permission_denials,
      ...(finalMsg.terminal_reason === undefined
        ? {}
        : { terminalReason: finalMsg.terminal_reason }),
    };
  }

  private buildTraceResponseSummary(response: ProviderResponse) {
    const metadata = response.metadata ?? {};
    const additionalAttributes = this.buildTraceAdditionalAttributes(response, metadata);
    return {
      tokenUsage: response.tokenUsage,
      responseModel: this.getTraceResponseModel(metadata),
      responseId: response.sessionId,
      finishReasons: this.getTraceFinishReasons(metadata),
      cacheHit: response.cached,
      responseBody: this.serializeTraceResponseBody(response.output),
      additionalAttributes:
        Object.keys(additionalAttributes).length > 0 ? additionalAttributes : undefined,
    };
  }

  private buildTraceAdditionalAttributes(
    response: ProviderResponse,
    metadata: NonNullable<ProviderResponse['metadata']>,
  ): Record<string, string | number | boolean> {
    const additional: Record<string, string | number | boolean> = {};
    if (typeof metadata.numTurns === 'number') {
      additional['gen_ai.agent.num_turns'] = metadata.numTurns;
    }
    if (typeof metadata.durationApiMs === 'number') {
      additional['gen_ai.agent.duration_api_ms'] = metadata.durationApiMs;
    }
    if (typeof response.cost === 'number' && response.cost > 0) {
      additional['gen_ai.agent.cost_usd'] = response.cost;
    }
    const toolCalls = metadata.toolCalls;
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      additional['gen_ai.agent.tool_call_count'] = toolCalls.length;
    }
    return additional;
  }

  private getTraceResponseModel(
    metadata: NonNullable<ProviderResponse['metadata']>,
  ): string | undefined {
    const modelUsage = metadata.modelUsage;
    if (!modelUsage || typeof modelUsage !== 'object' || Array.isArray(modelUsage)) {
      return undefined;
    }

    let responseModel: string | undefined;
    let topUsage = -1;
    for (const [key, usage] of Object.entries(
      modelUsage as Record<string, { inputTokens?: number; outputTokens?: number }>,
    )) {
      if (typeof key !== 'string' || key.length === 0 || key === 'undefined') {
        continue;
      }
      const total = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
      if (total > topUsage) {
        topUsage = total;
        responseModel = key;
      }
    }
    return responseModel;
  }

  private getTraceFinishReasons(
    metadata: NonNullable<ProviderResponse['metadata']>,
  ): string[] | undefined {
    return typeof metadata.terminalReason === 'string' ? [metadata.terminalReason] : undefined;
  }

  private serializeTraceResponseBody(output: ProviderResponse['output']): string | undefined {
    if (typeof output === 'string') {
      return output;
    }
    if (output === undefined) {
      return undefined;
    }
    return JSON.stringify(output);
  }

  toString(): string {
    return '[Anthropic Claude Agent SDK Provider]';
  }

  /**
   * For normal Claude Agent SDK support, just use the Anthropic API key
   * Users can also use Bedrock (with CLAUDE_CODE_USE_BEDROCK env var) or Vertex (with CLAUDE_CODE_USE_VERTEX env var)
   */
  requiresApiKey(): boolean {
    if (this.config.apiKeyRequired === false) {
      return false;
    }
    return !(
      this.env?.CLAUDE_CODE_USE_BEDROCK ||
      this.env?.CLAUDE_CODE_USE_VERTEX ||
      getEnvString('CLAUDE_CODE_USE_BEDROCK') ||
      getEnvString('CLAUDE_CODE_USE_VERTEX')
    );
  }

  getApiKey(): string | undefined {
    return this.config?.apiKey || this.env?.ANTHROPIC_API_KEY || getEnvString('ANTHROPIC_API_KEY');
  }

  async cleanup(): Promise<void> {
    // no cleanup needed
  }
}
