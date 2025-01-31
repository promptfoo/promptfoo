# DeepSeek-R1 vs OpenAI o1 Comparison

This example demonstrates how to benchmark DeepSeek's R1 model against OpenAI's o1 model using the Massive Multitask Language Understanding (MMLU) benchmark, focusing on reasoning-heavy subjects.

## Prerequisites

- promptfoo CLI installed (`npm install -g promptfoo` or `brew install promptfoo`)
- OpenAI API key set as `OPENAI_API_KEY`
- DeepSeek API key set as `DEEPSEEK_API_KEY`
- Hugging Face account and access token (for MMLU dataset)

## Hugging Face Authentication

To access the MMLU dataset, you'll need to authenticate with Hugging Face:

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

1. Get a local copy of the promptfooconfig.

   You can clone this repository and from the root directory run:

   ```bash
   cd examples/deepseek-r1-vs-openai-o1
   ```

   or you can get the example with:

   ```bash
   promptfoo init --example deepseek-r1-vs-openai-o1
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

This comparison evaluates both models on reasoning tasks from the MMLU benchmark, specifically:

1. **Abstract Algebra**: Advanced mathematical reasoning
2. **Formal Logic**: Logical statement analysis
3. **High School Mathematics**: Core problem-solving
4. **College Mathematics**: Advanced mathematical concepts
5. **Logical Fallacies**: Flaw identification in reasoning

Each subject uses 10 questions to keep the test manageable. You can edit this in `promptfooconfig.yaml`.

## Test Structure

The configuration in `promptfooconfig.yaml`:

1. **Prompt Template**: Encourages step-by-step reasoning for multiple choice questions
2. **Quality Checks**:
   - 60-second timeout per question
   - Required step-by-step reasoning
   - Clear final answer format
3. **Evaluation Metrics**:
   - Accuracy
   - Reasoning quality
   - Response time
   - Format adherence

## Customizing

You can modify the test by editing `promptfooconfig.yaml`:

1. Add more MMLU subjects:

   ```yaml
   tests:
     - huggingface://datasets/cais/mmlu?split=test&subset=physics
   ```

2. Try different prompting strategies:

   ```yaml
   prompts:
     # Zero-shot with step-by-step reasoning (default)
     - |
       You are an expert test taker. Please solve the following multiple choice question step by step.

       Question: {{question}}

       Options:
       A) {{choices[0]}}
       B) {{choices[1]}}
       C) {{choices[2]}}
       D) {{choices[3]}}

       Think through this step by step, then provide your final answer in the format "Therefore, the answer is A/B/C/D."

     # Zero-shot with direct answer
     - |
       Question: {{question}}

       A) {{choices[0]}}
       B) {{choices[1]}}
       C) {{choices[2]}}
       D) {{choices[3]}}

       Answer with just the letter (A/B/C/D) of the correct option.
   ```

3. Change the number of questions:

   ```yaml
   tests:
     - huggingface://datasets/cais/mmlu?split=test&subset=physics&limit=20 # Test 20 questions per subject
   ```

4. Adjust quality requirements:

   ```yaml
   defaultTest:
     assert:
       - type: latency
         threshold: 30000 # Stricter 30-second timeout
   ```

## Additional Resources

- [DeepSeek provider documentation](https://promptfoo.dev/docs/providers/deepseek)
- [MMLU benchmark](https://huggingface.co/datasets/cais/mmlu)
