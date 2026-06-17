# provider-evolink (EvoLink via OpenAI)

This example evaluates EvoLink's `evolink/auto` smart router through Promptfoo's generic
OpenAI-compatible chat provider.

## Setup

1. Create an EvoLink API key.
2. Export it locally:

   ```bash
   export EVOLINK_API_KEY=your_api_key_here
   ```

3. Initialize and run the example:

   ```bash
   npx promptfoo@latest init --example provider-evolink
   cd provider-evolink
   npx promptfoo@latest eval --no-cache
   ```

## What this example covers

- Connecting `openai:chat:evolink/auto` to EvoLink's `/v1` API root
- Reading the EvoLink token from `EVOLINK_API_KEY` without reusing OpenAI credentials
- Checking a smart-routed response with a deterministic assertion

See the [EvoLink integration documentation](https://www.promptfoo.dev/docs/providers/evolink/)
for model selection and provider-specific request options.
