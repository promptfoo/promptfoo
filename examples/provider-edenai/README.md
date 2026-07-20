# provider-edenai (Eden AI)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-edenai
cd provider-edenai
```

## Usage

Set your `EDENAI_API_KEY` environment variable. You can get a key from the [Eden AI dashboard](https://app.edenai.run/admin/account/settings).

Then run:

```bash
promptfoo eval
```

View the results with `promptfoo view`.

## What this shows

- Two models from different vendors compared on a short summarisation task, both on a single `EDENAI_API_KEY`:
  - `openai/gpt-4o-mini`
  - `anthropic/claude-sonnet-4-5`
- Plain `icontains` / `icontains-any` assertions, so the example runs with nothing but an `EDENAI_API_KEY`.

Eden AI is an EU-based, OpenAI-compatible gateway, so model ids are vendor-prefixed (`vendor/model`). For EU data residency, add `config: { apiBaseUrl: https://api.eu.edenai.run/v3 }` to a provider. Model names rotate over time; if one 404s, pick a current id from the models API (`GET https://api.edenai.run/v3/models`).
