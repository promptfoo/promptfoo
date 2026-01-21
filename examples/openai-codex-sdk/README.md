# openai-codex-sdk (OpenAI Codex SDK Examples)

The OpenAI Codex SDK provider enables agentic code analysis and generation evals with thread-based conversations and Git-aware operations.

You can run this example with:

```bash
npx promptfoo@latest init --example openai-codex-sdk
```

## Setup

Install the OpenAI Codex SDK:

```bash
npm install @openai/codex-sdk
```

**Requirements**: Node.js 20+

Set your OpenAI API key:

```bash
export OPENAI_API_KEY=your_api_key_here
```

## Examples

### Basic Usage

Simple code generation without file system access.

**Location**: `./basic/`

**Usage**:

```bash
(cd basic && promptfoo eval)
```

## Key Features

- **Thread Persistence**: Conversations saved to `~/.codex/sessions`
- **Git Integration**: Automatic repository detection (can be disabled)
- **Structured Output**: Native JSON schema support with Zod
- **Streaming Events**: Real-time progress updates
- **Custom Binary**: Override Codex binary path with `codex_path_override`

## Configuration Options

See [documentation](https://www.promptfoo.dev/docs/providers/openai-codex-sdk/) for full details.
