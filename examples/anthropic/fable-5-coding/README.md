# anthropic/fable-5-coding (Claude Fable 5 Advanced Coding)

This example exercises Claude Fable 5 on hard coding tasks using the `xhigh` effort level. Fable 5 always uses adaptive thinking, so no `thinking` configuration is needed.

You can run this example with:

```bash
npx promptfoo@latest init --example anthropic/fable-5-coding
cd fable-5-coding
```

## What This Tests

Claude Fable 5 is Anthropic's most powerful model — a new tier above Opus. This example evaluates:

- **Distributed-systems debugging** with incomplete information
- **Production-quality code generation** with concurrency concerns
- **Security-focused code review** with prioritized feedback

## Working with Fable 5

- **Adaptive thinking is always on.** Unlike Opus 4.7/4.8 (where adaptive thinking is opt-in), Fable 5 always thinks adaptively. There is nothing to configure: promptfoo converts a legacy `thinking: { type: enabled, budget_tokens: N }` config to adaptive and omits `thinking: { type: disabled }`, because the model rejects both.
- **Thinking summaries are opt-in.** By default the API omits thinking content (an empty thinking block, which promptfoo excludes from output). Set `thinking: { type: adaptive, display: summarized }` to include a readable summary.
- **Sampling controls are managed for you.** Fable 5 rejects `temperature`, `top_p`, and `top_k` at the model level; promptfoo omits them automatically (don't set them in config).
- **`effort` defaults to `high`; `xhigh` is available.** Start with `xhigh` for coding and agentic work, and pair high effort with a large `max_tokens` — thinking consumes output tokens before any visible text, so a tight budget can be spent entirely on thinking and yield an empty response.
- **1M-token context, up to 128K output tokens.** Priced at $10/$50 per million input/output tokens.

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

Fable 5 is also reachable through:

- AWS Bedrock — `bedrock:global.anthropic.claude-fable-5` (Runtime/Converse; requires the account to opt in to provider data sharing via `aws bedrock put-account-data-retention --mode provider_data_share`), or `bedrock:messages:anthropic.claude-fable-5` for Bedrock's Anthropic-compatible Messages endpoint in `us-east-1`/`eu-north-1`
- Google Vertex — `vertex:claude-fable-5`
- Azure AI Foundry — point `anthropic:messages:claude-fable-5` at `https://<resource>.services.ai.azure.com/anthropic` via `apiBaseUrl`

Across all providers, promptfoo automatically omits the unsupported sampling parameters and normalizes unsupported thinking configs for Fable 5. Note that Bedrock's regional and geo endpoints and Vertex's regional/multi-region endpoints (everything except `global`) carry a 10% price premium, which promptfoo includes in cost calculations.

## Learn More

- [Anthropic documentation](https://docs.anthropic.com)
- [Promptfoo Anthropic provider docs](https://promptfoo.dev/docs/providers/anthropic)
