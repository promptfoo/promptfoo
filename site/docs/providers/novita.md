---
title: Novita Provider
sidebar_label: Novita
sidebar_position: 57
description: Use Novita's OpenAI-compatible API in Promptfoo to evaluate chat, completion, and embedding models with authenticated, configurable provider endpoints.
---

# Novita

The `novita` provider routes Promptfoo's OpenAI-compatible provider stack to [Novita](https://novita.ai).

## Setup

Set the `NOVITA_API_KEY` environment variable:

```bash
export NOVITA_API_KEY=your_api_key_here
```

You can also pass `apiKey` directly in provider configuration when needed.

## Provider Formats

```text
novita:<model_name>                # chat provider shorthand
novita:chat:<model_name>           # chat completions
novita:completion:<model_name>     # text completions
novita:embedding:<model_name>      # embeddings
```

The shorthand form defaults to chat mode.

## Configuration

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: novita:chat:meta-llama/llama-3.3-70b-instruct
    config:
      temperature: 0.7
      max_tokens: 512

prompts:
  - 'Explain {{topic}} in one paragraph.'

tests:
  - vars:
      topic: retrieval augmented generation
```

Standard OpenAI-compatible provider options such as `temperature`, `max_tokens`,
and `top_p` are forwarded through the shared provider implementation. Promptfoo
uses Novita's documented `https://api.novita.ai/openai/v1` base URL by default.
For an OpenAI-compatible proxy or test server, set `apiBaseUrl` explicitly:

```yaml title="promptfooconfig.yaml"
providers:
  - id: novita:chat:meta-llama/llama-3.3-70b-instruct
    config:
      apiBaseUrl: https://my-proxy.example.com/openai/v1
      apiKeyEnvar: MY_NOVITA_PROXY_KEY
```

For the API contract and available models, see Novita's
[chat completion API](https://novita.ai/docs/api-reference/model-apis-llm-create-chat-completion),
[completion API](https://novita.ai/docs/api-reference/model-apis-llm-create-completion),
[embeddings API](https://novita.ai/docs/api-reference/model-apis-llm-create-embeddings),
and [list models API](https://novita.ai/docs/api-reference/model-apis-llm-list-models).

## Example

Initialize the bundled example:

```bash
npx promptfoo@latest init --example provider-novita
```

The example checks a short factual response from a Novita chat model and is a
good starting point for local smoke testing.
