# openai-function-call (OpenAI Function Call Example)

You can run this example with:

```bash
npx promptfoo@latest init --example openai-function-call
cd openai-function-call
```

This example validates the legacy Chat Completions `functions` format, with definitions in an external YAML file and inline in the configuration. It checks function names and arguments; it does not call a weather service.

For new workflows, use the [Responses API function-calling example](../openai-responses/README.md#function-calling-promptfooconfigfunction-callyaml).

## Setup

1. Set your OPENAI_API_KEY environment variable:

   ```bash
   export OPENAI_API_KEY=your_api_key_here
   ```

2. This example is pre-configured in `promptfooconfig.yaml`. You can review and modify it if needed.

3. Run the evaluation:

   ```bash
   npx promptfoo@latest eval --no-cache
   ```

4. View the results:

   ```bash
   npx promptfoo@latest view
   ```
