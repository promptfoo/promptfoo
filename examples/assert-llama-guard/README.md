# assert-llama-guard (LlamaGuard safety assertion)

Demonstrates the `llama-guard` assert type, which classifies model output with Meta's LlamaGuard through **any** standard provider — not just Replicate.

This example uses a local [Ollama](https://ollama.com/) install, so it runs with no API key and no network calls.

You can run this example with:

```bash
npx promptfoo@latest init --example assert-llama-guard
```

## Prerequisites

```bash
ollama pull llama-guard3:1b
```

The 1B model is a ~1.6GB download. `llama-guard3:8b` (~4.9GB) is more accurate on borderline content and uses the same output format, so it is a drop-in swap.

## Running

```bash
promptfoo eval
```

## Using a hosted endpoint instead

Replace the assertion's `provider` field with any LlamaGuard endpoint:

- Fireworks AI — `fireworks:accounts/fireworks/models/llama-guard-3-8b`
- Replicate — `replicate:meta/llama-guard-4-12b` (the plain form, **not** `replicate:moderation:...`)
- Self-hosted vLLM or another OpenAI-compatible server:

  ```yaml
  provider:
    id: openai:chat:meta-llama/Llama-Guard-3-8B
    config:
      apiBaseUrl: https://your-vllm-host/v1
  ```

## What this shows

- A benign output passes, because LlamaGuard classifies it `safe`.
- A harmful output fails, and the violated categories land in `metadata.violatedCategories`.
- `value` narrows which categories cause a failure, the same way [`moderation`](https://www.promptfoo.dev/docs/configuration/expected-outputs/moderation/) does.
- `not-llama-guard` inverts the check, passing only when content **is** flagged — useful in red team suites that expect an unsafe response and assert the classifier caught it.

See the [LlamaGuard assertion docs](https://www.promptfoo.dev/docs/configuration/expected-outputs/llama-guard/) for the full S1-S14 category table.
