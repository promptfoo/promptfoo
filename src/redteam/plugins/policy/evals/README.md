# policy evals

This suite evaluates the `PolicyPlugin` test generator itself.

It compares four native `promptfoo redteam generate` cases:

- normal single-input generation
- policy text with explicit test-generation instructions
- modifier-driven generation (Spanish output)
- multi-input generation with coordinated `document` / `query` attacks

The eval flow is:

- run `promptfoo redteam generate` against each case config under `cases/`
- parse the generated YAML test artifacts
- feed those generated cases into Promptfoo assertions and `llm-rubric` checks

That keeps the suite on Promptfoo's real CLI generation path instead of using a custom harness provider.

## Prerequisites

- `OPENAI_API_KEY` available in your environment or in `.env`

## Run

From the repository root:

```bash
npm run local -- validate -c src/redteam/plugins/policy/evals/promptfooconfig.yaml
npm run local -- eval -c src/redteam/plugins/policy/evals/promptfooconfig.yaml --env-file .env --no-cache
```

## Files

- `promptfooconfig.yaml` - eval suite
- `generateEvalCases.cjs` - JS test generator that runs `redteam generate` for each case config
- `cases/*.yaml` - native redteam generation configs being compared
- `tests/policy-generation.yaml` - case metadata and Promptfoo assertions
