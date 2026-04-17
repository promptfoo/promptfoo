# truefoundry (TrueFoundry Examples)

This directory contains example configurations for using [TrueFoundry's LLM Gateway](https://www.truefoundry.com/ai-gateway) with promptfoo.

## Prerequisites

1. **TrueFoundry API Key**: Obtain your API key from the [TrueFoundry Console](https://www.truefoundry.com/)

2. **Set Environment Variable**:

   ```bash
   export TRUEFOUNDRY_API_KEY=your_api_key_here
   ```

## Quick Start

To quickly set up this example:

```bash
npx promptfoo@latest init --example truefoundry
```

## Examples

### 1. Basic Configuration (`promptfooconfig.yaml`)

A simple example demonstrating basic TrueFoundry usage with multiple models:

- GPT-4 via OpenAI
- Claude 3.5 Sonnet via Anthropic
- Custom metadata and logging configuration

**Run the example:**

```bash
npx promptfoo eval -c promptfooconfig.yaml
```

**View results:**

```bash
npx promptfoo view
```

### 2. MCP Servers (`promptfooconfig-mcp.yaml`)

An advanced example showcasing TrueFoundry's MCP (Model Context Protocol) server integration:

- Web search capabilities
- Code execution tools
- Multi-step reasoning with tool use
- Custom iteration limits

**Run the example:**

```bash
npx promptfoo eval -c promptfooconfig-mcp.yaml
```

## Configuration Options

### Basic Options

```yaml
providers:
  - id: truefoundry:openai-main/gpt-5
    config:
      temperature: 0.7
      max_completion_tokens: 500
```

**Note**: The model identifier format is `provider-account/model-name`. The `provider-account` is the name of your provider integration in TrueFoundry (e.g., `openai-main`, `anthropic-main`).

### Metadata and Logging

```yaml
config:
  metadata:
    user_id: 'your-user-id'
    environment: 'development'
    custom_key: 'custom_value'
  loggingConfig:
    enabled: true
```

### MCP Servers

```yaml
config:
  mcp_servers:
    - integration_fqn: 'common-tools'
      enable_all_tools: false
      tools:
        - name: 'web_search'
        - name: 'code_executor'
  iteration_limit: 20
```

## Supported Models

TrueFoundry provides access to models from multiple providers. Use the format `provider-account/model-name`:

### OpenAI

```yaml
- truefoundry:openai-main/gpt-5
- truefoundry:openai-main/gpt-4o
- truefoundry:openai-main/gpt-4o-mini
- truefoundry:openai-main/o1
- truefoundry:openai-main/o1-mini
```

### Anthropic

```yaml
- truefoundry:anthropic-main/claude-sonnet-4.5
- truefoundry:anthropic-main/claude-3-5-sonnet-20241022
- truefoundry:anthropic-main/claude-3-opus-20240229
```

### Google Gemini

```yaml
- truefoundry:vertex-ai-main/gemini-2.5-pro
- truefoundry:vertex-ai-main/gemini-2.5-flash
- truefoundry:vertex-ai-main/gemini-1.5-pro
```

### Other Providers

```yaml
- truefoundry:groq-main/llama-3.3-70b-versatile
- truefoundry:mistral-main/mistral-large-latest
```

## Embeddings

TrueFoundry also supports embedding models:

```yaml
providers:
  - id: truefoundry:openai-main/text-embedding-3-large
    config:
      metadata:
        user_id: 'embedding-user'
      loggingConfig:
        enabled: true
```

### Cohere Embeddings

When using Cohere models, specify the `input_type`:

```yaml
providers:
  - id: truefoundry:cohere-main/embed-english-v3.0
    config:
      input_type: 'search_query' # Options: search_query, search_document, classification, clustering
```

## Observability

When `loggingConfig.enabled` is set to `true`, all requests are logged in the TrueFoundry dashboard where you can:

- Monitor request/response logs
- Track performance metrics
- Analyze costs
- Debug issues
- Filter by custom metadata

## Resources

- [TrueFoundry Documentation](https://docs.truefoundry.com/docs/ai-gateway)
- [TrueFoundry Provider Documentation](/docs/providers/truefoundry/)
- [Promptfoo Documentation](https://www.promptfoo.dev/docs/)

## Support

For TrueFoundry-specific questions:

- Visit [docs.truefoundry.com](https://docs.truefoundry.com/)
- Contact TrueFoundry support

For promptfoo-related questions:

- Visit [promptfoo.dev](https://www.promptfoo.dev/)
- Join the [Discord community](https://discord.gg/promptfoo)
