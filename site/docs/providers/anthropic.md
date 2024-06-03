---
sidebar_position: 10
---

# Anthropic

This provider supports the [Anthropic Claude](https://www.anthropic.com/claude) series of models.

## Setup

To use Anthropic, you need to set the `ANTHROPIC_API_KEY` environment variable or specify the `apiKey` in the provider configuration.

Create Anthropic API keys [here](https://console.anthropic.com/settings/keys).

Example of setting the environment variable:

```bash
export ANTHROPIC_API_KEY=your_api_key_here
```

### Supported parameters

| Config Property | Environment Variable | Description                                    |
| --------------- | -------------------- | ---------------------------------------------- |
| apiKey          | ANTHROPIC_API_KEY    | Your API key from Anthropic                    |
| apiBaseUrl      | ANTHROPIC_BASE_URL   | The base URL for requests to the Anthropic API |

## Latest API (Messages)

> The messages API supports all the latest Anthropic models.

The `anthropic` provider supports the following models via the messages API:

- `anthropic:messages:claude-instant-1.2`
- `anthropic:messages:claude-2.0`
- `anthropic:messages:claude-2.1`
- `anthropic:messages:claude-3-haiku-20240307`
- `anthropic:messages:claude-3-sonnet-20240229`
- `anthropic:messages:claude-3-opus-20240229`

### Prompt Template

To allow for compatibility with the OpenAI prompt template, the following format is supported.

Example: `prompt.json`

```json
[
  {
    "role": "system",
    "content": "{{ system_message }}"
  },
  {
    "role": "user",
    "content": "{{ question }}"
  }
]
```

If the role `system` is specified, then it will be automatically added to the API request.
All `user` or `assistant` roles will automatically converted into the right format for the API request.
Currently, only type `text` is supported.

The `system_message` and `question` are example variables that can be set with the `var` directive.

### Options

The Anthropic provider supports several options to customize the behavior of the model. These include:

- `temperature`: Controls the randomness of the output.
- `max_tokens`: The maximum length of the generated text.
- `top_p`: Controls nucleus sampling, affecting the randomness of the output.
- `top_k`: Only sample from the top K options for each subsequent token.

Example configuration with options and prompts:

```yaml
providers:
  - id: anthropic:messages:claude-3-opus-20240229
    config:
      temperature: 0.0
      max_tokens: 512
prompts: [prompt.json]
```

### Images / Vision

You can include images in the prompts in Claude 3 models.

See the [Claude vision example](https://github.com/typpo/promptfoo/tree/main/examples/claude-vision).

One important note: The Claude API only supports base64 representations of images.
This is different from how OpenAI's vision works, in that it supports grabbing images
from a URL. As a result, if you are trying to compare Claude 3 and OpenAI vision capabilities,
you will need to have separate prompts for each.

See the [OpenAI vision example](https://github.com/typpo/promptfoo/tree/main/examples/openai-vision) to see where there are differences here.

### Additional Capabilities

- **Caching**: Caches previous LLM requests by default.
- **Token Usage Tracking**: Provides detailed information on the number of tokens used in each request, aiding in usage monitoring and optimization.
- **Cost Calculation**: Calculates the cost of each request based on the number of tokens generated and the specific model used.

## Deprecated API (Completions)

> The completions API is deprecated, see the migration guide [here](https://docs.anthropic.com/claude/reference/migrating-from-text-completions-to-messages).

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
      id: anthropic:messages:claude-3-opus-20240229
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
      id: anthropic:messages:claude-3-opus-20240229
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
        id: anthropic:messages:claude-3-opus-20240229
        config:
          # Provider config options
    assert:
      - type: llm-rubric
        value: Do not mention that you are an AI or chat assistant
```
