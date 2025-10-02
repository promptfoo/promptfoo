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

- `chat` - For chat completions (text, vision, multimodal)
- `completion` - For text completions
- `embedding` - For text embeddings
- `image` - For image generation (DALL-E, Flux models)

You can also use `cometapi:<model>` which defaults to chat mode.

### Examples

**Chat Models (default):**

```yaml
providers:
  - cometapi:chat:gpt-5-mini
  - cometapi:chat:claude-3-5-sonnet-20241022
  - cometapi:chat:your-favorite-model
  # Or use default chat mode
  - cometapi:gpt-5-mini
```

**Image Generation Models:**

```yaml
providers:
  - cometapi:image:dall-e-3
  - cometapi:image:flux-schnell
  - cometapi:image:any-image-model
```

**Text Completion Models:**

```yaml
providers:
  - cometapi:completion:deepseek-chat
  - cometapi:completion:any-completion-model
```

**Embedding Models:**

```yaml
providers:
  - cometapi:embedding:text-embedding-3-small
  - cometapi:embedding:any-embedding-model
```

All standard OpenAI parameters are supported:

```yaml
providers:
  - id: cometapi:chat:gpt-5-mini
    config:
      temperature: 0.7
      max_tokens: 512
  - id: cometapi:image:dall-e-3
    config:
      n: 1
      size: '1024x1024'
      quality: 'standard'
```

## Examples

You can run the included example configuration:

```bash
npx promptfoo@latest init --example cometapi
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

**Vision/Multimodal:**

```bash
npx promptfoo@latest eval --prompts "Describe what's in this image: {{image_url}}" --vars image_url="https://example.com/image.jpg" -r cometapi:chat:gpt-4o
```

### Configuration Examples

**Image Generation with Custom Parameters:**

```yaml
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

```yaml
providers:
  - id: cometapi:chat:gpt-4o
    config:
      max_tokens: 1000
      temperature: 0.3

prompts:
  - file://./vision-prompt.yaml

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

**Using Any Model:** Simply specify the model name with the appropriate type prefix:

- `cometapi:chat:any-model-name` for text/chat models
- `cometapi:image:any-image-model` for image generation
- `cometapi:embedding:any-embedding-model` for embeddings
- `cometapi:completion:any-completion-model` for text completions
- `cometapi:any-model-name` (defaults to chat mode)

## Environment Variables

| Variable       | Description                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `COMETAPI_KEY` | Your CometAPI key. Get one at [CometAPI console token](https://api.cometapi.com/console/token) |
