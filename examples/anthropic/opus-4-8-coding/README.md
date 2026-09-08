# anthropic/opus-4-8-coding (Opus-Tier Advanced Coding)

This example exercises the Opus-tier Claude models on hard coding tasks, comparing **Claude Opus 5** against **Claude Opus 4.8** at `xhigh` effort — plus Opus 5 at `low` so you can see the effort tradeoff on your own tasks.

You can run this example with:

```bash
npx promptfoo@latest init --example anthropic/opus-4-8-coding
cd opus-4-8-coding
```

## What This Tests

Opus 5 is the current Opus-tier model, at the same $5/$25 pricing as Opus 4.8 — so this is a like-for-like capability comparison rather than a cost one. This example evaluates:

- **Bug diagnosis** across multiple system boundaries
- **Production-quality code generation** with proper error handling
- **Code review** with nuanced, prioritized feedback

## Working with Opus 5

- **Thinking is on by default.** This is the key difference from Opus 4.8: an omitted `thinking` block runs adaptive thinking rather than none. Since `max_tokens` caps thinking **plus** the answer, give it headroom — promptfoo's default rises to 2048 on this model, but set it explicitly for real work. On the bug-diagnosis task in this example, Opus 5 at `xhigh` spent ~4.4k tokens thinking; an 8k budget truncated the answer mid-sentence, which is why this config uses 16k.
- **Disabling thinking is effort-gated.** `thinking: { type: disabled }` is only accepted at `effort` `high` or below; pairing it with `xhigh` or `max` returns a 400. Promptfoo drops the rejected `disabled` (keeping your `effort`) and warns once.
- **`effort` is the main cost lever.** Opus 5 supports `low` through `max`. Start at `xhigh` for coding and agentic work, then sweep downward — `low` and `medium` are unusually strong here, which is why this example runs both.
- **Sampling controls are managed for you.** Opus 5 rejects `temperature`, `top_p`, and `top_k` at the model level; promptfoo omits them automatically (don't set them in config).

## Working with Opus 4.8

- **Builds on Opus 4.7.** Opus 4.8 supports the same feature set as 4.7 (no breaking API changes) and improves capability on complex reasoning and long-horizon agentic coding.
- **Adaptive thinking is opt-in.** Unlike Opus 5, without an explicit `thinking` block Opus 4.8 runs **without** extended thinking, even at high effort — so this example sets `thinking: { type: adaptive }` on the 4.8 provider.
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
