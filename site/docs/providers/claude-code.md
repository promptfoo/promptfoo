---
sidebar_position: 3
title: Claude Code
description: 'Use Claude Code for evals with configurable tools, permissions, MCP servers, and more'
---

# Claude Code

This provider makes [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) available for evals through its [TypeScript SDK](https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-typescript).

## Setup

The easiest way to get started is with an Anthropic API key. You can set it with the `ANTHROPIC_API_KEY` environment variable or specify the `apiKey` in the provider configuration.

Create Anthropic API keys [here](https://console.anthropic.com/settings/keys).

Example of setting the environment variable:

```sh
export ANTHROPIC_API_KEY=your_api_key_here
```

## Other Model Providers

Apart from using the Anthropic API, you can also use AWS Bedrock and Google Vertex AI.

For AWS Bedrock:

- Set the `CLAUDE_CODE_USE_BEDROCK` environment variable to `true`:

```sh
export CLAUDE_CODE_USE_BEDROCK=true
```

- Follow the [Claude Code Bedrock documentation](https://docs.anthropic.com/en/docs/claude-code/amazon-bedrock) to make credentials available to Claude Code.

For Google Vertex:

- Set the `CLAUDE_CODE_USE_VERTEX` environment variable to `true`:

```sh
export CLAUDE_CODE_USE_VERTEX=true
```

- Follow the [Claude Code Vertex documentation](https://docs.anthropic.com/en/docs/claude-code/google-vertex-ai) to make credentials available to Claude Code.

## Quick Start

### Basic Usage

By default, Claude Code runs in a temporary directory with no tools enabled, using the `default` permission mode. This makes it behave similarly to the standard [Anthropic provider](/docs/providers/anthropic/). It has no access to the file system (read or write) and can't run system commands.

```yaml title="promptfooconfig.yaml"
providers:
  - claude-code

prompts:
  - 'Output the a python function that prints the first 10 numbers in the Fibonacci sequence'
```

When your test cases finish, the temporary directory is deleted.

### With Working Directory

You can specify a specific working directory for Claude Code to run in:

```yaml
providers:
  - id: claude-code
    config:
      working_dir: ./src

prompts:
  - 'Review the TypeScript files and identify potential bugs'
```

This allows you to prepare a directory with files or sub-directories before running your tests.

By default, when you specify a working directory, Claude Code is given read-only access to the directory.

### With Side Effects

You can also allow Claude Code to write to files, run system commands, call MCP servers, and more.

Here's an example that will allow Claude Code to both read from and write to files in the working directory. It uses `append_allowed_tools` to add tools for writing and editing files to the default set of read-only tools. It also sets `permission_mode` to `acceptEdits` so Claude Code can modify files without asking for confirmation.

```yaml
providers:
  - id: claude-code
    config:
      working_dir: ./my-project
      append_allowed_tools: ['Write', 'Edit', 'MultiEdit']
      permission_mode: 'acceptEdits'

prompts:
  - 'Refactor the authentication module to use async/await'
```

> **Note:** when using `acceptEdits` and tools that allow side effects like writing to files, you'll need to consider how you will reset the files after each test run. See the [Testing with Side Effects](#testing-with-side-effects) section for more information.

## Supported Parameters

| Parameter              | Type     | Description                                                                    | Default              |
| ---------------------- | -------- | ------------------------------------------------------------------------------ | -------------------- |
| `apiKey`               | string   | Anthropic API key                                                              | Environment variable |
| `working_dir`          | string   | Directory for file operations                                                  | Temporary directory  |
| `model`                | string   | Primary model to use (passed to Claude Code)                                   | Claude Code default  |
| `fallback_model`       | string   | Fallback model if primary fails                                                | Claude Code default  |
| `max_turns`            | number   | Maximum conversation turns                                                     | Claude Code default  |
| `max_thinking_tokens`  | number   | Maximum tokens for thinking                                                    | Claude Code default  |
| `permission_mode`      | string   | File access permissions: `default`, `plan`, `acceptEdits`, `bypassPermissions` | `default`            |
| `custom_system_prompt` | string   | Replace default system prompt                                                  | None                 |
| `append_system_prompt` | string   | Append to default system prompt                                                | None                 |
| `custom_allowed_tools` | string[] | Replace default allowed tools                                                  | None                 |
| `append_allowed_tools` | string[] | Add to default allowed tools                                                   | None                 |
| `allow_all_tools`      | boolean  | Allow all available tools                                                      | false                |
| `disallowed_tools`     | string[] | Tools to explicitly block (overrides allowed)                                  | None                 |
| `mcp`                  | object   | MCP server configuration                                                       | None                 |
| `strict_mcp_config`    | boolean  | Only allow configured MCP servers                                              | true                 |

## Models

Model selection is optional, since Claude Code uses sensible defaults. When specified, models are passed directly to the Claude Code SDK.

```yaml
providers:
  - id: claude-code
    config:
      model: claude-opus-4-1-20250805
      fallback_model: claude-sonnet-4-20250514
```

Claude Code also supports a number of [model aliases](https://docs.anthropic.com/en/docs/claude-code/model-config#model-aliases), which can also be used in the configuration.

```yaml
providers:
  - id: claude-code
    config:
      model: sonnet
      fallback_model: haiku
```

Claude Code also supports configuring models through [environment variables](https://docs.anthropic.com/en/docs/claude-code/model-config#environment-variables). When using this provider, any environment variables you set will be passed through to the Claude Code SDK.

## Tools and Permissions

### Default Tools

If no `working_dir` is specified, Claude Code runs in a temporary directory with no access to tools by default.

By default, when a `working_dir` is specified, Claude Code has access to the following read-only tools:

- `Read` - Read file contents
- `Grep` - Search file contents
- `Glob` - Find files by pattern
- `LS` - List directory contents

### Permission Modes

Control Claude Code's permissions for modifying files and running system commands:

| Mode                | Description              |
| ------------------- | ------------------------ |
| `default`           | Standard permissions     |
| `plan`              | Planning mode            |
| `acceptEdits`       | Allow file modifications |
| `bypassPermissions` | No restrictions          |

### Tool Configuration

Customize available tools for your use case:

```yaml
# Add tools to defaults
providers:
  - id: claude-code
    config:
      append_allowed_tools: ['Write', 'Edit']

# Replace default tools entirely
providers:
  - id: claude-code
    config:
      custom_allowed_tools: ['Read', 'Grep', 'Glob', 'Write', 'Edit', 'MultiEdit', 'Bash', 'WebFetch', 'WebSearch']

# Block specific tools
providers:
  - id: claude-code
    config:
      disallowed_tools: ['Delete', 'Run']

# Allow all tools (use with caution)
providers:
  - id: claude-code
    config:
      allow_all_tools: true
```

⚠️ **Security Note**: Some tools allow Claude Code to modify files, run system commands, search the web, and more. Think carefully about security implications before using these tools.

[Here's a full list of available tools.](https://docs.anthropic.com/en/docs/claude-code/settings#tools-available-to-claude)

## MCP Integration

Unlike the standard Anthropic provider, Claude Code handles MCP (Model Context Protocol) connections directly. Configuration is forwarded to the Claude Code SDK:

```yaml
providers:
  - id: claude-code
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

For detailed MCP configuration, see [Claude Code MCP documentation](https://docs.anthropic.com/en/docs/claude-code/mcp).

## Caching Behavior

This provider automatically caches responses, and will read from the cache if the prompt, configuration, and files in the working directory (if `working_dir` is set) are the same as a previous run.

To disable caching globally:

```bash
export PROMPTFOO_CACHE_ENABLED=false
```

You can also include `bustCache: true` in the configuration to prevent reading from the cache.

## Managing Side Effects

When using Claude Code with configurations that allow side effects, like writing to files, running system commands, or calling MCP servers, you'll need to consider:

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

- [Simple usage](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-code-simple) - Basic usage with no tools
- [File operations](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-code-files) - Read-only access to a working directory
- [Advanced editing](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-code-advanced) - File edits and working directory reset in an extension hook
- [MCP integration](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-code-mcp) - Read-only MCP server integration with weather API

## See Also

- [Claude Code TypeScript SDK documentation](https://docs.anthropic.com/en/docs/claude-code)
- [Standard Anthropic provider](/docs/providers/anthropic/) - For text-only interactions
