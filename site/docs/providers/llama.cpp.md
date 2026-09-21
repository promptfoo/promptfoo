---
sidebar_label: Llama.cpp
description: "Execute quantized LLMs efficiently on CPUs using llama.cpp's optimized inference engine for resource-constrained deployments"
---

# Llama.cpp

The `llama` provider is compatible with the HTTP server bundled with [llama.cpp](https://github.com/ggerganov/llama.cpp). This allows you to leverage the power of `llama.cpp` models within Promptfoo.

## Configuration

To use the `llama` provider, specify `llama` as the provider in your `promptfooconfig.yaml` file.

Supported environment variables:

- `LLAMA_BASE_URL` - Scheme, hostname, and port (defaults to `http://localhost:8080`)
- `REQUEST_TIMEOUT_MS` - Request timeout in milliseconds

:::note
The server address comes from `LLAMA_BASE_URL` only. A `config.baseUrl` key is ignored.
:::

## Configuration options

All options are passed through to the llama.cpp server's `/completion` endpoint:

| Option              | Type     | Description                                          |
| ------------------- | -------- | ---------------------------------------------------- |
| `n_predict`         | number   | Tokens to generate. Defaults to 512.                 |
| `temperature`       | number   | Sampling temperature.                                |
| `top_k`             | number   | Top-k sampling.                                      |
| `top_p`             | number   | Nucleus sampling.                                    |
| `n_keep`            | number   | Tokens from the prompt to retain when context fills. |
| `stop`              | string[] | Sequences that stop generation.                      |
| `repeat_penalty`    | number   | Penalty applied to repeated tokens.                  |
| `repeat_last_n`     | number   | How far back to apply `repeat_penalty`.              |
| `penalize_nl`       | boolean  | Whether newlines are penalized.                      |
| `presence_penalty`  | number   | Penalizes tokens by presence.                        |
| `frequency_penalty` | number   | Penalizes tokens by frequency.                       |
| `mirostat`          | boolean  | Enable Mirostat sampling.                            |
| `mirostat_tau`      | number   | Mirostat target entropy.                             |
| `mirostat_eta`      | number   | Mirostat learning rate.                              |
| `seed`              | number   | Random seed.                                         |
| `ignore_eos`        | boolean  | Continue past the end-of-sequence token.             |
| `logit_bias`        | object   | Per-token bias map.                                  |

```yaml
providers:
  - id: llama
    config:
      n_predict: 1024
      temperature: 0
      stop: ['</s>']
```

For a detailed example of how to use Promptfoo with `llama.cpp`, including configuration and setup, refer to the [example on GitHub](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-llama-cpp).
