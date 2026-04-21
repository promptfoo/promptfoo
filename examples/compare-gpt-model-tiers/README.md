# compare-gpt-model-tiers (Comparing GPT Model Tiers)

You can run this example with:

```bash
npx promptfoo@latest init --example compare-gpt-model-tiers
cd compare-gpt-model-tiers
```

## Usage

Set your OPENAI_API_KEY environment variable, then run `npx promptfoo@latest eval`.

This example compares `gpt-5.4`, `gpt-5.4-mini`, and `gpt-5.4-nano` on the same prompts so you can compare quality, latency, and cost across model tiers.

Note: this example uses a [latency assertion](https://www.promptfoo.dev/docs/configuration/expected-outputs/deterministic/#latency), so use `--no-cache` to get accurate timing results.
