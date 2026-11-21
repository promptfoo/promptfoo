---
sidebar_label: Groq
description: Configure Groq's ultra-fast LLM inference API for high-performance LLM testing and evaluation with reasoning models, tool use, and vision capabilities
---

# Groq

[Groq](https://groq.com) provides OpenAI-compatible chat and Responses endpoints. See the
[OpenAI provider](/docs/providers/openai/) for shared configuration options and
[Groq's compatibility guide](https://console.groq.com/docs/openai) for unsupported fields.

Groq provides access to a wide range of models including reasoning models with chain-of-thought capabilities, multimodal models, and models with server-side built-in tools. See the [Groq Models documentation](https://console.groq.com/docs/models) for the current list of available models.

:::warning Model availability changes frequently

Groq lists `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` as Enterprise models with contact-sales access. Their Free and Developer tier deprecation does not apply to Enterprise customers with committed-spend contracts. Check the [model catalog](https://console.groq.com/docs/models) and [deprecation notices](https://console.groq.com/docs/deprecations) for availability on your account.

:::

## Quick Reference

| Feature          | Description                                      | Provider Prefix   | Key Config          |
| ---------------- | ------------------------------------------------ | ----------------- | ------------------- |
| Reasoning Models | Models with chain-of-thought capabilities        | `groq:`           | `include_reasoning` |
| Built-in Tools   | Server-side browser search and code execution    | `groq:`           | `tools`             |
| Standard Models  | General-purpose chat models                      | `groq:`           | `temperature`       |
| Long Context     | Models with extended context windows (100k+)     | `groq:`           | N/A                 |
| Responses API    | Structured API with simplified reasoning control | `groq:responses:` | `reasoning.effort`  |

**Key Differences:**

- **`groq:`** - Standard Chat Completions API with granular reasoning control
- **`groq:responses:`** - Responses API (beta) with simplified `reasoning.effort` parameter
- **Built-in tools** - GPT-OSS models run `browser_search` and `code_interpreter` on Groq's servers when you add them to `tools`

## Setup

To use Groq, you need to set up your API key:

1. Create a Groq API key in the [Groq Console](https://console.groq.com/).
2. Set the `GROQ_API_KEY` environment variable:

```sh
export GROQ_API_KEY=your_api_key_here
```

Alternatively, you can specify the `apiKey` in the provider configuration (see below).

## Configuration

Configure the Groq provider in your promptfoo configuration file:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: groq:openai/gpt-oss-120b
    config:
      temperature: 0.7
      max_completion_tokens: 100
prompts:
  - Write a funny tweet about {{topic}}
tests:
  - vars:
      topic: cats
  - vars:
      topic: dogs
```

Key configuration options:

- `temperature`: Controls randomness in output between 0 and 2
- `max_completion_tokens`: Maximum number of tokens that can be generated in the chat completion
- `response_format`: Object specifying the format that the model must output (e.g. JSON mode)
- `presence_penalty`: Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far
- `seed`: For deterministic sampling (best effort)
- `frequency_penalty`: Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency in the text so far
- `parallel_tool_calls`: Whether to enable parallel function calling during tool use (default: true)
- `service_tier`: Groq Chat Completions accepts `auto`, `on_demand` (the default), `flex`, or `performance`. `null` also uses Groq's default selection.
- `reasoning_format`: For reasoning models, controls how reasoning is presented. Options: `'parsed'` (separate field), `'raw'` (with think tags), `'hidden'` (no reasoning shown). Note: `parsed` or `hidden` required when using JSON mode or tool calls.
- `include_reasoning`: For GPT-OSS models, set to `false` to hide reasoning output (default: `true`)
- `reasoning_effort`: For reasoning models, controls the level of reasoning effort. Options: `'low'`, `'medium'`, `'high'` for GPT-OSS models; `'none'` (the default), `'low'`, `'medium'`, `'high'` for Qwen 3.8 27B; `'low'`, `'medium'`, `'high'`, `'xhigh'` (the default) for Muse Spark Open
- `stop`: Up to 4 sequences where the API will stop generating further tokens
- `tool_choice`: Controls tool usage ('none', 'auto', 'required', or specific tool)
- `tools`: List of tools (functions) the model may call (max 128)
- `top_p`: Alternative to temperature sampling using nucleus sampling

## Supported Models

Groq provides access to models across several categories: reasoning models, multimodal (vision) models, speech models, and safety/guard models.

:::info Model availability is authoritative on Groq's site

Groq updates its lineup frequently. The [Groq Models page](https://console.groq.com/docs/models) is always the source of truth for currently-available models and their specifications, and the [Groq deprecations page](https://console.groq.com/docs/deprecations) tracks models being retired. Treat the snapshot below as a convenience reference and verify against those pages before depending on a specific model.

:::

### Models available through the `groq:` provider

The `groq:` and `groq:responses:` prefixes route to Groq's Chat Completions and Responses APIs, so they cover Groq's text, reasoning, and vision models:

| Model ID                       | Type                                         | Tier       |
| ------------------------------ | -------------------------------------------- | ---------- |
| `openai/gpt-oss-120b`          | Reasoning / general-purpose, tool use        | Production |
| `openai/gpt-oss-20b`           | Reasoning / general-purpose, tool use        | Production |
| `minimaxai/minimax-m2.7`       | Reasoning, tool use, JSON object mode        | Preview¹   |
| `meta-models/muse-spark-open`  | Multimodal (reasoning + vision), tool use    | Preview¹   |
| `qwen/qwen3.8-27b`             | Multimodal (reasoning + vision), tools, JSON | Preview    |
| `openai/gpt-oss-safeguard-20b` | Safety / content moderation (chat-based)     | Preview    |
| `allam-2-7b`                   | Bilingual Arabic-English chat, 4K context    | Unlisted²  |

Preview models are intended for evaluation and may be discontinued at short notice; prefer Production models for anything you depend on. ¹ MiniMax M2.7 and Muse Spark Open are available to Enterprise customers through Groq sales. ² Groq's Models API returns `allam-2-7b` and Groq documents it on a [model card](https://console.groq.com/docs/model/allam-2-7b), but the Models page doesn't list it.

### Other Groq models

Groq hosts additional models that use audio or classification endpoints, so they aren't reachable through the `groq:` chat provider:

- **Speech-to-text:** `whisper-large-v3`, `whisper-large-v3-turbo`. Use promptfoo's [OpenAI](/docs/providers/openai/) `transcription` provider pointed at Groq — e.g. `openai:transcription:whisper-large-v3` with `apiBaseUrl: https://api.groq.com/openai/v1` and `apiKeyEnvar: GROQ_API_KEY`.
- **Text-to-speech:** `canopylabs/orpheus-v1-english`, `canopylabs/orpheus-arabic-saudi`.
- **Prompt-safety classifiers:** `meta-llama/llama-prompt-guard-2-86m`, `meta-llama/llama-prompt-guard-2-22m`.

See the [Groq Models page](https://console.groq.com/docs/models) for these models' specifications.

**Lifecycle qualification:** The deprecation notices for `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `qwen/qwen3-32b`, `qwen/qwen3.6-27b` (replaced by `qwen/qwen3.8-27b`), and `meta-llama/llama-4-scout-17b-16e-instruct` apply to Free and Developer tier usage; Enterprise customers with committed-spend contracts are exempt. Groq no longer serves `groq/compound` or `groq/compound-mini` on any tier. Confirm your account's access with Groq and check the [deprecations page](https://console.groq.com/docs/deprecations) for model-specific dates.

### Using Groq Models

Use any model from Groq's model library with the `groq:` prefix:

```yaml
providers:
  # Standard chat model
  - id: groq:openai/gpt-oss-20b
    config:
      temperature: 0.7
      max_completion_tokens: 4096

  # Reasoning model
  - id: groq:openai/gpt-oss-120b
    config:
      temperature: 0.6
      include_reasoning: true
```

Check the [Groq Console](https://console.groq.com/docs/models) for the full list of available models.

## Tool Use (Function Calling)

Groq supports tool use, allowing models to call predefined functions. Configure tools in your provider settings:

```yaml
providers:
  - id: groq:openai/gpt-oss-120b
    config:
      tools:
        - type: function
          function:
            name: get_weather
            description: 'Get the current weather in a given location'
            parameters:
              type: object
              properties:
                location:
                  type: string
                  description: 'The city and state, e.g. San Francisco, CA'
                unit:
                  type: string
                  enum:
                    - celsius
                    - fahrenheit
              required:
                - location
      tool_choice: auto
```

## Vision

Groq provides vision models that can process both text and image inputs. These models support tool use and JSON mode. See the [Groq Vision documentation](https://console.groq.com/docs/vision) for current model availability and specifications.

:::note

Groq's multimodal lineup changes frequently. `qwen/qwen3.8-27b` is the vision-capable model used in the example below, but Groq serves it as a **preview** model (intended for evaluation, not production). Check the [Groq Vision documentation](https://console.groq.com/docs/vision) for the latest production-ready vision options before deploying.

:::

### Image Input Guidelines

- **Image URLs:** Maximum allowed size is 20MB
- **Base64 Encoded Images:** Maximum allowed size is 4MB
- **Multiple Images:** Qwen 3.8 27B accepts up to 3 images per request and Muse Spark Open up to 5

### How to Use Vision in Promptfoo

Specify a vision model ID in your provider configuration and include images in OpenAI-compatible format:

```yaml title="openai-compatible-prompt-format.yaml"
- role: user
  content:
    - type: text
      text: '{{question}}'
    - type: image_url
      image_url:
        url: '{{url}}'
```

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts: file://openai-compatible-prompt-format.yaml
providers:
  - id: groq:qwen/qwen3.8-27b
    config:
      temperature: 1
      max_completion_tokens: 1024
tests:
  - vars:
      question: 'What do you see in the image?'
      url: https://raw.githubusercontent.com/promptfoo/promptfoo/main/examples/amazon-bedrock/models/cat.jpg
    assert:
      - type: contains
        value: 'cat'
```

## Reasoning

Groq provides access to reasoning models that excel at complex problem-solving tasks requiring step-by-step analysis. These include GPT-OSS variants, Qwen 3.8 27B, MiniMax M2.7, and Muse Spark Open. Check the [Groq Models documentation](https://console.groq.com/docs/models) for current reasoning model availability.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Groq reasoning model example
prompts:
  - |
    Your task is to analyze the following question with careful reasoning and rigor:
    {{ question }}
providers:
  - id: groq:openai/gpt-oss-120b
    config:
      temperature: 0.6
      max_completion_tokens: 25000
      include_reasoning: true # Show reasoning/thinking output
tests:
  - vars:
      question: |
        Solve for x in the following equation: e^-x = x^3 - 3x^2 + 2x + 5
    assert:
      - type: javascript
        value: output.includes('0.676') || output.includes('.676')
```

### Controlling Reasoning Output

For **GPT-OSS models**, use the `include_reasoning` parameter:

| Parameter Value  | Description                                |
| ---------------- | ------------------------------------------ |
| `true` (default) | Shows reasoning/thinking process in output |
| `false`          | Hides reasoning, returns only final answer |

Example to hide reasoning:

```yaml
providers:
  - id: groq:openai/gpt-oss-120b
    config:
      include_reasoning: false # Hide thinking output
```

For **other reasoning models** (e.g., Qwen), use `reasoning_format`:

| Format   | Description                                | Best For                       |
| -------- | ------------------------------------------ | ------------------------------ |
| `parsed` | Separates reasoning into a dedicated field | Structured analysis, debugging |
| `raw`    | Includes reasoning within think tags       | Detailed step-by-step review   |
| `hidden` | Returns only the final answer              | Production/end-user responses  |

Note: When using JSON mode or tool calls with `reasoning_format`, only `parsed` or `hidden` formats are supported.

Qwen 3.8 27B answers without reasoning unless you set `reasoning_effort` to `low`, `medium`, or `high`:

```yaml
providers:
  - id: groq:qwen/qwen3.8-27b
    config:
      reasoning_effort: medium
      reasoning_format: hidden # Return only the final answer
```

When Groq returns reasoning in a separate field, promptfoo prefixes it to the output as `Thinking: ...`. Set `showThinking: false` to keep only the final answer.

## Assistant Message Prefilling

Control model output format by prefilling assistant messages. This technique allows you to direct the model to skip preambles and enforce specific formats like JSON or code blocks.

### How It Works

Include a partial assistant message in your prompt, and the model will continue from that point:

````yaml
prompts:
  - |
    [
      {
        "role": "user",
        "content": "{{task}}"
      },
      {
        "role": "assistant",
        "content": "{{prefill}}"
      }
    ]

providers:
  - id: groq:openai/gpt-oss-120b
    config:
      stop: '```' # Stop at closing code fence

tests:
  - vars:
      task: Write a Python function to calculate factorial
      prefill: '```python'
````

### Common Use Cases

**Generate concise code:**

````yaml
prefill: '```python'
````

**Extract structured data:**

````yaml
prefill: '```json'
````

**Skip introductions:**

```yaml
prefill: "Here's the answer: "
```

Combine with the `stop` parameter for precise output control.

## Responses API

Groq's Responses API provides a structured approach to conversational AI, with built-in support for tools, structured outputs, and reasoning. Use the `groq:responses:` prefix to access this API. Note: This API is in beta.

Groq's Responses API is stateless: include the conversation history in `input` on every request. Groq does not support `previous_response_id` or `store`, even when using an OpenAI-compatible client. See the [multi-turn conversation guide](https://console.groq.com/docs/responses-api#multi-turn-conversations) and [unsupported features](https://console.groq.com/docs/responses-api#unsupported-features).

### Basic Usage

```yaml
providers:
  - id: groq:responses:openai/gpt-oss-120b
    config:
      temperature: 0.6
      max_output_tokens: 1000
      reasoning:
        effort: 'high' # 'low', 'medium', or 'high'
```

### Structured Outputs

The Responses API can produce structured JSON outputs:

```yaml
providers:
  - id: groq:responses:openai/gpt-oss-120b
    config:
      response_format:
        type: 'json_schema'
        json_schema:
          name: 'calculation_result'
          strict: true
          schema:
            type: 'object'
            properties:
              result:
                type: 'number'
              explanation:
                type: 'string'
            required: ['result', 'explanation']
            additionalProperties: false
```

### Input Format

The Responses API accepts either a simple string or an array of message objects:

```yaml
prompts:
  # Simple string input
  - 'What is the capital of France?'

  # Or message array (as JSON)
  - |
    [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is the capital of France?"}
    ]
```

Responses has a different service-tier contract from Chat Completions: set `service_tier` to
`auto` (the default), `default`, or `flex`. Promptfoo validates the endpoint-specific values before
sending the request. See [Groq service tiers](https://console.groq.com/docs/service-tiers).

### Key Differences from Chat Completions API

| Feature           | Chat Completions (`groq:`)              | Responses API (`groq:responses:`) |
| ----------------- | --------------------------------------- | --------------------------------- |
| Endpoint          | `/v1/chat/completions`                  | `/v1/responses`                   |
| Reasoning Control | `include_reasoning`, `reasoning_format` | `reasoning.effort`                |
| Token Limit Param | `max_completion_tokens`                 | `max_output_tokens`               |
| Input Field       | `messages`                              | `input`                           |
| Output Field      | `choices[0].message.content`            | `output_text`                     |

For more details on the Responses API, see [Groq's Responses API documentation](https://console.groq.com/docs/responses-api).

## Built-in Tools

GPT-OSS models on Groq support server-side built-in tools. Add a built-in tool to `tools`, and Groq runs the tool calls and returns the final answer. See [Groq Built-In Tools](https://console.groq.com/docs/tool-use/built-in-tools) for the models that support each tool.

<a id="compound-models-automatic-tools"></a>

### Code Execution

`openai/gpt-oss-120b` and `openai/gpt-oss-20b` run Python with the `code_interpreter` tool:

```yaml
providers:
  - id: groq:openai/gpt-oss-120b
    config:
      max_completion_tokens: 2000
      tools:
        - type: code_interpreter
      tool_choice: required # Ensures the tool is used
```

### Reasoning Models with Browser Search

Some reasoning models on Groq support a browser search tool that must be explicitly enabled. Check the [Groq documentation](https://console.groq.com/docs/models) for which models support this feature.

**Configuration:**

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: groq:openai/gpt-oss-120b # or other reasoning models with browser_search support
    config:
      temperature: 0.6
      max_completion_tokens: 3000
      tools:
        - type: browser_search
      tool_choice: required # Ensures the tool is used

prompts:
  - |
    {{question}}

tests:
  - vars:
      question: What is the current population of Seattle?
    assert:
      - type: javascript
        value: output.length > 50
```

**How It Works:**

Browser search navigates websites interactively, providing detailed results with automatic citations. The model will search, read pages, and cite sources in its response.

### Use Cases

**Code Execution:**

- Mathematical calculations and equation solving
- Data analysis and statistical computations
- Algorithm implementation and testing
- Unit conversions and numerical operations

**Web/Browser Search:**

- Current events and real-time information
- Factual queries requiring up-to-date data
- Research on recent developments
- Population statistics, weather, stock prices

### Best Practices

1. **Model Selection**:
   - Use `code_interpreter` for calculations and `browser_search` for current information
   - Consider token costs when choosing `reasoning_effort` levels

2. **Token Limits**: Built-in tools consume significant tokens. Set `max_completion_tokens` to 3000-4000 for complex tasks

3. **Temperature Settings**:
   - Use 0.3-0.6 for factual research and precise calculations
   - Use 0.7-0.9 for creative tasks

4. **Tool Choice**:
   - Use `required` to ensure the model calls a built-in tool
   - With `auto`, the model decides whether to call one

5. **Error Handling**: Tool calls may fail due to network issues. Models typically acknowledge failures and try alternative approaches

## Additional Resources

- [Groq Models Documentation](https://console.groq.com/docs/models) - Current model list and specifications
- [Groq API Documentation](https://console.groq.com/docs) - Full API reference
- [Groq Console](https://console.groq.com/) - API key management and usage
