---
sidebar_label: Snowflake Cortex
description: 'Configure Snowflake Cortex text generation through its REST API with native model IDs, bearer-token authentication, and account-specific model availability.'
---

# Snowflake Cortex

[Snowflake Cortex](https://docs.snowflake.com/en/user-guide/snowflake-cortex/overview) provides access to language models without requiring a dedicated warehouse. The `snowflake:` provider sends chat requests to `/api/v2/cortex/inference:complete`. This differs from Snowflake's newer OpenAI-compatible `/api/v2/cortex/v1/chat/completions` endpoint.

## Setup

1. Obtain your Snowflake account identifier (format: `orgname-accountname`)
2. Generate a bearer token (JWT, OAuth, or programmatic access token)
3. Ensure you have the `SNOWFLAKE.CORTEX_USER` database role
4. Check [model availability in your region](https://docs.snowflake.com/en/user-guide/snowflake-cortex/aisql-regional-availability) and your account's model access settings

## Provider Format

The Snowflake Cortex provider uses this format:

- `snowflake:<model_name>` - Connects to Snowflake Cortex using the specified model name

Use the exact Snowflake model ID. The examples below use `claude-sonnet-4-6`, which Snowflake documents for the [existing REST endpoint](https://docs.snowflake.com/en/user-guide/snowflake-cortex/complete-structured-outputs#rest-api-example). Availability still depends on your account and region.

For new configurations, avoid legacy models such as `mistral-large2` and `llama3.1-70b`: Snowflake restricts them to accounts with prior usage under its [August 2026 model lifecycle policy](https://docs.snowflake.com/en/release-notes/bcr-bundles/un-bundled/bcr-august-model-deprecations). Existing account-specific model selections must be checked against that policy before changing them.

## Configuration

### Basic Configuration

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: snowflake:claude-sonnet-4-6
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
  - id: snowflake:claude-sonnet-4-6
```

### With Additional Parameters

For text chat, configure generation parameters such as:

```yaml
providers:
  - id: snowflake:claude-sonnet-4-6
    config:
      accountIdentifier: 'myorg-myaccount'
      apiKey: 'your-bearer-token'
      temperature: 0.7
      max_tokens: 1024
```

### Custom Base URL

Override the default base URL if needed:

```yaml
providers:
  - id: snowflake:claude-sonnet-4-6
    config:
      apiBaseUrl: 'https://custom.snowflakecomputing.com'
      apiKey: 'your-bearer-token'
```

## Features

These examples cover text chat through the existing REST endpoint. Cortex capabilities such as tools, vision, structured output, and cross-region inference depend on the model, endpoint, and account configuration; a platform capability does not imply support through every provider route.

In particular, Snowflake's [structured-output REST example](https://docs.snowflake.com/en/user-guide/snowflake-cortex/complete-structured-outputs#rest-api-example) uses `response_format` with `type: json` and `schema`. Do not assume that the newer OpenAI-compatible endpoint's `json_schema` format works unchanged with the `snowflake:` provider.

## Authentication

Authentication is handled via Bearer tokens in the Authorization header. Snowflake Cortex supports multiple token types:

- **JWT (JSON Web Token)** - Standard Snowflake authentication
- **OAuth tokens** - OAuth 2.0 authentication flow
- **Programmatic access tokens** - Service account tokens

## Example Configuration

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Evaluate Snowflake Cortex text responses'

prompts:
  - 'Explain {{topic}} in simple terms'

providers:
  - id: snowflake:claude-sonnet-4-6
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
