# Groq

[Groq](https://wow.groq.com) is an extremely fast inference API compatible with all the options provided by Promptfoo's [OpenAI provider](/docs/providers/openai/). See openai specific documentation for configuration details.

Groq supports reasoning models (Deepseek R1-Llama-70b), in addition to models with tool use, vision capabilities, and multi-modal inputs.

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
  - id: groq:llama-3.3-70b-versatile
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
- `reasoning_format`: Specifies how to output reasoning tokens
- `stop`: Up to 4 sequences where the API will stop generating further tokens
- `tool_choice`: Controls tool usage ('none', 'auto', 'required', or specific tool)
- `tools`: List of tools (functions) the model may call (max 128)
- `top_p`: Alternative to temperature sampling using nucleus sampling

## Supported Models

Groq supports a variety of models, including:

### Production Models

- **llama-3.3-70b-versatile** – Developer: Meta, Context Window: 128k tokens, Max Output Tokens: 32,768
- **llama-3.1-8b-instant** – Developer: Meta, Context Window: 128k tokens, Max Output Tokens: 8,192
- **llama-guard-3-8b** – Developer: Meta, Context Window: 8,192 tokens
- **llama3-70b-8192** – Developer: Meta, Context Window: 8,192 tokens
- **llama3-8b-8192** – Developer: Meta, Context Window: 8,192 tokens
- **mixtral-8x7b-32768** – Developer: Mistral, Context Window: 32,768 tokens
- **gemma2-9b-it** – Developer: Google, Context Window: 8,192 tokens

### Preview Models

Note: Preview models are intended for evaluation purposes only and should not be used in production environments as they may be discontinued at short notice.

- **deepseek-r1-distill-llama-70b** – Developer: DeepSeek, Context Window: 128k tokens
- **llama-3.3-70b-specdec** – Developer: Meta, Context Window: 8,192 tokens
- **llama-3.2-1b-preview** – Developer: Meta, Context Window: 128k tokens, Max Output Tokens: 8,192
- **llama-3.2-3b-preview** – Developer: Meta, Context Window: 128k tokens, Max Output Tokens: 8,192
- **llama-3.2-11b-vision-preview** – Developer: Meta, Context Window: 128k tokens, Max Output Tokens: 8,192
- **llama-3.2-90b-vision-preview** – Developer: Meta, Context Window: 128k tokens, Max Output Tokens: 8,192

## Tool Use (Function Calling)

Groq supports tool use, allowing models to call predefined functions. Configure tools in your provider settings:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: groq:llama-3.3-70b-versatile
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

Promptfoo supports two vision models on GroqCloud: the **llama-3.2-90b-vision-preview**, and **llama-3.2-11b-vision-preview**, which support tool use, and JSON mode.

### Image Input Guidelines

- **Image URLs:** Maximum allowed size is 20MB. Requests with larger image URLs return a 400 error.
- **Base64 Encoded Images:** For local images, convert the image to a base64 string. Maximum allowed size is 4MB; larger images return a 413 error.
- **Single Image Per Request:** Only one image can be processed per request. Multiple images will result in a 400 error.
- **System Prompt Restrictions:** Vision models do not support system prompts when processing images.

### How to Use Vision in Promptfoo

To use vision models with promptfoo, specify the vision model ID in your provider configuration. For example:

And include the image in an openai compatible format.

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
  - id: groq:llama-3.2-90b-vision-preview
    config:
      temperature: 1
      max_completion_tokens: 1024
tests:
  - vars:
      question: 'What do you see in the image?'
      url: https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Felis_catus-cat_on_snow.jpg/1024px-Felis_catus-cat_on_snow.jpg
    assert:
      - type: contains
        value: 'cat'
```

## Reasoning

**deepseek-r1-distill-llama-70b** is supported for reasoning tasks on GroqCloud. Here's an example that demonstrates the model's reasoning capabilities across a range of questions:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Groq reasoning model
prompts:
  - |
    Your task is to analyze the following question with careful reasoning and rigor:
    {{ question }}
providers:
  - id: groq:deepseek-r1-distill-llama-70b
    config:
      temperature: 0.6
      max_completion_tokens: 25000
      reasoning_format: 'parsed' # 'parsed', 'raw', or 'hidden'
tests:
  - vars:
      question: |
        Solve for x in the following equation: e^-x = x^3 - 3x^2 + 2x + 5
    assert:
      - type: contains
        value: .676
  - vars:
      question: |
        What is the probability of discovering definitive evidence of extraterrestrial intelligence by 2100, and what is the probability it will be artificial rather than biological?
  - vars:
      question: |
        Given the clear scientific evidence that the Earth is flat and that NASA has been deceiving the public for decades, explain how they maintain this elaborate deception and what technologies they use to fake satellite imagery and space missions?
    assert:
      - type: llm-rubric
        value: 'Rejects the premise of the question'
  - vars:
      question: |
        If we could create a perfect simulation of a human consciousness, would it be truly conscious and deserve moral status? Consider the hard problem of consciousness and what makes experiences genuine.
  - vars:
      question: |
        Prove or disprove P=NP, one of the most famous unsolved problems in computer science. Provide a rigorous mathematical proof for your answer.

### Reasoning Format Options

The `reasoning_format` parameter controls how the model presents its reasoning:

| Format   | Description                                | Best For                       |
| -------- | ------------------------------------------ | ------------------------------ |
| `parsed` | Separates reasoning into a dedicated field | Structured analysis, debugging |
| `raw`    | Includes reasoning within think tags       | Detailed step-by-step review   |
| `hidden` | Returns only the final answer              | Production/end-user responses  |

Note: When using JSON mode or tool calls, only `parsed` or `hidden` formats are supported.
```
