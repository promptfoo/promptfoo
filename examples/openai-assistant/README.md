# openai-assistant (OpenAI Assistants API)

This example demonstrates how to use promptfoo to test the OpenAI Assistants API with various prompts and function calling capabilities.

## Environment Variables

This example requires the following environment variables:

- `OPENAI_API_KEY` - Your OpenAI API key

You can set this in a `.env` file or directly in your environment.

## Setup

1. Create an OpenAI account if you don't have one already and obtain an API key
2. Set the `OPENAI_API_KEY` environment variable
3. Run the evaluation with promptfoo

You can run this example with:

```bash
npx promptfoo@latest init --example openai-assistant
```

## What This Example Tests

This example tests:

1. Basic completion capabilities of the OpenAI Assistant API
2. Function calling capabilities
3. Different prompt structures and instructions
4. Response quality and adherence to instructions

The tests evaluate how well the OpenAI Assistant API handles various instructions and function definitions, comparing the outputs against expected formats and content.
