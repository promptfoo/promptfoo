# policy evals

This suite evaluates the `PolicyPlugin` test generator itself.

It compares five native `promptfoo redteam generate` cases:

- normal single-input generation
- policy text with explicit test-generation instructions
- modifier-driven generation (Spanish output)
- multi-input generation with coordinated `document` / `query` attacks
- log-analysis generation with `PromptBlock:` output

The eval flow is:

- run `promptfoo redteam generate` against each case config under `cases/`
- normalize the generated YAML into a stable JSON payload
- feed that payload into Promptfoo assertions and `llm-rubric` checks through an executable prompt

That keeps the suite on Promptfoo's real CLI generation path instead of using a custom harness provider.

## Prerequisites

- `OPENAI_API_KEY` available in your environment or in `.env`

## Run

From the repository root:

```bash
npm run local -- validate -c src/redteam/plugins/policy/evals/promptfooconfig.yaml
npm run local -- eval -c src/redteam/plugins/policy/evals/promptfooconfig.yaml --env-file .env --no-cache
```

To generate any single comparison case directly:

```bash
npm run local -- redteam generate -c src/redteam/plugins/policy/evals/cases/normal-single-input.yaml -o /tmp/policy-normal.yaml --force
```

## Files

- `promptfooconfig.yaml` - eval suite
- `generatePolicyEvalPrompt.cjs` - executable prompt that runs `redteam generate` for one case and emits normalized JSON
- `cases/*.yaml` - native redteam generation configs being compared
- `tests/policy-generation.yaml` - case metadata and Promptfoo assertions
