# openai-gpt5-verbosity (OpenAI GPT-5 Verbosity & Minimal Reasoning)

This example demonstrates GPT-5-only parameters in promptfoo:

- `verbosity`: Controls response verbosity (`low`, `medium`, `high`)
- `reasoning.effort`: Extended to allow `minimal` for GPT-5 models

## Prerequisites

- Set `OPENAI_API_KEY` in your environment

## How to run

You can run this example with:

```bash
npx promptfoo@latest init --example openai-gpt5-verbosity
```

Then execute an evaluation locally:

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml
```

If developing locally on the promptfoo repo, prefer:

```bash
npm run local -- eval -c examples/openai-gpt5-verbosity/promptfooconfig.yaml
```

## What it shows

- How to enable GPT-5 specific `verbosity`
- How to set `reasoning.effort: minimal` for GPT-5 models
