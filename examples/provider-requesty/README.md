# provider-requesty (Requesty Provider)

This example shows how to use [Requesty](https://requesty.ai/), an OpenAI-compatible LLM router, to evaluate prompts against models from multiple upstream providers through a single endpoint.

You can run this example with:

```bash
npx promptfoo@latest init --example provider-requesty
cd provider-requesty
```

## Setup

1. Get your API key from [Requesty](https://app.requesty.ai/api-keys).
2. Set your API key:

   ```bash
   export REQUESTY_API_KEY=your-api-key
   ```

3. Run the evaluation:

   ```bash
   npx promptfoo@latest eval
   ```

## What this example does

This example demonstrates calling upstream models (`openai/gpt-4o-mini` and `anthropic/claude-sonnet-4-5`) through Requesty using the shared `provider/model` naming convention.

For the full model catalog, see the [Requesty router list](https://app.requesty.ai/router/list). For provider docs, see the [Requesty provider page](https://www.promptfoo.dev/docs/providers/requesty).
