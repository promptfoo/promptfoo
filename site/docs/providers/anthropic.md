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

Config parameters may also be passed like so:

```yaml
providers:
  - id: anthropic:completion:claude-1
    prompts: chat_prompt
    config:
      temperature: 0
```

## Model-graded tests

[Model-graded assertions](/docs/configuration/expected-outputs/model-graded/) such as `factuality` or `llm-rubric` use OpenAI by default and expect `OPENAI_API_KEY` as an environment variable. If you are using Anthropic, you may override the grader to point a different provider.

Because of how model-graded evals are implemented, **the model must support chat-formatted prompts** (except for embedding or classification models).

The easiest way to do this for _all_ your test cases is to add the [`defaultTest`](/docs/configuration/guide/#default-test-cases) property to your config:

```yaml title=promptfooconfig.yaml
defaultTest:
  options:
    provider:
      id: provider:chat:modelname
      config:
        # Provider config options
```

However, you can also do this for individual assertions:

```yaml
# ...
assert:
  - type: llm-rubric
    value: Do not mention that you are an AI or chat assistant
    provider:
      id: provider:chat:modelname
      config:
        # Provider config options
```

Or individual tests:

```yaml
# ...
tests:
  - vars:
      # ...
    options:
      provider:
        id: provider:chat:modelname
        config:
          # Provider config options
    assert:
      - type: llm-rubric
        value: Do not mention that you are an AI or chat assistant
```