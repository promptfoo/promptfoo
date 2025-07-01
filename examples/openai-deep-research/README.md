# openai-deep-research (OpenAI Deep Research Models)

You can run this example with:

```bash
npx promptfoo@latest init --example openai-deep-research
```

This example demonstrates OpenAI's deep research models with web search capabilities via the Responses API.

## Important Notes

⚠️ **Response Times**: Deep research models can take **2-10 minutes** to complete research tasks as they perform extensive web searches and reasoning.

⚠️ **Token Usage**: These models use significant tokens for internal reasoning. Always set high `max_output_tokens` (50,000+) to avoid incomplete responses.

⚠️ **Access**: Deep research models may require special access from OpenAI. Check your API access if you encounter persistent 429 errors.

## Setup

1. Set your OpenAI API key:

```bash
export OPENAI_API_KEY=your-key-here
```

2. Run the evaluation with appropriate timeout:

```bash
# Set a 10-minute timeout for deep research tasks
export PROMPTFOO_EVAL_TIMEOUT_MS=600000
promptfoo eval
```

For local development:

```bash
PROMPTFOO_EVAL_TIMEOUT_MS=600000 npm run local -- eval -c examples/openai-deep-research/promptfooconfig.yaml
```

## What's happening?

This example:

- Tests OpenAI's `o4-mini-deep-research` model with web search tools
- Evaluates research capabilities on machine learning and space exploration topics
- Uses the model's ability to automatically search the web for current information
- Checks that responses contain relevant technical terminology

The model automatically decides when to use web search to provide comprehensive, up-to-date answers.

## Configuration Details

```yaml
providers:
  - id: openai:responses:o4-mini-deep-research
    config:
      max_output_tokens: 50000 # Required for complete research responses
      tools:
        - type: web_search_preview # Required for deep research models
```

## Available Models

- `o3-deep-research` - Most powerful deep research model ($10/1M input, $40/1M output)
- `o3-deep-research-2025-06-26` - Snapshot version
- `o4-mini-deep-research` - Faster, more affordable ($2/1M input, $8/1M output)
- `o4-mini-deep-research-2025-06-26` - Snapshot version

## Troubleshooting

- **Timeouts**: Increase `PROMPTFOO_EVAL_TIMEOUT_MS` if evaluations time out
- **Incomplete responses**: Increase `max_output_tokens` to 50,000 or higher
- **429 errors**: May indicate rate limits or access restrictions

## Learn More

- [OpenAI Deep Research Guide](https://platform.openai.com/docs/guides/deep-research)
- [Promptfoo Documentation](https://promptfoo.dev/docs)
