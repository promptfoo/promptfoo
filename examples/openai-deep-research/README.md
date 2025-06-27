# openai-deep-research (OpenAI Responses API Example)

You can run this example with:

```bash
npx promptfoo@latest init --example openai-deep-research
```

This example demonstrates how to use OpenAI's **Responses API** for structured conversations and advanced use cases beyond the standard Chat Completions API.

## What This Example Shows

- **Responses API usage**: How to configure and use OpenAI's Responses API
- **Structured output handling**: Working with the responses format
- **Multiple test cases**: Testing different topics with the same prompt

## Prerequisites

- promptfoo CLI installed
- OpenAI API key set as `OPENAI_API_KEY` environment variable

### Setting up your API Key

```bash
export OPENAI_API_KEY="your-api-key-here"
```

Or create a `.env` file in this directory:
```
OPENAI_API_KEY=your-api-key-here
```

## Running the Example

1. Initialize the example:
   ```bash
   npx promptfoo@latest init --example openai-deep-research
   ```

2. Set your OpenAI API key:
   ```bash
   export OPENAI_API_KEY="your-api-key-here"
   ```

3. Run the evaluation:
   ```bash
   promptfoo eval
   ```

4. View results:
   ```bash
   promptfoo view
   ```

## Configuration Details

The example uses this configuration:

```yaml
providers:
  - id: openai:responses:gpt-4o
    config:
      max_output_tokens: 4000
```

**Key points**:
- Uses the Responses API endpoint instead of Chat Completions
- Higher token limit for detailed responses
- Tests multiple topics to show versatility

## Expected Results

The evaluation should pass both test cases:
- **Machine learning topic**: Response contains relevant ML terms
- **Space exploration topic**: Response contains space-related terms

Both responses should be informative and demonstrate the Responses API's capabilities.

## Learn More

- [OpenAI Responses API Documentation](https://platform.openai.com/docs/guides/responses)
- [Promptfoo Documentation](https://promptfoo.dev/docs)
