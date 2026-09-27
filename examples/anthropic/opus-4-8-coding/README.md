# anthropic/opus-4-8-coding (Opus-Tier Advanced Coding)

This example runs the Opus-tier Claude models on hard coding tasks. It compares **Claude Opus 5.5**, **Claude Opus 5**, and **Claude Opus 4.8** at `xhigh` effort, and also runs Opus 5.5 at `low` so you can see how effort changes results on your own tasks.

You can run this example with:

```bash
npx promptfoo@latest init --example anthropic/opus-4-8-coding
cd opus-4-8-coding
```

## What This Tests

Opus 5.5 costs $4 / $20 per million input / output tokens. Opus 5 and Opus 4.8 both cost $5 / $25. The eval covers:

- **Bug diagnosis** across multiple system boundaries
- **Production-quality code generation** with proper error handling
- **Code review** with nuanced, prioritized feedback

## Working with Opus 5.5

- **Thinking is always on.** Opus 5.5 rejects `thinking: { type: disabled }` and manual `budget_tokens` at every effort level. Promptfoo removes `disabled`, turns `enabled` into `adaptive`, and logs a warning once. `max_tokens` covers thinking **plus** the answer, and at the same effort level Opus 5.5 thinks more than Opus 5. At `xhigh`, a 16K `max_tokens` cut off the code-generation answer in this example, so this config uses 32K with `stream: true`.
- **`effort` is the only way to control thinking, and it defaults to `medium`.** Opus 5 and Opus 4.8 default to `high`, so a config that leaves `effort` unset runs one level lower on Opus 5.5. Set `effort` explicitly when you compare models.
- **Forced tool use is rejected.** `tool_choice` values of `any` or a named `tool` return a 400. Promptfoo removes them and logs a warning. Use `auto` and name the tool in the prompt instead.
- **Promptfoo handles sampling controls for you.** Opus 5.5 rejects `temperature`, `top_p`, and `top_k`. Promptfoo leaves them out of the request.
- **Cost tracking includes cheaper cache reads.** Cache reads cost $0.20 per million tokens (0.05× the input price), and promptfoo's cost calculation reflects that.

## Working with Opus 5

- **Thinking is on by default.** This is the key difference from Opus 4.8: an omitted `thinking` block runs adaptive thinking rather than none. Since `max_tokens` caps thinking **plus** the answer, give it headroom — promptfoo's default rises to 2048 on this model, but set it explicitly for real work. On the bug-diagnosis task in this example, Opus 5 at `xhigh` spent ~4.4k tokens thinking; an 8k budget truncated the answer mid-sentence, which is why this config uses 16k.
- **Disabling thinking is effort-gated.** `thinking: { type: disabled }` is only accepted at `effort` `high` or below; pairing it with `xhigh` or `max` returns a 400. Promptfoo drops the rejected `disabled` (keeping your `effort`) and warns once.
- **`effort` is the main cost lever.** Opus 5 supports `low` through `max`. Start at `xhigh` for coding and agentic work, then sweep downward.
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

These models are also reachable through:

- AWS Bedrock — `bedrock:global.anthropic.claude-opus-5-5` or `bedrock:us.anthropic.claude-opus-4-8` (or the `bedrock:converse:` equivalents)
- Google Vertex — `vertex:claude-opus-5-5` or `vertex:claude-opus-4-8` with `config.region: global`
- Azure AI Foundry — point `anthropic:messages:claude-opus-5-5` at `https://<resource>.services.ai.azure.com/anthropic` via `apiBaseUrl`

Across all four providers, promptfoo automatically omits the unsupported sampling parameters (`temperature`, `top_p`, `top_k`) for these models. The Anthropic Messages provider also logs a one-time warning if you set them explicitly; the Bedrock, Vertex, and Azure paths omit them silently.

## Learn More

- [Claude Opus 5.5 announcement](https://www.anthropic.com/claude-opus-5-5)
- [Claude Opus 4.8 announcement](https://www.anthropic.com/news/claude-opus-4-8)
- [Anthropic documentation](https://docs.anthropic.com)
- [Promptfoo Anthropic provider docs](https://promptfoo.dev/docs/providers/anthropic)
