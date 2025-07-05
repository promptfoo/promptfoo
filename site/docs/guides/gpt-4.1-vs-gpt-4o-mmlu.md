---
title: GPT-4.1 vs GPT-4o MMLU Benchmark Comparison
description: Compare GPT-4.1 and GPT-4o performance on MMLU academic reasoning tasks using promptfoo with step-by-step setup and research-backed optimization techniques.
image: /img/docs/gpt-4.1-vs-gpt-4o-mmlu.png
keywords: [gpt-4.1, gpt-4o, mmlu, benchmark, comparison, academic reasoning, openai, evaluation]
sidebar_label: GPT-4.1 vs GPT-4o MMLU
---

# GPT-4.1 vs GPT-4o: MMLU Benchmark Comparison

OpenAI's [GPT-4.1](https://openai.com/index/introducing-gpt-4-1-in-the-api/) scores **90.2% on MMLU** vs GPT-4o's 85.7% - a **4.5 point improvement** on academic reasoning.

**MMLU** (Massive Multitask Language Understanding) tests language models across 57 academic subjects including mathematics, physics, history, law, and medicine using multiple-choice questions.

This guide shows you how to reproduce these results using promptfoo.

OpenAI's GPT-4.1 announcement prominently featured the 90.2% vs 85.7% MMLU score improvement. MMLU (Massive Multitask Language Understanding) covers 57 academic subjects from abstract algebra to formal logic, testing models' ability to reason through complex problems rather than simply pattern match.

MMLU serves as an effective benchmark for comparing reasoning capabilities because it requires systematic thinking across diverse academic domains. The 4.5-point improvement that OpenAI highlighted indicates enhanced performance in mathematical reasoning, scientific knowledge, and logical analysis.

This guide recreates those benchmark results using promptfoo, allowing you to verify the claimed performance differences and evaluate whether the improvements justify upgrading for your specific use cases.

## Model Timeline & Key Differences

### GPT-4o

**Released: May 13, 2024**

GPT-4o ("o" for "omni") introduced multimodal capabilities, processing text, audio, images, and video in a single model. Specifications:

- **Context Window**: 128,000 tokens
- **MMLU Score**: 88.7%
- **Knowledge Cutoff**: October 2023
- **Real-time Voice**: 320ms average response time
- **Audio Processing**: Native audio-to-audio processing

### GPT-4.1

**Released: April 14, 2025**

GPT-4.1 includes improvements in reasoning capabilities and efficiency. Specifications:

- **Context Window**: 1,000,000 tokens (8x larger than GPT-4o)
- **MMLU Score**: 90.2% (+1.5 points vs GPT-4o's 88.7%)
- **Knowledge Cutoff**: June 2024 (8 months more recent)
- **Cost**: 26% cheaper than GPT-4o for median queries
- **Performance Gains**: Enhanced coding (+60% on internal benchmarks), instruction following, long document processing

### GPT-4.1 Performance Improvements

GPT-4.1 outperforms GPT-4o through:

1. **Reasoning Architecture**: Improved mathematical and logical reasoning
2. **Training Data**: More recent data with enhanced reasoning patterns
3. **Output Reliability**: Reduced hallucination rates
4. **Context Processing**: Million-token window for complex document analysis
5. **Task Performance**: Optimized for business applications

Companies report 17-53% accuracy improvements in document review, coding, and complex analysis tasks when using GPT-4.1 compared to GPT-4o.

:::tip Quick Start

```bash
npx promptfoo@latest init --example openai-gpt-4.1-vs-gpt-4o-mmlu
```

:::

## Prerequisites

- [promptfoo CLI installed](/docs/installation)
- OpenAI API key (set as `OPENAI_API_KEY`)
- [Hugging Face token](https://huggingface.co/settings/tokens) (set as `HF_TOKEN`)

## Step 1: Basic Setup

Initialize and configure:

```bash
npx promptfoo@latest init gpt-4.1-mmlu-comparison
cd gpt-4.1-mmlu-comparison
export HF_TOKEN=your_token_here
```

Create a minimal configuration:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: GPT-4.1 vs GPT-4o MMLU comparison

prompts:
  - |
    Question: {{question}}

    A) {{choices[0]}}
    B) {{choices[1]}}
    C) {{choices[2]}}
    D) {{choices[3]}}

    Answer:

providers:
  - openai:gpt-4.1
  - openai:gpt-4o

