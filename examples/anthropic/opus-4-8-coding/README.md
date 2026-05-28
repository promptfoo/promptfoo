# anthropic/opus-4-8-coding (Claude Opus 4.8 Advanced Coding)

This example exercises Claude Opus 4.8 on hard coding tasks using the `xhigh` effort level with adaptive thinking.

You can run this example with:

```bash
npx promptfoo@latest init --example anthropic/opus-4-8-coding
cd opus-4-8-coding
```

## What This Tests

Claude Opus 4.8 is Anthropic's most capable model for complex reasoning and agentic coding. This example evaluates:

- **Bug diagnosis** across multiple system boundaries
- **Production-quality code generation** with proper error handling
- **Code review** with nuanced, prioritized feedback

## Working with Opus 4.8

- **Builds on Opus 4.7.** Opus 4.8 supports the same feature set as 4.7 (no breaking API changes) and improves capability on complex reasoning and long-horizon agentic coding.
- **Adaptive thinking is opt-in.** Set `thinking: { type: adaptive }` (as this example does) to let the model decide when and how much to reason per request. Without an explicit `thinking` block the model runs **without** extended thinking, even at high effort.
- **`effort` defaults to `high`; `xhigh` is available.** Setting `effort: high` behaves the same as omitting it. Start with `xhigh` for coding and agentic work, and pair high effort with a large `max_tokens`.
- **Sampling controls are managed for you.** Opus 4.8 rejects `temperature`, `top_p`, and `top_k` at the model level; promptfoo omits them automatically (don't set them in config).

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

Opus 4.8 is also reachable through:

- AWS Bedrock — `bedrock:us.anthropic.claude-opus-4-8` (or `bedrock:converse:us.anthropic.claude-opus-4-8`)
- Google Vertex — `vertex:claude-opus-4-8` with `config.region: global`
- Azure AI Foundry — point `anthropic:messages:claude-opus-4-8` at `https://<resource>.services.ai.azure.com/anthropic` via `apiBaseUrl`

Across all four providers, promptfoo automatically omits the unsupported sampling parameters (`temperature`, `top_p`, `top_k`) for Opus 4.8. The Anthropic Messages provider also logs a one-time warning if you set them explicitly; the Bedrock, Vertex, and Azure paths omit them silently.

## Learn More

- [Claude Opus 4.8 announcement](https://www.anthropic.com/news/claude-opus-4-8)
- [Anthropic documentation](https://docs.anthropic.com)
- [Promptfoo Anthropic provider docs](https://promptfoo.dev/docs/providers/anthropic)
