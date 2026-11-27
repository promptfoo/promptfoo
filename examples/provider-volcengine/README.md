# provider-volcengine (Volcengine Ark Provider)

This example shows how to configure and evaluate Volcengine Ark (Doubao) models with Promptfoo.

## Setup

1. Get an API key from the [Volcengine Ark Console](https://console.volcengine.com/ark/region:cn-beijing/apiKey).
2. Set the `ARK_API_KEY` environment variable:

```bash
export ARK_API_KEY=your_api_key_here
```

## Run the Evaluation

```bash
npx promptfoo@latest init --example provider-volcengine
cd provider-volcengine
npx promptfoo@latest eval
```

## What this example covers

- The `volcengine:<model>` provider format
- Comparing `doubao-seed-2-1-pro-260628` and `doubao-seed-2-1-turbo-260628`
- Standard assertions on model outputs

See the [Volcengine Ark provider documentation](https://www.promptfoo.dev/docs/providers/volcengine/) for full configuration options, including deep thinking and prompt caching support.
