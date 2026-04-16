# anthropic/opus-4-7-coding (Claude Opus 4.7 Advanced Coding)

This example exercises Claude Opus 4.7 on hard coding tasks using the new `xhigh` effort level.

You can run this example with:

```bash
npx promptfoo@latest init --example anthropic/opus-4-7-coding
cd opus-4-7-coding
```

## What This Tests

Claude Opus 4.7 is Anthropic's latest model for agentic coding. This example evaluates:

- **Bug diagnosis** across multiple system boundaries
- **Production-quality code generation** with proper error handling
- **Code review** with nuanced, prioritized feedback

## New in Opus 4.7

- **`xhigh` effort level**: sits between `high` and `max`, giving finer control over the reasoning/latency tradeoff on hard problems. Recommended as a starting point for coding and agentic use cases.
- **Better instruction following**: prompts tuned for earlier models may now take instructions more literally — re-tune if you hit unexpected results.
- **Higher-resolution vision**: images up to ~3.75 megapixels are processed at higher fidelity.

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

Opus 4.7 is also reachable through:

- AWS Bedrock — `bedrock:us.anthropic.claude-opus-4-7` (or `bedrock:converse:us.anthropic.claude-opus-4-7`)
- Google Vertex — `vertex:claude-opus-4-7` with `config.region: global`
- Azure AI Foundry — point `anthropic:messages:claude-opus-4-7` at `https://<resource>.services.ai.azure.com/anthropic` via `apiBaseUrl`

Promptfoo suppresses `temperature` on Opus 4.7 across all four providers (the model deprecated it at the model level) and warns once per provider instance if the user set it explicitly.

## Learn More

- [Claude Opus 4.7 announcement](https://www.anthropic.com/news/claude-opus-4-7)
- [Anthropic documentation](https://docs.anthropic.com)
- [Promptfoo Anthropic provider docs](https://promptfoo.dev/docs/providers/anthropic)