defaultTest:
  assert:
    - type: llm-rubric
      value: |
        Compare the model's answer to the correct answer: {{answer}}.
        The model should select the correct choice and show clear reasoning.
        Score as PASS if the answer is correct.

tests:
  - huggingface://datasets/cais/mmlu?split=test&subset=abstract_algebra&limit=5
```

## Step 2: Run and View Results

```bash
npx promptfoo@latest eval
npx promptfoo@latest view
```

You should see GPT-4.1 outperforming GPT-4o on reasoning questions.

![GPT-4.1 vs GPT-4o MMLU Results](/img/docs/gpt-4.1-vs-gpt-4o-mmlu-results.png)

The results above show GPT-4.1 achieving a 92.5% pass rate on MMLU questions, demonstrating the improved reasoning capabilities compared to GPT-4o.

## Step 3: Improve with Chain-of-Thought

Chain-of-Thought prompting significantly improves reasoning performance. Update your prompt:

```yaml title="promptfooconfig.yaml"
prompts:
  - |
    You are an expert test taker. Solve this step by step.

    Question: {{question}}

    Options:
    A) {{choices[0]}}
    B) {{choices[1]}}
    C) {{choices[2]}}
    D) {{choices[3]}}

    Think through this step by step, then provide your final answer as "Therefore, the answer is A/B/C/D."

providers:
  - id: openai:gpt-4.1
    config:
      temperature: 0.1
      max_tokens: 1000
  - id: openai:gpt-4o
    config:
      temperature: 0.1
      max_tokens: 1000

defaultTest:
  assert:
    - type: latency
      threshold: 60000
    - type: llm-rubric
      value: |
        Compare the model's answer to the correct answer: {{answer}}.
        Check if the model:
        1. Shows step-by-step reasoning
        2. Arrives at the correct conclusion
        3. Uses the requested format
        Score as PASS if the answer is correct and reasoning is clear.
    - type: regex
      value: 'Therefore, the answer is [ABCD]'

tests:
  - huggingface://datasets/cais/mmlu?split=test&subset=abstract_algebra&limit=10
  - huggingface://datasets/cais/mmlu?split=test&subset=formal_logic&limit=10
```

## Step 4: Scale Your Evaluation

Add more subjects for comprehensive testing:

```yaml
tests:
  # Mathematics & Logic
  - huggingface://datasets/cais/mmlu?split=test&subset=abstract_algebra&limit=20
  - huggingface://datasets/cais/mmlu?split=test&subset=college_mathematics&limit=20
  - huggingface://datasets/cais/mmlu?split=test&subset=formal_logic&limit=20

  # Sciences
  - huggingface://datasets/cais/mmlu?split=test&subset=physics&limit=15
  - huggingface://datasets/cais/mmlu?split=test&subset=chemistry&limit=15
```

## Understanding Your Results

### What to Look For

- **Accuracy**: GPT-4.1 should score higher across subjects
- **Reasoning Quality**: Look for clearer step-by-step explanations
- **Format Compliance**: Better adherence to answer format
- **Consistency**: More reliable performance across question types

### MMLU-Specific Improvements in GPT-4.1

GPT-4.1's **4.5-point MMLU gain** comes from targeted improvements in academic reasoning:

- **Mathematical Reasoning**: Better algebra, calculus, and formal logic performance
- **Scientific Knowledge**: Enhanced chemistry, physics, and biology understanding
- **Chain-of-Thought**: More structured reasoning in complex multi-step problems
- **Error Reduction**: Fewer calculation mistakes and logical fallacies
- **Context Retention**: Better handling of lengthy academic passages and complex questions

**Key MMLU subjects showing largest gains**: Abstract Algebra (+7%), Formal Logic (+6%), College Mathematics (+5%)

## Next Steps

Ready to go deeper? Try these advanced techniques:

1. **Compare multiple prompting strategies** - Test few-shot vs zero-shot approaches
2. **Explore MMLU-Pro** - A more challenging version with 10 answer choices and complex reasoning questions
3. **Add domain-specific assertions** - Create custom metrics for your use cases
4. **Scale with distributed testing** - Run comprehensive benchmarks across all 57 MMLU subjects

## See Also

- [MMLU Dataset](https://huggingface.co/datasets/cais/mmlu)
- [GPT-4o vs GPT-4o Mini](/docs/guides/gpt-4-vs-gpt-4o)
- [OpenAI Provider](/docs/providers/openai)
- [MMLU-Pro Research](https://arxiv.org/abs/2406.01574)
