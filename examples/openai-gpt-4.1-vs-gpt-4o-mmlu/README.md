# openai-gpt-4.1-vs-gpt-4o-mmlu (GPT-4.1 vs GPT-4o MMLU Comparison)

You can run this example with:

```bash
npx promptfoo@latest init --example openai-gpt-4.1-vs-gpt-4o-mmlu
```

This example demonstrates how to benchmark OpenAI's GPT-4.1 against GPT-4o using the Massive Multitask Language Understanding (MMLU) benchmark, focusing on reasoning-heavy academic subjects.

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

1. Get a local copy of the promptfooconfig.

   You can clone this repository and from the root directory run:

   ```bash
   cd examples/openai-gpt-4.1-vs-gpt-4o-mmlu
   ```

   or you can get the example with:

   ```bash
   promptfoo init --example openai-gpt-4.1-vs-gpt-4o-mmlu
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

1. **Abstract Algebra**: Advanced mathematical reasoning and algebraic structures
2. **Formal Logic**: Logical statement analysis and proof construction

Each subject uses 10 questions to keep the test manageable. You can edit this in `promptfooconfig.yaml`.

## Expected Results

Based on OpenAI's benchmark results, you should observe:

- **GPT-4.1**: 90.2% overall MMLU accuracy
- **GPT-4o**: 85.7% overall MMLU accuracy
- **Improvement**: 4.5 percentage point gain with GPT-4.1

GPT-4.1 should demonstrate superior performance in:

- Mathematical reasoning tasks
- Logical analysis and formal logic
- Complex multi-step problem solving
- Instruction following and format adherence

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
4. **Evaluation Metrics**:
   - Accuracy across subjects
   - Reasoning quality
   - Response time
   - Format adherence

## Customizing

You can modify the test by editing `promptfooconfig.yaml`:

1. **Add more MMLU subjects**:

   ```yaml
   tests:
     # STEM subjects
     - huggingface://datasets/cais/mmlu?split=test&subset=physics&limit=10
     - huggingface://datasets/cais/mmlu?split=test&subset=chemistry&limit=10
     - huggingface://datasets/cais/mmlu?split=test&subset=biology&limit=10

     # Humanities
     - huggingface://datasets/cais/mmlu?split=test&subset=world_history&limit=10
     - huggingface://datasets/cais/mmlu?split=test&subset=philosophy&limit=10

     # Professional domains
     - huggingface://datasets/cais/mmlu?split=test&subset=jurisprudence&limit=10
     - huggingface://datasets/cais/mmlu?split=test&subset=clinical_knowledge&limit=10
   ```

2. **Try different prompting strategies**:

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

     # Direct answer approach
     - |
       Question: {{question}}

       A) {{choices[0]}}
       B) {{choices[1]}}
       C) {{choices[2]}}
       D) {{choices[3]}}

       Answer with just the letter (A/B/C/D) of the correct option.
   ```

3. **Change the number of questions**:

   ```yaml
   tests:
     - huggingface://datasets/cais/mmlu?split=test&subset=abstract_algebra&limit=20 # Test 20 questions per subject
   ```

4. **Adjust model parameters**:

   ```yaml
   providers:
     - id: openai:gpt-4.1
       config:
         temperature: 0.0 # Even more deterministic
         max_tokens: 1000 # Allow longer explanations
   ```

5. **Modify quality requirements**:

   ```yaml
   defaultTest:
     assert:
       - type: latency
         threshold: 30000 # Stricter 30-second timeout
       - type: llm-rubric
         value: Response demonstrates clear mathematical reasoning
   ```

## Understanding the Results

### Performance Metrics

- **Accuracy**: Percentage of correct answers per subject
- **Latency**: Response time per question
- **Format Compliance**: Adherence to requested answer format
- **Reasoning Quality**: Clarity and correctness of step-by-step explanations

### Key Improvements in GPT-4.1

- **Enhanced Mathematical Reasoning**: Better handling of abstract algebra and calculus
- **Improved Instruction Following**: More consistent format compliance
- **Reduced Hallucination**: Less tendency to provide confident but incorrect answers
- **Better Long Context**: Improved handling of complex, multi-part questions

### Cost Analysis

GPT-4.1 offers better performance at lower cost:

- 26% less expensive than GPT-4o for median queries
- 75% prompt caching discount for repeated context
- Improved efficiency with higher accuracy per dollar spent

## Additional Resources

- [GPT-4.1 vs GPT-4o MMLU Guide](/docs/guides/gpt-4.1-vs-gpt-4o-mmlu)
- [OpenAI provider documentation](https://promptfoo.dev/docs/providers/openai)
- [MMLU benchmark details](https://huggingface.co/datasets/cais/mmlu)
- [GPT-4.1 announcement](https://openai.com/index/introducing-gpt-4-1-in-the-api/)
