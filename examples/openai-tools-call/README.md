# openai-tools-call (OpenAI Tools Call Example)

This example demonstrates how to use promptfoo to evaluate OpenAI's tools calling capabilities. It shows how to define and test tool usage with the Chat Completions API.

## Features Demonstrated

- Defining tools for AI models to use
- Testing tool call outputs
- Validating AI-generated function arguments
- Transforming outputs for assertions

## Environment Variables

This example requires the following environment variables:

- `OPENAI_API_KEY` - Your OpenAI API key

You can set this in a `.env` file or directly in your environment.

## Running the Example

You can run this example with:

```bash
npx promptfoo@latest init --example openai-tools-call
# and then
cd openai-tools-call

# Run the evaluation
npx promptfoo eval

# View the results
npx promptfoo view
```

## What This Example Does

The configuration defines a custom tool for getting weather information. It then tests the model's ability to:

1. Correctly call the weather function when asked about weather
2. Pass the correct location parameter based on the city mentioned
3. Handle various cities, including international ones
4. Format responses consistently

## Key Features

- Uses `is-valid-openai-tools-call` assertion to validate the function call structure
- Demonstrates output transformation to isolate and test specific parts of the response
- Shows how to use JavaScript assertions for detailed validation
- Tests with a variety of locations to ensure robust behavior

## Documentation

For more details, see:

- [OpenAI Tools documentation](https://platform.openai.com/docs/guides/function-calling)
- [promptfoo OpenAI Provider documentation](https://promptfoo.dev/docs/providers/openai#using-tools-and-functions)
