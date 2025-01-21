---
sidebar_label: MMLU Benchmark
title: 'Implementing MMLU Benchmarks with promptfoo'
description: 'A technical guide to running MMLU evaluations with optimized prompting strategies and automated testing workflows.'
---

# Implementing MMLU Benchmarks with promptfoo

The Massive Multitask Language Understanding (MMLU) benchmark has become the de facto standard for evaluating LLM capabilities, used by leading labs like Anthropic, DeepMind, and OpenAI to measure model performance. Spanning 57 subjects from elementary mathematics to professional medicine, MMLU's 15,908 multiple-choice questions provide a comprehensive assessment of both knowledge and reasoning abilities. While running these evaluations traditionally requires significant setup time and computational resources, you can now execute your first MMLU benchmark in under 5 minutes with a single command:

```sh
npx promptfoo@latest init --example mmlu && promptfoo eval
```

This guide demonstrates how to implement MMLU evaluations using promptfoo, focusing on advanced prompting strategies and optimization techniques that can improve your model's performance by 10-15% across key subjects. Whether you're comparing different LLM providers, fine-tuning prompts, or establishing baseline metrics, you'll learn how to efficiently run these evaluations at scale.

## Implementation Overview

This guide covers:

- Setting up automated MMLU evaluations
- Implementing and optimizing prompt templates
- Configuring test parameters and assertions
- Analyzing performance metrics and results
- Scaling evaluations across multiple subjects

## Quick Implementation

```sh
# Install the framework
npm install -g promptfoo

# Initialize MMLU configuration
promptfoo init --example mmlu

# Execute benchmark
promptfoo eval --concurrency 5
```

View results dashboard: `promptfoo view`

## Configuration Setup

The following configuration establishes a baseline testing environment:

```yaml title=promptfooconfig.yaml
providers:
  - openai:gpt-4 # Modify for your target model

# Test parameters
sharing: false
cache: true
concurrency: 5

defaultTest:
  assert:
    - type: regex
      value: "Therefore, the answer is [ABCD]\\."

tests:
  - huggingface://datasets/cais/mmlu?split=test&subset=high_school_mathematics&limit=5
  - huggingface://datasets/cais/mmlu?split=test&subset=high_school_physics&limit=5
```

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

## How to Prompt MMLU?

Effective prompting for MMLU requires balancing accuracy, cost, and inference speed. Let's explore different strategies, starting from the simplest approach and building up to more sophisticated techniques.

### Zero-Shot Direct Prompting

The most straightforward approach is simply presenting the question and options to the model and asking for an answer. This method is remarkably efficient, using only 200-300 tokens per query, making it perfect for initial testing or when you need to evaluate thousands of questions on a budget. While you'll typically see accuracy drop by 5-10% compared to more sophisticated methods, the speed and cost benefits make it an excellent baseline approach. It's particularly effective for straightforward knowledge-based questions where the answer doesn't require complex reasoning.

### Chain-of-Thought (CoT) Prompting

When accuracy is crucial, especially for STEM subjects, Chain-of-Thought prompting becomes invaluable. Introduced by Wei et al.[8], this technique guides the model through a structured reasoning process. By asking the model to show its work, you'll typically see a 10-15% accuracy improvement on complex problems, though this comes with higher token usage (800-1000 tokens per query) and increased latency. The real power of CoT lies in its ability to make the model's reasoning transparent and debuggable – you can actually see where and why the model might be making mistakes.

### Role-Based Expert Prompting

For specialized subjects like medicine or law, research by Xu et al.[9] shows that having the model assume the role of a domain expert can significantly improve performance. This approach strikes a nice balance between the efficiency of direct prompting and the thoroughness of CoT, typically using 900-1100 tokens while providing a 5-10% accuracy boost in professional domains. The key insight here is that domain framing helps the model access more relevant knowledge and apply domain-specific reasoning patterns.

### Comparative Analysis Prompting

When dealing with questions that have subtle differences between answer choices, a systematic comparison approach can be extremely effective. This strategy explicitly breaks down each option, analyzing its merits and flaws. While it's the most token-intensive approach (1200-1400 tokens), it can improve accuracy by 8-12% on analytical subjects where fine distinctions matter. Think of it as making the model act like a careful judge, weighing each option's evidence before making a decision.

### Majority Voting and Statistical Approaches

One of the most effective ways to improve accuracy is to leverage the statistical nature of language models. By sampling multiple responses from the model and taking the majority vote, you can often achieve a 3-5% accuracy boost across all subjects. This approach works because language models have some inherent randomness in their outputs, and aggregating multiple samples helps average out mistakes. Research by Li et al.[11] shows this is particularly effective when combined with temperature sampling (e.g., temperature=0.7) to introduce beneficial variance in the model's reasoning paths.

There are several variations of this approach:

- Simple majority voting: Sample 3-5 responses and take the most common answer
- Confidence-weighted voting: Weight each answer by the model's reported confidence
- Independent paths: Use different prompting strategies for each sample to diversify the reasoning approaches

While this method multiplies your API costs by the number of samples, the accuracy improvements often justify the expense for high-stakes evaluations. It's particularly effective at catching cases where the model might occasionally hallucinate or make careless errors.

### Hybrid Approaches

Recent work by Zhang et al.[10] suggests that the most effective approach is often a dynamic one. Rather than sticking to a single strategy, you can select different prompting techniques based on the subject matter and question type. For instance, use CoT for mathematical reasoning, direct prompting for basic knowledge questions, and expert prompting for specialized domains. This adaptive approach helps optimize both performance and cost, though it requires more sophisticated implementation.

