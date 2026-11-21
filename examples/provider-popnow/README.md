# provider-popnow (PopNow Example)

This directory contains an example configuration for using [PopNow](https://popnow.ai/api) with promptfoo. It runs the same questions against two chat models through one PopNow API key.

## Prerequisites

1. Create a PopNow API key in the [API console](https://popnow.ai/api/console/keys) and add funds to your API balance.
2. Set the environment variable:

   ```bash
   export POPNOW_API_KEY=your_api_key_here
   ```

## Quick Start

```bash
npx promptfoo@latest init --example provider-popnow
cd provider-popnow
npx promptfoo eval -c promptfooconfig.yaml
```

## Example Config

The included `promptfooconfig.yaml` demonstrates:

- PopNow chat requests to two models with generation parameters
- Deterministic assertions on the responses

## Provider Syntax

```yaml
providers:
  - id: popnow:google/gemini-3.7-flash/chat
```

## Custom Gateway Example

```yaml
providers:
  - id: popnow:google/gemini-3.7-flash/chat
    config:
      apiBaseUrl: https://proxy.example.com/popnow/v1
      apiKeyEnvar: MY_POPNOW_TOKEN
```

## Resources

- [PopNow Provider Docs](https://www.promptfoo.dev/docs/providers/popnow/)
- [PopNow chat docs](https://popnow.ai/docs/chat)
- [Promptfoo Docs](https://www.promptfoo.dev/docs/)
