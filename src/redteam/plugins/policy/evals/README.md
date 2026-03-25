# policy evals

This suite evaluates the `PolicyPlugin` test generator itself.

It compares four generation modes:

- normal single-input generation
- policy text with explicit test-generation instructions
- modifier-driven generation (Spanish output)
- multi-input generation with coordinated `document` / `query` attacks

The suite uses a local custom provider that calls the real `PolicyPlugin.generateTests()` path and returns a structured JSON trace containing:

- the rendered generation prompt sent to the model
- the raw model output
- the parsed generated cases

Promptfoo then grades those outputs with `llm-rubric` assertions tuned for policy-test quality, diversity, formatting, and case-specific expectations.

The default generator provider uses `gpt-4.1-mini` for stable plain-text prompt generation. You can duplicate the provider block in `promptfooconfig.yaml` to compare generator models directly.

## Prerequisites

- `OPENAI_API_KEY` available in your environment or in `.env`

## Run

From the repository root:

```bash
npm run local -- validate -c src/redteam/plugins/policy/evals/promptfooconfig.yaml
npm run local -- eval -c src/redteam/plugins/policy/evals/promptfooconfig.yaml --env-file .env --no-cache
```

To save and inspect the raw results:

```bash
npm run local -- eval -c src/redteam/plugins/policy/evals/promptfooconfig.yaml --env-file .env --no-cache -o src/redteam/plugins/policy/evals/output.json
```

## Files

- `promptfooconfig.yaml` - eval suite
- `policyGenerationProvider.cjs` - local harness that runs `PolicyPlugin.generateTests()`
- `tests/policy-generation.yaml` - comparison cases and grading assertions
