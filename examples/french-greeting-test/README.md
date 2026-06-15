# french-greeting-test (Nested Assertion Sets)

This example checks a French greeting with a nested assertion set so correctness,
tone, relevance, and performance requirements stay grouped in the results view.

## Setup

```bash
npx promptfoo@latest init --example french-greeting-test
cd french-greeting-test
```

Set `OPENAI_API_KEY` before running the eval.

## Run

```bash
promptfoo eval
```

Add `--show-assertions` to print the nested assertion hierarchy in the CLI table:

```bash
promptfoo eval --show-assertions
```
