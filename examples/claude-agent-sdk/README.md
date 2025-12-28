# claude-agent-sdk (Claude Agent SDK Examples)

The Claude Agent SDK provider (aka Claude Code provider) enables you to run agentic evals with configurable tools, permissions, and environments.

```bash
npx promptfoo@latest init --example claude-agent-sdk
```

## Setup

Install the Claude Agent SDK:

```bash
npm install @anthropic-ai/claude-agent-sdk
```

Export your Anthropic API key as `ANTHROPIC_API_KEY`:

```bash
export ANTHROPIC_API_KEY=your_api_key_here
```

## Examples

### Basic Usage

This example shows Claude Agent SDK in its simplest form - running in a temporary directory with no file system access or tools enabled, behaving similarly to the standard Anthropic provider.

**Location**: `./basic/`

**Usage**:

```bash
(cd basic && promptfoo eval)
```

### Working Directory

This example provides Claude Agent SDK with read-only access to a sample project containing Python, TypeScript, and JavaScript files with intentional bugs for analysis. Because the `working_dir` is set, Claude Agent SDK has access to the following read-only tools:

- `Read` - Read file contents
- `Grep` - Search file contents
- `Glob` - Find files by pattern
- `LS` - List directory contents

**Location**: `./working-dir/`

**Usage**:

```bash
(cd working-dir && promptfoo eval)
```

### Advanced Editing

This example shows Claude Agent SDK's ability to modify files with:

- **File editing tools**: `Write`, `Edit`, and `MultiEdit` tools are added to the default set of read-only tools by setting `append_allowed_tools`
- **Permission mode**: `permission_mode` is set to `acceptEdits` for automatic approval of file edits
- **Automatic git workspace management**: The working directory (`./workspace`) uses `beforeAll`, `afterEach`, and `afterAll` extension hooks defined in `hooks.js` to:
  - Initialize a git repository before all tests
  - Capture timestamped diffs after each test in a markdown report
  - Reset changes after each test
  - Clean up the `.git` directory after all tests
- **Serial execution**: `maxConcurrency: 1` to prevent race conditions during concurrent tests

**Location**: `./advanced/`

**Usage**:

```bash
(cd advanced && promptfoo eval)
```

### MCP Integration

This example shows Claude Agent SDK integration with:

- **MCP weather server**: Uses `@h1deya/mcp-server-weather` for weather data
- **Tool permissions**: Specific MCP tools (`mcp__weather__get-forecast`, `mcp__weather__get-alerts`)
- **External API access**: Fetches live weather data for San Francisco

**Location**: `./mcp/`

**Usage**:

```bash
(cd mcp && promptfoo eval)
```

### Structured Output

This example demonstrates Claude Agent SDK's structured output feature, which returns validated JSON that conforms to a schema. It includes:

- **JSON schema validation**: Define expected output structure with types, enums, and required fields
- **Code analysis task**: Agent analyzes a Python function for bugs
- **Assertion testing**: Validates that output matches expected schema and contains correct analysis

**Location**: `./structured-output/`

**Usage**:

```bash
(cd structured-output && promptfoo eval)
```

### Advanced Options

This example demonstrates advanced Claude Agent SDK configuration options including sandbox settings, runtime configuration, permission bypass, and CLI arguments.

**Location**: `./advanced-options/`

**Usage**:

```bash
(cd advanced-options && promptfoo eval)
```

**Features demonstrated**:

- **Sandbox configuration**: Run commands in isolated environments with network restrictions
- **Runtime configuration**: Specify JavaScript runtime (node, bun, deno)
- **Extra CLI arguments**: Pass additional flags to Claude Code
- **Setting sources**: Control where SDK loads settings from
- **Permission bypass**: Safely bypass permissions for automated testing

### AskUserQuestion Handling

This example demonstrates handling the `AskUserQuestion` tool in automated evaluations. When Claude needs to ask the user a question, this shows how to provide automated answers.

**Location**: `./ask-user-question/`

**Usage**:

```bash
(cd ask-user-question && promptfoo eval)
```

**Features demonstrated**:

- **Convenience option**: Use `ask_user_question.behavior` for simple automated responses
- **First option selection**: Automatically select the first available option
- **Tool enablement**: Enable `AskUserQuestion` via `append_allowed_tools`

### Cyber Espionage Red Team

This example demonstrates testing AI agents against cyber espionage attack patterns based on Anthropic's ["Disrupting AI Espionage"](https://www.anthropic.com/news/disrupting-AI-espionage) blog post. It includes:

- **Simulated target system**: Workspace with configuration files, credentials, logs, and sensitive data
- **Comprehensive red team plugins**: `harmful:cybercrime`, `harmful:cybercrime:malicious-code`, `ssrf`, `pii`, `excessive-agency`, and more
- **Advanced jailbreak strategies**: `jailbreak:meta`, `jailbreak:hydra`, `crescendo`, `goat` for sophisticated attacks
- **Reconnaissance testing**: File system access tools (`Read`, `Grep`, `Glob`, `Bash`) to test security boundaries
- **Authorized testing context**: Demonstrates responsible security testing practices

**Location**: `./cyber-espionage/`

**Usage**:

```bash
(cd cyber-espionage && promptfoo eval)
```

> ⚠️ This example is for authorized security testing only. It demonstrates how to identify vulnerabilities in AI agents before malicious actors can exploit them.
