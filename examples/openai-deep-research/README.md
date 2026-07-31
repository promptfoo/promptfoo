# openai-deep-research (OpenAI Research with Web Search)

You can run this example with:

```bash
npx promptfoo@latest init --example openai-deep-research
cd openai-deep-research
```

This example demonstrates current OpenAI Responses models with web search.

## Important Notes

⚠️ **Response Times**: Research prompts can take longer than ordinary completions because the model may perform multiple searches.

⚠️ **Token Usage**: Search and reasoning can use significant tokens. Set a suitable
`max_output_tokens` limit for the report length you need.

## Setup

1. Set your OpenAI API key:

```bash
export OPENAI_API_KEY=your-key-here
```

2. Run the evaluation with appropriate timeout:

```bash
# Allow enough time for multi-step research tasks
export PROMPTFOO_EVAL_TIMEOUT_MS=600000
promptfoo eval
```

For local development:

```bash
PROMPTFOO_EVAL_TIMEOUT_MS=600000 npm run local -- eval -c examples/openai-deep-research/promptfooconfig.yaml
```

## What's happening?

This example:

- Tests OpenAI's current `gpt-5.6-sol` model with the Responses web-search tool
- Evaluates research capabilities on machine learning and space exploration topics
- Uses the model's ability to automatically search the web for current information
- Checks that responses contain relevant technical terminology
- Demonstrates handling of web search results and citations

The model automatically decides when to use web search to provide comprehensive, up-to-date answers.

## Configuration Details

```yaml
providers:
  - id: openai:responses:gpt-5.6-sol
    config:
      max_output_tokens: 10000
      tools:
        - type: web_search
      # Optional parameters:
      # max_tool_calls: 50 # Control number of searches (default: unlimited)
      # background: true # Use background mode for long-running tasks
      # store: true # Store the conversation for 30 days
```

## Current Models

- `gpt-5.6-sol` - Flagship GPT-5.6 tier
- `gpt-5.6-terra` - Balanced GPT-5.6 tier
- `gpt-5.6-luna` - Efficient GPT-5.6 tier

OpenAI retired the `o3-deep-research` and `o4-mini-deep-research` families on July 23, 2026.

## Advanced Features

### Background Mode (Recommended)

For long-running production research, use background mode:

```yaml
providers:
  - id: openai:responses:gpt-5.6-sol
    config:
      background: true
      webhook_url: https://your-api.com/webhook # Optional: Get notified when complete
```

### Using Code Interpreter

Responses models can analyze data using Code Interpreter:

```yaml
providers:
  - id: openai:responses:gpt-5.6-sol
    config:
      tools:
        - type: web_search
        - type: code_interpreter
          container:
            type: auto
```

### MCP Server Integration

Connect to private data sources using MCP servers:

```yaml
providers:
  - id: openai:responses:gpt-5.6-sol
    config:
      tools:
        - type: web_search
        - type: mcp
          server_label: mycompany_mcp
          server_url: https://mycompany.com/mcp
          require_approval: never # Allow the model to call this server without an approval round trip
```

### Prompt Enhancement

For better results, consider preprocessing user queries:

1. **Clarification**: Use a faster model to gather context
2. **Prompt rewriting**: Expand the query with specific requirements
3. **Research**: Pass the enhanced prompt to the Responses model with web search

See the [OpenAI Web Search Guide](https://platform.openai.com/docs/guides/tools-web-search) for
detailed examples.

## Response Format

Responses with web search can include:

- **output_text**: The final research report with inline citations
- **annotations**: Citation details with URLs and titles
- **web_search_call**: Details of searches performed
- **code_interpreter_call**: Any code analysis performed

## Troubleshooting

- **Timeouts**: Increase `PROMPTFOO_EVAL_TIMEOUT_MS` if evaluations time out
- **Incomplete responses**: Increase `max_output_tokens`
- **429 errors**: May indicate rate limits or access restrictions
- **Tool validation errors**: Ensure `web_search` is configured

## Best Practices

1. **Set an intentional output limit**: Size `max_output_tokens` for the report you need
2. **Handle long response times**: Use background mode or set high timeouts
3. **Monitor costs**: These models use significant tokens for reasoning
4. **Validate citations**: Check that returned URLs are accessible
5. **Consider prompt enhancement**: Preprocess queries for better results

## Learn More

- [OpenAI Web Search Guide](https://platform.openai.com/docs/guides/tools-web-search)
- [Promptfoo Documentation](https://promptfoo.dev/docs)
- [MCP Integration Guide](https://platform.openai.com/docs/mcp)
- [Building a Research MCP Server](mcp-server-example.md)
