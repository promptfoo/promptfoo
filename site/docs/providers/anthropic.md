---
sidebar_position: 10
---

# Anthropic

The `anthropic` provider supports the following models:

- `anthropic:completion:claude-1`
- `anthropic:completion:claude-1-100k`
- `anthropic:completion:claude-instant-1`
- `anthropic:completion:claude-instant-1-100k`
- `anthropic:completion:<insert any other supported model name here>`

Supported environment variables:

- `ANTHROPIC_API_KEY` - required
- `ANTHROPIC_STOP` - stopwords, must be a valid JSON string
- `ANTHROPIC_MAX_TOKENS` - maximum number of tokens to sample, defaults to 1024
- `ANTHROPIC_TEMPERATURE` - temperature

[Config parameters](https://github.com/promptfoo/promptfoo/blob/main/src/providers/azureopenai.ts#L12-L26) may also be passed like so:

```yaml
providers:
  - id: anthropic:completion:claude-1
    prompts: chat_prompt
    config:
      temperature: 0
```
