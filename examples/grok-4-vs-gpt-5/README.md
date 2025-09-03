# grok-4-vs-gpt-5 (xAI-Grok-4 vs OpenAI GPT-5 Comparison)

You can run this example with:

```bash
npx promptfoo@latest init --example grok-4-vs-gpt-5
```

This example demonstrates how to use Promptfoo to benchmark and red-team xAI Grok-4 and OpenAI GPT-5 side by side.

It compares both models on:

- Benchmark tasks (summarization, code writing, reasoning, SQL, JSON, math).
- Red-teaming tasks (jailbreak, harmful prompts, bias, data exfiltration).

Both models are accessed via OpenRouter, so you only need one API key.

## Prerequisites

- Node.js ≥ 18 and npm ≥ 9 installed (verify with `node -v` and `npm -v`)
- Promptfoo CLI installed (`npm install -g promptfoo` or `brew install promptfoo`)
- OpenRouter API key set as (`OPENROUTER_API_KEY`)

```bash
export OPENROUTER_API_KEY="sk-or-xxxxxxxx"
```

Run the evaluation with:

```bash
promptfoo eval
```

View the results:

```bash
promptfoo view
```
