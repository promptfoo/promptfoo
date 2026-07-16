# openai-compatible-gateway (OpenAI-Compatible Multi-Model Gateway)

Point Promptfoo's built-in OpenAI provider at any OpenAI-compatible Chat Completions endpoint — a self-hosted server (vLLM, llamafile) or a hosted multi-model gateway (LiteLLM, OpenRouter, etc.). Change `apiBaseUrl` and the model ID; everything else works the same way.

## Setup

1. Create an API key with your gateway or endpoint provider.
2. Export credentials (prefer a gateway-specific env var so a real `OPENAI_API_KEY` is not sent to the gateway by accident):

   ```bash
   export GATEWAY_API_KEY=your_gateway_api_key
   # Optional: clear ambient OpenAI host/key overrides for this shell
   unset OPENAI_API_HOST
   ```

3. In `promptfooconfig.yaml`, set `apiBaseUrl` to your endpoint's base URL, set `apiKeyEnvar: GATEWAY_API_KEY`, and replace `your-model-id` with an exact model ID your endpoint serves (`GET /v1/models`).

4. Initialize and run the example:

   ```bash
   npx promptfoo@latest init --example openai-compatible-gateway
   cd openai-compatible-gateway
   npx promptfoo@latest eval
   ```

## What this example covers

- Using `openai:chat:<model>` against a custom OpenAI-compatible `apiBaseUrl`
- Account-scoped model IDs (many gateways have no static public catalog)
- Separating the gateway key via `apiKeyEnvar` (instead of reusing `OPENAI_API_KEY`)

## Notes

- Uses the OpenAI Chat Completions API shape only.
- URL resolution order: `apiHost` / `OPENAI_API_HOST` → `apiBaseUrl` → `OPENAI_API_BASE_URL` / `OPENAI_BASE_URL` → default OpenAI host. Ambient `OPENAI_API_HOST` overrides `apiBaseUrl`, so unset it when testing a gateway.
- Key resolution still falls through to `OPENAI_API_KEY` if `apiKey` / `apiKeyEnvar` is not set. Prefer `apiKeyEnvar` for gateways.
- Instead of `apiBaseUrl` in the config, you can set `OPENAI_BASE_URL` / `OPENAI_API_BASE_URL` when no `OPENAI_API_HOST` is present.

See also the [OpenAI provider documentation](https://www.promptfoo.dev/docs/providers/openai/) section on OpenAI-compatible multi-model gateways.
