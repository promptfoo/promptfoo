# compare-openai-models (OpenAI Model Comparison)

This example compares `gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-5.6-sol`, and `gpt-6-astra` on riddles with the same `low` reasoning effort. Astra requires model access on your OpenAI account.

You can run this example with:

```bash
npx promptfoo@latest init --example compare-openai-models
cd compare-openai-models
```

## Quick Start

1. Initialize this example by running:

   ```bash
   npx promptfoo@latest init --example compare-openai-models
   ```

2. Navigate to the newly created `compare-openai-models` directory:

   ```bash
   cd compare-openai-models
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

   The expected output will include the responses from all four models for the provided riddles, allowing you to compare their performance side by side.

## What this example demonstrates

This example compares Luna, Terra, Sol, and Astra across various riddles and puzzles. It demonstrates:

- **Model comparison**: Side-by-side evaluation of Luna, Terra, Sol, and Astra
- **Cost and latency assertions**: Ensuring responses meet performance thresholds
- **Content validation**: Using `contains` assertions to verify specific answers
- **LLM-based grading**: Using `llm-rubric` assertions for nuanced evaluation criteria
- **Diverse test cases**: A variety of riddles testing different reasoning capabilities
