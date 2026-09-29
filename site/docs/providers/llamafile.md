---
sidebar_label: llamafile
description: 'Deploy LLMs as portable single-file executables using llamafile for offline testing with OpenAI-compatible API endpoints'
---

# llamafile

Llamafile has an [OpenAI-compatible HTTP endpoint](https://github.com/Mozilla-Ocho/llamafile?tab=readme-ov-file#json-api-quickstart), so you can override the [OpenAI provider](/docs/providers/openai/) to talk to your llamafile server.

In order to use llamafile in your eval, set the `apiBaseUrl` variable to `http://localhost:8080/v1` (or wherever you're hosting llamafile).

Here's an example config that uses the server model name `LLaMA_CPP` for chat completions:

```yaml
providers:
  - id: openai:chat:LLaMA_CPP
    config:
      apiBaseUrl: http://localhost:8080/v1
      apiKey: local-placeholder # Use your server key if authentication is enabled
```

If desired, you can instead use the `OPENAI_BASE_URL` environment variable instead of the `apiBaseUrl` config.
