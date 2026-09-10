# anthropic/sonnet-5 (Claude Sonnet 5 Agentic Reasoning)

This example exercises Claude Sonnet 5 on agentic reasoning and coding tasks using the `high` effort level with adaptive thinking.

You can run this example with:

```bash
npx promptfoo@latest init --example anthropic/sonnet-5
cd sonnet-5
```

## What This Tests

Claude Sonnet 5 is the Claude 5-generation Sonnet — built to be Anthropic's most agentic Sonnet, with capability approaching Opus 4.8 at Sonnet pricing and a 1M-token context window. This example evaluates:

- **Multi-system bug diagnosis** of an intermittent production failure
- **Production-quality code generation** with error handling and caching

## Working with Sonnet 5

- **Adaptive thinking is opt-in.** Set `thinking: { type: adaptive }` (as this example does) to let the model decide when and how much to reason per request. Without an explicit `thinking` block the model runs **without** extended thinking, even at high effort. Unlike Fable 5 / Mythos 5, Sonnet 5 also accepts `thinking: { type: disabled }`.
- **`effort` tunes the cost/performance tradeoff.** Sonnet 5 supports `low`, `medium`, `high`, `xhigh`, and `max`. `high` is a good cost-efficient default; step up to `xhigh`/`max` for the hardest work and pair high effort with a large `max_tokens`.
- **Sampling controls are managed for you.** Sonnet 5 rejects `temperature`, `top_p`, and `top_k` at the model level; promptfoo omits them automatically (don't set them in config).
- **Pricing.** $3/$15 per million input/output tokens standard, with introductory pricing of $2/$10 through August 31, 2026. The full 1M-token context bills at the standard rate (no long-context surcharge).

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

Sonnet 5 is also reachable through:

- AWS Bedrock — `bedrock:us.anthropic.claude-sonnet-5` (or `bedrock:converse:us.anthropic.claude-sonnet-5`)
- Google Vertex — `vertex:claude-sonnet-5` with `config.region: global` (availability may roll out after the Anthropic API launch)
- Azure AI Foundry — point `anthropic:messages:claude-sonnet-5` at `https://<resource>.services.ai.azure.com/anthropic` via `apiBaseUrl`

Across all four providers, promptfoo automatically omits the unsupported sampling parameters (`temperature`, `top_p`, `top_k`) for Sonnet 5. The Anthropic Messages provider — used directly and for Azure AI Foundry via `apiBaseUrl` — logs a one-time warning if you set them explicitly; the Bedrock and Vertex paths omit them silently.

## Learn More

- [Claude Sonnet 5 announcement](https://www.anthropic.com/news/claude-sonnet-5)
- [Anthropic documentation](https://docs.anthropic.com)
- [Promptfoo Anthropic provider docs](https://promptfoo.dev/docs/providers/anthropic)
