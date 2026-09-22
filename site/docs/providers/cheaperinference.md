---
sidebar_label: Cheaper Inference
description: "Evaluate Anthropic, OpenAI, Google, xAI, DeepSeek, Moonshot, Z.ai and Alibaba chat models through Cheaper Inference's OpenAI-compatible discount gateway"
---

# Cheaper Inference

[Cheaper Inference](https://cheaperinference.com/) is an OpenAI-compatible gateway that resells chat models from several makers at or below the maker's list price, behind one endpoint and one key. Model ids are the maker's own - `claude-sonnet-5`, `gpt-5.6-luna`, `gemini-3.7-flash` - with no vendor prefix, so the same id works whether you go through the gateway or direct.

## Setup

1. Create an API key from the [Cheaper Inference docs](https://cheaperinference.com/docs).
2. Set the `CHEAPERINFERENCE_API_KEY` environment variable:

```sh
export CHEAPERINFERENCE_API_KEY=your_api_key_here
```

You can also pass `apiKey` directly in the provider config, but using an environment variable is recommended.

## Basic Configuration

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: cheaperinference:claude-sonnet-5
    config:
      temperature: 0.7
      max_tokens: 500

prompts:
  - 'Answer clearly and concisely: {{question}}'

tests:
  - vars:
      question: 'What is the capital of France?'
    assert:
      - type: contains
        value: 'Paris'
```

The default `apiBaseUrl` is `https://api.cheaperinference.com/v1`; promptfoo appends `/chat/completions` when sending chat requests.

## Comparing two makers on one key

Because the gateway fronts several makers, one key is enough to put their models side by side in the same eval:

```yaml title="promptfooconfig.yaml"
providers:
  - cheaperinference:claude-sonnet-5
  - cheaperinference:gpt-5.6-luna
  - cheaperinference:gemini-3.7-flash
```

## Configuration Options

The provider accepts the shared OpenAI chat options below:

- `temperature`
- `max_tokens`
- `top_p`
- `presence_penalty`
- `frequency_penalty`
- `stop`
- `response_format`
- `tools`
- `tool_choice`

For the full shared option set, see the [OpenAI provider documentation](/docs/providers/openai/).

## Custom Base URL or API Key Variable

If you route the gateway through a proxy, override `apiBaseUrl`. You can also read the Bearer token from a different environment variable by setting `apiKeyEnvar`.

```yaml title="promptfooconfig.yaml"
providers:
  - id: cheaperinference:claude-sonnet-5
    config:
      apiBaseUrl: https://proxy.example.com/ci/v1
      apiKeyEnvar: MY_CHEAPERINFERENCE_TOKEN
      temperature: 0.7
```

Precedence is:

- `config.apiBaseUrl` if provided, otherwise `https://api.cheaperinference.com/v1`
- `config.apiKeyEnvar` if provided, otherwise `CHEAPERINFERENCE_API_KEY`

## Things to know about this host

- `GET /v1/models` is authenticated and returns, per model, the charged and list price, the context and output limits, and capability flags.
- Do not trust the capability flags in that response. A probe of every chat route on 2026-09-22 found models that return reasoning although the catalogue sets `reasoning: false` (`claude-opus-4-8-fast`, `glm-4.6`, `gemini-2.5-flash`). The same probe found models that read an image although the catalogue sets `vision: false` (`deepseek-v4-flash`, `qwen-3-8-max`). Test the capability yourself if your eval depends on it.
- Image input, where it works, requires a `data:` URI. A remote `https://` image URL is rejected on every route.
- There is no embeddings endpoint: `POST /v1/embeddings` returns 404. Use another provider for embedding-based assertions.
- Prices move. Four models changed price within one 23-hour window in September 2026, so treat any cost figure you cache as a snapshot.

## Example

See the runnable example in [`examples/provider-cheaperinference`](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-cheaperinference).

## Additional Resources

- [Cheaper Inference Docs](https://cheaperinference.com/docs)
- [OpenAI provider documentation](/docs/providers/openai/)
