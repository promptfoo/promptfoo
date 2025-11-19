---
sidebar_label: TrueFoundry
description: Configure TrueFoundry's LLM Gateway to access 1000+ LLMs with enterprise-grade security, observability, and governance through a unified API
---

# TrueFoundry

[TrueFoundry](https://www.truefoundry.com/ai-gateway) is an LLM gateway that provides unified access to 1000+ LLMs through a single API with enterprise-grade security, observability, and governance. TrueFoundry's gateway is OpenAI-compatible and integrates seamlessly with promptfoo for testing and evaluation.

The TrueFoundry provider supports:

- Chat completions from multiple LLM providers (OpenAI, Anthropic, Google Gemini, Groq, Mistral, and more)
- Embeddings
- Tool use and function calling
- MCP (Model Context Protocol) servers for enhanced capabilities
- Custom metadata and logging configuration
- Real-time observability and monitoring

## Setup

To use TrueFoundry, you need to set up your API key:

1. Create a TrueFoundry account and obtain an API key from the [TrueFoundry Console](https://www.truefoundry.com/).
2. Set the `TRUEFOUNDRY_API_KEY` environment variable:

```sh
export TRUEFOUNDRY_API_KEY=your_api_key_here
```

Alternatively, you can specify the `apiKey` in the provider configuration (see below).

## Configuration

Configure the TrueFoundry provider in your promptfoo configuration file. The model name should follow the format `provider-account/model-name` (e.g., `openai-main/gpt-5`):

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: truefoundry:openai-main/gpt-5
    config:
      temperature: 0.7
      max_completion_tokens: 100
prompts:
  - Write a funny tweet about {{topic}}
tests:
  - vars:
      topic: cats
  - vars:
      topic: dogs
```

**Note**: The model identifier format is `provider-account/model-name`. The `provider-account` is the name of your provider integration in TrueFoundry (e.g., `openai-main`, `anthropic-main`). You can find available models in the TrueFoundry LLM Playground UI.

### Basic Configuration Options

The TrueFoundry provider supports all standard OpenAI configuration options:

- `temperature`: Controls randomness in output between 0 and 2
- `max_tokens`: Maximum number of tokens to generate
- `max_completion_tokens`: Maximum number of tokens that can be generated in the chat completion
- `top_p`: Alternative to temperature sampling using nucleus sampling
- `presence_penalty`: Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far
- `frequency_penalty`: Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency in the text so far
- `stop`: Up to 4 sequences where the API will stop generating further tokens
- `response_format`: Object specifying the format that the model must output (e.g., JSON mode)
- `seed`: For deterministic sampling (best effort)

### Custom API Base URL

For self-hosted or enterprise deployments, you can specify a custom API base URL:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: truefoundry:openai-main/gpt-5
    config:
      apiBaseUrl: 'https://your-custom-gateway.example.com'
      temperature: 0.7
```

If not specified, the default URL `https://llm-gateway.truefoundry.com` is used.

### TrueFoundry-Specific Configuration

TrueFoundry provides additional configuration options for metadata tracking and logging:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: truefoundry:openai-main/gpt-5
    config:
      temperature: 0.7
      metadata:
        user_id: 'test-user'
        environment: 'production'
        custom_key: 'custom_value'
      loggingConfig:
        enabled: true
```

Configuration options:

- `metadata`: Custom metadata to track with each request (object with key-value pairs)
- `loggingConfig`: Logging configuration for observability (must include `enabled: true`)

## Model Support

TrueFoundry supports models from multiple providers. Use the format `provider-account/model-name`:

### OpenAI Models

```yaml
providers:
  - truefoundry:openai-main/gpt-5
  - truefoundry:openai-main/gpt-4o
  - truefoundry:openai-main/gpt-4o-mini
  - truefoundry:openai-main/o1
  - truefoundry:openai-main/o1-mini
```

### Anthropic Models

```yaml
providers:
  - truefoundry:anthropic-main/claude-sonnet-4.5
  - truefoundry:anthropic-main/claude-3-5-sonnet-20241022
  - truefoundry:anthropic-main/claude-3-opus-20240229
```

### Google Gemini Models

```yaml
providers:
  - truefoundry:vertex-ai-main/gemini-2.5-pro
  - truefoundry:vertex-ai-main/gemini-2.5-flash
  - truefoundry:vertex-ai-main/gemini-1.5-pro
```

### Other Providers

```yaml
providers:
  - truefoundry:groq-main/llama-3.3-70b-versatile
  - truefoundry:mistral-main/mistral-large-latest
  - truefoundry:cohere-main/embed-english-v3.0 # Embeddings
```

## Embeddings

TrueFoundry supports embedding models through the same unified API:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: truefoundry:openai-main/text-embedding-3-large
    config:
      metadata:
        user_id: 'embedding-test'
      loggingConfig:
        enabled: true
tests:
  - vars:
      query: 'What is machine learning?'
    assert:
      - type: is-valid-openai-embedding
```

### Cohere Embeddings

When using Cohere models, you must specify the `input_type` parameter:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: truefoundry:cohere-main/embed-english-v3.0
    config:
      input_type: 'search_query' # Options: search_query, search_document, classification, clustering
      metadata:
        user_id: 'embedding-test'
```

### Multimodal Embeddings (Vertex AI)

TrueFoundry supports multimodal embeddings for images and videos through Vertex AI:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: truefoundry:vertex-ai-main/multimodalembedding@001
    config:
      metadata:
        use_case: 'image-search'
```

## Tool Use and Function Calling

TrueFoundry supports tool use and function calling, compatible with the OpenAI tools format:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: truefoundry:openai-main/gpt-5
    config:
      tools:
        - type: function
          function:
            name: get_weather
            description: 'Get the current weather in a given location'
            parameters:
              type: object
              properties:
                location:
                  type: string
                  description: 'The city and state, e.g. San Francisco, CA'
                unit:
                  type: string
                  enum:
                    - celsius
                    - fahrenheit
              required:
                - location
      tool_choice: auto
prompts:
  - 'What is the weather in {{location}}?'
tests:
  - vars:
      location: 'San Francisco, CA'
```

## MCP Servers (Model Context Protocol)

TrueFoundry supports MCP servers for enhanced tool capabilities. MCP servers provide access to integrated tools like web search, code execution, and more:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: truefoundry:openai-main/gpt-5
    config:
      temperature: 0.7
      mcp_servers:
        - integration_fqn: 'common-tools'
          enable_all_tools: false
          tools:
            - name: 'web_search'
            - name: 'code_executor'
      iteration_limit: 20
      metadata:
        user_id: 'mcp-test'
      loggingConfig:
        enabled: true
prompts:
  - 'Search the web for {{query}} and summarize the findings'
tests:
  - vars:
      query: 'latest AI developments 2025'
```

### MCP Configuration Options

- `mcp_servers`: Array of MCP server configurations
  - `integration_fqn`: Fully qualified name of the integration (e.g., 'common-tools')
  - `enable_all_tools`: Whether to enable all tools in the integration (boolean)
  - `tools`: Array of specific tools to enable (each with a `name` field)
- `iteration_limit`: Maximum number of iterations for tool calling (default: 20)

### Available MCP Integrations

Common integrations include:

- `common-tools`: Provides web_search, code_executor, and other utilities
- Custom integrations can be configured through your TrueFoundry account

## Complete Example

Here's a comprehensive example demonstrating TrueFoundry's capabilities:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: TrueFoundry LLM Gateway evaluation

providers:
  - id: truefoundry:openai-main/gpt-5
    label: 'GPT-5 via TrueFoundry'
    config:
      temperature: 0.7
      max_completion_tokens: 1000
      metadata:
        user_id: 'eval-user'
        environment: 'testing'
      loggingConfig:
        enabled: true
      mcp_servers:
        - integration_fqn: 'common-tools'
          enable_all_tools: false
          tools:
            - name: 'web_search'
      iteration_limit: 10

  - id: truefoundry:anthropic-main/claude-sonnet-4.5
    label: 'Claude Sonnet 4.5 via TrueFoundry'
    config:
      temperature: 0.7
      max_tokens: 1000
      metadata:
        user_id: 'eval-user'
        environment: 'testing'
      loggingConfig:
        enabled: true

prompts:
  - |
    You are a helpful assistant. Answer the following question:
    {{question}}

tests:
  - vars:
      question: 'What is the capital of France?'
    assert:
      - type: contains
        value: 'Paris'

  - vars:
      question: 'Explain quantum computing in simple terms'
    assert:
      - type: llm-rubric
        value: 'Provides a clear, simple explanation of quantum computing'

  - vars:
      question: 'Search for the latest news about AI and summarize'
    assert:
      - type: llm-rubric
        value: 'Successfully searches and summarizes recent AI news'
```

## Observability and Monitoring

TrueFoundry provides built-in observability features. When `loggingConfig.enabled` is set to `true`, all requests are logged and can be monitored through the TrueFoundry dashboard.

Key observability features:

- Request and response logging
- Performance metrics (latency, tokens used)
- Cost tracking
- Error monitoring
- Custom metadata for filtering and analysis

## Best Practices

1. **Use Metadata**: Add meaningful metadata to track requests by user, environment, or feature
2. **Enable Logging**: Set `loggingConfig.enabled: true` for production monitoring
3. **Model Selection**: Choose models based on your use case (speed vs. quality tradeoff)
4. **MCP Servers**: Use MCP servers for enhanced capabilities like web search and code execution
5. **Cost Management**: Monitor token usage through TrueFoundry's dashboard

## Additional Resources

- [TrueFoundry Documentation](https://docs.truefoundry.com/docs/ai-gateway)
- [TrueFoundry Blog](https://www.truefoundry.com/blog)
- [OpenAI Provider Documentation](/docs/providers/openai/) (for additional configuration options)

For more information about TrueFoundry's LLM Gateway, visit [truefoundry.com/ai-gateway](https://www.truefoundry.com/ai-gateway).
