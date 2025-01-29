---
sidebar_position: 2
---

# Anthropic

This provider supports the [Anthropic Claude](https://www.anthropic.com/claude) series of models.

> **Note:** Anthropic models can also be accessed through Amazon Bedrock. For information on using Anthropic models via Bedrock, please refer to our [AWS Bedrock documentation](/docs/providers/aws-bedrock).

## Setup

To use Anthropic, you need to set the `ANTHROPIC_API_KEY` environment variable or specify the `apiKey` in the provider configuration.

Create Anthropic API keys [here](https://console.anthropic.com/settings/keys).

Example of setting the environment variable:

```sh
export ANTHROPIC_API_KEY=your_api_key_here
```

## Models

The `anthropic` provider supports the following models via the messages API:

| Model ID                                                                   | Description                      |
| -------------------------------------------------------------------------- | -------------------------------- |
| `anthropic:messages:claude-3-5-sonnet-20241022` (claude-3-5-sonnet-latest) | Latest Claude 3.5 Sonnet model   |
| `anthropic:messages:claude-3-5-sonnet-20240620`                            | Previous Claude 3.5 Sonnet model |
| `anthropic:messages:claude-3-5-haiku-20241022` (claude-3-5-haiku-latest)   | Latest Claude 3.5 Haiku model    |
| `anthropic:messages:claude-3-5-haiku-20241022` (claude-3-5-haiku-latest)   | Latest Claude 3.5 Haiku model    |
| `anthropic:messages:claude-3-opus-20240229` (claude-3-opus-latest)         | Claude 3 Opus model              |
| `anthropic:messages:claude-3-sonnet-20240229`                              | Claude 3 Sonnet model            |
| `anthropic:messages:claude-3-haiku-20240307`                               | Claude 3 Haiku model             |

### Cross-Platform Model Availability

Claude models are available across multiple platforms. Here's how the model names map across different providers:

| Model             | Anthropic API                                         | AWS Bedrock ([documentation](/docs/providers/aws-bedrock)) | GCP Vertex AI ([documentation](/docs/providers/vertex)) |
| ----------------- | ----------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| Claude 3.5 Sonnet | claude-3-5-sonnet-20241022 (claude-3-5-sonnet-latest) | anthropic.claude-3-5-sonnet-20241022-v2:0                  | claude-3-5-sonnet-v2@20241022                           |
| Claude 3.5 Haiku  | claude-3-5-haiku-20241022 (claude-3-5-haiku-latest)   | anthropic.claude-3-5-haiku-20241022-v1:0                   | claude-3-5-haiku@20241022                               |
| Claude 3 Opus     | claude-3-opus-20240229 (claude-3-opus-latest)         | anthropic.claude-3-opus-20240229-v1:0                      | claude-3-opus@20240229                                  |
| Claude 3 Sonnet   | claude-3-sonnet-20240229                              | anthropic.claude-3-sonnet-20240229-v1:0                    | claude-3-sonnet@20240229                                |
| Claude 3 Haiku    | claude-3-haiku-20240307                               | anthropic.claude-3-haiku-20240307-v1:0                     | claude-3-haiku@20240307                                 |

### Supported Parameters

| Config Property | Environment Variable  | Description                                                       |
| --------------- | --------------------- | ----------------------------------------------------------------- |
| apiKey          | ANTHROPIC_API_KEY     | Your API key from Anthropic                                       |
| apiBaseUrl      | ANTHROPIC_BASE_URL    | The base URL for requests to the Anthropic API                    |
| temperature     | ANTHROPIC_TEMPERATURE | Controls the randomness of the output (default: 0)                |
| max_tokens      | ANTHROPIC_MAX_TOKENS  | The maximum length of the generated text (default: 1024)          |
| top_p           | -                     | Controls nucleus sampling, affecting the randomness of the output |
| top_k           | -                     | Only sample from the top K options for each subsequent token      |
| tools           | -                     | An array of tool or function definitions for the model to call    |
| tool_choice     | -                     | An object specifying the tool to call                             |
| headers         | -                     | Additional headers to be sent with the API request                |

### Prompt Template

To allow for compatibility with the OpenAI prompt template, the following format is supported:

```json title="prompt.json"
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

If the role `system` is specified, it will be automatically added to the API request.
All `user` or `assistant` roles will be automatically converted into the right format for the API request.
Currently, only type `text` is supported.

The `system_message` and `question` are example variables that can be set with the `var` directive.

### Options

The Anthropic provider supports several options to customize the behavior of the model. These include:

- `temperature`: Controls the randomness of the output.
- `max_tokens`: The maximum length of the generated text.
- `top_p`: Controls nucleus sampling, affecting the randomness of the output.
- `top_k`: Only sample from the top K options for each subsequent token.
- `tools`: An array of tool or function definitions for the model to call.
- `tool_choice`: An object specifying the tool to call.

Example configuration with options and prompts:

```yaml title="promptfooconfig.yaml"
providers:
  - id: anthropic:messages:claude-3-5-sonnet-20241022
    config:
      temperature: 0.0
      max_tokens: 512
prompts:
  - file://prompt.json
```

### Tool Use

The Anthropic provider supports tool use (or function calling). Here's an example configuration for defining tools:

```yaml title="promptfooconfig.yaml"
providers:
  - id: anthropic:messages:claude-3-5-sonnet-20241022
    config:
      tools:
        - name: get_weather
          description: Get the current weather in a given location
          input_schema:
            type: object
            properties:
              location:
                type: string
                description: The city and state, e.g., San Francisco, CA
              unit:
                type: string
                enum:
                  - celsius
                  - fahrenheit
            required:
              - location
```

See the [Anthropic Tool Use Guide](https://docs.anthropic.com/en/docs/tool-use) for more information on how to define tools and the tool use example [here](https://github.com/promptfoo/promptfoo/tree/main/examples/tool-use).

### Images / Vision

You can include images in the prompts in Claude 3 models.

See the [Claude vision example](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-vision).

One important note: The Claude API only supports base64 representations of images.
This is different from how OpenAI's vision works, as it supports grabbing images from a URL. As a result, if you are trying to compare Claude 3 and OpenAI vision capabilities, you will need to have separate prompts for each.

See the [OpenAI vision example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-vision) to understand the differences.

### Prompt Caching

Claude supports prompt caching to optimize API usage and reduce costs for repetitive tasks. This feature caches portions of your prompts to avoid reprocessing identical content in subsequent requests.

Supported on all Claude 3 and 3.5 models. Basic example:

```yaml title="promptfooconfig.yaml"
providers:
  - id: anthropic:messages:claude-3-5-sonnet-20241022
prompts:
  - file://prompts.yaml
```

```yaml title="prompts.yaml"
- role: system
  content:
    - type: text
      text: 'System message'
      cache_control:
        type: ephemeral
    - type: text
      text: '{{context}}'
      cache_control:
        type: ephemeral
- role: user
  content: '{{question}}'
```

Common use cases for caching:

- System messages and instructions
- Tool/function definitions
- Large context documents
- Frequently used images

See [Anthropic's Prompt Caching Guide](https://docs.anthropic.com/claude/docs/prompt-caching) for more details on requirements, pricing, and best practices.

### Citations

Claude can provide detailed citations when answering questions about documents. Basic example:

```yaml title="promptfooconfig.yaml"
providers:
  - id: anthropic:messages:claude-3-5-sonnet-20241022
prompts:
  - file://prompts.yaml
```

```yaml title="prompts.yaml"
- role: user
  content:
    - type: document
      source:
        type: text
        media_type: text/plain
        data: 'Your document text here'
      citations:
        enabled: true
    - type: text
      text: 'Your question here'
```

See [Anthropic's Citations Guide](https://docs.anthropic.com/en/docs/build-with-claude/citations) for more details.

## Model-Graded Tests

[Model-graded assertions](/docs/configuration/expected-outputs/model-graded/) such as `factuality` or `llm-rubric` will automatically use Anthropic as the grading provider if `ANTHROPIC_API_KEY` is set and `OPENAI_API_KEY` is not set.

If both API keys are present, OpenAI will be used by default. You can explicitly override the grading provider in your configuration.

Because of how model-graded evals are implemented, **the model must support chat-formatted prompts** (except for embedding or classification models).

You can override the grading provider in several ways:

1. For all test cases using `defaultTest`:

```yaml title=promptfooconfig.yaml
defaultTest:
  options:
    provider: anthropic:messages:claude-3-5-sonnet-20241022
```

2. For individual assertions:

```yaml
assert:
  - type: llm-rubric
    value: Do not mention that you are an AI or chat assistant
    provider:
      id: anthropic:messages:claude-3-5-sonnet-20241022
      config:
        temperature: 0.0
```

3. For specific tests:

```yaml
tests:
  - vars:
      question: What is the capital of France?
    options:
      provider:
        id: anthropic:messages:claude-3-5-sonnet-20241022
    assert:
      - type: llm-rubric
        value: Answer should mention Paris
```

### Additional Capabilities

- **Caching**: Promptfoo caches previous LLM requests by default.
- **Token Usage Tracking**: Provides detailed information on the number of tokens used in each request, aiding in usage monitoring and optimization.
- **Cost Calculation**: Calculates the cost of each request based on the number of tokens generated and the specific model used.

## See Also

### Examples

We provide several example implementations demonstrating Claude's capabilities:

#### Core Features

- [Tool Use Example](https://github.com/promptfoo/promptfoo/tree/main/examples/tool-use) - Shows how to use Claude's tool calling capabilities
- [Vision Example](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-vision) - Demonstrates using Claude's vision capabilities

#### Model Comparisons & Evaluations

- [Claude vs GPT](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-vs-gpt) - Compares Claude with GPT-4 on various tasks
- [Claude vs GPT Image Analysis](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-vs-gpt-image) - Compares Claude's and GPT's image analysis capabilities

#### Cloud Platform Integrations

- [AWS Bedrock](https://github.com/promptfoo/promptfoo/tree/main/examples/amazon-bedrock) - Using Claude through AWS Bedrock
- [Google Vertex AI](https://github.com/promptfoo/promptfoo/tree/main/examples/google-vertex) - Using Claude through Google Vertex AI

For more examples and general usage patterns, visit our [examples directory](https://github.com/promptfoo/promptfoo/tree/main/examples) on GitHub.
