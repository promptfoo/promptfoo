# anthropic/memory-tool (Anthropic Memory Tool)

This example shows how to include Anthropic's native `memory_20250818` tool in a Promptfoo eval.

```bash
npx promptfoo@latest init --example anthropic/memory-tool
cd anthropic/memory-tool
```

## Features Demonstrated

- Passing the Anthropic memory tool through the Messages provider
- Restricting the tool to direct model calls with `allowed_callers`
- Asserting on the `tool_use` block the model emits when it wants a memory operation

## Required Environment Variables

- `ANTHROPIC_API_KEY` - Your Anthropic API key from [console.anthropic.com](https://console.anthropic.com/settings/keys)

## Running the Example

```bash
promptfoo eval
```

Promptfoo sends the memory tool definition to Anthropic, but it does not create memory stores or run local memory handlers. The model's request surfaces in the output as a `tool_use` block, which is what the assertions match on:

```json
{
  "type": "tool_use",
  "name": "memory",
  "input": { "command": "view", "path": "/memories" },
  "caller": { "type": "direct" }
}
```

Use this pattern to validate prompt behavior around memory-tool availability. Note that `tool_choice: none` suppresses the tool call **and** the text response on current Claude models, so the eval would see empty output.
