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

### Why GPT-4.1 Improves

GPT-4.1's gains come from:
- Better mathematical reasoning
- Improved instruction following  
- Reduced hallucination
- Enhanced long-context understanding

## Troubleshooting

**Dataset errors?** Verify `HF_TOKEN` is set correctly.

**Low pass rates?** Check your regex pattern matches the prompt format.

**High latency?** Reduce `max_tokens` or increase the timeout threshold.

**Need help?** See [configuration docs](/docs/configuration) or [OpenAI provider guide](/docs/providers/openai).

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
