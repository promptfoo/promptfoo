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

## Example Usage

Here's an example comparing DeepSeek with OpenAI on reasoning tasks:

```yaml
providers:
  - id: deepseek:deepseek-reasoner
    config:
      temperature: 0.0
  - id: openai:o-1
    config:
      temperature: 0.0

prompts:
  - 'Solve this step by step: {{math_problem}}'

tests:
  - vars:
      math_problem: 'What is the derivative of x^3 + 2x with respect to x?'
```

See our [complete example](https://github.com/promptfoo/promptfoo/tree/main/examples/deepseek-r1-vs-openai-o1) that benchmarks it against OpenAI's o1 model on the MMLU reasoning tasks.

## API Details

- Base URL: `https://api.deepseek.com/v1`
- OpenAI-compatible API format
- Full [API documentation](https://platform.deepseek.com/docs)
