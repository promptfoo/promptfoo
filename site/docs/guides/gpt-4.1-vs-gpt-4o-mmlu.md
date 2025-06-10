---
sidebar_label: GPT-4.1 vs GPT-4o MMLU
---

# GPT-4.1 vs GPT-4o: MMLU Benchmark Comparison

OpenAI released [GPT-4.1](https://openai.com/index/introducing-gpt-4-1-in-the-api/), a new series of models featuring major improvements on coding, instruction following, and long context understanding. GPT-4.1 outperforms GPT-4o across the board, scoring 90.2% on MMLU compared to GPT-4o's 85.7% - a significant 4.5 percentage point improvement.

This guide will walk you through comparing GPT-4.1 and GPT-4o using the Massive Multitask Language Understanding (MMLU) benchmark in promptfoo. MMLU is a comprehensive test of language understanding across 57 academic subjects including mathematics, physics, history, law, medicine, and more.

The end result will be a side-by-side comparison that looks like this:

![GPT-4.1 vs GPT-4o MMLU comparison](/img/docs/gpt-4.1-vs-gpt-4o-mmlu.png)

## Prerequisites

Before we dive in, ensure you have the following ready:

- promptfoo CLI installed. If not, refer to the [installation guide](/docs/installation).
- An active OpenAI API key set as the `OPENAI_API_KEY` environment variable. See [OpenAI configuration](/docs/providers/openai) for details.
- Hugging Face account and access token for MMLU dataset access.

## Step 1: Hugging Face Authentication

To access the MMLU dataset, you'll need to authenticate with Hugging Face:

Create a Hugging Face account at [huggingface.co](https://huggingface.co) if you don't have one, then generate an access token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).

Set your token as an environment variable:

```bash
export HF_TOKEN=your_token_here
```

Or add it to your `.env` file:

```env
HF_TOKEN=your_token_here
```

## Step 2: Setup

Create a dedicated directory for your MMLU comparison project:

```bash
npx promptfoo@latest init --example openai-gpt-4.1-vs-gpt-4o-mmlu
```

Edit `promptfooconfig.yaml` to include GPT-4.1 and GPT-4o:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'GPT-4.1 vs GPT-4o comparison on MMLU reasoning tasks'

providers:
  - openai:gpt-4.1
  - openai:gpt-4o
```

## Step 3: Configure the MMLU Prompt

Set up a prompt that encourages step-by-step reasoning for multiple choice questions:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'GPT-4.1 vs GPT-4o comparison on MMLU reasoning tasks'

prompts:
  - |
    You are an expert test taker. Please solve the following multiple choice question step by step.

    Question: {{question}}

    Options:
    A) {{choices[0]}}
    B) {{choices[1]}}
    C) {{choices[2]}}
    D) {{choices[3]}}

    Think through this step by step, then provide your final answer in the format "Therefore, the answer is A/B/C/D."

providers:
  - openai:gpt-4.1
  - openai:gpt-4o
```

## Step 4: Add Quality Checks

Configure assertions to ensure responses meet quality standards:

```yaml title="promptfooconfig.yaml"
defaultTest:
  assert:
    # Inference should complete within 60 seconds
    - type: latency
      threshold: 60000
    # Check for step-by-step reasoning
    - type: llm-rubric
      value: Response must include clear step-by-step reasoning
    # Check that it ends with a clear answer choice
    - type: regex
      value: "Therefore, the answer is [ABCD]\\."
```

## Step 5: Load MMLU Test Sets

Add MMLU datasets for multiple academic subjects. Start with reasoning-heavy subjects that showcase the models' analytical capabilities:

```yaml title="promptfooconfig.yaml"
tests:
  # Load MMLU test sets for reasoning-heavy subjects
  - huggingface://datasets/cais/mmlu?split=test&subset=abstract_algebra&config=abstract_algebra&limit=10
  - huggingface://datasets/cais/mmlu?split=test&subset=formal_logic&config=formal_logic&limit=10
  - huggingface://datasets/cais/mmlu?split=test&subset=high_school_mathematics&config=high_school_mathematics&limit=10
  - huggingface://datasets/cais/mmlu?split=test&subset=college_mathematics&config=college_mathematics&limit=10
  - huggingface://datasets/cais/mmlu?split=test&subset=logical_fallacies&config=logical_fallacies&limit=10
```

:::tip
You can customize the number of questions per subject by changing the `limit` parameter. Start with 10 questions per subject for faster iteration, then increase for more comprehensive testing.
:::

## Step 6: Run the Evaluation

Execute the comparison:

```bash
npx promptfoo@latest eval
```

View the results in your browser:

```bash
npx promptfoo@latest view
```

## Step 7: Analyze the Results

The evaluation will provide several key metrics:

### Accuracy

GPT-4.1 should demonstrate higher accuracy across MMLU subjects, particularly in:

- **Mathematics**: Abstract algebra, college mathematics
- **Logic**: Formal logic, logical fallacies
- **Reasoning**: Multi-step problem solving

### Response Quality

Look for improvements in:

- **Reasoning clarity**: GPT-4.1's enhanced instruction following should produce clearer step-by-step explanations
- **Format adherence**: Better compliance with the requested answer format
- **Consistency**: More reliable performance across different question types

### Latency

Monitor response times. GPT-4.1 offers comparable or improved latency while delivering higher accuracy.

## Customizing Your Evaluation

### Add More MMLU Subjects

Expand your evaluation to cover additional domains:

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

### Adjust Model Parameters

Fine-tune model behavior for optimal performance:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:gpt-4.1
    config:
      temperature: 0.1 # Lower temperature for more consistent reasoning
      max_tokens: 500 # Sufficient tokens for step-by-step explanations
  - id: openai:gpt-4o
    config:
      temperature: 0.1
      max_tokens: 500
```

### Test Different Prompting Strategies

Compare zero-shot vs few-shot approaches:

```yaml
prompts:
  # Zero-shot with step-by-step reasoning (recommended)
  - |
    You are an expert test taker. Please solve the following multiple choice question step by step.

    Question: {{question}}

    Options:
    A) {{choices[0]}}
    B) {{choices[1]}}
    C) {{choices[2]}}
    D) {{choices[3]}}

    Think through this step by step, then provide your final answer in the format "Therefore, the answer is A/B/C/D."

  # Direct answer (for comparison)
  - |
    Question: {{question}}

    A) {{choices[0]}}
    B) {{choices[1]}}
    C) {{choices[2]}}
    D) {{choices[3]}}

    Answer with just the letter (A/B/C/D) of the correct option.
