# openai-compatible-gateway (OpenAI-Compatible Multi-Model Gateway)

Point Promptfoo's built-in OpenAI provider at any OpenAI-compatible Chat Completions endpoint — a self-hosted server (vLLM, llamafile) or a hosted multi-model gateway (LiteLLM, OpenRouter, etc.). Change `apiBaseUrl` and the model ID; everything else works the same way.

## Setup

1. Create an API key with your gateway or endpoint provider.
2. Export credentials:

   ```bash
   export OPENAI_API_KEY=your_gateway_api_key
   ```

3. In `promptfooconfig.yaml`, set `apiBaseUrl` to your endpoint's base URL and replace `your-model-id` with an exact model ID your endpoint serves (`GET /v1/models`).

4. Initialize and run the example:

   ```bash
   npx promptfoo@latest init --example openai-compatible-gateway
   cd openai-compatible-gateway
   npx promptfoo@latest eval
   ```

## What this example covers

- Using `openai:chat:<model>` against a custom OpenAI-compatible `apiBaseUrl`
- Account-scoped model IDs (many gateways have no static public catalog)

## Notes

- Uses the OpenAI Chat Completions API shape only.
- Instead of `apiBaseUrl` in the config, you can set the `OPENAI_BASE_URL` environment variable — the config value takes precedence when both are set.
- To keep your gateway key separate from a real OpenAI key, set `apiKeyEnvar` in the provider config to a different environment variable name.

See also the [OpenAI provider documentation](https://www.promptfoo.dev/docs/providers/openai/) section on OpenAI-compatible multi-model gateways.
