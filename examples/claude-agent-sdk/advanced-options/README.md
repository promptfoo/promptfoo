# advanced-options (Claude Agent SDK Advanced Options)

This example demonstrates advanced Claude Agent SDK configuration options including sandbox settings, runtime configuration, and CLI arguments.

```bash
npx promptfoo@latest init --example claude-agent-sdk
```

## Setup

Install the Claude Agent SDK:

```bash
npm install @anthropic-ai/claude-agent-sdk
```

Export your Anthropic API key:

```bash
export ANTHROPIC_API_KEY=your_api_key_here
```

## Usage

```bash
cd advanced-options && promptfoo eval
```

## Features Demonstrated

### Sandbox Configuration

Run commands in a sandboxed environment for additional security:

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

### Runtime Configuration

Specify the JavaScript runtime:

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

### Setting Sources

Control where the SDK looks for settings:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      setting_sources:
        - user # ~/.claude/settings.json
        - project # .claude/settings.json
        - local # .claude/settings.local.json
```

### Permission Bypass (Use with Caution)

For automated testing scenarios that require bypassing permissions:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      permission_mode: bypassPermissions
      allow_dangerously_skip_permissions: true # Required safety flag
```

### Permission Prompt Tool

Route permission prompts through an MCP tool:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      permission_prompt_tool_name: my-mcp-permission-tool
```

### Custom Executable Path

Use a specific Claude Code installation:

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      path_to_claude_code_executable: /custom/path/to/claude-code
```

## All New Configuration Options

| Option                               | Type                         | Description                                      |
| ------------------------------------ | ---------------------------- | ------------------------------------------------ |
| `sandbox`                            | object                       | Sandbox settings for command execution isolation |
| `sandbox.enabled`                    | boolean                      | Enable sandboxed execution                       |
| `sandbox.autoAllowBashIfSandboxed`   | boolean                      | Auto-allow bash when sandboxed                   |
| `sandbox.network`                    | object                       | Network configuration for sandbox                |
| `sandbox.network.allowedDomains`     | string[]                     | Domains allowed for network access               |
| `sandbox.network.allowLocalBinding`  | boolean                      | Allow binding to localhost                       |
| `allow_dangerously_skip_permissions` | boolean                      | Required for `bypassPermissions` mode            |
| `permission_prompt_tool_name`        | string                       | MCP tool for permission prompts                  |
| `executable`                         | 'node' \| 'bun' \| 'deno'    | JavaScript runtime to use                        |
| `executable_args`                    | string[]                     | Arguments for the runtime                        |
| `extra_args`                         | Record<string, string\|null> | Additional CLI arguments                         |
| `path_to_claude_code_executable`     | string                       | Path to Claude Code executable                   |
