# DeepSeek Red Team Example

This example demonstrates how to run a red team evaluation using Promptfoo against DeepSeek-R1 and GPT-4o-mini. The repository includes several key files:

- `promptfooconfig.yaml`: Contains the evaluation configuration.

Follow these steps to get started:

1. Set your `OPENROUTER_API_KEY` and `OPENAI_API_KEY` environment variables.

2. Run the redteam defined in `promptfooconfig.yaml` by executing:

   ```sh
   promptfoo redteam run
   ```

3. View the redteam results:

   ```sh
   promptfoo redteam report
   ```

**Note:** If you prefer not to use the OpenRouter DeepSeek configuration, you can switch to the official DeepSeek provider. Simply update your configuration to follow the guidelines in [DeepSeek Documentation](https://promptfoo.dev/docs/providers/deepseek) (also referenced as @deepseek.md).

For more details on our DeepSeek red team process and security analysis, refer to the [DeepSeek Red Team Blog Post](https://www.promptfoo.dev/blog/deepseek-redteam/).
