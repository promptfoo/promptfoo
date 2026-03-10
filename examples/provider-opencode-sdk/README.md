# provider-opencode-sdk (OpenCode SDK Examples)

The OpenCode SDK provider runs agentic evals through OpenCode, an open-source coding agent with support for hosted and local model providers.

```bash
npx promptfoo@latest init --example provider-opencode-sdk
cd provider-opencode-sdk
```

## Setup

### 1. Install OpenCode CLI

```bash
curl -fsSL https://opencode.ai/install | bash
```

### 2. Install OpenCode SDK

```bash
npm install @opencode-ai/sdk
```

Configure provider credentials in your shell or `.env`. For example:

```bash
export OPENAI_API_KEY=your_api_key_here
```

If promptfoo starts the OpenCode server for you, you can also set `config.apiKey` together with `config.provider_id`. If you use `baseUrl`, the target OpenCode server must already be authenticated.

If you are validating changes inside this repository, use `npm run local -- eval ...` from the repo root. If you initialized an example with `npx promptfoo@latest init --example provider-opencode-sdk`, run `npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache` from the example directory.

The shipped examples use OpenAI for reproducible QA, but the provider itself is not OpenAI-specific. OpenCode can route to Anthropic, Google, Ollama, LM Studio, and other providers configured in OpenCode.

## Examples

### Basic Usage

Chat-only usage in a temporary directory with no filesystem tools.

**Location**: `./basic/`

**Usage**:

```bash
cd basic
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
```

### Working Directory

Read-only filesystem access with `working_dir`, using the default `read`, `grep`, `glob`, and `list` tools.

**Location**: `./working-dir/`

**Usage**:

```bash
cd working-dir
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
```

### Structured Output

Provider-enforced JSON Schema output using the OpenCode `format` request option.

**Location**: `./structured-output/`

**Usage**:

```bash
cd structured-output
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
```

## Provider Configuration

The provider supports these high-value options:

```yaml
providers:
  - id: opencode:sdk
    config:
      provider_id: openai
      model: gpt-4o-mini

      # Optional: pass credentials directly when promptfoo starts the server
      apiKey: '{{env.OPENAI_API_KEY}}'

      # Read-only local repo access
      working_dir: ./examples/provider-opencode-sdk/basic
      workspace: feature-branch

      # Structured output
      format:
        type: json_schema
        schema:
          type: object
          properties:
            answer:
              type: string
          required: [answer]

      # Reuse the same OpenCode session for repeated calls
      persist_sessions: true
```

## Supported Providers

OpenCode can route requests to the provider ecosystem it already supports, including:

- Anthropic
- OpenAI
- Google
- Ollama
- LM Studio
- Other providers configured in OpenCode

## Learn More

- [OpenCode SDK Provider Documentation](/docs/providers/opencode-sdk/)
- [OpenCode Documentation](https://opencode.ai/docs/)
- [OpenCode SDK Reference](https://opencode.ai/docs/sdk/)
- [Claude Agent SDK Provider](/docs/providers/claude-agent-sdk/) - Alternative agentic provider
