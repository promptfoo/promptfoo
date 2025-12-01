# opencode-sdk (OpenCode SDK Examples)

The OpenCode SDK provider enables you to run agentic evals through OpenCode, an open-source AI coding agent for the terminal with support for 75+ LLM providers.

```bash
npx promptfoo@latest init --example opencode-sdk
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

Configure your provider credentials. For example, for Anthropic:

```bash
export ANTHROPIC_API_KEY=your_api_key_here
```

Or for OpenAI:

```bash
export OPENAI_API_KEY=your_api_key_here
```

OpenCode supports 75+ providers including Anthropic, OpenAI, Google, Groq, Together AI, Ollama (local), and more.

## Examples

### Basic Usage

This example shows OpenCode SDK in its simplest form - running in a temporary directory with no file system access or tools enabled, behaving similarly to a standard LLM provider.

**Location**: `./basic/`

**Usage**:

```bash
(cd basic && promptfoo eval)
```

## Provider Configuration

The OpenCode SDK provider supports these key configuration options:

```yaml
providers:
  - id: opencode:sdk
    config:
      # LLM provider (anthropic, openai, google, ollama, etc.)
      provider_id: anthropic
      model: claude-sonnet-4-20250514

      # Working directory (enables file tools)
      working_dir: ./src

      # Tool configuration
      tools:
        read: true
        grep: true
        glob: true
        list: true
        write: false # Disable file writing
        bash: false # Disable shell commands

      # Session management
      persist_sessions: true
```

## Supported Providers

OpenCode supports 75+ LLM providers including:

- **Anthropic** - Claude models
- **OpenAI** - GPT models
- **Google** - Gemini models
- **Groq** - Fast inference
- **Together AI** - Open source models
- **Ollama** - Local models
- **Amazon Bedrock** - AWS-hosted models
- **Google Vertex AI** - GCP-hosted models
- And many more via [Models.dev](https://models.dev)

## Learn More

- [OpenCode SDK Provider Documentation](/docs/providers/opencode-sdk/)
- [OpenCode Documentation](https://opencode.ai/docs/)
- [Claude Agent SDK Provider](/docs/providers/claude-agent-sdk/) - Alternative agentic provider
