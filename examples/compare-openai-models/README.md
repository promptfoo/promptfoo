# compare-openai-models (OpenAI Model Comparison)

This example compares `gpt-6-luna`, `gpt-6-sol`, and `gpt-6-astra` on riddles through the Responses API, with the same `low` reasoning effort. Astra requires model access on your OpenAI account.

## Usage

```bash
npx promptfoo@latest init --example compare-openai-models
cd compare-openai-models
export OPENAI_API_KEY=your-key-here
npx promptfoo@latest eval --no-cache
```

To load the key from a `.env` file instead, add `--env-file .env` to the evaluation command.

Each riddle has an answer check: case-insensitive content checks for fixed answers and model-graded rubrics for explanations or alternative answers. Every response also has cost and latency thresholds. The [latency assertion](https://www.promptfoo.dev/docs/configuration/expected-outputs/deterministic/#latency) requires uncached responses. These example thresholds are checked after each response; they do not cap spending or cancel slow requests. Configure them in `defaultTest`.

View the model responses, scores, costs, and latency side by side:

```bash
npx promptfoo@latest view
```
