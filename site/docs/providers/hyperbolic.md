---
sidebar_position: 42
---

# Hyperbolic

The `hyperbolic` provider supports [Hyperbolic's API](https://docs.hyperbolic.xyz), which provides access to various LLM models through an [OpenAI-compatible API format](/docs/providers/openai). This makes it easy to integrate into existing applications that use the OpenAI SDK.

## Setup

To use Hyperbolic, you need to set the `HYPERBOLIC_API_KEY` environment variable or specify the `apiKey` in the provider configuration.

Example of setting the environment variable:

```sh
export HYPERBOLIC_API_KEY=your_api_key_here
```

## Provider Format

The provider format is:

```
hyperbolic:<model_name>
```

### Available Models

Hyperbolic provides access to a variety of state-of-the-art models:

- `hyperbolic:deepseek-ai/DeepSeek-R1`
- `hyperbolic:deepseek-ai/DeepSeek-R1-Zero`
- `hyperbolic:deepseek/DeepSeek-V2.5`
- `hyperbolic:hermes/Hermes-3-70B`
- `hyperbolic:meta-llama/Llama-3.1-8B`
- `hyperbolic:meta-llama/Llama-3.2-3B`
- `hyperbolic:meta-llama/Llama-3.3-70B-Instruct`
- `hyperbolic:qwen/Qwen2.5-72B-Instruct`
- `hyperbolic:qwen/Qwen2.5-Coder-32B`

## Configuration

Configure the provider in your promptfoo configuration file:

```yaml
providers:
  - id: hyperbolic:deepseek-ai/DeepSeek-R1-Zero
    config:
      temperature: 0.1
      top_p: 0.9
      apiKey: ... # override the environment variable
```

### Configuration Options

| Parameter            | Description                                                               |
| -------------------- | ------------------------------------------------------------------------- |
| `apiKey`             | Your Hyperbolic API key                                                   |
| `temperature`        | Controls the randomness of the output (0.0 to 2.0)                        |
| `max_tokens`         | The maximum number of tokens to generate                                  |
| `top_p`              | Controls nucleus sampling (0.0 to 1.0)                                    |
| `top_k`              | Controls the number of top tokens to consider (-1 to consider all tokens) |
| `min_p`              | Minimum probability for a token to be considered (0.0 to 1.0)             |
| `presence_penalty`   | Penalty for new tokens (0.0 to 1.0)                                       |
| `frequency_penalty`  | Penalty for frequent tokens (0.0 to 1.0)                                  |
| `repetition_penalty` | Prevents token repetition (default: 1.0)                                  |
| `stop`               | Array of strings that will stop generation when encountered               |
| `seed`               | Random seed for reproducible results                                      |

## Example Usage

Here's an example configuration using the Hyperbolic provider:

```yaml
prompts:
  - file://prompts/coding_assistant.json
providers:
  - id: hyperbolic:qwen/Qwen2.5-Coder-32B
    config:
      temperature: 0.1
      max_tokens: 4096
      presence_penalty: 0.1
      seed: 42

tests:
  - vars:
      task: 'Write a Python function to find the longest common subsequence of two strings'
    assert:
      - type: contains
        value: 'def lcs'
      - type: contains
        value: 'dynamic programming'
```

Example prompt template (`prompts/coding_assistant.json`):

```json
[
  {
    "role": "system",
    "content": "You are an expert programming assistant."
  },
  {
    "role": "user",
    "content": "{{task}}"
  }
]
```
