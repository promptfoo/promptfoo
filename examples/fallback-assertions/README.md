# fallback-assertions (Fallback Assertions Example)

## Run the example

Try this example after setting `OPENAI_API_KEY` in your environment:

```bash
npx promptfoo@latest init --example fallback-assertions
cd fallback-assertions
npx promptfoo eval --no-cache -o output.json
```

## How fallbacks work

Each test starts with a fast assertion. When it fails, `fallback: next` runs the next assertion in the list. A passing assertion stops its chain; an independent assertion outside the chain still runs.

```yaml
assert:
  - type: contains
    value: Paris
    fallback: next
  - type: llm-rubric
    value: The response identifies Paris as the capital of France
```

If the response contains “Paris”, the rubric is skipped. Otherwise the rubric grades the response. Chains can have more than two assertions: put `fallback: next` on each link except the last one.

Only the assertion that ends a chain contributes to its score and weight. Earlier failures that led to a fallback remain available in the result details, along with their named metrics and token usage. A grader outage or an assertion that could not run stops the chain so a fallback cannot hide the error.

A fallback must have a following assertion in the same test or assertion set. It cannot lead into another assertion set, `select-*`, or `max-score`; redteam guardrails cannot start fallback chains. See [promptfooconfig.yaml](./promptfooconfig.yaml) for independent assertions alongside two- and three-step chains.
