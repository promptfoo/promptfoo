# compare-gpt-5-vs-gpt-5-mini-mmlu (GPT-5 vs GPT-5-mini MMLU Comparison)

You can run this example with:

```bash
npx promptfoo@latest init --example compare-gpt-5-vs-gpt-5-mini-mmlu
cd compare-gpt-5-vs-gpt-5-mini-mmlu
```

This example demonstrates how to benchmark OpenAI's GPT-5 against GPT-5-mini using the Massive Multitask Language Understanding (MMLU) benchmark, focusing on reasoning-heavy academic subjects.

## Prerequisites

- promptfoo CLI installed (`npm install -g promptfoo` or `brew install promptfoo`)
- OpenAI API key set as `OPENAI_API_KEY`
- Hugging Face account and access token (for MMLU dataset)

## Hugging Face Authentication

To access the MMLU dataset, you'll need to authenticate with Hugging Face:

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
   npx promptfoo@latest init --example compare-gpt-5-vs-gpt-5-mini-mmlu
   cd compare-gpt-5-vs-gpt-5-mini-mmlu
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

This comparison evaluates both models on reasoning tasks from the MMLU benchmark, specifically:

1. **Abstract Algebra**: Advanced mathematical reasoning and algebraic structures
2. **Formal Logic**: Logical statement analysis and proof construction

Each subject uses 10 questions to keep the test manageable. You can edit this in `promptfooconfig.yaml`.

## Test Structure

The configuration in `promptfooconfig.yaml`:

1. **Prompt Template**: Encourages step-by-step reasoning for multiple choice questions
2. **Quality Checks**:
   - 60-second timeout per question
   - Required step-by-step reasoning
   - Clear final answer format (A/B/C/D)
3. **Model Configuration**:
   - Low temperature (0.1) for consistent reasoning
   - 1000 max tokens for detailed explanations

## Customizing

You can modify the test by editing `promptfooconfig.yaml`:

1. **Add more MMLU subjects**:

   ```yaml
   tests:
     # STEM subjects
     - huggingface://datasets/cais/mmlu?split=test&subset=physics&limit=10
     - huggingface://datasets/cais/mmlu?split=test&subset=chemistry&limit=10

     # Humanities
     - huggingface://datasets/cais/mmlu?split=test&subset=world_history&limit=10
     - huggingface://datasets/cais/mmlu?split=test&subset=philosophy&limit=10
   ```

2. **Change the number of questions**:

   ```yaml
   tests:
     - huggingface://datasets/cais/mmlu?split=test&subset=abstract_algebra&limit=20
   ```

3. **Adjust model parameters**:

   ```yaml
   providers:
     - id: openai:gpt-5
       config:
         temperature: 0.0
         max_tokens: 1500
   ```

## Additional Resources

- [OpenAI provider documentation](https://promptfoo.dev/docs/providers/openai)
- [MMLU benchmark details](https://huggingface.co/datasets/cais/mmlu)
