# ruby-provider

This example demonstrates how to create a custom Ruby provider for promptfoo that integrates with the OpenAI API.

You can run this example with:

```bash
npx promptfoo@latest init --example ruby-provider
```

## Overview

The Ruby provider allows you to use Ruby code as a provider in promptfoo evaluations. This is useful when you need to:

1. Call APIs from Ruby libraries
2. Implement custom logic before or after calling LLMs
3. Process responses in specific ways
4. Track token usage and other metrics

## Environment Variables

This example requires the following environment variable:

- `OPENAI_API_KEY` - Your OpenAI API key

You can set this in a `.env` file or directly in your environment.

## Requirements

- Ruby 2.7 or higher (with `net/http` and `json` from standard library)

## Files

- `provider.rb` - The Ruby provider implementation that calls OpenAI's API
- `promptfooconfig.yaml` - Configuration for promptfoo evaluation with proper YAML schema reference

## Implementation Details

The Ruby provider is defined in `provider.rb` and includes:

1. A `call_api` function that makes API calls to OpenAI
2. Token usage extraction from the API response
3. Multiple sample functions showing different ways to call the API

By default, the example is configured to use `gpt-4.1-mini` model, but you can modify it to use other models as needed.

## Expected Output

When you run this example, you'll see:

1. The prompts being submitted to your Ruby provider
2. Responses from the OpenAI API
3. Token usage statistics for each completion
4. Evaluation results in a table format

Run the example with:

```bash
npx promptfoo@latest evaluate -c examples/ruby-provider/promptfooconfig.yaml
```

## Learn More

For more information on creating custom providers, see the [promptfoo documentation](https://promptfoo.dev/docs/providers/ruby/).
