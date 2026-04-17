# openai-reasoning-comparison (OpenAI Reasoning Effort Comparison)

You can run this example with:

```bash
npx promptfoo@latest init --example openai-reasoning-comparison
cd openai-reasoning-comparison
```

## Usage

This example compares the same `gpt-5.4-mini` Responses API model with two reasoning settings:

- `none` for low-latency tasks that do not need reasoning tokens
- `medium` for tasks where extra deliberation may improve reliability

Set `OPENAI_API_KEY`, then run:

```bash
promptfoo eval --no-cache
```

The provider, prompt, verbosity, and output limit are otherwise identical, so the eval table makes it easier to compare output quality, latency, and cost for each reasoning effort.
