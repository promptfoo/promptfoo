---
title: Novita Provider
sidebar_label: Novita
description: Use Novita's OpenAI-compatible API with chat, completion, and embedding provider formats.
---

# Novita

The `novita` provider routes Promptfoo's OpenAI-compatible provider stack to [Novita](https://novita.ai).

## Setup

Set the `NOVITA_API_KEY` environment variable:

```bash
export NOVITA_API_KEY=your_api_key_here
```

You can also pass `apiKey` directly in provider configuration when needed.

## Provider Formats

```text
novita:<model_name>                # chat provider shorthand
novita:chat:<model_name>           # chat completions
novita:completion:<model_name>     # text completions
novita:embedding:<model_name>      # embeddings
```

The shorthand form defaults to chat mode.

## Configuration

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: novita:chat:deepseek/deepseek-v3.2
    config:
      temperature: 0.7
      max_tokens: 512

prompts:
  - 'Explain {{topic}} in one paragraph.'

tests:
  - vars:
      topic: retrieval augmented generation
```

Standard OpenAI-compatible provider options such as `temperature`, `max_tokens`,
`top_p`, and `stream` are forwarded through the shared provider implementation.

## Example

Initialize the bundled example:

```bash
npx promptfoo@latest init --example provider-novita
```

The example compares two short factual prompts with a Novita chat model and is a
good starting point for local smoke testing.
