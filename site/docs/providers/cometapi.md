---
title: CometAPI
description: Use 500+ AI models from multiple providers through CometAPI's unified OpenAI-compatible interface
sidebar_label: CometAPI
---

# CometAPI

The `cometapi` provider lets you use [CometAPI](https://www.cometapi.com/?utm_source=promptfoo&utm_campaign=integration&utm_medium=integration&utm_content=integration) via OpenAI-compatible endpoints. It supports hundreds of models across vendors.

## Setup

First, set the `COMETAPI_KEY` environment variable with your CometAPI API key:

```bash
export COMETAPI_KEY=your_api_key_here
```

You can obtain an API key from the [CometAPI console](https://api.cometapi.com/console/token).

## Configuration

The provider uses the following syntax:

```yaml
providers:
  - cometapi:<type>:<model>
```

Where `<type>` can be:

- `chat` - `/v1/chat/completions`, with text or image input supported by the selected model
- `completion` - `/v1/completions`
- `embedding` - `/v1/embeddings`
- `image` - `/v1/images/generations`, returning a completed Images API response

You can also use `cometapi:<model>` which defaults to chat mode.

Choose a model that supports the selected endpoint. CometAPI's [GPT-6 Astra tool-calling guidance](https://apidoc.cometapi.com/api/text/chat) uses the [OpenAI Responses API](https://apidoc.cometapi.com/api/text/responses) at `/v1/responses`, and its [FLUX.2 Pro quickstart](https://apidoc.cometapi.com/quickstarts/image/flux-api) requires task submission and polling. The `cometapi:` modes above do not implement those flows. A [custom provider](/docs/providers/custom-api/) can use their required endpoints and handle polling.

### Examples

**Chat Models (default):**

```yaml
providers:
  - cometapi:chat:gpt-5-mini
  - cometapi:chat:claude-3-5-sonnet-20241022
  - cometapi:chat:your-chat-model
  # Or use default chat mode
  - cometapi:gpt-5-mini
```

**Image Generation Models:**

```yaml
providers:
  - cometapi:image:dall-e-3
  - cometapi:image:flux-schnell
  - cometapi:image:your-image-model
```

**Text Completion Models:**

```yaml
providers:
  - cometapi:completion:deepseek-chat
  - cometapi:completion:your-completion-model
```

**Embedding Models:**

```yaml
providers:
  - cometapi:embedding:text-embedding-3-small
  - cometapi:embedding:your-embedding-model
```

Each mode accepts its corresponding OpenAI-compatible configuration options. Parameter support, image sizes, tool calling, and output formats depend on the selected CometAPI model. Confirm those details in its API reference before using or replacing an example ID:

```yaml
providers:
  - id: cometapi:chat:gpt-5-mini
    config:
      max_completion_tokens: 512
  - id: cometapi:image:dall-e-3
    config:
      n: 1
      size: '1024x1024'
      quality: 'standard'
```

## Examples

You can run the included example configuration:

```bash
npx promptfoo@latest init --example provider-cometapi
```

### Command Line Usage

**Text Generation:**

```bash
npx promptfoo@latest eval --prompts "Write a haiku about AI" -r cometapi:chat:gpt-5-mini
```

**Image Generation:**

```bash
npx promptfoo@latest eval --prompts "A futuristic robot in a garden" -r cometapi:image:dall-e-3
```

For image input, use a message with an `image_url` content part, as shown in the vision configuration below. A URL in a plain text prompt is sent as text.

### Configuration Examples

**Image Generation with Custom Parameters:**

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: cometapi:image:dall-e-3
    config:
      size: '1792x1024'
      quality: 'hd'
      style: 'vivid'
      n: 1

prompts:
  - 'A {{style}} painting of {{subject}}'

tests:
  - vars:
      style: surreal
      subject: floating islands in space
```

**Vision Model Configuration:**

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - |
    [{"role": "user", "content": [
      {"type": "text", "text": {{question | dump}}},
      {"type": "image_url", "image_url": {"url": {{image_url | dump}}}}
    ]}]

providers:
  - id: cometapi:chat:gpt-4o
    config:
      max_tokens: 1000
      temperature: 0.3

tests:
  - vars:
      image_url: 'https://example.com/chart.png'
      question: 'What insights can you draw from this data?'
```

## Available Models

CometAPI supports 500+ models from multiple providers. You can view available models using:

```bash
curl -H "Authorization: Bearer $COMETAPI_KEY" https://api.cometapi.com/v1/models
```

Or browse models on the [CometAPI pricing page](https://api.cometapi.com/pricing).

Use the exact CometAPI model ID with the matching type prefix from the configuration section. Check that model's API reference for endpoint and feature support. For example, the [GPT Image quickstart](https://apidoc.cometapi.com/quickstarts/image/gpt-image-api) returns a completed `b64_json` image, while FLUX.2 Pro requires the asynchronous flow described above.

## Environment Variables

| Variable       | Description                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `COMETAPI_KEY` | Your CometAPI key. Get one at [CometAPI console token](https://api.cometapi.com/console/token) |
