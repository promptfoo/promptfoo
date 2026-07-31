# openai-compatible-gateway (OpenAI-Compatible Multi-Model Gateway)

Point Promptfoo's built-in OpenAI provider at any OpenAI-compatible Chat Completions endpoint — a self-hosted server (vLLM, llamafile) or a hosted multi-model gateway (LiteLLM, OpenRouter, etc.). Change `apiBaseUrl` and the model ID; everything else works the same way.

## Setup

1. Initialize the example and enter its directory:

   ```bash
   npx promptfoo@latest init --example openai-compatible-gateway
   cd openai-compatible-gateway
   ```

2. Create an API key with your gateway or endpoint provider, then export it (prefer a gateway-specific env var so a real `OPENAI_API_KEY` is not sent to the gateway by accident):

   ```bash
   export GATEWAY_API_KEY=your_gateway_api_key
   # Recommended: clear any ambient OpenAI key so a real key cannot reach the
   # gateway if GATEWAY_API_KEY is unset or misspelled.
   unset OPENAI_API_KEY
   ```

3. In `promptfooconfig.yaml`, set `apiBaseUrl` to your endpoint's base URL, set `apiKeyEnvar: GATEWAY_API_KEY`, and replace `your-model-id` with an exact model ID your endpoint serves (`GET <apiBaseUrl>/models`).

4. Run the configured example:

   ```bash
   npx promptfoo@latest eval
   ```

## What this example covers

- Using `openai:chat:<model>` against a custom OpenAI-compatible `apiBaseUrl`
- Account-scoped model IDs (many gateways have no static public catalog)
- Separating the gateway key via `apiKeyEnvar` (instead of reusing `OPENAI_API_KEY`)

## Notes

- Uses the OpenAI Chat Completions API shape only.

See also the [OpenAI provider documentation](https://www.promptfoo.dev/docs/providers/openai/) section on OpenAI-compatible multi-model gateways.
