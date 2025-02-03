# Humanity's Last Exam Benchmark

This example demonstrates how to evaluate LLMs against [Humanity's Last Exam (HLE)](https://arxiv.org/abs/2501.14249), a benchmark designed to be the final frontier of closed-ended academic testing.

## Prerequisites

- promptfoo CLI installed (`npm install -g promptfoo` or `brew install promptfoo`)
- API keys for the models you want to test:
  - OpenAI API key set as `OPENAI_API_KEY`
  - Anthropic API key set as `ANTHROPIC_API_KEY`
  - DeepSeek API key set as `DEEPSEEK_API_KEY`
- Hugging Face account and access token (for HLE dataset)

## Hugging Face Authentication

To access the HLE dataset, you'll need to authenticate with Hugging Face:

1. Create a Hugging Face account at [huggingface.co](https://huggingface.co) if you don't have one
2. Generate an access token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
3. Set your token as an environment variable:

   ```bash
   export HUGGING_FACE_HUB_TOKEN=your_token_here
   ```

   Or add it to your `.env` file:

   ```env
   HUGGING_FACE_HUB_TOKEN=your_token_here
   ```

## Running the Eval

1. Get a local copy of the configuration:

   ```bash
   promptfoo init --example hle
   ```

2. Run the evaluation:

   ```bash
   promptfoo eval
   ```

3. View the results in a web interface:

   ```bash
   promptfoo view
   ```

## What's Being Tested

This evaluation runs models against HLE questions that span:

1. Advanced Mathematics & Sciences
2. Humanities & Social Sciences
3. Professional Fields
4. Visual & Multimodal Reasoning
5. Interdisciplinary Topics

Each model is evaluated on:

- Answer accuracy
- Reasoning quality
- Response time
- Format adherence

## Customizing

You can modify the test by editing `promptfooconfig.yaml`:

1. Test specific subjects:

   ```yaml
   tests:
     - huggingface://datasets/cais/hle?split=test&subject=quantum_mechanics
   ```

2. Adjust grading criteria:

   ```yaml
   defaultTest:
     assert:
       - type: llm-rubric
         value: |
           Response must:
           1. Show clear mathematical reasoning
           2. Cite relevant principles/theorems
           3. Arrive at a precise answer
   ```

3. Try different prompting strategies:

   ```yaml
   prompts:
     - file://prompts/zero-shot.txt
     - file://prompts/chain-of-thought.txt
     - file://prompts/few-shot.txt
   ```

## Additional Resources

- [HLE Paper](https://arxiv.org/abs/2501.14249)
- [HLE Dataset](https://huggingface.co/datasets/cais/hle)
- [promptfoo Documentation](https://promptfoo.dev/docs/getting-started) 