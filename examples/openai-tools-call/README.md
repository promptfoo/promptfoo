# openai-tools-call (OpenAI Tools Call Example)

This example validates function names and arguments returned by the Chat Completions `tools` API. It does not call a weather service.

## Usage

```bash
npx promptfoo@latest init --example openai-tools-call
cd openai-tools-call
export OPENAI_API_KEY=your-key-here
npx promptfoo@latest eval --no-cache
```

To load the key from a `.env` file instead, add `--env-file .env` to the evaluation command.

The configuration defines a `get_current_weather` tool and tests several locations. Assertions validate the Chat tool-call structure, check arguments, and transform outputs to compare individual fields.

For new workflows, use the [Responses API function-calling example](../openai-responses/README.md#function-calling-promptfooconfigfunction-callyaml). See the [OpenAI provider documentation](https://www.promptfoo.dev/docs/providers/openai/#using-tools) for configuration details.