```

## Understanding GPT-4.1's Improvements

Based on OpenAI's benchmark results, you should observe:

### Enhanced Reasoning

GPT-4.1's 90.2% MMLU score represents substantial improvement in:

- **Mathematical reasoning**: Better handling of abstract algebra and calculus problems
- **Scientific knowledge**: Improved understanding of physics, chemistry, and biology concepts
- **Logical analysis**: More accurate identification of logical fallacies and formal logic problems

### Instruction Following

GPT-4.1's improved instruction following should result in:

- **Better format compliance**: More consistent use of the requested answer format
- **Clearer explanations**: Step-by-step reasoning that's easier to follow
- **Reduced hallucination**: Less tendency to provide incorrect information with high confidence

### Long Context Understanding

For complex MMLU questions with lengthy context, GPT-4.1's 1M token context window and improved attention should show:

- **Better context retention**: More accurate responses to questions requiring information from earlier in the prompt
- **Improved comprehension**: Better understanding of nuanced academic concepts

## Cost Considerations

GPT-4.1 offers better performance at lower cost:

- **26% less expensive** than GPT-4o for median queries
- **75% prompt caching discount** for repeated context (increased from 50%)
- **No additional cost** for long context requests beyond standard per-token pricing

## Best Practices

### Start Small

Begin with 10 questions per subject to validate your setup, then scale up:

```yaml
tests:
  - huggingface://datasets/cais/mmlu?split=test&subset=abstract_algebra&config=abstract_algebra&limit=10
```

### Monitor Quality

Use the built-in assertions to ensure response quality:

```yaml
defaultTest:
  assert:
    - type: latency
      threshold: 60000
    - type: llm-rubric
      value: Response must include clear step-by-step reasoning
    - type: regex
      value: "Therefore, the answer is [ABCD]\\."
```

### Cache for Efficiency

Enable prompt caching to reduce costs on repeated evaluations:

```bash
npx promptfoo@latest eval --cache
```

## Conclusion

GPT-4.1 represents a significant advancement over GPT-4o, particularly evident in MMLU performance. The 4.5 percentage point improvement in MMLU score translates to more reliable academic reasoning, better instruction following, and enhanced problem-solving capabilities.

While benchmarks provide valuable insights, testing on your specific use cases remains crucial. Use this MMLU comparison as a foundation, then adapt the evaluation to your domain-specific requirements.

## See Also

- [OpenAI Provider Configuration](/docs/providers/openai)
- [MMLU Benchmark Details](https://huggingface.co/datasets/cais/mmlu)
- [GPT-4o vs GPT-4o mini Comparison](/docs/guides/gpt-4-vs-gpt-4o)
- [LLM Evaluation Best Practices](/docs/getting-started)
- [GPT-4.1 vs GPT-4o MMLU Guide](/docs/guides/gpt-4.1-vs-gpt-4o-mmlu)
- [OpenAI provider documentation](https://promptfoo.dev/docs/providers/openai)
- [MMLU benchmark details](https://huggingface.co/datasets/cais/mmlu)
- [GPT-4.1 announcement](https://openai.com/index/introducing-gpt-4-1-in-the-api/)
