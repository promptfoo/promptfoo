# provider-empiriolabs (EmpirioLabs via OpenAI)

This example compares two EmpirioLabs chat models through Promptfoo's generic OpenAI-compatible
provider.

## Setup

1. Create an API key in the
   [EmpirioLabs dashboard](https://platform.empiriolabs.ai/dashboard/api-keys).
2. Export it locally:

   ```bash
   export EMPIRIOLABS_API_KEY=your_api_key_here
   ```

3. Initialize and run the example:

   ```bash
   npx promptfoo@latest init --example provider-empiriolabs
   cd provider-empiriolabs
   npx promptfoo@latest eval --no-cache
   ```

## What this example covers

- Connecting `openai:chat` providers to EmpirioLabs' `/v1` API root
- Reading the Bearer token only from `EMPIRIOLABS_API_KEY`
- Comparing two model IDs with a deterministic assertion

See the
[EmpirioLabs integration documentation](https://www.promptfoo.dev/docs/providers/empiriolabs/)
for embeddings, model-specific request fields, and cost overrides.
