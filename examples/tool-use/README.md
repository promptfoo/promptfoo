To get started, set your `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` environment variables.

This example demonstrates how to use promptfoo to call functions using OpenAI and Anthropic's API.
Please see the documentation below on how to define functions for each type of provider.

- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)
- [Anthropic Tool Use Guide](https://docs.anthropic.com/en/docs/tool-use)

Note that the function and tool syntax differ slightly between the two providers.

The configuration for this example is specified in `promptfooconfig.yaml`. To run the example, execute the following command in your terminal:

```
promptfoo eval
```

Afterwards, you can view the results by running `promptfoo view`.
