---
sidebar_label: AI/ML API
---

# AI/ML API

The `aimlapi` provider lets you use the AI/ML API via OpenAI-compatible endpoints.

## Setup

Set your API key in the `AIML_API_KEY` environment variable:

```bash
export AIML_API_KEY=your_api_key_here
```

## Provider Usage

The provider follows the syntax `aimlapi:<type>:<model>` where `<type>` can be `chat`, `completion`, or `embedding`. Or you can use `aimlapi:<model>` for default (as a chat-completion).

Example configuration comparing three models:

```yaml
providers:
  - aimlapi:chat:my-chat-model
  - aimlapi:completion:my-completion-model
  - aimlapi:gpt-3.5-turbo
```

You can customize options supported by OpenAI such as `temperature` or `max_tokens`.

## Available Models

To fetch the latest list of available models, call the `/models` endpoint:

```bash
curl https://api.aimlapi.com/models
```

## Environment Variables

| Variable            | Description                                   |
| ------------------- | --------------------------------------------- |
| `AIML_API_KEY`      | API key for authentication                    |
