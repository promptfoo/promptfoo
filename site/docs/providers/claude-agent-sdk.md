---
sidebar_position: 3
title: Claude Agent SDK
description: 'Use Claude Agent SDK for evals with configurable tools, permissions, MCP servers, and more'
---

# Claude Agent SDK

This provider makes [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview) available for evals through its [TypeScript SDK](https://docs.claude.com/en/api/agent-sdk/typescript).

:::info
The Claude Agent SDK was formerly known as the Claude Code SDK. It's still built on top of Claude Code and exposes all its functionality.
:::

## Provider IDs

You can reference this provider using either:

- `anthropic:claude-agent-sdk` (full name)
- `anthropic:claude-code` (alias)

## Installation

The Claude Agent SDK provider requires the `@anthropic-ai/claude-agent-sdk` package to be installed separately:

```bash
npm install @anthropic-ai/claude-agent-sdk
```

:::note
This is an optional dependency and only needs to be installed if you want to use the Claude Agent SDK provider. Note that Anthropic has released the claude-agent-sdk library with a [proprietary license](https://github.com/anthropics/claude-agent-sdk-typescript/blob/9f51899c3e04f15951949ceac81849265d545579/LICENSE.md).
:::

## Setup

The easiest way to get started is with an Anthropic API key. You can set it with the `ANTHROPIC_API_KEY` environment variable or specify the `apiKey` in the provider configuration.

Create Anthropic API keys [here](https://console.anthropic.com/settings/keys).

Example of setting the environment variable:

```sh
export ANTHROPIC_API_KEY=your_api_key_here
```

If Claude Agent SDK will authenticate through an existing local Claude Code session instead of `ANTHROPIC_API_KEY`, disable Promptfoo's upfront API key check:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      apiKeyRequired: false
```

This is useful when you're using a local Claude Code binary with an active session, such as Claude Code monthly plans. Promptfoo will skip its preflight API key validation, but the SDK still needs to be able to authenticate on its own.

## Other Model Providers

Apart from using the Anthropic API, you can also use AWS Bedrock and Google Vertex AI.

For AWS Bedrock:

- Set the `CLAUDE_CODE_USE_BEDROCK` environment variable to `true`:

```sh
export CLAUDE_CODE_USE_BEDROCK=true
```

- Follow the [Claude Code Bedrock documentation](https://docs.claude.com/en/docs/claude-code/amazon-bedrock) to make credentials available to Claude Agent SDK.

For Google Vertex:

- Set the `CLAUDE_CODE_USE_VERTEX` environment variable to `true`:

```sh
export CLAUDE_CODE_USE_VERTEX=true
```

- Follow the [Claude Code Vertex documentation](https://docs.claude.com/en/docs/claude-code/google-vertex-ai) to make credentials available to Claude Agent SDK.

## Quick Start

### Basic Usage

By default, Claude Agent SDK runs in a temporary directory with no tools enabled, using the `default` permission mode. This makes it behave similarly to the standard [Anthropic provider](/docs/providers/anthropic/). It has no access to the file system (read or write) and can't run system commands.

```yaml title="promptfooconfig.yaml"
providers:
  - anthropic:claude-agent-sdk

prompts:
  - 'Output a python function that prints the first 10 numbers in the Fibonacci sequence'
```

When your test cases finish, the temporary directory is deleted.

### With Working Directory

You can specify a specific working directory for Claude Agent SDK to run in:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      working_dir: ./src

prompts:
  - 'Review the TypeScript files and identify potential bugs'
```

This allows you to prepare a directory with files or sub-directories before running your tests.

By default, when you specify a working directory, Claude Agent SDK is given read-only access to the directory.

### With Side Effects

You can also allow Claude Agent SDK to write to files, run system commands, call MCP servers, and more.

Here's an example that will allow Claude Agent SDK to both read from and write to files in the working directory. It uses `append_allowed_tools` to add tools for writing and editing files to the default set of read-only tools. It also sets `permission_mode` to `acceptEdits` so Claude Agent SDK can modify files without asking for confirmation.

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      working_dir: ./my-project
      append_allowed_tools: ['Write', 'Edit', 'MultiEdit']
      permission_mode: 'acceptEdits'

prompts:
  - 'Refactor the authentication module to use async/await'
```

> **Note:** when using `acceptEdits` and tools that allow side effects like writing to files, you'll need to consider how you will reset the files after each test run. See the [Managing Side Effects](#managing-side-effects) section for more information.

## Supported Parameters

| Parameter                            | Type          | Description                                                                                                  | Default                  |
| ------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------ |
| `apiKey`                             | string        | Anthropic API key                                                                                            | Environment variable     |
| `apiKeyRequired`                     | boolean       | Require Promptfoo to find an Anthropic API key before calling the SDK. Set to `false` for local SDK auth.    | `true`                   |
| `working_dir`                        | string        | Directory for file operations                                                                                | Temporary directory      |
| `model`                              | string        | Primary model to use (passed to Claude Agent SDK)                                                            | Claude Agent SDK default |
| `fallback_model`                     | string        | Fallback model if primary fails                                                                              | Claude Agent SDK default |
| `max_turns`                          | number        | Maximum conversation turns                                                                                   | Claude Agent SDK default |
| `max_thinking_tokens`                | number        | Maximum tokens for thinking                                                                                  | Claude Agent SDK default |
| `max_budget_usd`                     | number        | Maximum cost budget in USD for the agent execution                                                           | None                     |
| `task_budget`                        | object        | Token budget for pacing tool use: `{total: N}`                                                               | None                     |
| `permission_mode`                    | string        | Permission mode: `default`, `plan`, `acceptEdits`, `bypassPermissions`, `dontAsk`, `auto`                    | `default`                |
| `allow_dangerously_skip_permissions` | boolean       | Required safety flag when using `bypassPermissions` mode                                                     | false                    |
| `thinking`                           | object        | Thinking config: `{type: 'adaptive'}`, `{type: 'enabled', budgetTokens: N}`, or `{type: 'disabled'}`         | Model default            |
| `effort`                             | string        | Response effort level: `low`, `medium`, `high`, `max`                                                        | `high`                   |
| `agent`                              | string        | Named agent for the main thread (must be defined in `agents` or settings)                                    | None                     |
| `session_id`                         | string        | Custom session UUID (cannot be used with `continue`/`resume` unless `fork_session` is set)                   | Auto-generated           |
| `debug`                              | boolean       | Enable verbose debug logging                                                                                 | false                    |
| `debug_file`                         | string        | Write debug logs to this file path (implicitly enables debug)                                                | None                     |
| `betas`                              | string[]      | Enable beta features (e.g., `['context-1m-2025-08-07']` for 1M context)                                      | None                     |
| `custom_system_prompt`               | string        | Replace default system prompt                                                                                | None                     |
| `append_system_prompt`               | string        | Append to default system prompt                                                                              | None                     |
| `tools`                              | array/object  | Base set of built-in tools (array of names or `{type: 'preset', preset: 'claude_code'}`)                     | None                     |
| `custom_allowed_tools`               | string[]      | Replace default allowed tools                                                                                | None                     |
| `append_allowed_tools`               | string[]      | Add to default allowed tools                                                                                 | None                     |
| `allow_all_tools`                    | boolean       | Allow all available tools                                                                                    | false                    |
| `disallowed_tools`                   | string[]      | Tools to explicitly block (overrides allowed)                                                                | None                     |
| `additional_directories`             | string[]      | Additional directories the agent can access (beyond working_dir)                                             | None                     |
| `ask_user_question`                  | object        | Automated handling for AskUserQuestion tool (see [Handling AskUserQuestion](#handling-askuserquestion-tool)) | None                     |
| `mcp`                                | object        | MCP server configuration                                                                                     | None                     |
| `strict_mcp_config`                  | boolean       | Only allow configured MCP servers                                                                            | true                     |
| `cache_mcp`                          | boolean       | Enable caching when MCP is configured (for deterministic MCP tools)                                          | false                    |
| `setting_sources`                    | string[]      | Where SDK looks for settings, CLAUDE.md, and slash commands                                                  | None (disabled)          |
| `plugins`                            | array         | Local [plugins](#plugins) to load for the session                                                            | None                     |
| `output_format`                      | object        | Structured output configuration with JSON schema                                                             | None                     |
| `agents`                             | object        | Programmatic agent definitions for custom subagents                                                          | None                     |
| `hooks`                              | object        | Event hooks for intercepting tool calls and other events                                                     | None                     |
| `include_partial_messages`           | boolean       | Include partial/streaming messages in response                                                               | false                    |
| `include_hook_events`                | boolean       | Include hook lifecycle events in output stream                                                               | false                    |
| `tool_config`                        | object        | Per-tool configuration (e.g., `askUserQuestion.previewFormat`)                                               | None                     |
| `prompt_suggestions`                 | boolean       | Enable AI-predicted next prompts after each turn                                                             | false                    |
| `agent_progress_summaries`           | boolean       | Enable periodic AI progress summaries for subagents                                                          | false                    |
| `settings`                           | string/object | Additional [settings](#settings) (file path or inline object)                                                | None                     |
| `on_elicitation`                     | function      | Callback for MCP elicitation requests (programmatic only)                                                    | Auto-decline             |
| `resume`                             | string        | Resume from a specific session ID                                                                            | None                     |
| `fork_session`                       | boolean       | Fork from an existing session instead of continuing                                                          | false                    |
| `continue`                           | boolean       | Continue an existing session                                                                                 | false                    |
| `enable_file_checkpointing`          | boolean       | Track file changes for rewinding to previous states                                                          | false                    |
| `persist_session`                    | boolean       | Save session to disk for later resumption                                                                    | true                     |
| `sandbox`                            | object        | Sandbox settings for command execution isolation                                                             | None                     |
| `permission_prompt_tool_name`        | string        | MCP tool name to use for permission prompts                                                                  | None                     |
| `executable`                         | string        | JavaScript runtime: `node`, `bun`, or `deno`                                                                 | Auto-detected            |
| `executable_args`                    | string[]      | Arguments to pass to the JavaScript runtime                                                                  | None                     |
| `extra_args`                         | object        | Additional CLI arguments (keys without `--`, values as strings or null for flags)                            | None                     |
| `path_to_claude_code_executable`     | string        | Path to a custom Claude Code executable                                                                      | Built-in                 |
| `spawn_claude_code_process`          | function      | Custom spawn function for VMs/containers (programmatic only)                                                 | Default spawn            |

## Models

Model selection is optional, since Claude Agent SDK uses sensible defaults. When specified, models are passed directly to the Claude Agent SDK.

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      model: claude-opus-4-6
      fallback_model: claude-sonnet-4-5-20250929
```

Claude Agent SDK also supports a number of [model aliases](https://docs.claude.com/en/docs/claude-code/model-config#model-aliases), which can also be used in the configuration.

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      model: sonnet
      fallback_model: haiku
```

Claude Agent SDK also supports configuring models through [environment variables](https://docs.claude.com/en/docs/claude-code/model-config#environment-variables). When using this provider, any environment variables you set will be passed through to the Claude Agent SDK.

## System Prompt

Unless you specify a `custom_system_prompt`, the default Claude Code system prompt will be used. You can append additional instructions to it with `append_system_prompt`.

:::info
Note that this differs slightly from the Claude Agent SDK's behavior when used independently of Promptfoo. The Agent SDK will _not_ use the Claude Code system prompt by default unless it's specified—it will instead use an empty system prompt if none is provided. If you want to use an empty system prompt with this provider, set `custom_system_prompt` to an empty string.
:::

## Tools and Permissions

### Default Tools

If no `working_dir` is specified, Claude Agent SDK runs in a temporary directory with no access to tools by default.

By default, when a `working_dir` is specified, Claude Agent SDK has access to the following read-only tools:

- `Read` - Read file contents
- `Grep` - Search file contents
- `Glob` - Find files by pattern
- `LS` - List directory contents

### Permission Modes

Control Claude Agent SDK's permissions for modifying files and running system commands:

| Mode                | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| `default`           | Standard permissions                                                  |
| `plan`              | Planning mode                                                         |
| `acceptEdits`       | Allow file modifications                                              |
| `bypassPermissions` | No restrictions (requires `allow_dangerously_skip_permissions: true`) |
| `dontAsk`           | Deny permissions that aren't pre-approved (no prompts)                |

:::warning
Using `bypassPermissions` requires setting `allow_dangerously_skip_permissions: true` as a safety measure:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      permission_mode: bypassPermissions
      allow_dangerously_skip_permissions: true
```

:::

### Tool Configuration

Customize available tools for your use case:

```yaml
# Use all default Claude Code tools via preset
providers:
  - id: anthropic:claude-agent-sdk
    config:
      tools:
        type: preset
        preset: claude_code

# Specify exact base tools
providers:
  - id: anthropic:claude-agent-sdk
    config:
      tools:
        - Bash
        - Read
        - Edit
        - Write

# Disable all built-in tools
providers:
  - id: anthropic:claude-agent-sdk
    config:
      tools: []

# Add tools to defaults
providers:
  - id: anthropic:claude-agent-sdk
    config:
      append_allowed_tools: ['Write', 'Edit']

# Replace default tools entirely
providers:
  - id: anthropic:claude-agent-sdk
    config:
      custom_allowed_tools: ['Read', 'Grep', 'Glob', 'Write', 'Edit', 'MultiEdit', 'Bash', 'WebFetch', 'WebSearch']

# Block specific tools
providers:
  - id: anthropic:claude-agent-sdk
    config:
      disallowed_tools: ['Delete', 'Run']

# Allow all tools (use with caution)
providers:
  - id: anthropic:claude-agent-sdk
    config:
      allow_all_tools: true
```

The `tools` option specifies the base set of available built-in tools, while `allowedTools` and `disallowedTools` filter from that base.

⚠️ **Security Note**: Some tools allow Claude Agent SDK to modify files, run system commands, search the web, and more. Think carefully about security implications before using these tools.

[Here's a full list of available tools.](https://docs.claude.com/en/docs/claude-code/settings#tools-available-to-claude)

## MCP Integration

Unlike the standard Anthropic provider, Claude Agent SDK handles MCP (Model Context Protocol) connections directly. Configuration is forwarded to the Claude Agent SDK:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      mcp:
        servers:
          # HTTP-based server
          - url: https://api.example.com/mcp
            name: api-server
            headers:
              Authorization: 'Bearer token'

          # Process-based server
          - command: node
            args: ['mcp-server.js']
            name: local-server

      strict_mcp_config: true # Only use configured servers (true by default)
```

For detailed MCP configuration, see [Claude Code MCP documentation](https://docs.claude.com/en/docs/claude-code/mcp).

## Setting Sources

By default, the Claude Agent SDK provider does not look for settings files, CLAUDE.md, or slash commands. You can enable this by specifying `setting_sources`:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      setting_sources: ['project', 'local']
```

Available values:

- `user` - User-level settings
- `project` - Project-level settings
- `local` - Local directory settings

## Plugins

[Plugins](https://code.claude.com/docs/en/plugins) extend the agent with additional skills, agents, hooks, and MCP servers. While `setting_sources` discovers skills from the standard settings hierarchy (project/local/user), plugins are self-contained directories that bundle capabilities together and namespace their skills—mirroring how marketplace-installed plugins work.

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      working_dir: ./my-project
      plugins:
        - type: local
          path: ./my-plugin
      append_allowed_tools: ['Skill', 'Read']
```

:::note
Only the `local` type is currently supported. Relative paths in `path` resolve against the config file's directory.
:::

### Plugin Structure

A plugin is a directory containing a `.claude-plugin/plugin.json` manifest:

```text
my-plugin/
├── .claude-plugin/
│   └── plugin.json
└── skills/
    └── code-review/
        └── SKILL.md
```

The manifest defines the plugin's name and description:

```json title="my-plugin/.claude-plugin/plugin.json"
{
  "name": "my-plugin",
  "description": "A plugin that provides code review skills"
}
```

### Skill Namespacing

Skills from plugins are namespaced with the plugin name. For example, a `standards-check` skill in a plugin named `project-standards` becomes `project-standards:standards-check`. Use this namespaced name when asserting on skill invocations:

```yaml
assert:
  - type: skill-used
    value: project-standards:standards-check
```

### Plugins vs Setting Sources

Both `plugins` and `setting_sources` can provide skills, but they serve different purposes:

- **`setting_sources`**: Discovers skills from the standard settings hierarchy—project, local, and user-level `.claude/skills/` directories. Skills are not namespaced.
- **`plugins`**: Loads self-contained plugin directories, mirroring how marketplace-installed plugins work. Skills are namespaced with the plugin name (`plugin:skill`).

You can use both together — skills from both sources are available in the same session.

## Testing Skills

[Agent Skills](https://platform.claude.com/docs/en/agent-sdk/skills) are reusable capabilities that extend Claude's functionality. They are defined as `SKILL.md` files and can be tested using the Claude Agent SDK provider. Skills can be loaded via `setting_sources` (from the standard settings hierarchy) or from [plugins](#plugins).

### Enabling Skills

To test skills, load them via `setting_sources` or `plugins`, and include `Skill` in the allowed tools. Using `setting_sources`:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      working_dir: ./my-project
      setting_sources: ['project'] # Load skills from .claude/skills/
      append_allowed_tools: ['Skill']
```

### How Skills Are Discovered

Skills are automatically discovered at startup from the configured `setting_sources` directories. The SDK scans for `SKILL.md` files in subdirectories of `.claude/skills/`:

```text
my-project/
└── .claude/
    └── skills/
        ├── code-review/
        │   └── SKILL.md
        └── test-generator/
            └── SKILL.md
```

Claude automatically invokes the relevant skill when a task matches the skill's description in its frontmatter.

### Testing Skill Invocation

Promptfoo normalizes Claude `Skill` tool invocations into `response.metadata.skillCalls`, so skill evals can use the same `skill-used` assertion style as Codex. The underlying `Skill` tool calls are still available in [`response.metadata.toolCalls`](#tool-call-tracking) when you need the raw tool payload.

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      working_dir: ./my-project
      setting_sources: ['project']
      append_allowed_tools: ['Skill', 'Read', 'Write']

prompts:
  - 'Review the authentication module for security issues'

tests:
  - assert:
      # Check that a specific skill was invoked
      - type: skill-used
        value: code-review
```

### Checking Available Skills

You can verify skills are loaded by asking Claude to list them. Note that this relies on Claude's free-text response, so use a flexible assertion:

```yaml
prompts:
  - 'List all available skills by name'

tests:
  - assert:
      - type: icontains
        value: 'code-review' # Expected skill name
```

:::note
Because the response is free-text, `contains` assertions may be fragile. For more reliable testing, check tool calls instead (see [Testing Skill Invocation](#testing-skill-invocation)).
:::

### Testing Restrictions for CI

For consistent testing in CI/CD environments, restrict to project-level skills only:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      working_dir: ./my-project
      setting_sources: ['project'] # Only team-shared skills, exclude personal
      append_allowed_tools: ['Skill', 'Read', 'Bash']
      permission_mode: 'acceptEdits'
```

This ensures tests don't depend on user-specific skills that may not be present in CI.

### Example: Complete Skills Testing Configuration

```yaml title="promptfooconfig.yaml"
providers:
  - id: anthropic:claude-agent-sdk
    config:
      working_dir: ./my-project
      setting_sources: ['project']
      append_allowed_tools: ['Skill', 'Read', 'Write', 'Bash']
      permission_mode: 'acceptEdits'

prompts:
  - 'Generate unit tests for the UserService class'

tests:
  - assert:
      # Verify the test-generator skill was invoked
      - type: skill-used
        value: test-generator
      # Verify tests were generated
      - type: icontains
        value: 'describe('
```

For more information about creating skills, see the [Claude Code skills documentation](https://code.claude.com/docs/en/skills).

## Budget Control

Limit the maximum cost of an agent execution with `max_budget_usd`:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      max_budget_usd: 0.50
```

The agent will stop execution if the cost exceeds the specified budget.

## Task Budget

Control how the model paces its tool use within a token budget using `task_budget`:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      task_budget:
        total: 50000
```

The `total` field sets the token budget for the task. The model uses this to pace its tool use—for example, being more selective about which tools to invoke as the budget is consumed.

## Additional Directories

Grant the agent access to directories beyond the working directory:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      working_dir: ./project
      additional_directories:
        - /shared/libs
        - /data/models
```

## Structured Output

Get validated JSON responses by specifying an output schema:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      output_format:
        type: json_schema
        schema:
          type: object
          properties:
            analysis:
              type: string
            confidence:
              type: number
          required: [analysis, confidence]
```

When `output_format` is configured, the response will include structured output that conforms to the schema. The structured output is available in:

- `output` - The parsed structured output (when available)
- `metadata.structuredOutput` - The raw structured output value

## Session Management

Continue or fork existing sessions for multi-turn interactions:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      # Continue an existing session
      resume: 'session-id-from-previous-run'
      continue: true

      # Or fork from an existing session
      resume: 'session-id-to-fork'
      fork_session: true
```

Session IDs are returned in the response and can be used to continue conversations across eval runs.

### Disabling Session Persistence

By default, sessions are saved to disk (`~/.claude/projects/`) and can be resumed later. For ephemeral or automated workflows where session history is not needed, disable persistence:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      persist_session: false
```

## File Checkpointing

Track file changes during the session to enable rewinding to previous states:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      enable_file_checkpointing: true
      working_dir: ./my-project
      append_allowed_tools: ['Write', 'Edit']
```

When file checkpointing is enabled, the SDK creates backups of files before they are modified. This allows programmatic restoration to any previous state in the conversation.

## Beta Features

Enable experimental features using the `betas` parameter:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      betas:
        - context-1m-2025-08-07
```

Currently available betas:

| Beta                    | Description                                        |
| ----------------------- | -------------------------------------------------- |
| `context-1m-2025-08-07` | Enable 1M token context window (Sonnet 4/4.5 only) |

See the [Anthropic beta headers documentation](https://docs.anthropic.com/en/api/beta-headers) for more information.

## Sandbox Configuration

Run commands in an isolated sandbox environment for additional security:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      sandbox:
        enabled: true
        autoAllowBashIfSandboxed: true
        network:
          allowLocalBinding: true
          allowedDomains:
            - api.example.com
```

Available sandbox options:

| Option                        | Type     | Description                                          |
| ----------------------------- | -------- | ---------------------------------------------------- |
| `enabled`                     | boolean  | Enable sandboxed execution                           |
| `autoAllowBashIfSandboxed`    | boolean  | Auto-allow bash commands when sandboxed              |
| `allowUnsandboxedCommands`    | boolean  | Allow commands that can't be sandboxed               |
| `enableWeakerNestedSandbox`   | boolean  | Enable weaker sandbox for nested environments        |
| `excludedCommands`            | string[] | Commands to exclude from sandboxing                  |
| `failIfUnavailable`           | boolean  | Fail closed when sandbox dependencies are missing    |
| `ignoreViolations`            | object   | Map of command patterns to violation types to ignore |
| `network.allowedDomains`      | string[] | Domains allowed for network access                   |
| `network.allowLocalBinding`   | boolean  | Allow binding to localhost                           |
| `network.allowUnixSockets`    | string[] | Specific Unix sockets to allow                       |
| `network.allowAllUnixSockets` | boolean  | Allow all Unix socket connections                    |
| `network.httpProxyPort`       | number   | HTTP proxy port for network access                   |
| `network.socksProxyPort`      | number   | SOCKS proxy port for network access                  |
| `ripgrep.command`             | string   | Path to custom ripgrep executable                    |
| `ripgrep.args`                | string[] | Additional arguments for ripgrep                     |

When `sandbox.enabled` is `true`, Claude Agent SDK defaults `failIfUnavailable` to `true`; set it to `false` only if you want the SDK to degrade gracefully when sandbox dependencies or platform support are missing.

See the [Claude Code sandbox documentation](https://docs.anthropic.com/en/docs/claude-code/settings#sandbox-settings) for more details.

## Settings

Apply additional settings via a file path or inline object. These load into the "flag settings" layer, which has the highest priority among user-controlled settings:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      settings:
        permissions:
          allow:
            - 'Bash(*)'
            - 'Read(*)'
```

Or reference a settings file:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      settings: /path/to/settings.json
```

## Tool Configuration

Customize built-in tool behavior with `tool_config`:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      tool_config:
        askUserQuestion:
          previewFormat: html # 'markdown' (default) or 'html'
```

## Progress Summaries and Prompt Suggestions

Enable AI-generated progress summaries for running subagents and predicted next prompts:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      agent_progress_summaries: true # periodic summaries for subagents
      prompt_suggestions: true # AI-predicted next prompts after each turn
```

## Advanced Runtime Configuration

### JavaScript Runtime

Specify which JavaScript runtime to use:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      executable: bun # or 'node' or 'deno'
      executable_args:
        - '--smol'
```

### Extra CLI Arguments

Pass additional arguments to Claude Code:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      extra_args:
        verbose: null # boolean flag (adds --verbose)
        timeout: '30' # adds --timeout 30
```

### Custom Executable Path

Use a specific Claude Code installation:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      path_to_claude_code_executable: /custom/path/to/claude-code
```

### Custom Spawn Function (Programmatic Only)

For running Claude Code in VMs, containers, or remote environments, you can provide a custom spawn function when using the provider programmatically:

```typescript
import { ClaudeCodeSDKProvider } from 'promptfoo';

const provider = new ClaudeCodeSDKProvider({
  config: {
    spawn_claude_code_process: (options) => {
      // Custom spawn logic for VM/container execution
      // options contains: command, args, cwd, env, signal
      return myVMProcess; // Must satisfy SpawnedProcess interface
    },
  },
});
```

This option is only available when using the provider programmatically, not via YAML configuration.

## Programmatic Agents

Define custom subagents with specific tools and permissions:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      agents:
        code-reviewer:
          name: Code Reviewer
          description: Reviews code for bugs and style issues
          tools: [Read, Grep, Glob]
        test-runner:
          name: Test Runner
          description: Runs tests and reports results
          tools: [Bash, Read]
```

## Handling AskUserQuestion Tool

The `AskUserQuestion` tool allows Claude to ask the user multiple-choice questions during execution. In automated evaluations, there's no human to answer these questions, so you need to configure how they should be handled.

### Using the Convenience Option

The simplest approach is to use the `ask_user_question` configuration:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      append_allowed_tools: ['AskUserQuestion']
      ask_user_question:
        behavior: first_option
```

Available behaviors:

| Behavior       | Description                            |
| -------------- | -------------------------------------- |
| `first_option` | Always select the first option         |
| `random`       | Randomly select from available options |
| `deny`         | Deny the tool use                      |

### Programmatic Usage

For custom answer selection logic when using the provider programmatically, you can provide your own `canUseTool` callback:

```typescript
import { ClaudeCodeSDKProvider } from 'promptfoo';

const provider = new ClaudeCodeSDKProvider({
  config: {
    append_allowed_tools: ['AskUserQuestion'],
  },
  // Custom canUseTool passed via SDK options
});
```

The `canUseTool` callback receives the tool name and input, and returns an answer:

```typescript
async function canUseTool(toolName, input, options) {
  if (toolName !== 'AskUserQuestion') {
    return { behavior: 'allow', updatedInput: input };
  }

  const answers = {};
  for (const q of input.questions) {
    // Custom selection logic - prefer options marked as recommended
    const preferred = q.options.find((o) => o.description.toLowerCase().includes('recommended'));
    answers[q.question] = preferred?.label ?? q.options[0].label;
  }

  return {
    behavior: 'allow',
    updatedInput: {
      questions: input.questions,
      answers,
    },
  };
}
```

See the [Claude Agent SDK permissions documentation](https://platform.claude.com/docs/en/agent-sdk/permissions) for more details on `canUseTool`.

:::tip
If you're testing scenarios where the agent asks questions, consider what answer would lead to the most interesting test case. Using `random` behavior can help discover edge cases.
:::

## Tool Call Tracking

The Claude Agent SDK provider captures all tool calls made during the agentic session and exposes them in `response.metadata.toolCalls`. This allows you to assert on tool usage in your evaluations.

Each tool call entry contains:

| Field             | Type           | Description                                                  |
| ----------------- | -------------- | ------------------------------------------------------------ |
| `id`              | string         | Unique tool call ID                                          |
| `name`            | string         | Tool name (e.g., `Read`, `Bash`, `Grep`)                     |
| `input`           | unknown        | Arguments passed to the tool                                 |
| `output`          | unknown        | Tool result content (undefined if not available)             |
| `is_error`        | boolean        | Whether the tool call resulted in an error                   |
| `parentToolUseId` | string \| null | Parent tool use ID for sub-agent calls, `null` for top-level |

### Asserting on Tool Usage

Use JavaScript assertions to check which tools were called:

```yaml
assert:
  - type: javascript
    value: |
      const toolCalls = context.providerResponse?.metadata?.toolCalls || [];
      const readCalls = toolCalls.filter(t => t.name === 'Read');
      return readCalls.length > 0;
```

Check that a specific command was run:

```yaml
assert:
  - type: javascript
    value: |
      const toolCalls = context.providerResponse?.metadata?.toolCalls || [];
      const bashCalls = toolCalls.filter(t => t.name === 'Bash');
      return bashCalls.some(t => t.input?.command?.includes('npm test'));
```

Verify tool output content:

```yaml
assert:
  - type: javascript
    value: |
      const toolCalls = context.providerResponse?.metadata?.toolCalls || [];
      const grepCall = toolCalls.find(t => t.name === 'Grep');
      return grepCall?.output?.includes('expected match');
```

For skill evals specifically, prefer the deterministic [`skill-used`](/docs/configuration/expected-outputs/deterministic/#skill-used) assertion over raw JavaScript when possible. Promptfoo derives `metadata.skillCalls` from these `Skill` tool calls automatically.

## Caching Behavior

This provider automatically caches responses, and will read from the cache if the prompt, configuration, and files in the working directory (if `working_dir` is set) are the same as a previous run.

When MCP servers are configured, caching is disabled by default because MCP tools typically interact with external state (APIs, file systems, databases), making cached responses unreliable. To opt back into caching for deterministic MCP tools (e.g., code search, static knowledge bases), set `cache_mcp: true`:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      cache_mcp: true
      mcp:
        servers:
          - command: npx
            args: ['-y', '@my/deterministic-mcp-server']
            name: my-server
```

To disable caching globally:

```bash
export PROMPTFOO_CACHE_ENABLED=false
```

You can also include `bustCache: true` in the configuration to prevent reading from the cache.

## Managing Side Effects

When using Claude Agent SDK with configurations that allow side effects, like writing to files, running system commands, or calling MCP servers, you'll need to consider:

- How to reset after each test run
- How to ensure tests don't interfere with each other (like writing to the same files concurrently)

This increases complexity, so first consider if you can achieve your goal with a read-only configuration. If you do need to test with side effects, here are some strategies that can help:

- **Serial execution**: Set `evaluateOptions.maxConcurrency: 1` in your config or use `--max-concurrency 1` CLI flag
- **Hooks**: Use promptfoo [extension hooks](/docs/configuration/reference/#extension-hooks) to reset the environment after each test run
- **Wrapper scripts**: Handle setup/cleanup outside of promptfoo
- **Use git**: If you're using a custom working directory, you can use git to reset the files after each test run
- **Use a container**: Run tests that might run commands in a container to protect the host system

## Examples

Here are a few complete example implementations:

- [Basic usage](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-agent-sdk#basic-usage) - Basic usage with no tools
- [Working directory](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-agent-sdk#working-directory) - Read-only access to a working directory
- [Advanced editing](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-agent-sdk#advanced-editing) - File edits and working directory reset in an extension hook
- [MCP integration](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-agent-sdk#mcp-integration) - Read-only MCP server integration with weather API
- [Structured output](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-agent-sdk#structured-output) - JSON schema validation for agent responses
- [Advanced options](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-agent-sdk#advanced-options) - Sandbox, runtime configuration, and CLI arguments
- [AskUserQuestion handling](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-agent-sdk#askuserquestion-handling) - Automated handling of user questions in evaluations
- [Skills testing](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-agent-sdk#skills-testing) - Testing Agent Skills with the SDK
- [Plugins](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-agent-sdk#plugins) - Loading plugins to extend agent capabilities

## See Also

- [Claude Agent SDK documentation](https://docs.claude.com/en/api/agent-sdk)
- [Agent Skills in the SDK](https://platform.claude.com/docs/en/agent-sdk/skills) - Testing and using skills with the SDK
- [Claude Code skills documentation](https://code.claude.com/docs/en/skills) - Creating custom skills
- [Claude Code plugins](https://code.claude.com/docs/en/plugins) - Creating and using plugins
- [Standard Anthropic provider](/docs/providers/anthropic/) - For text-only interactions
