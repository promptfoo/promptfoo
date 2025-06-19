---
title: Recreating Mistral Magistral AIME2024 Benchmarks in promptfoo
description: Reproduce Mistral's Magistral 73.6% AIME2024 mathematical reasoning benchmark using promptfoo with a simple evaluation setup comparing Magistral Medium vs Small.
image: /img/docs/mistral-magistral-aime2024-evaluation-results.png
keywords:
  [
    mistral magistral,
    aime2024,
    mathematical reasoning benchmark,
    mistral comparison,
    promptfoo evaluation,
  ]
sidebar_label: Magistral AIME2024 Benchmark
---

# Recreating Mistral Magistral AIME2024 Benchmarks

Mistral's [Magistral models](https://mistral.ai/news/magistral/) achieved **73.6% on AIME2024** (Medium) and **70.7%** (Small) on mathematical reasoning problems. This guide shows you how to reproduce these benchmark results using promptfoo.

:::tip Quick Start

```bash
npx promptfoo@latest init --example mistral
npx promptfoo@latest eval -c mistral/promptfooconfig.aime2024.yaml
```

:::

## The Benchmark Setup

Mistral's published results:

- **Magistral Medium**: 73.6% accuracy (90% with majority voting @64)
- **Magistral Small**: 70.7% accuracy (83.3% with majority voting @64)

Note: Our evaluation calls each model once per problem. Mistral's highest scores used **majority voting across 64 attempts** - running the same problem 64 times and taking the most common answer.

## Prerequisites

