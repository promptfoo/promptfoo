---
title: GPT-4.1 vs GPT-4o MMLU Benchmark Comparison
description: Compare GPT-4.1 and GPT-4o performance on MMLU academic reasoning tasks using promptfoo with step-by-step setup and research-backed optimization techniques.
image: /img/docs/gpt-4.1-vs-gpt-4o-mmlu.png
keywords: [gpt-4.1, gpt-4o, mmlu, benchmark, comparison, academic reasoning, openai, evaluation]
sidebar_label: GPT-4.1 vs GPT-4o MMLU
---

# GPT-4.1 vs GPT-4o: MMLU Benchmark Comparison

OpenAI's [GPT-4.1](https://openai.com/index/introducing-gpt-4-1-in-the-api/) delivers significant improvements over GPT-4o, scoring **90.2% on MMLU** compared to GPT-4o's 85.7% - a **4.5 percentage point** improvement on this academic reasoning benchmark.

This guide shows you how to reproduce and validate these results using promptfoo's MMLU evaluation framework.

:::tip Quick Start

Get started immediately with our pre-configured example:

```bash
npx promptfoo@latest init --example openai-gpt-4.1-vs-gpt-4o-mmlu
```

:::

## Prerequisites

- [promptfoo CLI installed](/docs/installation)
- OpenAI API key (set as `OPENAI_API_KEY` environment variable)
- Hugging Face account for MMLU dataset access

## Step 1: Quick Setup

Initialize a new comparison project:

```bash
npx promptfoo@latest init gpt-4.1-mmlu-comparison
cd gpt-4.1-mmlu-comparison
```

Create your Hugging Face token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) and set it:

```bash
export HF_TOKEN=your_token_here
```

## Step 2: Basic Configuration

Start with a minimal comparison setup:

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

tests:
  - huggingface://datasets/cais/mmlu?split=test&subset=abstract_algebra&limit=5
```

## Step 3: Run Your First Eval

Execute the comparison:

```bash
npx promptfoo@latest eval
```

View results in your browser:

```bash
npx promptfoo@latest view
```

:::note Expected Results

Based on [OpenAI's benchmarks](https://openai.com/index/introducing-gpt-4-1-in-the-api/), you should see GPT-4.1 outperforming GPT-4o on reasoning-heavy questions.

:::

## Step 4: Enhanced Configuration

Improve evaluation quality with research-backed techniques:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: GPT-4.1 vs GPT-4o MMLU comparison with enhanced prompting

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
      value: Response includes clear step-by-step reasoning
    - type: regex
      value: "Therefore, the answer is [ABCD]"

tests:
  # Start with reasoning-heavy subjects where improvements are most visible
  - huggingface://datasets/cais/mmlu?split=test&subset=abstract_algebra&limit=10
  - huggingface://datasets/cais/mmlu?split=test&subset=formal_logic&limit=10
```

:::tip Why Chain-of-Thought?

Research from [MMLU-Pro](https://arxiv.org/abs/2406.01574) shows Chain-of-Thought prompting provides **15-19% improvement** on reasoning tasks compared to direct answering.

:::

## Step 5: Scale Your Evaluation

Add more subjects to get comprehensive results:

```yaml
tests:
  # Mathematics & Logic (reasoning-heavy)
  - huggingface://datasets/cais/mmlu?split=test&subset=abstract_algebra&limit=20
  - huggingface://datasets/cais/mmlu?split=test&subset=college_mathematics&limit=20
  - huggingface://datasets/cais/mmlu?split=test&subset=formal_logic&limit=20
  
  # Sciences
  - huggingface://datasets/cais/mmlu?split=test&subset=physics&limit=15
  - huggingface://datasets/cais/mmlu?split=test&subset=chemistry&limit=15
  
  # Professional domains
  - huggingface://datasets/cais/mmlu?split=test&subset=jurisprudence&limit=10
```

## Understanding the Results

### Key Metrics to Monitor

- **Accuracy**: Percentage of correct answers per subject
- **Reasoning Quality**: Step-by-step explanation clarity (via LLM rubric)
- **Format Compliance**: Adherence to requested answer format
- **Latency**: Response time per question

### Expected Improvements in GPT-4.1

Based on [OpenAI's research](https://openai.com/index/introducing-gpt-4-1-in-the-api/):

- **Enhanced Mathematical Reasoning**: Better handling of abstract algebra and calculus
- **Improved Instruction Following**: More consistent format compliance
- **Reduced Hallucination**: Less tendency to provide confident but incorrect answers
- **Better Long Context**: Improved comprehension of complex academic concepts

## Advanced Optimization

### Robust Answer Extraction

Add sophisticated answer parsing for production use:

```yaml
defaultTest:
  assert:
    - type: javascript
      value: |
        // Multi-pattern answer extraction with fallbacks
        const patterns = [
          /(Therefore|Thus|So).{0,50}answer is.{0,10}([ABCD])/i,
          /answer.{0,10}([ABCD])/i,
          /\b([ABCD])\b/g
        ];
        
        let modelChoice = null;
        for (const pattern of patterns.slice(0, -1)) {
          const match = output.match(pattern);
          if (match) {
            modelChoice = match[match.length - 1];
            break;
          }
        }
        
        if (!modelChoice) {
          const allMatches = output.match(patterns[patterns.length - 1]);
          if (allMatches?.length > 0) {
            modelChoice = allMatches[allMatches.length - 1];
          }
        }
        
        return {
          pass: !!modelChoice,
          score: modelChoice ? 1 : 0,
          reason: modelChoice ? `Extracted: ${modelChoice}` : "Could not extract answer"
        };
```

### Cost Optimization

Enable caching for repeated evaluations:

```bash
npx promptfoo@latest eval --cache
```

:::info Cost Benefits

GPT-4.1 offers [better performance at lower cost](https://openai.com/index/introducing-gpt-4-1-in-the-api/):
- **26% less expensive** than GPT-4o for median queries
- **75% prompt caching discount** for repeated context

:::

## Troubleshooting

### Common Issues

- **Dataset access errors**: Verify your `HF_TOKEN` is set correctly
- **Low pass rates**: Check that regex patterns match your prompt format
- **High latency**: Reduce `max_tokens` or increase `threshold` in assertions

### Getting Help

- [Configuration reference](/docs/configuration)
- [OpenAI provider docs](/docs/providers/openai)
- [Hugging Face dataset integration](/docs/guides/datasets)

## Next Steps

1. **Compare prompting strategies**: Test [few-shot vs zero-shot approaches](/docs/configuration/guide#prompts)
2. **Add custom metrics**: Implement [domain-specific assertions](/docs/configuration/expected-outputs)
3. **Scale evaluation**: Use [distributed testing](/docs/configuration/guide#performance) for comprehensive benchmarks
4. **Share results**: Create [shareable reports](/docs/usage/sharing) with your team

## See Also

- [MMLU Dataset Documentation](https://huggingface.co/datasets/cais/mmlu)
- [GPT-4o vs GPT-4o Mini Comparison](/docs/guides/gpt-4-vs-gpt-4o)
- [OpenAI Provider Configuration](/docs/providers/openai)
- [LLM Evaluation Best Practices](/docs/getting-started)
- [MMLU-Pro Research Paper](https://arxiv.org/abs/2406.01574)
