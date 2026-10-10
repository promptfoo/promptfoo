# provider-cheaperinference (Cheaper Inference)

Compare two chat models through Cheaper Inference using promptfoo's generic OpenAI-compatible provider.

## Setup

1. Create an API key using the [Cheaper Inference documentation](https://www.cheaperinference.com/docs).
2. Set `CHEAPERINFERENCE_API_KEY` in your environment.
3. Confirm that the example's models are available to your account through the service's current model catalog.

```bash
export CHEAPERINFERENCE_API_KEY=your_api_key_here
npx promptfoo@latest init --example provider-cheaperinference
cd provider-cheaperinference
npx promptfoo eval -c promptfooconfig.yaml
```

Each provider uses `openai:chat:<model>` with `apiBaseUrl: https://api.cheaperinference.com/v1` and `apiKeyEnvar: CHEAPERINFERENCE_API_KEY`. Keep those settings on each provider when adding models. The example checks basic knowledge and a short technical explanation using deterministic assertions.

To route requests through your own proxy, change `apiBaseUrl`. To read the token from another environment variable, change `apiKeyEnvar`.

See the [Promptfoo integration guide](https://www.promptfoo.dev/docs/providers/cheaperinference/) for capability and cost considerations.