- [promptfoo CLI installed](/docs/installation)
- Mistral API key: `export MISTRAL_API_KEY=your_key`
- Hugging Face token: `export HF_TOKEN=your_token` ([get one here](https://huggingface.co/settings/tokens))

## Step 1: Create the Evaluation

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Reproduce Mistral Magistral AIME2024 benchmark

prompts:
  - |
    Solve this AIME mathematical problem step by step.

    Problem: {{question}}

    Think through this carefully and provide your final answer as a 3-digit integer (000-999).
    End with: "Therefore, the answer is [your answer]."

providers:
  - id: mistral:magistral-medium-latest
    label: Magistral Medium
    config:
      temperature: 0.7
      top_p: 0.95
      max_tokens: 40960
  - id: mistral:magistral-small-latest
    label: Magistral Small
    config:
      temperature: 0.7
      top_p: 0.95
      max_tokens: 40960

tests:
  - huggingface://datasets/sea-snell/aime-2024?split=test

defaultTest:
  assert:
    - type: llm-rubric
      value: |
        Evaluate this mathematical solution to an AIME competition problem.

        The correct answer is: {{answer}}

        Grade as PASS if and only if:
        1. The response shows clear step-by-step mathematical reasoning
        2. The final answer presented equals {{answer}} exactly
        3. The mathematical work supports the conclusion

        Grade as FAIL if the final answer is incorrect, regardless of the reasoning quality.
```

### Understanding the Configuration

This configuration demonstrates several key promptfoo concepts:

**Prompts**: The prompt template includes a `{{question}}` variable that gets populated from the dataset. You can modify this prompt to test different reasoning approaches - for example, you might add "Show your work clearly" or "Use multiple solution methods."

**Providers**: We're comparing two Mistral models with identical settings. The `max_tokens: 40960` allows for extended reasoning traces - crucial for complex math problems.

**Tests**: The `huggingface://` integration automatically loads the AIME2024 dataset. Each test case provides variables like `{{question}}` and `{{answer}}` to your prompts and assertions.

**LLM Rubric**: The `llm-rubric` assertion uses an LLM to evaluate responses based on your criteria. This is more flexible than exact string matching - it can assess both mathematical correctness and reasoning quality. The rubric gets access to both the model's response and the correct `{{answer}}` from the dataset.

:::tip Customize Your Evaluation

Try modifying the prompt to test different approaches:

```yaml
prompts:
  - 'Solve step-by-step: {{question}}'
  - 'Use multiple methods to solve: {{question}}'
  - 'Explain your reasoning clearly: {{question}}'
```

:::

## Step 2: Run the Benchmark

```bash
npx promptfoo@latest eval
npx promptfoo@latest view
```

You should see results showing Magistral Medium outperforming Magistral Small on mathematical reasoning, with detailed step-by-step solutions using the full 40k token context.

![Magistral AIME2024 Benchmark Results](/img/docs/mistral-magistral-aime2024-evaluation-results.png)

## Understanding the Results

### What You'll See

- **Accuracy comparison** between Magistral Medium and Small on exact answer matching
- **Extended reasoning** traces using the full 40k token context for complex problems
- **Performance on challenging problems** requiring multi-step mathematical logic

### Expected Performance

With single evaluations and strict answer matching (vs Mistral's 64-vote majority):

- **Magistral Medium**: ~70-75% accuracy on AIME2024 problems
- **Magistral Small**: ~65-70% accuracy on AIME2024 problems

### How the Evaluation Works

The evaluation process:

1. **Dataset Loading**: promptfoo automatically downloads the AIME2024 dataset from Hugging Face, which contains 30 mathematical problems with verified answers.

2. **Prompt Injection**: Each problem's `question` gets inserted into your prompt template, and the model generates a solution.

3. **LLM-Based Grading**: Instead of simple string matching, the `llm-rubric` uses an LLM evaluator to assess whether the response demonstrates correct mathematical reasoning and arrives at the right answer.

4. **Results Aggregation**: promptfoo calculates pass rates, shows individual responses, and highlights where each model succeeded or failed.

The LLM rubric is particularly important here because mathematical solutions can be expressed in many ways - the evaluator can recognize correct math even if the formatting varies.

:::tip Alternative Evaluation Methods

For deterministic evaluation, you can replace the LLM rubric with exact matching:

```yaml
defaultTest:
  assert:
    - type: javascript
      value: |
        // Extract final answer from response
        const match = output.match(/answer is (\d{3})/i);
        const modelAnswer = match ? match[1] : '';
        return modelAnswer === context.vars.answer;
```

Or use regex matching:

```yaml
defaultTest:
  assert:
    - type: regex
      value: 'answer is {{answer}}'
```

:::

### About AIME Problems

The **American Invitational Mathematics Examination (AIME)** is a prestigious mathematics competition where:

- **15 problems** to solve in **3 hours**
- **Answers are integers** from 000 to 999 (no multiple choice)
- **Invitation only** - top 2.5% of AMC 10 and top 5% of AMC 12 students qualify
- **Subject areas**: Algebra, Geometry, Number Theory, and Combinatorics

#### Example AIME 2024 Problem

:::note AIME 2024 Problem 4

Let `x`, `y`, and `z` be positive real numbers that satisfy the following system of equations:

**log₂(x/yz) = 1/2**  
**log₂(y/xz) = 1/3**  
**log₂(z/xy) = 1/4**

Then the value of `|log₂(x⁴y³z²)|` is `m/n` where `m` and `n` are relatively prime positive integers. Find `m+n`.

**Answer: 33**

:::

This problem requires logarithmic manipulation, algebraic substitution, and multi-step verification to reach the final answer.

## Scaling the Benchmark

To test more problems or reproduce the full benchmark:

```yaml
tests:
  # Test all 30 AIME2024 problems
  - huggingface://datasets/sea-snell/aime-2024?split=test
```

To implement majority voting like Mistral's 90% result:

```yaml
providers:
  - id: mistral:magistral-medium-latest
    config:
      temperature: 0.7 # Add randomness for diverse attempts
      max_tokens: 40960
# Run multiple times and aggregate results manually
```

## Key Insights

### Why Magistral Excels at AIME

1. **Extended Context**: 40k token budget allows for detailed mathematical reasoning
2. **Transparent Thinking**: Shows complete step-by-step mathematical work
3. **Problem Decomposition**: Breaks complex problems into manageable steps
4. **Mathematical Fluency**: Strong grasp of advanced mathematical concepts

## Working Example

The complete example is available in our repository:

**[🔗 Magistral AIME2024 Example](https://github.com/promptfoo/promptfoo/blob/main/examples/mistral/promptfooconfig.aime2024.yaml)**

```bash
npx promptfoo@latest init --example mistral
cd mistral
npx promptfoo@latest eval -c promptfooconfig.aime2024.yaml
```

## See Also

- [AIME2024 Dataset](https://huggingface.co/datasets/sea-snell/aime-2024)
- [Mistral Magistral Announcement](https://mistral.ai/news/magistral/)
- [Mistral Provider Documentation](/docs/providers/mistral)
- [AIME Official Website](https://aime.maa.org/) - Mathematical Association of America
