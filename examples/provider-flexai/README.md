# provider-flexai (FlexAI)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-flexai
cd provider-flexai
```

## Usage

Set your `FLEXAI_API_KEY` environment variable. You can create a key on the [FlexAI platform](https://platform.flex.ai).

Then run:

```bash
promptfoo eval
```

View the results with `promptfoo view`.

## What this shows

- Two FlexAI chat models compared on short factual questions, both on a single `FLEXAI_API_KEY`:
  - `DeepSeek-V4-Flash-0731`, the default FlexAI chat model.
  - `gpt-oss-120b` with `reasoning_effort: low`. `showThinking: false` keeps its reasoning out of the graded answer.
- A `similar` assertion graded with FlexAI's `bge-m3` embedding model, so the example needs no other API key.

Model names change over time. If one returns a 404, pick a current id from `GET https://api.flex.ai/v1/models` or [flex.ai/models](https://flex.ai/models).
