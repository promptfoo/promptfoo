# provider-thegrid (The Grid AI)

Compare the `text-standard` and `text-prime` tiers on arithmetic, instruction following, and JSON extraction. Both use [The Grid AI's OpenAI-compatible endpoint](https://thegrid.ai).

## Run the example

```bash
npx promptfoo@latest init --example provider-thegrid
cd provider-thegrid
```

Set `THEGRID_API_KEY` to a Grid API key. Then run the eval and compare results.

```bash
npx promptfoo@latest eval
npx promptfoo@latest view
```

If reasoning consumes the output budget, raise `max_tokens` in the shared provider configuration. The models behind these tiers can change between runs. See [The Grid AI provider guide](https://www.promptfoo.dev/docs/providers/thegrid/) for model selection, credentials, and cost reporting.
