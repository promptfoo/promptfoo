# OpenAI Model Comparison

This example compares OpenAI's latest flagship model with its smaller variant across various riddles and reasoning tasks.

You can run this example with:

```bash
npx promptfoo@latest init --example openai-model-comparison
```

## Quick Start

1. Initialize this example by running:

   ```bash
   npx promptfoo@latest init --example openai-model-comparison
   ```

2. Navigate to the newly created `openai-model-comparison` directory:

   ```bash
   cd openai-model-comparison
   ```

3. Set an OpenAI API key directly in your environment:

   ```bash
   export OPENAI_API_KEY="your_openai_api_key"
   ```

   Alternatively, you can set the API key in a `.env` file:

   ```bash
   OPENAI_API_KEY=your_openai_api_key
   ```

4. Run the evaluation with:

   ```bash
   npx promptfoo@latest eval --no-cache
   ```

   Note: the `--no-cache` flag is required because the example uses a [latency assertion](https://www.promptfoo.dev/docs/configuration/expected-outputs/deterministic/#latency) which does not support caching.

5. View the results:

   ```bash
   npx promptfoo@latest view
   ```

   The expected output will include the responses from both models for the provided riddles, allowing you to compare their performance side by side.

## What this example demonstrates

This example compares OpenAI's current flagship model with its smaller variant across various riddles and puzzles. It demonstrates:

- **Model comparison**: Side-by-side evaluation of flagship vs mini models
- **Cost and latency assertions**: Ensuring responses meet performance thresholds
- **Content validation**: Using `contains` assertions to verify specific answers
- **LLM-based grading**: Using `llm-rubric` assertions for nuanced evaluation criteria
- **Diverse test cases**: A variety of riddles testing different reasoning capabilities
