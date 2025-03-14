# redteam-deepseek-foundation (DeepSeek Red Team Example)

This example demonstrates how to run a red team evaluation against DeepSeek-R1 and GPT-4o-mini models to test their security and safety guardrails.

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-deepseek-foundation
```

## Purpose

This example shows how to:

- Set up red team evaluations against multiple AI models
- Compare security responses between DeepSeek-R1 and GPT-4o-mini
- Analyze model refusals and potential vulnerabilities
- Use promptfoo's redteam commands for security testing

## Environment Variables

This example requires the following environment variables:

- `OPENROUTER_API_KEY` - Your OpenRouter API key for accessing DeepSeek-R1
- `OPENAI_API_KEY` - Your OpenAI API key for accessing GPT-4o-mini

You can set these in a `.env` file or directly in your environment.

## Getting Started

1. Set up the required environment variables
2. Navigate to the example directory
3. Run the redteam evaluation:

   ```sh
   promptfoo redteam run
   ```

4. View the detailed results:

   ```sh
   promptfoo redteam report
   ```

## Configuration

The example includes a `promptfooconfig.yaml` file with the complete redteam evaluation setup. The configuration includes multiple attack vectors and compares responses between models.

## Alternative Configuration

If you prefer to use the official DeepSeek provider instead of OpenRouter, you can modify your configuration to use the direct DeepSeek API. For setup instructions, refer to the [DeepSeek Documentation](https://promptfoo.dev/docs/providers/deepseek).

## Additional Resources

For more information about this redteam evaluation and our security analysis of DeepSeek models, read our detailed [DeepSeek Red Team Blog Post](https://www.promptfoo.dev/blog/deepseek-redteam/).
