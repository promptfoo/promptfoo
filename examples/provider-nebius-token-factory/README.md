# provider-nebius-token-factory (Nebius Token Factory)

Use Nebius Token Factory through promptfoo's generic OpenAI-compatible Chat Completions provider. Token Factory needs only its canonical base URL, an API key, and a current model ID, so this example does not add a dedicated provider prefix.

## Setup

1. Create an API key by following the [Token Factory quickstart](https://docs.tokenfactory.nebius.com/quickstart).
2. Export the key:

   ```bash
   export NEBIUS_API_KEY=your_api_key_here
   ```

3. Copy and run the example:

   ```bash
   npx promptfoo@latest init --example provider-nebius-token-factory
   cd provider-nebius-token-factory
   npx promptfoo@latest eval
   ```

The config uses `openai:chat:openai/gpt-oss-120b` with `apiBaseUrl` set to `https://api.tokenfactory.nebius.com/v1`. The config reads the key from `NEBIUS_API_KEY` and suppresses the OpenAI organization header. Replace the model ID with another current chat model from the [Token Factory catalog](https://tokenfactory.nebius.com/api/public/models_info) if needed.

## API scope

This recipe uses the stateless Chat Completions endpoint. It does not configure promptfoo's OpenAI Responses provider or rely on persisted response state.

See the [Nebius provider guide](https://www.promptfoo.dev/docs/providers/nebius/) for a complete configuration. These assertions are smoke checks of response shape, not a coding-correctness benchmark.
