# openai-decisions (OpenAI Decisions API)

Classify CI failures, estimate whether infrastructure caused the failure, and score its impact using OpenAI's standalone Decisions API.

## Setup

The Decisions API is in alpha and requires an enabled OpenAI project. Model availability and the API contract may change. Set `OPENAI_API_KEY` in your environment, then run:

```sh
npx promptfoo@latest init --example openai-decisions
cd openai-decisions
npx promptfoo@latest eval --no-cache -o results.json
```

From a Promptfoo source checkout, run from the repository root:

```sh
npm run local -- eval -c examples/openai-decisions/promptfooconfig.yaml --no-cache -o results.json
```

Add `--env-file .env` when your key is in a local `.env` file.

## Inspect the results

The two cases describe a TypeScript compilation error and a CI runner failure. Each asks three independent questions about the same log:

- `category` chooses `compile`, `test`, or `infrastructure`.
- `infrastructure_failure` returns the probability that the runner or its dependencies caused the failure.
- `impact` returns an expected score over three ordered levels, from `0` for routine to `2` for blocked.

The assertions check the expected category, a high or low infrastructure probability, and the score range. Probabilities can vary across runs. A score can fall between levels; it is not a selected integer level.

Inspect `results.results` in `results.json` for `success`, `score`, `error`, and `response.output`. Provider output is a JSON string: use `JSON.parse(output).answers` in assertions. Answers preserve question order and names. A refused question has `type: refusal` and no probability or score, so these assertions fail when their required answers are refused.

See the [provider documentation](https://www.promptfoo.dev/docs/providers/openai-decisions/).
