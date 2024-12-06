# Structured Outputs Config

This example demonstrates how to enforce structured JSON outputs using schema validation with OpenAI and Azure OpenAI providers. The configuration supports both providers, but you can remove either one if you only want to test with a specific provider.

The example includes two prompt configurations for solving a math problem.

- One that requires step-by-step problem solving
- One that only requires the final answer

## Prerequisites

1. Set up your API credentials:
   - For OpenAI: Set `OPENAI_API_KEY` environment variable.
   - For Azure OpenAI: Set required Azure credentials. See [Azure OpenAI provider docs](https://promptfoo.com/docs/providers/azure) for more details.

## Getting Started

1. Review and customize `promptfooconfig.yaml` as needed
2. Run the evaluation:

   ```bash
   promptfoo eval
   ```

3. View the results:

   ```bash
   promptfoo view
   ```
