---
sidebar_label: Snowflake Cortex
description: "Connect to AI models through Snowflake Cortex's OpenAI-compatible REST API with access to Claude, GPT, Mistral, and Llama models"
---

# Snowflake Cortex

[Snowflake Cortex](https://docs.snowflake.com/en/user-guide/snowflake-cortex/overview) is Snowflake's AI and ML platform that provides access to various LLM models through an [OpenAI-compatible](/docs/providers/openai/) REST API. Cortex offers industry-leading LLMs including Claude, GPT, Mistral, and Llama models without requiring a dedicated warehouse.

## Setup

1. Obtain your Snowflake account identifier (format: `orgname-accountname`)
2. Generate a bearer token (JWT, OAuth, or programmatic access token)
3. Ensure you have the `SNOWFLAKE.CORTEX_USER` database role

## Provider Format

The Snowflake Cortex provider uses this format:

- `snowflake:<model_name>` - Connects to Snowflake Cortex using the specified model name

## Configuration

### Basic Configuration

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: snowflake:mistral-large2
    config:
      accountIdentifier: 'myorg-myaccount'
      apiKey: 'your-bearer-token'
```

### With Environment Variables

Set your Snowflake credentials as environment variables:

```bash
export SNOWFLAKE_ACCOUNT_IDENTIFIER="myorg-myaccount"
export SNOWFLAKE_API_KEY="your-bearer-token"
```

Then use the provider without specifying credentials:

```yaml
providers:
  - id: snowflake:mistral-large2
```

### With Additional Parameters

Snowflake Cortex supports OpenAI-compatible parameters:

```yaml
providers:
  - id: snowflake:mistral-large2
    config:
      accountIdentifier: 'myorg-myaccount'
      apiKey: 'your-bearer-token'
      temperature: 0.7
      max_tokens: 1024
      top_p: 0.9
```

### Custom Base URL

Override the default base URL if needed:

```yaml
providers:
  - id: snowflake:claude-3-5-sonnet
    config:
      apiBaseUrl: 'https://custom.snowflakecomputing.com'
      apiKey: 'your-bearer-token'
```

## Features

Snowflake Cortex supports:

- **Tool Calling** - Function calling and tool use
- **Structured Output** - JSON schema validation
- **Streaming** - Real-time token streaming (via API)
- **Image Input** - Vision capabilities for select models
- **Content Filtering** - Built-in guardrails
- **Cross-Region Inference** - Models available across Snowflake regions

## Authentication

Authentication is handled via Bearer tokens in the Authorization header. Snowflake Cortex supports multiple token types:

- **JWT (JSON Web Token)** - Standard Snowflake authentication
- **OAuth tokens** - OAuth 2.0 authentication flow
- **Programmatic access tokens** - Service account tokens

## Example Configuration

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Compare Snowflake Cortex models'

prompts:
  - 'Explain {{topic}} in simple terms'

providers:
  - id: snowflake:claude-3-5-sonnet
    config:
      temperature: 0.7
      max_tokens: 1024
  - id: snowflake:mistral-large2
    config:
      temperature: 0.7
      max_tokens: 1024
  - id: snowflake:llama-3.1-70b
    config:
      temperature: 0.7
      max_tokens: 1024

tests:
  - vars:
      topic: quantum computing
    assert:
      - type: contains
        value: quantum
```

## See Also

- [OpenAI Provider](/docs/providers/openai) - Compatible API format used by Snowflake Cortex
- [Configuration Reference](/docs/configuration/reference.md) - Full configuration options for providers
- [Snowflake Cortex Documentation](https://docs.snowflake.com/en/user-guide/snowflake-cortex/overview) - Official Cortex documentation
- [Snowflake Cortex REST API](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-rest-api) - REST API reference
