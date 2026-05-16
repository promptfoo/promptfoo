# compare-gpt-model-tiers-mmlu-pro (GPT Model Tiers MMLU-Pro Comparison)

You can run this example with:

```bash
npx promptfoo@latest init --example compare-gpt-model-tiers-mmlu-pro
cd compare-gpt-model-tiers-mmlu-pro
```

This example demonstrates how to benchmark full, mini, and nano OpenAI GPT model tiers using MMLU-Pro, a more challenging successor to MMLU with up to 10 answer options per question.

## Prerequisites

- promptfoo CLI installed (`npm install -g promptfoo` or `brew install promptfoo`)
- OpenAI API key set as `OPENAI_API_KEY`
- Hugging Face account and access token (optional for public MMLU-Pro data, useful for higher rate limits)

## Hugging Face Authentication

For higher rate limits or private datasets, authenticate with Hugging Face:

1. Create a Hugging Face account at [huggingface.co](https://huggingface.co) if you don't have one
2. Generate an access token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
3. Set your token as an environment variable:

   ```bash
   export HF_TOKEN=your_token_here
   ```

   Or add it to your `.env` file:

   ```env
   HF_TOKEN=your_token_here
   ```

## Running the Eval

1. Get a local copy of the promptfooconfig:

   ```bash
   npx promptfoo@latest init --example compare-gpt-model-tiers-mmlu-pro
   cd compare-gpt-model-tiers-mmlu-pro
   ```

2. Run the evaluation:

   ```bash
   npx promptfoo@latest eval
   ```

3. View the results:

   ```bash
   npx promptfoo@latest view
   ```

## What's Being Tested

This comparison evaluates all three models on 100 MMLU-Pro questions spanning many subject categories.

## Test Structure

The configuration in `promptfooconfig.yaml` includes:

1. **Prompt Template**: Renders all available MMLU-Pro options dynamically and asks for a final answer in a fixed format
2. **Quality Checks**:
   - 60-second timeout per question
   - Required final answer format (`Therefore, the answer is X`)
   - Deterministic JavaScript scoring that compares the parsed final letter against `answer`
3. **Model Configuration**:
   - 1200 max completion tokens for concise reasoning plus the final answer

## Customizing

You can modify the test by editing `promptfooconfig.yaml`:

1. **Evaluate more MMLU-Pro questions**:

   ```yaml
   tests:
     - huggingface://datasets/TIGER-Lab/MMLU-Pro?split=test&config=default&limit=250
   ```

2. **Change the number of questions**:

   ```yaml
   tests:
     - huggingface://datasets/TIGER-Lab/MMLU-Pro?split=test&config=default&limit=200
   ```

3. **Adjust model parameters**:

   ```yaml
   providers:
     - id: openai:chat:gpt-5.4
       config:
         max_completion_tokens: 1500
   ```

## Additional Resources

- [OpenAI provider documentation](https://promptfoo.dev/docs/providers/openai)
- [MMLU-Pro benchmark details](https://huggingface.co/datasets/TIGER-Lab/MMLU-Pro)
