# provider-yapi (Y-API)

Compare three text chat models on Y-API using the generic OpenAI-compatible provider. Create a gateway key and run the example:

```bash
export Y_API_API_KEY=your_api_key_here
npx promptfoo@latest init --example provider-yapi
cd provider-yapi
npx promptfoo@latest eval
```

Choose model IDs from the [gateway catalog](https://y-api.bestvirtualgoods.com/models.json). Each provider uses the gateway endpoint, names its own key variable, and suppresses an ambient OpenAI organization. See the [Y-API configuration guide](https://www.promptfoo.dev/docs/providers/yapi/) for current service limits and per-token cost estimates.
