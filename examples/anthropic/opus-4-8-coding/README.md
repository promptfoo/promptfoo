# anthropic/opus-4-8-coding (Claude Opus 4.8 Advanced Coding)

This example exercises Claude Opus 4.8 on hard coding tasks using the `xhigh` effort level.

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
- **Self-review honesty** — Opus 4.8 is markedly less likely to let flaws in its own code pass unremarked

## New in Opus 4.8

- **Builds on Opus 4.7.** Opus 4.8 supports the same feature set as 4.7 — there are no breaking API changes when moving from 4.7 — and improves capability on complex reasoning and long-horizon agentic coding.
- **`effort` defaults to `high`, `xhigh` available.** Setting `effort: high` behaves the same as omitting it. `xhigh` sits between `high` and `max` and is the recommended starting point for coding and agentic use cases.
- **Adaptive thinking.** The model decides when and how much to reason per request; manual budget-based thinking is rejected.
- **More honest about its own code.** Anthropic reports Opus 4.8 is roughly four times less likely than Opus 4.7 to let flaws in code it has written go unremarked.

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

Promptfoo suppresses `temperature` on Opus 4.8 across all four providers (the model deprecated it at the model level) and warns once per provider instance if the user set it explicitly.

## Learn More

- [Claude Opus 4.8 announcement](https://www.anthropic.com/news/claude-opus-4-8)
- [Anthropic documentation](https://docs.anthropic.com)
- [Promptfoo Anthropic provider docs](https://promptfoo.dev/docs/providers/anthropic)
