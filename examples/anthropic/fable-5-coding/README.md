# anthropic/fable-5-coding (Claude Fable 5 Advanced Coding)

Compare Claude Fable 5.2 and Fable 5.1 on coding tasks at `xhigh` effort. Both always use adaptive thinking.

You can run this example with:

```bash
npx promptfoo@latest init --example anthropic/fable-5-coding
cd anthropic/fable-5-coding
```

## What This Tests

This example evaluates:

- **Distributed-systems debugging** with incomplete information
- **Production-quality code generation** with concurrency concerns
- **Security-focused code review** with prioritized feedback

## Working with Fable 5.x

- **Adaptive thinking is always on.** Unlike Opus 4.7/4.8 (where adaptive thinking is opt-in), Fable models always think adaptively. There is nothing to configure: promptfoo converts a legacy `thinking: { type: enabled, budget_tokens: N }` config to adaptive and omits `thinking: { type: disabled }`, because the model rejects both.
- **Thinking summaries are opt-in.** By default the API omits thinking content (an empty thinking block, which promptfoo excludes from output). Set `thinking: { type: adaptive, display: summarized }` to include a readable summary.
- **Sampling controls are managed for you.** Fable rejects `temperature`, `top_p`, and `top_k` at the model level; promptfoo omits them automatically (don't set them in config). Fable 5.1 and 5.2 also reject forced `tool_choice`, which promptfoo omits.
- **`effort` defaults to `high`; `xhigh` is available.** Start with `xhigh` for coding and agentic work, and pair high effort with a large `max_tokens` — thinking consumes output tokens before any visible text, so a tight budget can be spent entirely on thinking and yield an empty response.
- **1M-token context, up to 128K output tokens.** Fable 5.2 costs $8/$40 per million input/output tokens; Fable 5.1 costs $10/$50.

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

Fable 5.2 is also reachable through:

- AWS Bedrock — `bedrock:global.anthropic.claude-fable-5-2` or `bedrock:us.anthropic.claude-fable-5-2` (InvokeModel), `bedrock:converse:global.anthropic.claude-fable-5-2`, or `bedrock:messages:global.anthropic.claude-fable-5-2` for Bedrock Runtime's Anthropic-compatible Messages endpoint
- Google Vertex — `vertex:claude-fable-5-2`
- Azure AI Foundry — point `anthropic:messages:claude-fable-5-2` at `https://<resource>.services.ai.azure.com/anthropic` via `apiBaseUrl`

Across all providers, promptfoo automatically omits the unsupported sampling parameters and normalizes unsupported thinking configs for Fable. Note that Bedrock's regional and geo endpoints and Vertex's regional/multi-region endpoints (everything except `global`) carry a 10% price premium, which promptfoo includes in cost calculations.

## Learn More

- [Anthropic documentation](https://docs.anthropic.com)
- [Promptfoo Anthropic provider docs](https://promptfoo.dev/docs/providers/anthropic)
