---
sidebar_label: OpenLLM
description: "Serve open-source models with BentoML OpenLLM and configure promptfoo's OpenAI provider using your server URL, API key, and deployed model name for evals."
---

# OpenLLM

[OpenLLM](https://github.com/bentoml/OpenLLM) serves models through an OpenAI-compatible endpoint. Use promptfoo's [OpenAI provider](/docs/providers/openai) with the model name exposed by your server.

## Start a server

The OpenLLM quickstart uses:

```sh
openllm serve llama3.2:1b
```

This starts the API at `http://localhost:3000/v1`. Model access and hardware requirements depend on the selected model; follow the OpenLLM setup instructions before serving it.

## Configure promptfoo

```yaml
providers:
  - id: openai:chat:meta-llama/Llama-3.2-1B-Instruct
    config:
      apiBaseUrl: http://localhost:3000/v1
      apiKey: local-placeholder # Use your server key if authentication is enabled
```

Keep the model name aligned with your server's `/v1/models` response. A name configured by your deployment may differ from the upstream Hugging Face repository name.

Older OpenLLM releases used `openllm start` and port `8001`. If you run one of those deployments, use its matching startup command, URL, and served model name. Use `openai:completion:<served-model>` only when that deployment supports the completions endpoint and the model accepts completion prompts.
