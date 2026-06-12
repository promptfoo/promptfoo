# provider-pi (Pi Coding Agent Examples)

The Pi provider runs agentic evals through [Pi](https://pi.dev/), a minimal terminal coding agent with support for Anthropic, OpenAI, Google, Groq, OpenRouter, and other model providers.

```bash
npx promptfoo@latest init --example provider-pi
cd provider-pi
```

## Setup

### 1. Install the pi CLI

```bash
npm install -g @earendil-works/pi-coding-agent
```

Or with the install script:

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

Pi requires Node.js 22.19 or newer.

### 2. Configure credentials

Pi reads standard provider environment variables. For example:

```bash
export OPENAI_API_KEY=your_api_key_here
```

Anthropic (`ANTHROPIC_API_KEY`), Google (`GEMINI_API_KEY`), Groq (`GROQ_API_KEY`), OpenRouter (`OPENROUTER_API_KEY`), and other providers work the same way. Subscription auth configured with `pi /login` also works.

If you are validating changes inside the promptfoo repository, use `npm run local -- eval ...` from the repo root. If you initialized this example with `npx promptfoo@latest init --example provider-pi`, run `npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache` from the example directory.

## Examples

### Basic Usage

Chat-only usage in a temporary directory with no tools.

**Location**: `./basic/`

**Usage**:

```bash
cd basic
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
```

### Working Directory

Read-only filesystem access with `working_dir`, using the default `read`, `grep`, `find`, and `ls` tools.

**Location**: `./working-dir/`

**Usage**:

```bash
cd working-dir
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
```

### Model Comparison

The same agent harness compared across models from different providers. Requires `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GEMINI_API_KEY`.

**Location**: `./model-comparison/`

**Usage**:

```bash
cd model-comparison
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
```

## Provider Configuration

The provider supports these high-value options:

```yaml
providers:
  - id: pi:anthropic/claude-sonnet-4-5
    config:
      # Thinking level: off, minimal, low, medium, high, xhigh
      thinking: medium

      # Read-only local repo access
      working_dir: ./basic

      # Opt into side effects (pi has no sandbox - use a scratch directory)
      # tools: [read, bash, edit, write, grep, find, ls]

      # Replace or extend pi's system prompt
      # system_prompt: 'You are a terse code reviewer.'
      # append_system_prompt: 'Answer in one sentence.'

      # Pass credentials directly instead of via environment
      # apiKey: '{{env.ANTHROPIC_API_KEY}}'
```

By default the provider runs `pi --mode json --no-session --offline` with extension, skill, prompt-template, and context-file discovery disabled, so evals are reproducible and nothing is written to your pi session history.

## Learn More

- [Pi Provider Documentation](/docs/providers/pi/)
- [Pi Documentation](https://pi.dev/docs)
- [OpenCode SDK Provider](/docs/providers/opencode-sdk/) - Alternative multi-provider coding agent
- [Claude Agent SDK Provider](/docs/providers/claude-agent-sdk/) - Alternative agentic provider
