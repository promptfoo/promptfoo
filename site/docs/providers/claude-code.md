---
sidebar_position: 3
---

# Claude Code

Claude Code provides Anthropic's Claude with code execution and file system capabilities through the Claude Code SDK.

## Setup

Set the `ANTHROPIC_API_KEY` environment variable:
```bash
export ANTHROPIC_API_KEY=your_api_key_here
```

## Usage

Basic usage (read-only, safe):
```yaml
providers:
  - claude-code
```

With file reading:
```yaml
providers:
  - id: claude-code
    config:
      working_dir: ./my-project
```

With file editing (use with caution):
```yaml
providers:
  - id: claude-code
    config:
      working_dir: ./my-project
      permission_mode: 'acceptEdits'
```

## Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `permission_mode` | Controls file permissions: `plan`, `acceptEdits`, `bypassPermissions` | `plan` |
| `working_dir` | Directory for file operations | None (temp dir) |
| `custom_allowed_tools` | Override default allowed tools | Read-only tools |

## Features

- **Safe by default**: Read-only tools enabled by default
- **Automatic caching**: Responses cached when using read-only configurations
- **File system access**: Can read and optionally modify files
- **MCP support**: Integrate with Model Context Protocol servers

## Examples

- [Simple usage](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-code-simple) - Basic code analysis
- [File reading](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-code-files) - Analyzing project files
- [Advanced editing](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-code-advanced) - Modifying files with permission controls