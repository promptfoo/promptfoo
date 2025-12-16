---
sidebar_label: Groq
description: Configure Groq's ultra-fast LLM inference API for high-performance LLM testing and evaluation with reasoning models, tool use, and vision capabilities
---

# Groq

[Groq](https://groq.com) is an extremely fast inference API compatible with all the options provided by Promptfoo's [OpenAI provider](/docs/providers/openai/). See openai specific documentation for configuration details.

Groq provides access to a wide range of models including reasoning models with chain-of-thought capabilities, compound models with built-in tools, and standard chat models. See the [Groq Models documentation](https://console.groq.com/docs/models) for the current list of available models.

## Quick Reference

| Feature          | Description                                      | Provider Prefix   | Key Config          |
| ---------------- | ------------------------------------------------ | ----------------- | ------------------- |
| Reasoning Models | Models with chain-of-thought capabilities        | `groq:`           | `include_reasoning` |
| Compound Models  | Built-in code execution, web search, browsing    | `groq:`           | `compound_custom`   |
| Standard Models  | General-purpose chat models                      | `groq:`           | `temperature`       |
| Long Context     | Models with extended context windows (100k+)     | `groq:`           | N/A                 |
| Responses API    | Structured API with simplified reasoning control | `groq:responses:` | `reasoning.effort`  |

**Key Differences:**

- **`groq:`** - Standard Chat Completions API with granular reasoning control
- **`groq:responses:`** - Responses API (beta) with simplified `reasoning.effort` parameter
- **Compound models** - Have automatic code execution, web search, and visit website tools
- **Reasoning models** - Support `browser_search` tool via manual configuration
- **Explicit control** - Use `compound_custom.tools.enabled_tools` to control which built-in tools are enabled

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
- `reasoning_format`: For reasoning models, controls how reasoning is presented. Options: `'parsed'` (separate field), `'raw'` (with think tags), `'hidden'` (no reasoning shown). Note: `parsed` or `hidden` required when using JSON mode or tool calls.
- `include_reasoning`: For GPT-OSS models, set to `false` to hide reasoning output (default: `true`)
- `reasoning_effort`: For reasoning models, controls the level of reasoning effort. Options: `'low'`, `'medium'`, `'high'` for GPT-OSS models; `'none'`, `'default'` for Qwen models
- `stop`: Up to 4 sequences where the API will stop generating further tokens
- `tool_choice`: Controls tool usage ('none', 'auto', 'required', or specific tool)
- `tools`: List of tools (functions) the model may call (max 128)
- `top_p`: Alternative to temperature sampling using nucleus sampling

## Supported Models

Groq provides access to models across several categories. For the current list of available models and their specifications, see the [Groq Models documentation](https://console.groq.com/docs/models).

### Model Categories

- **Reasoning Models** - Models with chain-of-thought capabilities (e.g., GPT-OSS, Qwen, DeepSeek R1 variants)
- **Compound Models** - Models with built-in tools for code execution and web search (`groq/compound`)
- **Standard Chat Models** - General-purpose models (e.g., Llama variants)
- **Long Context Models** - Models with extended context windows (100k+ tokens)
- **Vision Models** - Multi-modal models that can process images
- **Speech Models** - Whisper models for speech-to-text

### Using Groq Models

Use any model from Groq's model library with the `groq:` prefix:

```yaml
providers:
  # Standard chat model
  - id: groq:llama-3.3-70b-versatile
    config:
      temperature: 0.7
      max_completion_tokens: 4096

  # Reasoning model
  - id: groq:deepseek-r1-distill-llama-70b
    config:
      temperature: 0.6
      include_reasoning: true
```

Check the [Groq Console](https://console.groq.com/docs/models) for the full list of available models.

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

Groq provides vision models that can process both text and image inputs. These models support tool use and JSON mode. See the [Groq Vision documentation](https://console.groq.com/docs/vision) for current model availability and specifications.

### Image Input Guidelines

- **Image URLs:** Maximum allowed size is 20MB
- **Base64 Encoded Images:** Maximum allowed size is 4MB
- **Multiple Images:** Check model documentation for image limits per request

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
  - id: groq:meta-llama/llama-4-scout-17b-16e-instruct
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

Groq provides access to reasoning models that excel at complex problem-solving tasks requiring step-by-step analysis. These include GPT-OSS variants, Qwen models, and DeepSeek R1 variants. Check the [Groq Models documentation](https://console.groq.com/docs/models) for current reasoning model availability.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Groq reasoning model example
prompts:
  - |
    Your task is to analyze the following question with careful reasoning and rigor:
    {{ question }}
providers:
  - id: groq:deepseek-r1-distill-llama-70b
    config:
      temperature: 0.6
      max_completion_tokens: 25000
      reasoning_format: parsed # 'parsed', 'raw', or 'hidden'
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
  - id: groq:deepseek-r1-distill-llama-70b
    config:
      reasoning_format: hidden # Hide thinking output
```

For **other reasoning models** (e.g., Qwen, DeepSeek), use `reasoning_format`:

| Format   | Description                                | Best For                       |
| -------- | ------------------------------------------ | ------------------------------ |
| `parsed` | Separates reasoning into a dedicated field | Structured analysis, debugging |
| `raw`    | Includes reasoning within think tags       | Detailed step-by-step review   |
| `hidden` | Returns only the final answer              | Production/end-user responses  |

Note: When using JSON mode or tool calls with `reasoning_format`, only `parsed` or `hidden` formats are supported.

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
  - id: groq:llama-3.3-70b-versatile
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

Groq's Responses API provides a structured approach to conversational AI, with built-in support for tools, structured outputs, and reasoning. Use the `groq:responses:` prefix to access this API. Note: This API is currently in beta.

### Basic Usage

```yaml
providers:
  - id: groq:responses:llama-3.3-70b-versatile
    config:
      temperature: 0.6
      max_output_tokens: 1000
      reasoning:
        effort: 'high' # 'low', 'medium', or 'high'
```

### Structured Outputs

The Responses API makes it easy to get structured JSON outputs:

```yaml
providers:
  - id: groq:responses:llama-3.3-70b-versatile
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

Groq offers models with built-in tools: compound models with automatic tool usage, and reasoning models with manually configured tools like browser search.

### Compound Models (Automatic Tools)

Groq's compound models combine language models with pre-enabled built-in tools that activate automatically based on the task. Check the [Groq documentation](https://console.groq.com/docs/models) for current compound model availability.

**Built-in Capabilities (No Configuration Needed):**

- **Code Execution** - Python code execution for calculations and algorithms
- **Web Search** - Real-time web searches for current information
- **Visit Website** - Automatic webpage fetching when URLs are in the message

**Basic Configuration:**

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: groq:groq/compound
    config:
      temperature: 0.7
      max_completion_tokens: 3000

prompts:
  - |
    {{task}}

tests:
  # Code execution
  - vars:
      task: Calculate the first 10 Fibonacci numbers using code
    assert:
      - type: javascript
        value: output.length > 50

  # Web search
  - vars:
      task: What is the current population of Seattle?
    assert:
      - type: javascript
        value: output.length > 50
```

**Example Outputs:**

Code execution:

```
Thinking:
To calculate the first 10 Fibonacci numbers, I will use a Python code snippet.

<tool>
python
def fibonacci(n):
    fib = [0, 1]
    for i in range(2, n):
        fib.append(fib[i-1] + fib[i-2])
    return fib[:n]

print(fibonacci(10))
</tool>

<output>[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]</output>
```

Web search:

```
<tool>search(current population of Seattle)</tool>

<output>
Title: Seattle Population 2025
URL: https://example.com/seattle
Content: The current metro area population of Seattle in 2025 is 816,600...
</output>
```

**Web Search Settings (Optional):**

You can customize web search behavior:

```yaml
providers:
  - id: groq:groq/compound
    config:
      search_settings:
        exclude_domains: ['example.com'] # Exclude specific domains
        include_domains: ['*.edu'] # Restrict to specific domains
        country: 'us' # Boost results from country
```

**Explicit Tool Control:**

By default, Compound models automatically select which tools to use. You can explicitly control which tools are available using `compound_custom`:

```yaml
providers:
  - id: groq:groq/compound
    config:
      compound_custom:
        tools:
          enabled_tools:
            - code_interpreter # Python code execution
            - web_search # Web searches
            - visit_website # URL fetching
```

This allows you to:

- Restrict which tools are available for a request
- Control costs by limiting tool usage
- Ensure only specific capabilities are used

**Available Tool Identifiers:**

- `code_interpreter` - Python code execution
- `web_search` - Real-time web searches
- `visit_website` - Webpage fetching
- `browser_automation` - Interactive browser control (requires latest version)
- `wolfram_alpha` - Computational knowledge (requires API key)

### Reasoning Models with Browser Search

Some reasoning models on Groq support a browser search tool that must be explicitly enabled. Check the [Groq documentation](https://console.groq.com/docs/models) for which models support this feature.

**Configuration:**

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: groq:compound-beta # or other models with browser_search support
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

**Key Differences from Web Search:**

- **Browser Search** (Reasoning models): Mimics human browsing, navigates websites interactively, provides detailed content
- **Web Search** (Compound models): Performs single search, retrieves text snippets, faster for simple queries

### Use Cases

**Code Execution (Compound Models):**

- Mathematical calculations and equation solving
- Data analysis and statistical computations
- Algorithm implementation and testing
- Unit conversions and numerical operations

**Web/Browser Search:**

- Current events and real-time information
- Factual queries requiring up-to-date data
- Research on recent developments
- Population statistics, weather, stock prices

**Combined Capabilities (Compound Models):**

- Financial analysis requiring both research and calculations
- Scientific research with computational verification
- Data-driven reports combining current information and analysis

### Best Practices

1. **Model Selection**:
   - Use compound models for tasks combining code and research
   - Use reasoning models with browser search for detailed web research
   - Consider token costs when choosing `reasoning_effort` levels

2. **Token Limits**: Built-in tools consume significant tokens. Set `max_completion_tokens` to 3000-4000 for complex tasks

3. **Temperature Settings**:
   - Use 0.3-0.6 for factual research and precise calculations
   - Use 0.7-0.9 for creative tasks

4. **Tool Choice**:
   - Use `required` to ensure browser search is always used
   - Compound models handle tool selection automatically

5. **Error Handling**: Tool calls may fail due to network issues. Models typically acknowledge failures and try alternative approaches

## Additional Resources

- [Groq Models Documentation](https://console.groq.com/docs/models) - Current model list and specifications
- [Groq API Documentation](https://console.groq.com/docs) - Full API reference
- [Groq Console](https://console.groq.com/) - API key management and usage
