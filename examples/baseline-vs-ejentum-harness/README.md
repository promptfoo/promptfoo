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

The custom provider in this directory (`provider.mjs`) is meant as a transferable template: it shows how to pre-fetch a per-task prompt augmentation, splice it into the system message, and return the result in promptfoo's standard provider shape. You can adapt the same pattern to any prompt-augmentation service - LangChain, DSPy, a self-hosted retrieval pipeline, or your own internal API - by replacing the scaffold request in step 1.

### Pointing at a different endpoint

The Ejentum base URL is configurable so you can target staging or a self-hosted endpoint without editing code. The provider resolves it in this order: `config.apiUrl` in `promptfooconfig.yaml`, then `EJENTUM_API_URL` env var, then the default. For example:

```yaml
- id: file://provider.mjs
  label: ejentum-reasoning-gpt-5.4-mini
  config:
    mode: reasoning
    apiUrl: https://your-endpoint.example.com/logicv1/
```

The OpenAI completion endpoint follows the built-in provider's routing options: set `config.apiHost`, `OPENAI_API_HOST`, `config.apiBaseUrl`, `OPENAI_API_BASE_URL`, or `OPENAI_BASE_URL` when using an OpenAI-compatible gateway or local endpoint. Authentication configuration such as `apiKey`, `apiKeyEnvar`, `apiKeyRequired`, `organization`, and `headers` is also forwarded by the augmented provider so both comparison arms can use the same gateway or account setup. Both external calls use Promptfoo's standard cached, proxy-aware transport, including its proxy and custom CA/TLS configuration.

## How the custom provider works

`provider.mjs` is a one-class custom provider:

1. On each test, it calls the Ejentum Logic API with the test's prompt and the configured `mode` (default `reasoning`).
2. It splices the returned scaffold into the system message of an OpenAI chat completion.
3. It returns the completion in the standard promptfoo provider shape (`output`, `tokenUsage`).

Provider config options (set in `promptfooconfig.yaml`):

| Option                  | Default                 | Notes                                                                                         |
| ----------------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| `mode`                  | `reasoning`             | One of `reasoning`, `code`, `anti-deception`, `memory`.                                       |
| `model`                 | `gpt-5.4-mini`          | Any OpenAI chat-completion model.                                                             |
| `reasoning_effort`      | -                       | Included only when set for reasoning or GPT-5-compatible chat models.                         |
| `verbosity`             | -                       | Included only when set for GPT-5 chat models.                                                 |
| `max_tokens`            | `1024` for chat models  | Matches the built-in default for non-reasoning chat models; configurable when changing model. |
| `max_completion_tokens` | -                       | Completion cap for GPT-5 and o-series models.                                                 |
| `temperature`           | `0` for chat models     | Matches the built-in default for non-reasoning chat models.                                   |
| `omitDefaults`          | `false`                 | Set `true` to omit ordinary-chat token and temperature defaults.                              |
| `apiUrl`                | Ejentum public endpoint | Override the Ejentum base URL. Falls back to `EJENTUM_API_URL`, then the default published.   |
| `ejentumApiKey`         | `EJENTUM_API_KEY`       | Set an Ejentum key in local provider config; prefer environment variables in shared files.    |
| `ejentumApiKeyEnvar`    | -                       | Read the Ejentum key from a named environment variable.                                       |
| `apiHost`               | -                       | Override the OpenAI host, matching the baseline provider and `OPENAI_API_HOST`.               |
| `apiBaseUrl`            | OpenAI public endpoint  | Override the OpenAI base URL. Falls back to `OPENAI_API_BASE_URL`, then `OPENAI_BASE_URL`.    |
| `apiKey`                | `OPENAI_API_KEY`        | Override the OpenAI key for the augmented provider.                                           |
| `apiKeyEnvar`           | -                       | Read the OpenAI key from a named environment override.                                        |
| `apiKeyRequired`        | `true`                  | Set `false` for local OpenAI-compatible endpoints that do not require authentication.         |
| `organization`          | `OPENAI_ORGANIZATION`   | Forward the OpenAI organization header.                                                       |
| `headers`               | -                       | Forward custom request headers to the OpenAI completion endpoint.                             |

To test a different harness (for example, the anti-deception mode), copy the `file://provider.mjs` provider block, change `mode: reasoning` to `mode: anti-deception`, and update the label.

## Bringing your own prompts

The four `tests:` entries in `promptfooconfig.yaml` are seed prompts. Replace them with prompts from your own workload to see how the harness affects results on tasks you actually run. The `defaultTest` rubric is general enough to apply across most reasoning tasks; tighten it per-test if you need stricter scoring.

When your prompts are JSON or YAML chat message arrays, the augmented provider preserves their roles and inserts the scaffold as an additional system message, so the baseline and augmented arms still run the same original conversation. JSON chat prompts require no additional package; before using YAML chat prompts in a copied example, run `npm install js-yaml`.

## Configuration is minimal

This example is intentionally small: two providers, one rubric, four tests, one custom provider file. It can be inlined into a larger promptfoo project by copying just the `providers:` block and `provider.mjs` into your own config.
