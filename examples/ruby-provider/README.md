# ruby-provider

This example demonstrates how to create a custom Ruby provider for promptfoo that integrates with the OpenAI API.

You can run this example with:

```bash
npx promptfoo@latest init --example ruby-provider
```

## Overview

The Ruby provider allows you to use Ruby code as a provider in promptfoo evaluations. This example also demonstrates Ruby assertions for custom validation logic.

**Ruby Provider** is useful when you need to:

1. Call APIs from Ruby libraries
2. Implement custom logic before or after calling LLMs
3. Process responses in specific ways
4. Track token usage and other metrics

**Ruby Assertions** allow you to:

1. Write custom validation logic in Ruby
2. Access test context and variables
3. Return detailed grading results with scores and reasons
4. Reuse assertion logic across multiple tests

## Environment Variables

This example requires the following environment variable:

- `OPENAI_API_KEY` - Your OpenAI API key

You can set this in a `.env` file or directly in your environment.

## Requirements

- Ruby 2.7 or higher (with `net/http` and `json` from standard library)

## Files

- `provider.rb` - The Ruby provider implementation that calls OpenAI's API
- `assert.rb` - Custom Ruby assertion functions for validation
- `promptfooconfig.yaml` - Configuration for promptfoo evaluation with proper YAML schema reference

## Implementation Details

### Ruby Provider (`provider.rb`)

The Ruby provider includes:

1. A `call_api` function that makes API calls to OpenAI
2. Token usage extraction from the API response
3. Multiple sample functions showing different ways to call the API

By default, the example is configured to use `gpt-4.1-mini` model, but you can modify it to use other models as needed.

### Ruby Assertions

The example demonstrates three types of Ruby assertions:

1. **Inline assertions** - Simple one-line checks (e.g., `output.length > 10`)
2. **Multiline assertions** - Complex logic with detailed results and scores
3. **External file assertions** (`assert.rb`) - Reusable assertion functions

Ruby assertions can:

- Return boolean values for pass/fail
- Return numeric scores
- Return detailed `GradingResult` hashes with pass/fail, score, reason, and component results
- Access test context including variables, prompts, and provider responses

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

For more information, see the promptfoo documentation:

- [Ruby Provider](https://promptfoo.dev/docs/providers/ruby/)
- [Ruby Assertions](https://promptfoo.dev/docs/configuration/expected-outputs/ruby/)
