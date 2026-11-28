---
title: Straitly
sidebar_label: Straitly
description: Configure Straitly in Promptfoo using the OpenAI-compatible provider to evaluate 150+ models including Claude, GPT, Gemini, Grok, and DeepSeek with one API key.
---

# Straitly

[Straitly](https://straitly.ai) is an AI gateway providing one [OpenAI-compatible API](https://straitly.ai/docs/quickstart) for more than 150 models, including Claude, GPT, Gemini, Grok, and DeepSeek. Use Promptfoo's [OpenAI provider](/docs/providers/openai/) with Straitly's base URL and API key.

Straitly documents its data handling in its [privacy policy](https://straitly.ai/privacy) and [terms of service](https://straitly.ai/terms).

## Setup

Create an API key in the [Straitly console](https://straitly.ai/app) and set `STRAITLY_API_KEY` in your shell, or load it from a file with `--env-file`.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'Summarize {{topic}} in two sentences.'

providers:
  - id: openai:chat:claude-sonnet-5-5
    config:
      apiBaseUrl: https://api.straitly.ai/v1
      apiKeyEnvar: STRAITLY_API_KEY
      headers:
        OpenAI-Organization: ''
      omitDefaults: true
      temperature: 0
      max_tokens: 4096

  - id: openai:chat:deepseek/deepseek-v4-1-flash-1017
    config:
      apiBaseUrl: https://api.straitly.ai/v1
      apiKeyEnvar: STRAITLY_API_KEY
      headers:
        OpenAI-Organization: ''
      omitDefaults: true
      temperature: 0
      max_tokens: 4096

tests:
  - vars:
      topic: prompt caching
```

`apiBaseUrl` overrides OpenAI endpoint environment variables. `apiKeyEnvar` selects only `STRAITLY_API_KEY`; a missing key does not fall back to `OPENAI_API_KEY`. Setting `OpenAI-Organization` to an empty string overrides any inherited `OPENAI_ORGANIZATION` value.

## Configuration

- `omitDefaults: true` omits Promptfoo's default output token limit and temperature so explicit provider values or model defaults apply.
- Use `openai:chat:<model-id>` for Chat Completions or `openai:responses:<model-id>` for the Responses API with the exact model ID from Straitly's catalog.
- For model-graded assertions such as `llm-rubric`, point `defaultTest.options.provider` at the same `apiBaseUrl` and `apiKeyEnvar` so grading uses your Straitly key instead of `OPENAI_API_KEY`:

```yaml
defaultTest:
  options:
    provider:
      id: openai:chat:deepseek/deepseek-v4-1-flash-1017
      config:
        apiBaseUrl: https://api.straitly.ai/v1
        apiKeyEnvar: STRAITLY_API_KEY
        headers:
          OpenAI-Organization: ''
```

Check the [Straitly model catalog](https://straitly.ai/models) or `GET https://straitly.ai/api/catalog` for current model IDs. See the [Straitly quickstart](https://straitly.ai/docs/quickstart) for endpoint details and [pricing](https://straitly.ai/pricing) for current rates.
