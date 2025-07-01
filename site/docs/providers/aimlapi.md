---
sidebar_label: AI/ML API
---

# AI/ML API

The `aimlapi` provider lets you use [AI/ML API](https://aimlapi.com/app/?utm_source=promptfoo&utm_medium=github&utm_campaign=integration) via OpenAI-compatible endpoints. It supports over 300+ models, including `ChatGPT`, `DeepSeek`, `Gemini`, `Claude`, and more — all under a unified API.

## Features

- 🧠 300+ models for chat, completion, embeddings, and images
- 🚀 Enterprise-grade speed and uptime
- 🔁 OpenAI-compatible endpoints
- 📊 Unified billing with free quota to start

## Quick Start

```bash
npx promptfoo@latest init --example aimlapi
```

## Setup

Set your API key as an environment variable:

```bash
export AIML_API_KEY=<your_api_key>
```

If you don’t have an API key yet, sign up at
👉 [https://aimlapi.com/app/?utm_source=promptfoo\&utm_medium=github\&utm_campaign=integration](https://aimlapi.com/app/?utm_source=promptfoo&utm_medium=github&utm_campaign=integration)

## Provider Usage

The syntax follows:

```yaml
providers:
  - aimlapi:<type>:<model>
```

Where `<type>` can be:

- `chat`
- `completion`
- `embedding`

You can also use `aimlapi:<model>` to default to chat-completion mode.

### Example

```yaml
providers:
  - aimlapi:chat:gpt-4
  - aimlapi:completion:deepseek-coder
  - aimlapi:embedding:bge-m3
  - aimlapi:gemini-pro
```

All standard OpenAI-style parameters are supported, such as:

```yaml
temperature: 0.7
max_tokens: 512
```

## Available Models

Fetch the list of available models:

```bash
curl https://api.aimlapi.com/models
```

Or explore models via the [UI catalog](https://aimlapi.com/models?utm_source=promptfoo&utm_medium=github&utm_campaign=integration)

## Environment Variables

| Variable       | Description                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `AIML_API_KEY` | Your personal API key. Get one at [aimlapi.com](https://aimlapi.com/app/?utm_source=promptfoo&utm_medium=github&utm_campaign=integration) |
