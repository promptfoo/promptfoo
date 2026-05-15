# provider-novita (Novita Provider)

This example shows how to use Novita through Promptfoo's OpenAI-compatible provider surface.

## Setup

1. Create a Novita API key.
2. Export it locally:

   ```bash
   export NOVITA_API_KEY=your_api_key_here
   ```

3. Initialize and run the example:

   ```bash
   npx promptfoo@latest init --example provider-novita
   cd provider-novita
   npx promptfoo@latest eval
   ```

## What this example covers

- The `novita:chat:<model>` provider format
- Standard OpenAI-compatible provider options such as `temperature`
- A small factual eval that is easy to adapt to a preferred Novita model
