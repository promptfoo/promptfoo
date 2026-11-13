# anthropic/sonnet-5-5 (Claude Sonnet 5.5 thinking settings)

This example compares Claude Sonnet 5.5 with adaptive thinking at `high` effort against its new
`between_tools` setting at `medium` effort, on a debugging task and a coding task.

You can run this example with:

```bash
npx promptfoo@latest init --example anthropic/sonnet-5-5
cd anthropic/sonnet-5-5
```

## Thinking settings

Adaptive thinking is on by default. `between_tools` turns off up-front thinking and
requires effort `high` or below. This example uses no tools, so `between_tools` returns
only text. With tools, progress updates can still appear in thinking blocks.

Promptfoo converts legacy `disabled` thinking to `between_tools`, omits unsupported
sampling parameters, and removes forced `any`/`tool` choices. See the
[provider documentation](https://promptfoo.dev/docs/providers/anthropic/#claude-sonnet-55-notes)
for model-specific settings and pricing.

## Running the Example

```bash
export ANTHROPIC_API_KEY=your_api_key_here
npx promptfoo@latest eval
npx promptfoo@latest view
```

## Other providers

- AWS Bedrock: `bedrock:global.anthropic.claude-sonnet-5-5`
- Google Vertex: `vertex:claude-sonnet-5-5` with `config.region: global`
- Azure AI Foundry: a `claude-sonnet-5-5` deployment

## Learn More

- [Claude Sonnet 5.5 announcement](https://www.anthropic.com/claude-sonnet-5-5)
- [What's new in Claude Sonnet 5.5](https://platform.claude.com/docs/en/models/sonnet-5-5/whats-new-sonnet-5-5)
- [Promptfoo Anthropic provider docs](https://promptfoo.dev/docs/providers/anthropic)
