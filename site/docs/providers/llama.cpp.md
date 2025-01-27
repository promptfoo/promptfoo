# Llama.cpp

The `llama` provider is compatible with the HTTP server bundled with [llama.cpp](https://github.com/ggerganov/llama.cpp). This allows you to leverage the power of `llama.cpp` models within Promptfoo.

## Configuration

To use the `llama` provider, specify `llama` as the provider in your `promptfooconfig.yaml` file.

Supported environment variables:

- `LLAMA_BASE_URL` - Scheme, hostname, and port (defaults to `http://localhost:8080`)

For a detailed example of how to use Promptfoo with `llama.cpp`, including configuration and setup, refer to the [example on GitHub](https://github.com/promptfoo/promptfoo/tree/main/examples/llama-cpp).
