# Function Tool Callbacks Example

This example demonstrates how to use promptfoo to evaluate OpenAI's function calling capabilities with the gpt-4o, utilizing the `functionToolCallbacks` feature.

## Overview

This example sets up an addition function that the AI model can call, showcasing:

1. Function tool configuration for OpenAI models
2. Implementation of function callbacks
3. Assertion of model response correctness

## Configuration

See `promptfooconfig.js` for the full configuration, including prompts, provider setup, and test cases.

## Running the Example

```
promptfoo eval -c [path to examples/function-tools-callback/]promptfooconfig.js
```

For more details on function calling and OpenAI tools, refer to:

- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)
- [Promptfoo OpenAI Provider Documentation](https://promptfoo.dev/docs/providers/openai)
