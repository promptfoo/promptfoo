# structured-outputs-config (Multi-Provider Structured Outputs)

You can run this example with:

```bash
npx promptfoo@latest init --example structured-outputs-config
```

This example demonstrates how to enforce structured JSON outputs using schema validation across multiple AI providers:

- **OpenAI** - using `response_format` with `json_schema`
- **Azure OpenAI** - using `response_format` with `json_schema`
- **Anthropic** - using `output_format` with `json_schema`

The example includes two prompt configurations for solving quirky math problems:

- One that requires step-by-step problem solving (with `steps` array)
- One that only requires the final answer (without `steps` array)

## Environment Variables

This example requires at least one of the following API keys:

- `OPENAI_API_KEY` - Your OpenAI API key for testing with GPT models
- `ANTHROPIC_API_KEY` - Your Anthropic API key for testing with Claude models
- For Azure OpenAI: See [Azure OpenAI provider docs](https://promptfoo.dev/docs/providers/azure) for required credentials

You can set these in a `.env` file or directly in your environment:

```bash
export OPENAI_API_KEY=your_api_key_here
export ANTHROPIC_API_KEY=your_api_key_here
```

## Provider Differences

### OpenAI/Azure Format

OpenAI and Azure use `response_format` at the prompt level:

```yaml
prompts:
  - raw: 'Your prompt here'
    config:
      response_format:
        type: json_schema
        json_schema:
          name: schema_name
          strict: true
          schema:
            # Your schema here
```

### Anthropic Format

Anthropic uses `output_format` at the provider level:

```yaml
providers:
  - id: anthropic:messages:claude-sonnet-4-5-20250929
    config:
      output_format:
        type: json_schema
        schema:
          # Your schema here (no nested json_schema object)
```

## Getting Started

1. Review and customize `promptfooconfig.yaml` as needed
2. Remove any providers you don't have API keys for
3. Run the evaluation:

   ```bash
   promptfoo eval
   ```

4. View the results:

   ```bash
   promptfoo view
   ```

## What You'll Learn

- How to enforce JSON schemas across different providers
- The syntax differences between OpenAI and Anthropic structured outputs
- How to validate that responses are always valid JSON objects
- How to require specific fields and types in LLM responses

## Learn More

- [OpenAI Structured Outputs Documentation](https://platform.openai.com/docs/guides/structured-outputs)
- [Anthropic Structured Outputs Documentation](https://docs.anthropic.com/en/docs/build-with-claude/structured-outputs)
- [promptfoo Structured Outputs Guide](https://promptfoo.dev/docs/)
