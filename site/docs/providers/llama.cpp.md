---
sidebar_label: Llama.cpp
description: "Execute quantized LLMs efficiently on CPUs using llama.cpp's optimized inference engine for resource-constrained deployments"
---

# Llama.cpp

The `llama` provider connects to the HTTP server bundled with [llama.cpp](https://github.com/ggml-org/llama.cpp).

## Configuration

To use the `llama` provider, specify `llama` as the provider in your `promptfooconfig.yaml` file.

Supported environment variables:

- `LLAMA_BASE_URL` - Scheme, hostname, and port (defaults to `http://localhost:8080`)
- `REQUEST_TIMEOUT_MS` - Request timeout in milliseconds

:::note
The server address comes from `LLAMA_BASE_URL` only. A `config.baseUrl` key is ignored.
:::

## Configuration options

Promptfoo sends these options to the llama.cpp server's [`/completion` endpoint](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#post-completion):

| Option              | Type            | Description                                                                         |
| ------------------- | --------------- | ----------------------------------------------------------------------------------- |
| `n_predict`         | number          | Tokens to generate. Defaults to 512.                                                |
| `temperature`       | number          | Sampling temperature.                                                               |
| `top_k`             | number          | Top-k sampling.                                                                     |
| `top_p`             | number          | Nucleus sampling.                                                                   |
| `n_keep`            | number          | Tokens from the prompt to retain when context fills.                                |
| `stop`              | string[]        | Sequences that stop generation.                                                     |
| `repeat_penalty`    | number          | Penalty applied to repeated tokens.                                                 |
| `repeat_last_n`     | number          | How far back to apply `repeat_penalty`.                                             |
| `penalize_nl`       | boolean         | Whether newlines are penalized.                                                     |
| `presence_penalty`  | number          | Penalizes tokens by presence.                                                       |
| `frequency_penalty` | number          | Penalizes tokens by frequency.                                                      |
| `mirostat`          | 0, 1, or 2      | Mirostat sampling: `0` disables it, `1` uses Mirostat, and `2` uses Mirostat 2.0.   |
| `mirostat_tau`      | number          | Mirostat target entropy.                                                            |
| `mirostat_eta`      | number          | Mirostat learning rate.                                                             |
| `seed`              | number          | Random seed.                                                                        |
| `ignore_eos`        | boolean         | Continue past the end-of-sequence token.                                            |
| `logit_bias`        | array or object | Token/bias pairs or an OpenAI-style bias map. Use `false` in a pair to ban a token. |

```yaml
providers:
  - id: llama
    config:
      n_predict: 1024
      temperature: 0
      stop: ['</s>']
```

For a detailed example of how to use Promptfoo with `llama.cpp`, including configuration and setup, refer to the [example on GitHub](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-llama-cpp).
