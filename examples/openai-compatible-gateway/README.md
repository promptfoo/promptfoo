# openai-compatible-gateway (DaoXE example)

Point Promptfoo's built-in OpenAI provider at a third-party OpenAI-compatible multi-model gateway.

This example uses [DaoXE](https://daoxe.com) (`https://daoxe.com/v1`). Any OpenAI-compatible Chat Completions host works the same way — change `apiBaseUrl` and the model ID.

## Setup

1. Create an API key at [daoxe.com](https://daoxe.com).
2. Export credentials:

   ```bash
   export OPENAI_API_KEY=your_daoxe_api_key
   # optional if you also set apiBaseUrl in the config:
   export OPENAI_BASE_URL=https://daoxe.com/v1
   ```

3. Set `your-account-model-id` in `promptfooconfig.yaml` to an exact model ID available to your account (`GET /v1/models` or the dashboard).

4. Run:

   ```bash
   npx promptfoo@latest eval
   ```

## Notes

- Uses OpenAI Chat Completions only.
- Model IDs are account-scoped; do not rely on a static public list.
- DaoXE is not available in mainland China.
- Contributor disclosure: this example was contributed by a DaoXE affiliate.
