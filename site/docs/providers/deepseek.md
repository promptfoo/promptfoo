# DeepSeek

[DeepSeek](https://platform.deepseek.com/) provides an OpenAI-compatible API for their language models, with specialized models for both general chat and advanced reasoning tasks. The DeepSeek provider is compatible with all the options provided by the [OpenAI provider](/docs/providers/openai/).

## Setup

To use DeepSeek, you'll need an API key:

1. Get your key from the [DeepSeek Platform](https://platform.deepseek.com/)
2. Set `DEEPSEEK_API_KEY` or specify `apiKey` in your config

## Configuration

Here's a simple example configuration:

```yaml
providers:
  - id: deepseek:deepseek-chat # DeepSeek-V3 model
    config:
      temperature: 0.7
      max_tokens: 4000
      apiKey: YOUR_DEEPSEEK_API_KEY

  - id: deepseek:deepseek-reasoner # DeepSeek-R1 model
    config:
      temperature: 0.0 # Best for precise reasoning
      max_tokens: 8000 # For complex tasks
```

Key configuration options:

- `temperature`: 0.0-1.5 (default: 1.0)
- `max_tokens`: Max 8000 (default: 4000)
- `top_p`, `presence_penalty`, `frequency_penalty`: Same as OpenAI
- `stream`: Enable streaming (default: false)

## Available Models

### DeepSeek-V3 (deepseek-chat)

- Versatile model for conversations, content creation, and translation
- 64K context window, 8K output tokens
- Pricing (until 2025-02-08):
  - Input: $0.014/1M (cache hit), $0.14/1M (miss)
  - Output: $0.28/1M

### DeepSeek-R1 (deepseek-reasoner)

- Advanced reasoning model with step-by-step problem solving
- Excels at math, coding, and logical reasoning tasks
- Shows its work through Chain-of-Thought (CoT) reasoning
- 64K context, 32K CoT tokens, 8K output tokens
- MIT licensed - free for commercial use
- Pricing:
  - Input: $0.14/1M (cache hit), $0.55/1M (miss)
  - Output: $2.19/1M (includes reasoning steps)

## Temperature Guide

DeepSeek models respond differently to temperature settings. Here's what works best:

| Use Case         | Temperature | Purpose           |
| ---------------- | ----------- | ----------------- |
| Code/Math        | 0.0         | Precise outputs   |
| Data/Analysis    | 1.0         | Balanced          |
| Chat/Translation | 1.3         | Natural variation |
| Creative         | 1.5         | Maximum variation |

## Context Caching

DeepSeek automatically caches your inputs for 24 hours to help reduce costs:

- Identical or similar queries get discounted rates (see pricing above)
- No configuration needed - it just works
- Great for repeated queries or batch processing

## Example: Reasoning Benchmark

Want to see DeepSeek-R1's reasoning capabilities in action? We provide a [complete example](https://github.com/promptfoo/promptfoo/tree/main/examples/deepseek-r1-vs-openai-o1) that benchmarks it against OpenAI's o1 model on the MMLU reasoning tasks:

```sh
promptfoo init --example deepseek-r1-vs-openai-o1
# Set OPENAI_API_KEY, DEEPSEEK_API_KEY, and HUGGING_FACE_HUB_TOKEN
promptfoo eval
```

This example tests both models on complex subjects like abstract algebra and formal logic, demonstrating DeepSeek-R1's step-by-step reasoning capabilities.

## API Details

- Base URL: `https://api.deepseek.com/v1`
- OpenAI-compatible format and SDKs
- Supports streaming responses

For complete API documentation, see the [DeepSeek docs](https://platform.deepseek.com/docs).
