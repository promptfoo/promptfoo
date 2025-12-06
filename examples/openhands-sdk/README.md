# openhands-sdk (OpenHands SDK Examples)

The OpenHands SDK provider enables you to run agentic evals through OpenHands, an open-source AI coding agent with 72.8% SWE-Bench Verified performance and Docker-based sandboxing.

```bash
npx promptfoo@latest init --example openhands-sdk
```

## Setup

### 1. Install OpenHands

```bash
pip install openhands-ai
```

### 2. Set up Docker

OpenHands uses Docker for sandboxed execution:

```bash
docker --version
```

### 3. Configure API Keys

Configure your provider credentials. For Anthropic:

```bash
export ANTHROPIC_API_KEY=your_api_key_here
```

Or for OpenAI:

```bash
export OPENAI_API_KEY=your_api_key_here
```

OpenHands supports 100+ providers through LiteLLM.

## Examples

### Basic Usage

This example shows OpenHands SDK in its simplest form - running in a temporary directory with basic code generation.

**Location**: `./basic/`

**Usage**:

```bash
(cd basic && promptfoo eval)
```

## Provider Configuration

The OpenHands SDK provider supports these key configuration options:

```yaml
providers:
  - id: openhands:sdk
    config:
      # LLM provider (anthropic, openai, google, ollama, etc.)
      provider_id: anthropic
      model: claude-sonnet-4-20250514

      # Working directory (enables file operations)
      working_dir: ./src

      # Execution environment
      workspace_type: docker # or 'local', 'remote'

      # Agent configuration
      max_iterations: 50

      # Session management
      persist_sessions: true
```

## Supported Providers

OpenHands supports 100+ LLM providers through LiteLLM:

- **Anthropic** - Claude models
- **OpenAI** - GPT models
- **Google** - Gemini models
- **Amazon Bedrock** - AWS-hosted models
- **Azure OpenAI** - Azure-hosted models
- **Ollama** - Local models
- **Together AI** - Open source models
- And many more via [LiteLLM](https://litellm.ai/)

## Learn More

- [OpenHands SDK Provider Documentation](/docs/providers/openhands-sdk/)
- [OpenHands Documentation](https://docs.all-hands.dev/)
- [OpenCode SDK Provider](/docs/providers/opencode-sdk/) - Alternative multi-provider agent
- [Claude Agent SDK Provider](/docs/providers/claude-agent-sdk/) - Anthropic's agentic framework
