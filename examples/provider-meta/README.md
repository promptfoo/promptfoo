# provider-meta (Meta Model API)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-meta
cd provider-meta
```

## Usage

Set your `MODEL_API_KEY` environment variable — Meta's default, the same variable its official SDKs use. You can create a key from the API keys tab on the [Meta Model API dashboard](https://dev.meta.ai/). The provider also reads `META_API_KEY` as a promptfoo-specific override.

Then run:

```bash
promptfoo eval
```

View the results with `promptfoo view`.

## What this shows

- `muse-spark-1.1` — Meta's Muse Spark multimodal reasoning model — evaluated at two `reasoning_effort` levels (`minimal` vs `high`) on a short summarisation task, so you can compare answer quality, latency, and cost.
- Cost is computed automatically from Meta's published pricing, including the cheaper cached-input rate for prompt-cache hits.
- Plain `icontains` / `icontains-any` assertions, so the example runs with nothing but a `MODEL_API_KEY`.

To try search grounding with inline citations, switch a provider to the Responses API endpoint: `meta:responses:muse-spark-1.1` with `tools: [{ type: web_search }]` — see the [provider docs](https://www.promptfoo.dev/docs/providers/meta/).
