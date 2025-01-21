---
sidebar_label: MMLU Benchmark
title: "Getting Started with MMLU Benchmarking in 5 Minutes"
description: "Learn how to evaluate your LLM's reasoning capabilities using the MMLU benchmark - a comprehensive test of 57 subjects from mathematics to medicine."
---

# Getting Started with MMLU Benchmarking in 5 Minutes

Want to test how well your LLM performs on real-world knowledge and reasoning tasks? The Massive Multitask Language Understanding (MMLU) benchmark is perfect for this. Created by researchers at UC Berkeley, MMLU tests models across 57 subjects ranging from elementary math to professional medicine[1][2].

## Quick Start (5 Minutes)

```sh
# Install promptfoo
npm install -g promptfoo

# Get the example config
promptfoo init --example mmlu

# Run your first benchmark
promptfoo eval --concurrency 5
```

That's it! View your results with `promptfoo view`

## What is MMLU?

MMLU is a comprehensive benchmark that includes:
- 15,908 multiple-choice questions
- 57 subjects across humanities, social sciences, STEM, and more
- Questions that test both knowledge and reasoning ability[1][2]

For example, here's a sample question:
```
[High School Mathematics]
Q: If f(x) = 2x + 3 and g(x) = x² - 1, find (f ∘ g)(2).
A) 9
B) 11
C) 13
D) 15
```

## Basic Configuration

Here's a simple config to get started:

```yaml title=promptfooconfig.yaml
# Choose your model
providers:
  - openai:gpt-4  # Fast and cost-effective

# Performance settings
sharing: false
cache: true
concurrency: 5  # Run 5 tests in parallel

# Basic quality checks
defaultTest:
  assert:
    - type: regex
      value: "Therefore, the answer is [ABCD]\\."

# Start with a few subjects
tests:
  - huggingface://datasets/cais/mmlu?split=test&subset=high_school_mathematics&limit=5
  - huggingface://datasets/cais/mmlu?split=test&subset=high_school_physics&limit=5
```

## Running Your First Evaluation

1. Set up your API key:
```sh
export OPENAI_API_KEY=your_key
```

2. Run the evaluation:
```sh
promptfoo eval
```

3. View results:
```sh
promptfoo view
```

## Cost Management Tips

1. Start small with a few questions:
```yaml
tests:
  - huggingface://datasets/cais/mmlu?split=test&subset=high_school_mathematics&limit=5  # Just 5 questions
```

2. Enable caching to avoid re-running identical prompts:
```yaml
cache: true
```

3. Use concurrent evaluations to speed things up:
```sh
promptfoo eval --concurrency 10
```

## Simple Prompt Template

Here's an effective prompt template:

```yaml
prompts: |
  Answer this multiple-choice question step by step:

  Question: {{question}}

  Options:
  A) {{choices[0]}}
  B) {{choices[1]}}
  C) {{choices[2]}}
  D) {{choices[3]}}

  Let's solve this:
  1. Understand the question
  2. Work through it step by step
  3. Pick the best answer

  End with "Therefore, the answer is [A/B/C/D]."
```

## Prompting Strategies for MMLU

Your choice of prompt can significantly impact model performance. Here are several proven strategies, each with its own strengths:

### 1. Chain-of-Thought (CoT)

Best for complex reasoning tasks. Explicitly asks the model to show its work:

```yaml
prompts: |
  You are an expert at {{subject}}. Let's solve this step-by-step:

  Question: {{question}}

  Options:
  A) {{choices[0]}}
  B) {{choices[1]}}
  C) {{choices[2]}}
  D) {{choices[3]}}

  Let's approach this systematically:
  1. First, let's understand what we're being asked
  2. Break down the key concepts
  3. Apply our knowledge
  4. Evaluate each option
  5. Choose the best answer

  Therefore, the answer is [A/B/C/D].
```

**Performance Impact**: Often improves accuracy by 10-15% on STEM subjects where reasoning is crucial.

### 2. Direct Answer (Baseline)

Useful for establishing a performance baseline or when token efficiency is important:

```yaml
prompts: |
  Question: {{question}}
  A) {{choices[0]}}
  B) {{choices[1]}}
  C) {{choices[2]}}
  D) {{choices[3]}}
  Answer with just A, B, C, or D.
```

**Performance Impact**: Generally lower accuracy but 3-4x faster and cheaper. Good for initial testing.

### 3. Expert Role with Verification

Particularly effective for specialized subjects:

