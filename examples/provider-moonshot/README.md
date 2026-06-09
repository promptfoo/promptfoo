# provider-moonshot (Moonshot AI / Kimi)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-moonshot
cd provider-moonshot
```

## Usage

Set your `MOONSHOT_API_KEY` environment variable. You can get a key from the [Moonshot Platform](https://platform.moonshot.ai/console/api-keys).

Then run:

```bash
promptfoo eval
```

View the results with `promptfoo view`.

## What this shows

- Two Moonshot **Kimi** chat models (`kimi-k2-0711-preview` and `moonshot-v1-8k`) compared on a short summarisation task.
- Plain `icontains` / `icontains-any` assertions, so the example runs with nothing but a `MOONSHOT_API_KEY` (Moonshot does not expose an embeddings endpoint).

Model names rotate over time — if one 404s, pick a current id from the [Moonshot model list](https://platform.moonshot.ai/docs/pricing/chat).
