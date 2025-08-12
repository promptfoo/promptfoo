# openai-multi-turn-tools (OpenAI Multi-Turn Tool Conversations Example)

You can run this example with:

```bash
npx promptfoo@latest init --example openai-multi-turn-tools
```

This example demonstrates how to evaluate multi-turn tool conversations. It shows how to chain multiple tool calls together to solve tasks that require sequential operations.

## Setup

1. Set your OPENAI_API_KEY environment variable:

   ```bash
   export OPENAI_API_KEY=your_api_key_here
   ```

2. This example is pre-configured in `promptfooconfig.yaml`. You can review and modify it if needed.

3. Run the evaluation:

   ```bash
   promptfoo eval
   ```

4. View the results:

   ```bash
   promptfoo view
   ```

## Configuration

The example defines two tools:

- `calculate_total` - Multiplies quantity × price
- `check_budget` - Compares amount against budget limit

Uses `enableMultiTurnTools: true` to enable sequential tool calling.

## Documentation

For more details, see:

- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)
- [Promptfoo OpenAI Provider Documentation](https://promptfoo.dev/docs/providers/openai)
