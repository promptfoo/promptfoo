# provider-moonshot (Moonshot AI / Kimi)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-moonshot
cd provider-moonshot
```

## Usage

Set your `MOONSHOT_API_KEY` environment variable. You can get a key from the [Kimi (Moonshot) platform](https://platform.kimi.ai/console/api-keys).

Then run:

```bash
promptfoo eval
```

View the results with `promptfoo view`.

## What this shows

- Two Moonshot model families compared on a short summarisation task, both on a single `MOONSHOT_API_KEY`:
  - `kimi-k2.6` — Moonshot's flagship Kimi K2 **thinking** model. It reasons before answering; `showThinking: false` keeps that reasoning out of the graded output.
  - `moonshot-v1-8k` — a generation model with a configurable `temperature`.
- Plain `icontains` / `icontains-any` assertions, so the example runs with nothing but a `MOONSHOT_API_KEY` (Moonshot does not expose an embeddings endpoint).

Kimi K2 (`kimi-k2.x`) models pin `temperature` and the other sampling params to fixed values, so leave them unset — the provider handles that for you. Model names rotate over time; if one 404s, pick a current id from the [Kimi model list](https://platform.kimi.ai/docs/api/list-models).
