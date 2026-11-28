---
title: Nebius Token Factory
sidebar_position: 88
description: Evaluate chat models on Nebius Token Factory with Promptfoo. Configure a dedicated API key, choose a model from the catalog, and grade the final answer.
---

# Nebius Token Factory

Use the OpenAI-compatible Chat Completions provider with the Nebius Token Factory endpoint. Create a key using the [Token Factory quickstart](https://docs.tokenfactory.nebius.com/quickstart) and set it in your environment:

```bash
export NEBIUS_API_KEY=your_api_key_here
```

Choose a model ID from the `flavors` in the [public model catalog](https://tokenfactory.nebius.com/api/public/models_info). This example sends a chat request to `/v1/chat/completions` and grades the final answer separately from any reasoning text:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Return only the sum of {{a}} and {{b}}.'

providers:
  - id: openai:chat:openai/gpt-oss-120b
    config:
      apiBaseUrl: https://api.tokenfactory.nebius.com/v1
      apiKeyEnvar: NEBIUS_API_KEY
      headers:
        OpenAI-Organization: ''
      showThinking: false
      max_tokens: 512

tests:
  - vars:
      a: 28
      b: 17
    assert:
      - type: equals
        value: '45'
```

Keep the endpoint and named credential on each Nebius provider. The empty organization header suppresses the ambient OpenAI organization value. The [coding example](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-nebius-token-factory) runs two language-specific smoke checks.
