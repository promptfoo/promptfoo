---
sidebar_label: llmman
description: 'Evaluate local models pulled as OCI artifacts with llmman through its OpenAI-compatible API'
---

# llmman

[llmman](https://github.com/llmmanorg/llmman) runs local models distributed as OCI artifacts and serves an OpenAI-compatible API on port 17434. Use the [OpenAI provider](/docs/providers/openai/) with `apiBaseUrl` set to the `/v1` root:

```yaml
providers:
  - id: openai:chat:qwen3.8
    config:
      apiBaseUrl: http://localhost:17434/v1
      apiKeyRequired: false
      useDefaultApiKey: false
```

Use the model name you pulled with llmman. If your server requires a key, replace the two key options with `apiKeyEnvar: LLMMAN_API_KEY`.