## Example Prompt Implementations

Below are concrete implementations of each strategy:

### 1. Chain-of-Thought (CoT) Implementation

Optimal for complex reasoning tasks, particularly in STEM subjects. This approach enforces structured problem-solving:

```yaml
prompts: |
  System: You are evaluating a {{subject}} problem. Approach this systematically and show your reasoning.

  Question: {{question}}

  Options:
  A) {{choices[0]}}
  B) {{choices[1]}}
  C) {{choices[2]}}
  D) {{choices[3]}}

  Reasoning process:
  1. Problem Analysis:
     - Key concepts identified
     - Given information parsed

  2. Solution Strategy:
     - Applicable formulas/principles
     - Solution approach outlined

  3. Implementation:
     - Step-by-step calculation/reasoning
     - Intermediate results validated

  4. Verification:
     - Solution cross-checked
     - Edge cases considered

  Therefore, the answer is [A/B/C/D].
```

**Performance Characteristics**:

- Token Usage: ~800-1000 tokens/query
- Accuracy Improvement: +10-15% in STEM
- Optimal Use Case: Complex multi-step problems
- Trade-offs: Higher latency, increased costs

### 2. Zero-Shot Direct Answer

Optimized for performance and cost efficiency:

```yaml
prompts: |
  {{question}}
  A) {{choices[0]}}
  B) {{choices[1]}}
  C) {{choices[2]}}
  D) {{choices[3]}}
  Select the correct answer [A/B/C/D]:
```

**Performance Characteristics**:

- Token Usage: ~200-300 tokens/query
- Baseline Accuracy: Model-dependent
- Optimal Use Case: Initial benchmarking, high-volume testing
- Trade-offs: Lower accuracy, minimal reasoning visibility

### 3. Domain-Specific Expert Implementation

Tailored for specialized subjects with domain-specific reasoning:

```yaml
prompts: |
  System: You are a leading researcher in {{subject}} with extensive publication history.

  Task: Analyze the following question using domain expertise.

  Question: {{question}}

  Options:
  A) {{choices[0]}}
  B) {{choices[1]}}
  C) {{choices[2]}}
  D) {{choices[3]}}

  Expert Analysis:
  1. Domain Context:
     - Relevant theoretical framework
     - Applicable methodologies

  2. Critical Evaluation:
     - Evidence assessment
     - Methodology validation

  3. Conclusion:
     Based on {{subject}}-specific principles and current research...

  Therefore, the answer is [A/B/C/D].
```

**Performance Characteristics**:

- Token Usage: ~900-1100 tokens/query
- Accuracy Improvement: +5-10% in specialized domains
- Optimal Use Case: Domain-specific evaluations
- Trade-offs: Requires subject-specific prompt tuning

### 4. Comparative Analysis Framework

Implements systematic option evaluation:

```yaml
prompts: |
  System: Implement a systematic comparison of all options for this {{subject}} question.

  Question: {{question}}

  Detailed Analysis:

  A) {{choices[0]}}
  Analysis:
  - Theoretical validity
  - Supporting evidence
  - Potential contradictions

  B) {{choices[1]}}
  Analysis:
  - Theoretical validity
  - Supporting evidence
  - Potential contradictions

  C) {{choices[2]}}
  Analysis:
  - Theoretical validity
  - Supporting evidence
  - Potential contradictions

  D) {{choices[3]}}
  Analysis:
  - Theoretical validity
  - Supporting evidence
  - Potential contradictions

  Comparative Evaluation:
  1. Primary differentiators
  2. Critical assumptions
  3. Validity assessment

  Therefore, the answer is [A/B/C/D].
```

**Performance Characteristics**:

- Token Usage: ~1200-1400 tokens/query
- Accuracy Improvement: +8-12% in analytical subjects
- Optimal Use Case: Complex comparison tasks
- Trade-offs: Highest token usage, longest processing time

### 5. Majority Voting Implementation

This implementation samples multiple responses and aggregates them:

```yaml
prompts: |
  System: You are taking a multiple choice test. Select the most accurate answer.

  Question: {{question}}

  Options:
  A) {{choices[0]}}
  B) {{choices[1]}}
  C) {{choices[2]}}
  D) {{choices[3]}}

  Think carefully and select the answer.

defaultTest:
  options:
    # Sample 5 responses with temperature
    provider_options:
      temperature: 0.7
      n: 5

    # Custom evaluation logic to take majority vote
    postprocess: |
      const answers = responses.map(r => {
        const match = r.match(/answer is ([ABCD])/);
        return match ? match[1] : null;
      }).filter(Boolean);

      // Count frequencies
      const counts = answers.reduce((acc, ans) => {
        acc[ans] = (acc[ans] || 0) + 1;
        return acc;
      }, {});

      // Find most common answer
      const majorityAnswer = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])[0][0];

      return `Therefore, the answer is ${majorityAnswer}.`;
```

**Performance Characteristics**:

- Token Usage: ~300-400 tokens/query × number of samples
- Accuracy Improvement: +3-5% across all subjects
- Optimal Use Case: High-stakes evaluations where accuracy is critical
- Trade-offs: Increased API costs, longer total evaluation time

### Implementation Optimization

#### 1. Dynamic Template Selection

```

```
