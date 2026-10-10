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

Replace `llamaapi:` with the new host's model ID and set that host's credentials. For Groq, set `GROQ_API_KEY`:

```yaml
providers:
  # Before: - id: llamaapi:<llama-model>
  - id: groq:<model-from-groq-catalog>
```

Use the model ID from your chosen host's catalog. See the [provider list](./index.md) for more options.
