# openai-compatible-gateway (OpenAI-Compatible Multi-Model Gateway)

Point Promptfoo's built-in OpenAI provider at any OpenAI-compatible Chat Completions endpoint — a self-hosted server (vLLM, llamafile) or a hosted multi-model gateway (LiteLLM, OpenRouter, etc.). Change `apiBaseUrl` and the model ID; everything else works the same way.

## Setup

1. Initialize the example and enter its directory:

   ```bash
   npx promptfoo@latest init --example openai-compatible-gateway
   cd openai-compatible-gateway
   ```

2. Create an API key with your gateway or endpoint provider, then export it under a gateway-specific env var, so a real `OPENAI_API_KEY` is never sent to the gateway:

   ```bash
   export GATEWAY_API_KEY=your_gateway_api_key
   ```

   `apiKeyEnvar` reads only the named variable; it does not fall back to `OPENAI_API_KEY`. For an endpoint that needs no credential, drop `apiKeyEnvar` and set `apiKeyRequired: false` and `useDefaultApiKey: false` instead.

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

See the [connection settings](https://www.promptfoo.dev/docs/providers/openai/#connection-settings) section of the OpenAI provider documentation for the full list of base URL and credential options.

## IteraCompute

Save this classification example as `promptfooconfig.iteracompute.yaml`. Keep the `z-ai/` prefix in the model ID. `showThinking: false` keeps reasoning text out of the exact-match assertions.

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json

description: Classify support requests with IteraCompute

prompts:
  - 'Classify this support request as BILLING or TECHNICAL. Reply with only the label. Request: {{request}}'

providers:
  - id: openai:chat:z-ai/glm-5.3-flash
    config:
      apiBaseUrl: https://api.iteracompute.com/v1
      apiKeyEnvar: ITERACOMPUTE_API_KEY
      headers:
        OpenAI-Organization: ''
      omitDefaults: true
      showThinking: false

tests:
  - vars:
      request: I was charged twice for my subscription.
    assert:
      - type: equals
        value: BILLING
  - vars:
      request: The app crashes whenever I upload a file.
    assert:
      - type: equals
        value: TECHNICAL
```

Set your IteraCompute API key and run the example.

```bash
export ITERACOMPUTE_API_KEY=your_iteracompute_api_key
npx promptfoo@latest eval -c promptfooconfig.iteracompute.yaml
```

Live compatibility with the IteraCompute endpoint is unverified.