```yaml
prompts: |
  As a professor of {{subject}}, analyze this question:

  {{question}}

  Options:
  A) {{choices[0]}}
  B) {{choices[1]}}
  C) {{choices[2]}}
  D) {{choices[3]}}

  Analysis:
  1. Core concept identification
  2. Solution approach
  3. Answer derivation
  4. Verification: Let's verify this is correct

  Confidence check:
  - Is this consistent with {{subject}} principles?
  - Have we considered all relevant factors?

  Final answer: Therefore, the answer is [A/B/C/D].
```

**Performance Impact**: Can improve accuracy by 5-10% on domain-specific subjects like medicine or law.

### 4. Comparative Analysis

Effective for questions requiring option comparison:

```yaml
prompts: |
  Let's analyze each option for this {{subject}} question:

  Question: {{question}}

  A) {{choices[0]}}
   Analysis: [Evaluate option A]

  B) {{choices[1]}}
   Analysis: [Evaluate option B]

  C) {{choices[2]}}
   Analysis: [Evaluate option C]

  D) {{choices[3]}}
   Analysis: [Evaluate option D]

  Comparison:
  1. Eliminate clearly incorrect options
  2. Compare remaining choices
  3. Select best answer

  Therefore, the answer is [A/B/C/D].
```

**Performance Impact**: Particularly strong on multiple-choice questions where subtle differences matter.

### Optimizing Your Prompts

1. **Subject-Specific Adjustments**
   ```yaml
   defaultTest:
     options:
       transformVars: |
         return {
           ...vars,
           prompt_prefix: vars.subject.includes('mathematics') 
             ? 'Let's solve this mathematically:'
             : 'Let's analyze this:'
         }
   ```

2. **Quality Checks**
   ```yaml
   defaultTest:
     assert:
       - type: regex
         value: "Therefore, the answer is [ABCD]\\."
       - type: llm-rubric
         value: "Response includes clear reasoning steps"
   ```

3. **Performance Monitoring**
   ```yaml
   defaultTest:
     assert:
       - type: latency
         threshold: 10000  # 10-second timeout
       - type: cost
         threshold: 0.02   # $0.02 per query
   ```

### Best Practices

1. **Match Prompt to Subject**
   - Use mathematical notation for STEM
   - Legal terminology for law questions
   - Clinical language for medical topics

2. **Balance Detail vs. Efficiency**
   - Longer prompts often improve accuracy
   - But increase token usage and cost
   - Find your optimal trade-off point

3. **Consistent Output Format**
   - Always require a specific answer format
   - Makes automated evaluation easier
   - Helps with result aggregation

4. **Test Multiple Approaches**
   ```yaml
   prompts:
     - file://prompts/cot_prompt.txt
     - file://prompts/direct_prompt.txt
     - file://prompts/expert_prompt.txt
   ```

## Available Subjects

MMLU covers a wide range of topics[1][2]:

- **STEM**: Mathematics, Physics, Chemistry, Computer Science
- **Humanities**: Philosophy, History, Literature
- **Social Sciences**: Psychology, Sociology, Economics
- **Professional**: Medicine, Law, Engineering

Try different subjects by changing the `subset` parameter:
```yaml
tests:
  - huggingface://datasets/cais/mmlu?split=test&subset=college_physics
  - huggingface://datasets/cais/mmlu?split=test&subset=anatomy
  - huggingface://datasets/cais/mmlu?split=test&subset=computer_science
```

## Next Steps

1. Try more subjects
2. Compare different models
3. Experiment with prompts
4. Share your results!

## Resources

- [Full example code](https://github.com/promptfoo/promptfoo/tree/main/examples/mmlu)
- [Configuration guide](/docs/configuration/guide)
- [MMLU dataset](https://huggingface.co/datasets/cais/mmlu)

## References

[1] Hendrycks, D., Burns, C., Basart, S., Zou, A., Mazeika, M., Song, D., & Steinhardt, J. (2021). Measuring Massive Multitask Language Understanding. Proceedings of the International Conference on Learning Representations (ICLR)[1][2].

[2] The MMLU benchmark covers 57 subjects across STEM, the humanities, the social sciences, and more. It ranges in difficulty from an elementary level to an advanced professional level, and it tests both world knowledge and problem-solving ability[1].

Citations:
[1] https://paperswithcode.com/dataset/mmlu
[2] https://en.wikipedia.org/wiki/MMLU
[3] https://www.restack.io/p/llm-evaluation-answer-how-to-run-mmlu-benchmark-cat-ai
[4] https://zilliz.com/glossary/mmlu-benchmark
[5] https://metaschool.so/articles/mmlu-benchmark/
[6] https://klu.ai/glossary/mmlu-eval
[7] https://docs.airtrain.ai/docs/mmlu-benchmark
