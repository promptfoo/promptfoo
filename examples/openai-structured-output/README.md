# openai-structured-output (OpenAI Structured Output Example)

These examples define JSON schemas inline, in external JSON or YAML files, and per test. Use the Responses API configuration for new workflows; the Chat Completions configuration demonstrates that API's schema format for comparison.

## Usage

```bash
npx promptfoo@latest init --example openai-structured-output
cd openai-structured-output
export OPENAI_API_KEY=your-key-here
```

| File                             | Description                                          |
| -------------------------------- | ---------------------------------------------------- |
| `promptfooconfig.responses.yaml` | Responses API with inline and external schemas       |
| `promptfooconfig.chat.yaml`      | Chat Completions with inline and external schemas    |
| `per-test-schema.yaml`           | Responses API with a different schema for each test  |
| `schema.responses.yaml`          | External Responses API schema                        |
| `schema.chat.json`               | External Chat Completions schema                     |
| `schemas/`                       | Math and comparison schemas for the per-test example |

Run a configuration:

```bash
npx promptfoo@latest eval -c promptfooconfig.responses.yaml --no-cache
npx promptfoo@latest eval -c promptfooconfig.chat.yaml --no-cache
npx promptfoo@latest eval -c per-test-schema.yaml --no-cache
```

The Responses provider parses structured output into an object. The per-test example checks its properties with JavaScript assertions. See the [structured output documentation](https://www.promptfoo.dev/docs/providers/openai/#using-response_format) for provider configuration details.
