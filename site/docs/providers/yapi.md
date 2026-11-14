---
title: Y-API
sidebar_position: 86
description: Run text chat evals through Y-API with the OpenAI-compatible provider. Use a separate key, choose a catalog model, and estimate costs in USD per token.
---

# Y-API

[Y-API](https://y-api.bestvirtualgoods.com/) exposes an OpenAI-compatible Chat Completions endpoint. Copy a model ID from the [Y-API catalog](https://y-api.bestvirtualgoods.com/models.json), create a gateway key and export it:

```sh
export Y_API_API_KEY=your_api_key_here
```

```yaml title="promptfooconfig.yaml"
prompts:
  - 'What is the capital of {{country}}?'

providers:
  - id: openai:chat:deepseek/deepseek-v4-pro
    config:
      apiBaseUrl: https://api.y-api.bestvirtualgoods.com/v1
      apiKeyEnvar: Y_API_API_KEY
      headers:
        OpenAI-Organization: ''
      showThinking: false
      max_tokens: 1024

tests:
  - vars:
      country: France
    assert:
      - type: icontains
        value: Paris
```

Set the endpoint, named credential and organization header on each gateway model. The [runnable example](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-yapi) compares three catalog entries.

## Cost estimates

Y-API bills in credits. A direct model rate displayed by Promptfoo may differ from the gateway charge. For an explicit USD estimate, divide the catalog's credit price per million tokens by the number of credits per dollar and by 1,000,000. Read the current prices and conversion from the [pricing file](https://y-api.bestvirtualgoods.com/pricing.json).

For example, 0.5 input credits and 1 output credit per million tokens at 10 credits per dollar correspond to these provider settings:

```yaml
config:
  inputCost: 0.00000005
  outputCost: 0.0000001
```

## Service limits

The [public OpenAPI description](https://y-api.bestvirtualgoods.com/openapi.json) documents text-only model input. Catalog models ignore image parts. Check the gateway key on HTTP 401 and the account balance on HTTP 403.
