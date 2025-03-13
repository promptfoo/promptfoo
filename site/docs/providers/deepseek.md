# DeepSeek

[DeepSeek](https://platform.deepseek.com/) provides an OpenAI-compatible API for their language models, with specialized models for both general chat and advanced reasoning tasks. The DeepSeek provider is compatible with all the options provided by the [OpenAI provider](/docs/providers/openai/).

## Setup

1. Get an API key from the [DeepSeek Platform](https://platform.deepseek.com/)
2. Set `DEEPSEEK_API_KEY` environment variable or specify `apiKey` in your config

## Configuration

Basic configuration example:

```yaml
providers:
  - id: deepseek:deepseek-chat
    config:
      temperature: 0.7
      max_tokens: 4000
      apiKey: YOUR_DEEPSEEK_API_KEY

  - id: deepseek:deepseek-reasoner # DeepSeek-R1 model
    config:
      temperature: 0.0
      max_tokens: 8000
```

### Configuration Options

- `temperature`
- `max_tokens`
- `top_p`, `presence_penalty`, `frequency_penalty`
- `stream`
- `showThinking` - Control whether reasoning content is included in the output (default: `true`, applies to deepseek-reasoner model)

## Available Models

### deepseek-chat (DeepSeek-V3)

- General purpose model for conversations and content
- 64K context window, 8K output tokens
- Input: $0.014/1M (cache), $0.14/1M (no cache)
- Output: $0.28/1M

### deepseek-reasoner (DeepSeek-R1)

- Specialized for reasoning and problem-solving
- 64K context, 32K reasoning tokens, 8K output tokens
- Input: $0.14/1M (cache), $0.55/1M (no cache)
- Output: $2.19/1M
- Supports showing or hiding reasoning content through the `showThinking` parameter

## Example Usage

Here's an example comparing DeepSeek with OpenAI on reasoning tasks:

```yaml
providers:
  - id: deepseek:deepseek-reasoner
    config:
      temperature: 0.0
      showThinking: true # Include reasoning content in output (default)
  - id: openai:o-1
    config:
      temperature: 0.0

prompts:
  - 'Solve this step by step: {{math_problem}}'

tests:
  - vars:
      math_problem: 'What is the derivative of x^3 + 2x with respect to x?'
```

### Controlling Reasoning Output

The DeepSeek-R1 model (deepseek-reasoner) includes detailed reasoning steps in its output. You can control whether this reasoning content is shown using the `showThinking` parameter:

```yaml
providers:
  - id: deepseek:deepseek-reasoner
    config:
      showThinking: false # Hide reasoning content from output
```

When `showThinking` is set to `true` (default), the output includes both reasoning and the final answer in a standardized format:

```
Thinking: <reasoning content>

<final answer>
```

When set to `false`, only the final answer is included in the output. This is useful when you want better reasoning quality but don't want to expose the reasoning process to end users or in your assertions.

See our [complete example](https://github.com/promptfoo/promptfoo/tree/main/examples/deepseek-r1-vs-openai-o1) that benchmarks it against OpenAI's o1 model on the MMLU reasoning tasks.

## API Details

- Base URL: `https://api.deepseek.com/v1`
- OpenAI-compatible API format
- Full [API documentation](https://platform.deepseek.com/docs)
