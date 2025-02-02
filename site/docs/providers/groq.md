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

```yaml
providers:
  - id: groq:llama-3.3-70b-versatile
    config:
      temperature: 0.7
      max_completion_tokens: 100
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

Key configuration options:

- `temperature`: Controls randomness in output (0.0 to 1.0)
- `max_completion_tokens`: Maximum number of tokens to generate in the response
- `tools`: Defines functions the model can use (for tool use/function calling)
- `tool_choice`: Specifies how the model should choose tools ('auto', 'none', or a specific tool)

## Supported Models

GroqCloud currently supports the following models:

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

Deprecated models are models that are no longer supported or will be phased out in future releases.

## Using the Provider

Specify the Groq provider in your test configuration:

```yaml
providers:
  - id: groq:llama-3.3-70b-versatile
    config:
      temperature: 0.5
      max_completion_tokens: 150

prompts:
  - Tell me about the weather in {{city}} in the default unit for the location.

tests:
  - vars:
      city: Boston
  - vars:
      city: New York
```

## Tool Use (Function Calling)

Groq supports tool use, allowing models to call predefined functions. Configure tools in your provider settings:

```yaml
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

For complex tools or ambiguous queries, use the `llama-3.3-70b-versatile` model.

## Additional Capabilities

- **Caching**: Groq provider caches previous LLM requests by default for improved performance.
- **Token Usage Tracking**: Provides detailed information on token usage for each request.
- **Cost Calculation**: Automatically calculates the cost of each request based on token usage and the specific model used.

## Vision

Groq API offers fast inference and low latency for multi-modal models with vision capabilities. With promptfoo's Groq Provider, you can integrate vision models to analyze and interpret visual data from images.

### Supported Vision Models

Promptfoo supports the following vision models available on GroqCloud:

- **llama-3.2-90b-vision-preview** – A powerful multimodal model from Meta that processes both text and image inputs. (Preview; Context Window: 128k tokens, Max Output Tokens: 8,192)
- **llama-3.2-11b-vision-preview** – A multimodal model from Meta that supports multilingual, multi-turn conversations, tool use, and JSON mode. (Preview; Context Window: 128k tokens, Max Output Tokens: 8,192)

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

Reasoning models excel at complex problem-solving tasks that require step-by-step analysis, logical deduction, and structured thinking with solution validation. With GroqCloud's inference speed, these models deliver near-instant reasoning capabilities that are critical for real-time applications.

### Why Speed Matters for Reasoning

Reasoning models operate by generating explicit chains of reasoning tokens that form the basis of complex decision-making. Each step builds on previous results, so low latency is crucial—reducing delays can transform minutes of reasoning into seconds, which is essential for interactive and real-time applications.

### Supported Reasoning Model

- **deepseek-r1-distill-llama-70b** – DeepSeek R1 (Distil-Llama 70B) is currently the supported model for reasoning tasks on GroqCloud.

### Reasoning Format

The Groq API supports explicit reasoning formats via the `reasoning_format` parameter, giving you fine-grained control over how the model presents its reasoning process. This is particularly valuable for obtaining valid JSON outputs, debugging, and understanding the model's decision-making process.

**Options for `reasoning_format`:**

- **parsed** – Separates reasoning into a dedicated field, keeping the final output concise.
- **raw** – Includes reasoning within think tags in the content.
- **hidden** – Returns only the final answer for maximum efficiency.

**Note:** The format defaults to `raw` or `parsed` when JSON mode or tool use is enabled, as those modes do not support `raw`. If `reasoning_format` is explicitly set to `raw` while JSON mode or tool use is enabled, a 400 error will be returned.

### Recommended Configuration Parameters for Reasoning

- **temperature:** Default is 0.6. Recommended range is 0.5–0.7 to produce consistent yet creative responses.
- **max_completion_tokens:** Default is 1024. Increase this value for detailed, step-by-step solutions.
- **top_p:** Typically set to around 0.95 to balance diversity and determinism.
- **stream:** Set to `true` for interactive or streaming reasoning tasks.
- **seed:** Set an integer value for reproducible results, especially for benchmarking.
- **reasoning_format:** Choose from `parsed`, `raw`, or `hidden` as described above.

### Quick Start Example

Below is a sample curl command to use a reasoning model with tool use enabled:

```sh
curl https://api.groq.com/openai/v1/chat/completions -s \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -d '{
    "model": "deepseek-r1-distill-llama-70b",
    "messages": [
        {
            "role": "user",
            "content": "What is the weather like in Paris today?"
        }
    ],
    "tools": [
        {
            "type": "function",
            "function": {
                "name": "get_weather",
                "description": "Get current temperature for a given location.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "location": {
                            "type": "string",
                            "description": "City and country, e.g., Bogotá, Colombia"
                        }
                    },
                    "required": ["location"],
                    "additionalProperties": false
                },
                "strict": true
            }
        }
    ],
    "reasoning_format": "parsed",
    "temperature": 0.6,
    "max_completion_tokens": 1024,
    "top_p": 0.95,
    "stream": false
  }'
```

### Optimizing Performance

- **Temperature & Token Management:** Use temperatures between 0.5 and 0.7 for consistent reasoning. Increase `max_completion_tokens` for more complex tasks.
- **Prompt Engineering:** Include detailed instructions in the user message. Structure prompts to request explicit intermediate steps and validation when necessary.
- **Tool Use:** Combine reasoning with tool calls for enhanced contextual decision-making when applicable.
