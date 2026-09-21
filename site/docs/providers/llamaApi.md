---
title: Meta Llama API
description: Meta retired the Llama API Public Preview. Migrate promptfoo configurations to the Meta Model API or a third-party Llama host.
sidebar_label: Meta Llama API
---

# Meta Llama API

:::warning Retired service

Meta [retired the Llama API Public Preview on July 6, 2026](https://llama.developer.meta.com/docs/llama-api-deprecation/),
including `api.llama.com`. The `llamaapi:` provider is still registered so existing configs load,
but requests to the retired endpoint will not succeed.

:::

## Where to go instead

| You want                                                       | Use                                                                                                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Meta's current hosted inference (Muse models at `api.meta.ai`) | [Meta Model API](/docs/providers/meta.md)                                                                                    |
| Llama models from a third-party host                           | [AWS Bedrock](/docs/providers/aws-bedrock.md), [Together AI](/docs/providers/togetherai.md), [Groq](/docs/providers/groq.md) |
| Llama models run locally                                       | [Ollama](/docs/providers/ollama.md), [llama.cpp](/docs/providers/llama.cpp.md), [vLLM](/docs/providers/vllm.md)              |

## Migrating an existing config

Model names and credentials are not portable between hosts, so set both:

```yaml
providers:
  # Before: - id: llamaapi:<llama-model>
  - id: groq:<model-from-groq-catalog>
```

Pick the model id from your chosen host's catalog — each host names Llama models differently, and
availability varies by account tier. See the [provider list](./index.md) for every host that
serves Llama models.
