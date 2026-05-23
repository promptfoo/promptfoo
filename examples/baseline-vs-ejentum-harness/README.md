# baseline-vs-ejentum-harness (Cognitive Scaffold Comparison)

You can run this example with:

```bash
npx promptfoo@latest init --example baseline-vs-ejentum-harness
cd baseline-vs-ejentum-harness
```

## Usage

This example compares the same `gpt-4o-mini` model under two conditions on a small set of reasoning-heavy prompts:

- **baseline-gpt-4o-mini**: plain OpenAI chat completion, no augmentation
- **ejentum-reasoning-gpt-4o-mini**: the same model with a task-matched cognitive scaffold from the [Ejentum Logic API](https://ejentum.com) injected into the system message before the call

Each row in the eval table is the same task posed to both providers, scored by the same `llm-rubric`. The rubric checks for three behaviors that the harness targets directly: naming relevant trade-offs before recommending, refusing to skip steps when the user invites skipping, and grounding the final recommendation in named criteria. The table format makes the lift (if any) visible per task.

Set `OPENAI_API_KEY` and `EJENTUM_API_KEY`, then run:

```bash
promptfoo eval --no-cache
```

Get an Ejentum key at <https://ejentum.com/dashboard>. Free and paid tiers are available.

## How the custom provider works

`provider.js` is a one-class custom provider:

1. On each test, it calls the Ejentum Logic API with the test's prompt and the configured `mode` (default `reasoning`).
2. It splices the returned scaffold into the system message of an OpenAI chat completion.
3. It returns the completion in the standard promptfoo provider shape (`output`, `tokenUsage`).

Provider config options (set in `promptfooconfig.yaml`):

| Option | Default | Notes |
|---|---|---|
| `mode` | `reasoning` | One of `reasoning`, `code`, `anti-deception`, `memory`. |
| `model` | `gpt-4o-mini` | Any OpenAI chat-completion model. |
| `temperature` | `0` | Standard OpenAI temperature. |

To test a different harness (for example, the anti-deception mode), copy the `file://provider.js` provider block, change `mode: reasoning` to `mode: anti-deception`, and update the label.

## Bringing your own prompts

The four `tests:` entries in `promptfooconfig.yaml` are seed prompts. Replace them with prompts from your own workload to see how the harness affects results on tasks you actually run. The `defaultTest` rubric is general enough to apply across most reasoning tasks; tighten it per-test if you need stricter scoring.

## Configuration is minimal

This example is intentionally small: two providers, one rubric, four tests, one custom provider file. It can be inlined into a larger promptfoo project by copying just the `providers:` block and `provider.js` into your own config.
