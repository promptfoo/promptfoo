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
