# anthropic/sonnet-5-5 (Claude Sonnet 5.5 thinking settings)

This example compares Claude Sonnet 5.5 with adaptive thinking at `high` effort against its new
`between_tools` setting at `medium` effort, on a debugging task and a coding task.

You can run this example with:

```bash
npx promptfoo@latest init --example anthropic/sonnet-5-5
cd sonnet-5-5
```

## Working with Sonnet 5.5

- **Adaptive thinking is on by default.** Omitting `thinking` lets the model decide how much to
  reason, steered by `effort`, which defaults to `high`. Anthropic recalibrated the effort levels
  for Sonnet 5.5, so re-run an effort sweep rather than reusing a Sonnet 5 setting.
- **`between_tools` replaces `disabled`.** Sonnet 5.5 rejects `thinking: { type: disabled }`. Its
  lowest setting, `thinking: { type: between_tools }`, turns off up-front thinking and is only
  accepted at `effort` `high` or below. If your config still says `disabled`, promptfoo sends
  `between_tools` instead and logs a warning once.
- **Forced tool use is rejected.** Promptfoo omits `tool_choice` values of type `any` or `tool`;
  use `auto`, and say in the prompt when a tool applies.
- **Sampling controls are managed for you.** Sonnet 5.5 rejects `temperature`, `top_p`, and
  `top_k`; promptfoo omits them automatically.
- **Pricing.** $2 / $10 per million input / output tokens, the same as Sonnet 5, across the full
  1M-token context window.

## Running the Example

```bash
export ANTHROPIC_API_KEY=your_api_key_here
npx promptfoo@latest eval
npx promptfoo@latest view
```

## Other providers

- AWS Bedrock: `bedrock:global.anthropic.claude-sonnet-5-5` (the only inference profile at launch)
- Google Vertex: `vertex:claude-sonnet-5-5` with `config.region: global`
- Azure AI Foundry: a `claude-sonnet-5-5` deployment

## Learn More

- [Claude Sonnet 5.5 announcement](https://www.anthropic.com/claude-sonnet-5-5)
- [What's new in Claude Sonnet 5.5](https://platform.claude.com/docs/en/models/sonnet-5-5/whats-new-sonnet-5-5)
- [Promptfoo Anthropic provider docs](https://promptfoo.dev/docs/providers/anthropic)
