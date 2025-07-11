# dynamic-response-schema (Dynamic Response Schema Example)

You can run this example with:

```bash
npx promptfoo@latest init --example dynamic-response-schema
```

This example demonstrates how to use TypeScript configuration files to dynamically generate response schemas for LLM providers, avoiding duplication between your application code and test configurations.

## Overview

When building LLM applications with structured outputs, you often define schemas in your application code (e.g., using Zod). This example shows how to:

1. Reuse your application's Zod schemas in promptfoo tests
2. Automatically convert schemas for different providers (OpenAI vs Gemini)
3. Maintain a single source of truth for your data models

## Prerequisites

- Node.js 20 or later
- A TypeScript loader such as `tsx`
- API keys for the providers you want to test

Install dependencies:

```bash
npm install tsx zod openai
```

## Environment Variables

Set the API keys for the providers you want to test:

```bash
# For OpenAI (required)
export OPENAI_API_KEY=your-openai-api-key

# For Google Gemini (optional)
export GOOGLE_API_KEY=your-google-api-key
```

## Project Structure

```
dynamic-response-schema/
├── README.md
├── promptfooconfig.ts         # TypeScript configuration
├── src/
│   └── schemas/
│       └── conversation.ts    # Zod schema definitions
└── prompts/
    └── conversation.txt       # Prompt template
```

## Running the Example

Execute the evaluation using:

```bash
NODE_OPTIONS="--import tsx" promptfoo eval -c promptfooconfig.ts
```

View the results:

```bash
promptfoo view
```

## Configuration Options

The example includes configurations for multiple providers:

1. **OpenAI with structured outputs** - Uses the `response_format` parameter
2. **Google Gemini with response schema** - Uses `generationConfig.response_schema`

If you don't have a Google API key, you can comment out the Gemini provider in `promptfooconfig.ts`.

## How It Works

1. **Define Zod Schema**: Your application defines structured output schemas using Zod
2. **Import in Config**: The TypeScript config imports and uses these schemas
3. **Provider Adaptation**: The config automatically adapts schemas for different providers:
   - OpenAI uses `response_format` with JSON Schema
   - Gemini uses `generationConfig.response_schema` with cleaned schema
4. **Type Safety**: TypeScript ensures your test configuration matches your application

## Benefits

- **No Duplication**: Define schemas once in your application
- **Automatic Updates**: Changes to application schemas are reflected in tests
- **Provider Compatibility**: Handle provider-specific schema requirements
- **Type Safety**: Catch configuration errors at compile time

## Extending the Example

You can extend this pattern to:

- Generate test cases based on your schemas
- Validate outputs against your Zod schemas
- Create provider-specific prompt variations
- Share validation logic between app and tests

## Troubleshooting

### "Expected one candidate in API response" Error

This error typically occurs when:
- The Google API key is not set correctly
- The response schema format is incompatible with the Gemini API
- The API quota has been exceeded

To debug:
1. Verify your API key is set: `echo $GOOGLE_API_KEY`
2. Try running without response schema first
3. Check the Google Cloud Console for API errors

### TypeScript Errors

If you encounter TypeScript errors:
1. Ensure you have `tsx` installed: `npm install tsx`
2. Check that your Node.js version is 20 or later
3. Verify the import paths in your configuration 