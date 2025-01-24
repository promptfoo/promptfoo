---
sidebar_position: 42
---

# Hyperbolic

The `hyperbolic` provider supports [Hyperbolic's API](https://docs.hyperbolic.xyz), which provides access to various LLM models including Meta's Llama 3 series. The API is compatible with OpenAI's format, making it easy to integrate into existing applications.

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

For example:

- `hyperbolic:meta-llama/Meta-Llama-3-70B-Instruct`
- `hyperbolic:meta-llama/Meta-Llama-3-8B-Instruct-Turbo`

If no model is specified, it defaults to `meta-llama/Meta-Llama-3-70B-Instruct`.

## Configuration

Configure the provider in your promptfoo configuration file:

```yaml
providers:
  - id: hyperbolic:meta-llama/Meta-Llama-3-70B-Instruct
    config:
      temperature: 0.1
      top_p: 0.9
      max_tokens: 1000
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
  - file://prompts/travel_guide.json
providers:
  - id: hyperbolic:meta-llama/Meta-Llama-3-70B-Instruct
    config:
      temperature: 0.7
      max_tokens: 500
      presence_penalty: 0.1
      seed: 42

tests:
  - vars:
      location: 'San Francisco'
      days: 3
    assert:
      - type: contains
        value: 'Golden Gate Bridge'
      - type: contains
        value: "Fisherman's Wharf"
```

Example prompt template (`prompts/travel_guide.json`):

```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are an expert travel guide."
    },
    {
      "role": "user",
      "content": "Tell me fun things to do in {{location}} for {{days}} days."
    }
  ]
}
```
