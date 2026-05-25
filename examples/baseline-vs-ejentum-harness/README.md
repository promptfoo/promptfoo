# baseline-vs-ejentum-harness (Cognitive Scaffold Comparison)

You can run this example with:

```bash
npx promptfoo@latest init --example baseline-vs-ejentum-harness
cd baseline-vs-ejentum-harness
```

## Usage

This example compares the same `gpt-5.4-mini` model under two conditions on a small set of reasoning-heavy prompts:

- **baseline-gpt-5.4-mini**: plain OpenAI chat completion, no augmentation
- **ejentum-reasoning-gpt-5.4-mini**: the same model with a task-matched cognitive scaffold from the [Ejentum Logic API](https://ejentum.com) injected into the system message before the call

Each row in the eval table is the same task posed to both providers, scored by the same `llm-rubric`. The rubric checks for three behaviors that the harness targets directly: naming relevant trade-offs before recommending, refusing to skip steps when the user invites skipping, and grounding the final recommendation in named criteria. The table format makes the lift (if any) visible per task.

## Setup

Set `OPENAI_API_KEY` (required for both providers) and `EJENTUM_API_KEY` (required only for the augmented provider), then run:

```bash
promptfoo eval --no-cache
```

Get an Ejentum key at <https://ejentum.com/dashboard>. Free and paid tiers are available.

Without `EJENTUM_API_KEY`, the augmented half of the eval will error out, but the baseline `openai:chat:gpt-5.4-mini` provider still runs to completion — so you can preview the baseline scores even without an Ejentum account.

The custom provider in this directory (`provider.js`) is meant as a transferable template: it shows how to pre-fetch a per-task prompt augmentation, splice it into the system message, and return the result in promptfoo's standard provider shape. You can adapt the same pattern to any prompt-augmentation service — LangChain, DSPy, a self-hosted retrieval pipeline, or your own internal API — by swapping the `fetch` call in step 1.

### Pointing at a different endpoint

The Ejentum base URL is configurable so you can target staging or a self-hosted endpoint without editing code. The provider resolves it in this order: `config.apiUrl` in `promptfooconfig.yaml`, then `EJENTUM_API_URL` env var, then the default. For example:

```yaml
- id: file://provider.js
  label: ejentum-reasoning-gpt-5.4-mini
  config:
    mode: reasoning
    apiUrl: https://your-endpoint.example.com/logicv1/
```

## How the custom provider works

`provider.js` is a one-class custom provider:

1. On each test, it calls the Ejentum Logic API with the test's prompt and the configured `mode` (default `reasoning`).
2. It splices the returned scaffold into the system message of an OpenAI chat completion.
3. It returns the completion in the standard promptfoo provider shape (`output`, `tokenUsage`).

Provider config options (set in `promptfooconfig.yaml`):

| Option             | Default                 | Notes                                                                                       |
| ------------------ | ----------------------- | ------------------------------------------------------------------------------------------- |
| `mode`             | `reasoning`             | One of `reasoning`, `code`, `anti-deception`, `memory`.                                     |
| `model`            | `gpt-5.4-mini`          | Any OpenAI chat-completion model.                                                           |
| `reasoning_effort` | `none`                  | OpenAI reasoning effort applied to the completion request.                                  |
| `verbosity`        | `low`                   | OpenAI response verbosity applied to the completion request.                                |
| `apiUrl`           | Ejentum public endpoint | Override the Ejentum base URL. Falls back to `EJENTUM_API_URL`, then the default published. |

To test a different harness (for example, the anti-deception mode), copy the `file://provider.js` provider block, change `mode: reasoning` to `mode: anti-deception`, and update the label.

## Bringing your own prompts

The four `tests:` entries in `promptfooconfig.yaml` are seed prompts. Replace them with prompts from your own workload to see how the harness affects results on tasks you actually run. The `defaultTest` rubric is general enough to apply across most reasoning tasks; tighten it per-test if you need stricter scoring.

## Configuration is minimal

This example is intentionally small: two providers, one rubric, four tests, one custom provider file. It can be inlined into a larger promptfoo project by copying just the `providers:` block and `provider.js` into your own config.
