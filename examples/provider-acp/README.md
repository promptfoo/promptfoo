# provider-acp (ACP Provider Examples)

These examples demonstrate how to use the ACP (Agent Client Protocol) provider to evaluate any ACP-compatible coding agent.

## Prerequisites

1. Install the ACP SDK:

   ```bash
   npm install @agentclientprotocol/sdk
   ```

2. Have an ACP-compatible agent binary installed:
   - [Kiro](https://kiro.dev) - `command: ["kiro-cli", "acp"]`
   - [Claude Code](https://github.com/harukitosa/claude-code-acp) - `command: ["npx", "claude-code-acp"]`
   - [Codex](https://www.npmjs.com/package/@agentclientprotocol/codex-acp) - `command: codex-acp`
   - [Cursor](https://github.com/blowmage/cursor-agent-acp-npm) - `command: cursor-agent-acp`

## Examples

### Basic Usage

Simple single-turn eval:

```bash
cd basic
npx promptfoo eval
```

### Skills Testing

Verify that an agent discovers and uses skills:

```bash
cd skills
npx promptfoo eval
```

## Provider Configuration

The ACP provider spawns any binary that implements the Agent Client Protocol over stdio:

```yaml
providers:
  - id: acp
    config:
      command: ['kiro-cli', 'acp'] # The binary + args to spawn
      working_dir: ./my-project # Agent's working directory
      timeout: 300 # Per-session timeout (seconds)
      model: claude-sonnet-4-5 # Model (if agent supports it)
      permission_mode: auto_approve # deny (default) or auto_approve
      env: # Custom environment variables
        CUSTOM_VAR: value
```

## Agent Commands

| Agent       | `config.command`             | Notes                                                     |
| ----------- | ---------------------------- | --------------------------------------------------------- |
| Kiro        | `["kiro-cli", "acp"]`        | Built-in ACP support                                      |
| Claude Code | `["npx", "claude-code-acp"]` | Community bridge (Claude CLI does not speak ACP natively) |
| Codex       | `codex-acp`                  | Official ACP adapter                                      |
| Cursor      | `cursor-agent-acp`           | Community ACP adapter                                     |

## Assertions

The ACP provider supports these assertion types:

- **`trajectory:tool-used`**: Check traced tool usage via OTEL spans
- **`javascript`**: Access `context.providerResponse.metadata.toolCalls` for custom checks
- Standard text assertions (`contains`, `regex`, `equals`, etc.)
