# OpenAI Function Call Example

This example demonstrates how to use promptfoo to evaluate OpenAI function calls. It showcases two different methods of defining functions: in an external YAML file and directly in the configuration file.

## Setup

1. Set your OPENAI_API_KEY environment variable:

   ```bash
   export OPENAI_API_KEY=your_api_key_here
   ```

2. This example is pre-configured in `promptfooconfig.yaml`. You can review and modify it if needed.

3. Run the evaluation:

   ```bash
   promptfoo eval
   ```

4. View the results:

   ```bash
   promptfoo view
   ```
