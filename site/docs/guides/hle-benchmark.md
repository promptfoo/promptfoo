---
sidebar_label: HLE Benchmark
description: Evaluate LLMs against Humanity's Last Exam, the most challenging AI benchmark with questions from 1,000+ experts across 100+ subjects.
---

# Evaluating LLMs with Humanity's Last Exam (HLE)

[Humanity's Last Exam (HLE)](https://arxiv.org/abs/2501.14249) represents the cutting edge of AI evaluation. Created by 1,000+ experts across 500+ institutions in 50+ countries, it features 3,000+ questions spanning 100+ subjects designed to push AI capabilities to their limits.

This guide shows you how to run this challenging benchmark against any LLM using promptfoo.

## Why HLE Matters

Unlike saturated benchmarks where models achieve 90%+ accuracy (like MMLU), HLE reveals true AI limitations:

- **Advanced mathematics**: Complex proofs and theoretical problems
- **Interdisciplinary reasoning**: Questions requiring knowledge across multiple domains
- **Unambiguous grading**: Each question has a precise, verifiable answer
- **Jailbreak-resistant**: Questions can't be solved via simple web lookup

Current AI performance remains surprisingly low, making HLE an ideal benchmark for tracking genuine progress.

## Current State of AI on HLE

Recent results demonstrate rapid AI advancement but highlight remaining challenges:

- **OpenAI Deep Research**: 26.6% accuracy (183% improvement in 2 weeks)
- **o4-mini**: ~13% accuracy
- **DeepSeek-R1**: 8.5% accuracy

These low scores are expected - HLE is designed to challenge the best AI systems.

## Quick Start

Run the HLE benchmark with a single command:

```bash
npx promptfoo@latest init --example huggingface-hle
cd huggingface-hle
npx promptfoo@latest eval
```

## Prerequisites

- OpenAI API key set as `OPENAI_API_KEY`
- Hugging Face access token (required for dataset access)

## Setup

Set your Hugging Face token to access the HLE dataset:

```bash
export HF_TOKEN=your_token_here
```

Or add it to your `.env` file:

```env
HF_TOKEN=your_token_here
```

:::info

Get your token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)

:::

## Running Your First Eval

Navigate to your example directory and run the evaluation:

```bash
npx promptfoo@latest eval
```

View results in the web interface:

```bash
npx promptfoo@latest view
```

The default configuration tests 10 questions and should complete in 2-3 minutes.

## Understanding Results

HLE evaluates models on:

- **Answer accuracy**: Exact match against verified correct answers
- **Reasoning quality**: How well the model explains its approach
- **Confidence calibration**: Whether confidence scores match actual performance

Each question uses an LLM judge to compare the model's response against the verified correct answer.

## Customization

### Test More Questions

Increase sample size for more comprehensive results:

```yaml title="promptfooconfig.yaml"
tests:
  - huggingface://datasets/cais/hle?split=test&limit=100
```

### Compare Multiple Models

Evaluate different providers simultaneously:

```yaml title="promptfooconfig.yaml"
providers:
  - openai:o4-mini
  - anthropic:claude-3-7-sonnet-latest
  - deepseek:deepseek-reasoner
```

### Advanced Prompting

The example includes a sophisticated `prompt.js` function that:

- Handles different model response formats
- Formats multiple choice questions properly
- Supports image-based questions
- Adapts system prompts for reasoning models (o1, o3, o4)

You can also try simpler static prompts:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Answer this question step by step: {{question}}'
  - 'Think through this problem carefully: {{question}}'
```

### Custom Grading

Modify the evaluation criteria:

```yaml title="promptfooconfig.yaml"
defaultTest:
  assert:
    - type: llm-rubric
      value: |
        Grade this response on accuracy and reasoning quality.
        Focus on: 1) Correct final answer 2) Sound methodology 3) Clear explanation
```

## Example Questions

HLE includes questions like:

- **Mathematics**: "Compute the Poincaré polynomial of a 6-dimensional Lie algebra..."
- **Physics**: "Calculate eigenvalues below threshold 14 for Kaluza-Klein modes..."
- **Computer Science**: "Decipher this two-step substitution cipher..."
- **Chess**: "Find the mate in 2 sequence without moving the queens..."

Each question is:

- Unambiguous in its correct answer
- Resistant to internet lookup
- Verified against state-of-the-art models
- Designed by domain experts

## Performance Expectations

HLE is intentionally difficult. Expected performance ranges:

- **Leading models**: 15-30% accuracy
- **Mid-tier models**: 5-15% accuracy
- **Smaller models**: <5% accuracy

Low scores indicate the benchmark is working as intended - measuring genuine reasoning capabilities rather than memorization.

## See Also

- [HLE Research Paper](https://arxiv.org/abs/2501.14249)
- [HLE Dataset on Hugging Face](https://huggingface.co/datasets/cais/hle)
- [Hugging Face Provider Guide](../providers/huggingface.md)
- [Custom Prompts](../configuration/prompts.md)
- [LLM Grading](../configuration/expected-outputs/model-graded.md)
