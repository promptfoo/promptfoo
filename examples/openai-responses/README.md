# openai-responses (OpenAI Responses API Examples)

This example demonstrates how to use OpenAI's Responses API to generate model outputs with advanced capabilities including image understanding, web search, function calling, and reasoning.

## Features Demonstrated

- Text generation with the OpenAI Responses API
- Structured JSON output using schemas
- Image input processing
- Web search integration
- Function/tool calling
- Mathematical reasoning with o-series models (o1, o3, o4-mini)

## Environment Variables

This example requires the following environment variables:

- `OPENAI_API_KEY` - Your OpenAI API key

You can set this in a `.env` file or directly in your environment.

## Running the Example

You can run this example with:

```bash
npx promptfoo@latest init --example openai-responses
# and then
cd openai-responses

# Run specific configs
npx promptfoo eval -c promptfooconfig.yaml
npx promptfoo eval -c promptfooconfig.image.yaml
npx promptfoo eval -c promptfooconfig.web-search.yaml
npx promptfoo eval -c promptfooconfig.function-call.yaml
npx promptfoo eval -c promptfooconfig.reasoning.yaml
```

## Configuration Files

This example includes several configuration files, each demonstrating a different capability:

1. **Structured JSON Output** (`promptfooconfig.yaml`): Generates a structured story in JSON format with a schema
2. **Image Input** (`promptfooconfig.image.yaml`): Processes images with structured JSON input
3. **Web Search** (`promptfooconfig.web-search.yaml`): Retrieves recent information from the web using `gpt-4o`
4. **Function Calling** (`promptfooconfig.function-call.yaml`): Calls a weather function with parameters using various reasoning models (o1-pro, o3, o4-mini)
5. **Mathematical Reasoning** (`promptfooconfig.reasoning.yaml`): Solves math problems step-by-step using OpenAI's reasoning models (o3-mini, o3, o4-mini)
6. **Codex Reasoning** (`promptfooconfig.codex.yaml`): Generates Python code using the `codex-mini-latest` model with medium reasoning effort

## Key Differences from Chat Completions API

- Can accept simple strings or structured message arrays as input
- Returns an array of output items with explicit types
- Function calls appear directly in the output array
- Built-in tools like web search are natively supported
- Supports o-series models with configurable reasoning effort
- Structured output using JSON schema with a different format structure

## Supported Models

- `openai:responses:gpt-4o` - Vision-capable model
- `openai:responses:o1-mini`, `openai:responses:o1`, `openai:responses:o1-pro` - Reasoning models
- `openai:responses:o3-mini`, `openai:responses:o3` - High-performance reasoning models
- `openai:responses:o4-mini` - Latest fast, cost-effective reasoning model
- `openai:responses:codex-mini-latest` - Fast reasoning model optimized for the Codex CLI
