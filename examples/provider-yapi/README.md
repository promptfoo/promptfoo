# provider-yapi (Y-API Provider)

This example uses [Y-API](https://y-api.bestvirtualgoods.com/), an OpenAI-compatible gateway, to evaluate prompts against models from several vendors through one endpoint and one API key. Model IDs are vendor-namespaced and copied verbatim from the catalog.

You can run this example with:

```bash
npx promptfoo@latest init --example provider-yapi
cd provider-yapi
```

## Setup

1. Create an API key in the Y-API console.
2. Set your API key:

   ```bash
   export Y_API_API_KEY=your_api_key_here
   ```

3. Run the evaluation:

   ```bash
   npx promptfoo@latest eval
   ```

## What this example does

This example demonstrates:

- Calling three different vendors' models (`deepseek/`, `qwen/`, `anthropic/`) from a single gateway prefix.
- Comparing them side by side on the same test cases in one eval.

The full model catalog is published at [y-api.bestvirtualgoods.com/models.json](https://y-api.bestvirtualgoods.com/models.json). For provider docs, including current limitations, see the [Y-API provider page](https://www.promptfoo.dev/docs/providers/yapi).
