# anthropic/memory-tool (Anthropic Memory Tool)

This example shows how to include Anthropic's native `memory_20250818` tool in a Promptfoo eval.

```bash
npx promptfoo@latest init --example anthropic/memory-tool
cd anthropic/memory-tool
```

## Features Demonstrated

- Passing the Anthropic memory tool through the Messages provider
- Restricting the tool to direct model calls
- Keeping the eval single-turn by disabling tool use with `tool_choice`

## Required Environment Variables

- `ANTHROPIC_API_KEY` - Your Anthropic API key from [console.anthropic.com](https://console.anthropic.com/settings/keys)

## Running the Example

```bash
promptfoo eval
```

Promptfoo sends the memory tool definition to Anthropic, but it does not create memory stores or run local memory handlers. Use this pattern to validate prompt behavior around memory-tool availability, or remove `tool_choice` when you want the model to request memory operations for assertion.
