---
sidebar_label: Cohere
description: Configure Cohere chat models for RAG-optimized inference, including Command A+, Command A, Aya, Command R, and flexible prompt truncation controls for evals
---

# Cohere

The `cohere` provider is an interface to Cohere AI's [chat inference API](https://docs.cohere.com/reference/chat), with models such as Command R that are optimized for RAG and tool usage.

## Setup

First, set the `COHERE_API_KEY` environment variable with your Cohere API key.

Next, edit the promptfoo configuration file to point to the Cohere provider.

- `cohere:<model name>` - uses the specified Cohere model (for example, `command-a-03-2025`).

The following models are confirmed supported. For the complete list of supported models, see [Cohere Models](https://docs.cohere.com/docs/models).

- `command-a-plus-05-2026`
- `north-mini-code-1-0`
- `command-a-03-2025`
- `command-r7b-12-2024`
- `command-a-translate-08-2025`
- `command-a-reasoning-08-2025`
- `command-a-vision-07-2025`
- `command-r-08-2024`
- `command-r-plus-08-2024`
- `tiny-aya-global`
- `tiny-aya-earth`
- `tiny-aya-fire`
- `tiny-aya-water`
- `c4ai-aya-expanse-32b`
- `c4ai-aya-vision-32b`

Legacy aliases such as `command`, `command-r`, and `command-r-plus` are deprecated. Cohere may
still serve them only to eligible existing users who used the model within 90 days before the
September 15, 2025 deprecation announcement; new configurations should use the dated IDs above.

`command-a-plus-05-2026` supports a 128K-token input context and up to 64K output tokens. Cohere's
hosted API offers the model without token charges until the account's rate limit; production use is
available through Cohere Model Vault, so Promptfoo does not assign a speculative per-token price.

`north-mini-code-1-0` is Cohere's agentic coding model. It supports a 256K-token context and up to
64K output tokens through the v2 Chat API. Cohere also offers it without token charges until the
account's rate limit, with production deployment available through Model Vault.

### Model Vault

For a [Cohere Model Vault](https://docs.cohere.com/v2/docs/model-vault) deployment, copy the Vault
endpoint and model name from the model card in the Cohere dashboard. Use that model name in the
provider ID and set the endpoint as the provider-level `apiBaseUrl`:

```yaml
providers:
  - id: cohere:command-a-plus-05-2026
    config:
      apiBaseUrl: '{{env.COHERE_API_BASE_URL}}'
```

Set `COHERE_API_BASE_URL` to the Vault endpoint shown in the dashboard. Promptfoo selects the v1 or
v2 Chat API path for the configured model, including when the supplied base URL ends in `/v1` or
`/v2`. Configure the applicable Cohere credential through `COHERE_API_KEY` or the provider-level
`apiKey`. Prompt config cannot override either `apiBaseUrl` or `apiKey`.

Here's an example configuration:

```yaml
providers:
  - id: cohere:command-a-03-2025
    config:
      temperature: 0.5
      max_tokens: 256
      prompt_truncation: 'AUTO'
      connectors:
        - id: web-search
```

## Control over prompting

By default, a regular string prompt is wrapped in the appropriate chat format. Command A+ and North
Mini Code use Cohere's v2 Chat API, so Promptfoo sends them in a `messages` array; existing models
continue to use the v1 `message` field. For those v2 models, Promptfoo also converts `chatHistory` and
`preamble_override` to v2 messages. The v1-only `connectors`, `search_queries_only`, and
`prompt_truncation` features are not available with them; use v2 tools instead of connectors.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'Write a tweet about {{topic}}'

providers:
  - cohere:command-a-03-2025

tests:
  - vars:
      topic: bananas
```

If desired, your prompt can reference a YAML or JSON file that has a more complex set of API parameters. For example:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - file://prompt1.yaml

providers:
  - cohere:command-a-03-2025

tests:
  - vars:
      question: What year was he born?
  - vars:
      question: What did he like eating for breakfast?
```

And in `prompt1.yaml`:

```yaml
chat_history:
  - role: USER
    message: 'Who discovered gravity?'
  - role: CHATBOT
    message: 'Isaac Newton'
message: '{{question}}'
connectors:
  - id: web-search
```

## Embedding Configuration

Cohere provides embedding capabilities that can be used for various natural language processing tasks, including similarity comparisons. To use Cohere's embedding model in your evaluations, you can configure it as follows:

1. In your `promptfooconfig.yaml` file, add the embedding configuration under the `defaultTest` section:

```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: cohere:embedding:embed-english-v3.0
```

This configuration sets the default embedding provider for all tests that require embeddings (such as similarity assertions) to use Cohere's `embed-english-v3.0` model.

For text inputs with Cohere's current embedding model, use `embed-v4.0`. The v3 model IDs remain
valid for text-focused workloads.

```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: cohere:embedding:embed-v4.0
```

2. You can also specify the embedding provider for individual assertions:

```yaml
assert:
  - type: similar
    value: Some reference text
    provider:
      embedding:
        id: cohere:embedding:embed-english-v3.0
```

3. Additional configuration options can be passed to the embedding provider:

```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: cohere:embedding:embed-english-v3.0
        config:
          apiKey: your_api_key_here # If not set via environment variable
          truncate: NONE # Options: NONE, START, END
```

## Displaying searches and documents

When the Cohere API is called, the provider can optionally include the search queries and documents in the output. This is controlled by the `showSearchQueries` and `showDocuments` config parameters. If true, the content will be appending to the output.

## Configuration

Cohere parameters

| Parameter             | Description                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `apiKey`              | Provider-level Cohere API key if not using the `COHERE_API_KEY` environment variable.                |
| `apiBaseUrl`          | Provider-level Cohere API base URL. For Model Vault, use the endpoint shown in the Cohere dashboard. |
| `chatHistory`         | An array of chat history objects with role, message, and optionally user_name and conversation_id.   |
| `connectors`          | An array of connector objects for integrating with external systems.                                 |
| `documents`           | An array of document objects for providing reference material to the model.                          |
| `frequency_penalty`   | Penalizes new tokens based on their frequency in the text so far.                                    |
| `k`                   | Controls the diversity of the output via top-k sampling.                                             |
| `max_tokens`          | The maximum length of the generated text.                                                            |
| `modelName`           | The model name to use for the chat completion.                                                       |
| `p`                   | Controls the diversity of the output via nucleus (top-p) sampling.                                   |
| `preamble_override`   | A string to override the default preamble used by the model.                                         |
| `presence_penalty`    | Penalizes new tokens based on their presence in the text so far.                                     |
| `prompt_truncation`   | Controls how prompts are truncated ('AUTO' or 'OFF').                                                |
| `search_queries_only` | If true, only search queries are processed.                                                          |
| `temperature`         | Controls the randomness of the output.                                                               |

Special parameters

| Parameter           | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `showSearchQueries` | If true, includes the search queries used in the output. |
| `showDocuments`     | If true, includes the documents used in the output.      |
