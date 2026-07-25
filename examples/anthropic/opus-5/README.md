# anthropic/opus-5 (Claude Opus 5 Agentic Coding)

This example exercises Claude Opus 5 on agentic coding and diagnosis tasks, comparing the `xhigh` and `low` effort levels side by side.

You can run this example with:

```bash
npx promptfoo@latest init --example anthropic/opus-5
cd opus-5
```

## What This Tests

Claude Opus 5 is the Opus-tier Claude 5 model, aimed at complex agentic coding and long-horizon work at the same list price as Opus 4.8. This example evaluates:

- **Multi-system bug diagnosis** of an intermittent production failure
- **Multi-file refactor planning**, including the tradeoffs of the chosen approach

Both run at two effort levels so you can see the cost/quality tradeoff on your own tasks.

## Working with Opus 5

- **Thinking is on by default.** Unlike Opus 4.7/4.8 — where omitting `thinking` meant no extended thinking — an omitted `thinking` block on Opus 5 runs adaptive thinking. `max_tokens` caps thinking **plus** response text, so give it headroom; promptfoo's default rises to 2048 on this model, but set it explicitly for real work.
- **Disabling thinking is effort-gated.** `thinking: { type: disabled }` is only accepted at `effort` `high` or below — pairing it with `xhigh` or `max` returns a 400. Promptfoo drops the rejected `disabled` (keeping your `effort`) and warns once; lower `effort` to `high` if you need thinking off.
- **`effort` is the main cost lever.** Opus 5 supports `low`, `medium`, `high`, `xhigh`, and `max`. Start at `xhigh` for coding and agentic work, then sweep downward — `low` and `medium` are unusually strong on this model.
- **Sampling controls are managed for you.** Opus 5 rejects `temperature`, `top_p`, and `top_k` at the model level; promptfoo omits them automatically (don't set them in config).
- **Pricing.** $5/$25 per million input/output tokens — the same as Opus 4.8. The full 1M-token context bills at the standard rate (no long-context surcharge). Fast mode ($10/$50, Claude API only) is not encoded in promptfoo's cost calculation; set `inputCost: 10 / 1e6` and `outputCost: 50 / 1e6` to track it (a single `cost` is applied as both rates).

## Running the Example

```bash
# Set your API key
export ANTHROPIC_API_KEY=your_api_key_here

# Run the evaluation
npx promptfoo@latest eval

# View results
npx promptfoo@latest view
```

## Other providers

Opus 5 is also reachable through:

- AWS Bedrock — `bedrock:us.anthropic.claude-opus-5` (or `bedrock:converse:global.anthropic.claude-opus-5`)
- Google Vertex — `vertex:claude-opus-5` with `config.region: global` (verified working; regional endpoints depend on the quota provisioned for your GCP project)
- Azure AI Foundry — point `anthropic:messages:claude-opus-5` at `https://<resource>.services.ai.azure.com/anthropic` via `apiBaseUrl`

Across all four providers, promptfoo automatically omits the unsupported sampling parameters (`temperature`, `top_p`, `top_k`) for Opus 5. The Anthropic Messages provider — used directly and for Azure AI Foundry via `apiBaseUrl` — logs a one-time warning if you set them explicitly; the Bedrock and Vertex paths omit them silently.

## Learn More

- [Claude Opus 5 announcement](https://www.anthropic.com/news/claude-opus-5)
- [Anthropic documentation](https://docs.anthropic.com)
- [Promptfoo Anthropic provider docs](https://promptfoo.dev/docs/providers/anthropic)
