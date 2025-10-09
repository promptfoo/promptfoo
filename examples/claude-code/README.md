# claude-agent-sdk (Claude Agent SDK Examples)

The Claude Agent SDK provider enables you to run agentic evals with configurable tools, permissions, and environments.

```bash
npx promptfoo@latest init --example claude-agent-sdk
```

## Setup

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
- **Git workspace with cleanup**: The working directory (`./workspace`) is a git repository that gets reset after each test using an `afterEach` extension hook defined in `hooks.js`
- **Serial execution**: `maxConcurrency: 1` to prevent race conditions during concurrent tests

**Location**: `./advanced/`

**Setup**:

In order for the `afterEach` cleanup hook to work, you'll need to initialize a git repository in the `workspace` directory.

```bash
cd advanced/workspace
git init
git add .
git commit -m "Initial commit"
cd ../..
```

**Usage**:

```bash
(cd advanced && promptfoo eval)
```

**Cleanup**:

If you're running this example inside the promptfoo repo itself, rather than as a standalone example, remove the `.git` directory in the `advanced/workspace` directory after running the example to prevent adding it to the main repo.

```bash
rm -rf advanced/workspace/.git
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
