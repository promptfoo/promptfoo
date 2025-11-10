---
title: Testing Humanity's Last Exam with Promptfoo
description: Run evaluations against Humanity's Last Exam using promptfoo - the most challenging AI benchmark with expert-crafted questions across 100+ subjects.
sidebar_label: HLE Benchmark
keywords:
  [
    hle,
    humanity's last exam,
    llm benchmark,
    ai eval,
    model testing,
    claude,
    gpt,
    promptfoo,
    expert questions,
  ]
image: /img/hle-token-usage-summary.png
sidebar_position: 6
date: 2025-06-30
authors: [michael]
---

# Testing Humanity's Last Exam with Promptfoo

[Humanity's Last Exam (HLE)](https://arxiv.org/abs/2501.14249) is a challenging benchmark commissioned by Scale AI and the Center for AI Safety (CAIS), developed by 1,000+ subject experts from over 500 institutions across 50 countries. Created to address benchmark saturation where current models achieve 90%+ accuracy on MMLU, HLE presents genuinely difficult expert-level questions that test AI capabilities at the frontier of human knowledge.

This guide shows you how to:

- Set up HLE evals with promptfoo
- Configure reasoning models for HLE questions
- Analyze real performance data from Claude 4 and o4-mini
- Understand model limitations on challenging benchmarks

## About Humanity's Last Exam

HLE addresses benchmark saturation - the phenomenon where advanced models achieve over 90% accuracy on existing tests like MMLU, making it difficult to measure continued progress. HLE provides a more challenging eval for current AI systems.

**Key characteristics:**

- Created by 1,000+ PhD-level experts across 500+ institutions
- Covers 100+ subjects from mathematics to humanities
- 14% of questions include images alongside text
- Questions resist simple web search solutions
- Focuses on verifiable, closed-ended problems

**Current model performance:**

| Model                | Accuracy | Notes                      |
| -------------------- | -------- | -------------------------- |
| OpenAI Deep Research | 26.6%    | With search capabilities   |
| o4-mini              | ~13%     | Official benchmark results |
| DeepSeek-R1          | 8.5%     | Text-only evaluation       |
| o1                   | 8.0%     | Previous generation        |
| Gemini 2.0 Flash     | 6.6%     | Multimodal support         |
| Claude 3.5 Sonnet    | 4.1%     | Base model                 |

_Official model performance on full HLE dataset_

## Running the Eval

Set up your HLE eval with these commands:

```bash
npx promptfoo@latest init --example huggingface-hle
cd huggingface-hle
npx promptfoo@latest eval
```

See the complete example at [examples/huggingface-hle](https://github.com/promptfoo/promptfoo/tree/main/examples/huggingface-hle) for all configuration files and implementation details.

Set these API keys before running:

- `OPENAI_API_KEY` - for o4-mini and GPT models
- `ANTHROPIC_API_KEY` - for Claude 4 with thinking mode
- `HF_TOKEN` - get yours from [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)

Promptfoo handles dataset loading, parallel execution, cost tracking, and results analysis automatically.

:::note License and Safety

HLE is released under the MIT license. The dataset includes a canary string to help model builders filter it from training data. Images in the dataset may contain copyrighted material. Review your AI provider's policies regarding image content before running evaluations with multimodal models.

:::

## Eval Results

After your eval completes, open the web interface:

```bash
npx promptfoo@latest view
```

Promptfoo generates a summary report showing token usage, costs, success rates, and performance metrics:

![HLE Evaluation Results](/img/hle-token-usage-summary.png)

We tested Claude 4 and o4-mini on 50 HLE questions using promptfoo with optimized configurations to demonstrate real-world performance. Note that our results differ from official benchmarks due to different prompting strategies, token budgets, and question sampling.

![Model Comparison on Bioinformatics Question](/img/hle-model-comparison-detail.png)

This example shows both models attempting a complex bioinformatics question. The interface displays complete reasoning traces and comparative analysis.

**Performance summary (50 questions per model, 100 total test cases):**

- **Combined pass rate**: 28% (28 successes across both models)
- **Runtime**: 9 minutes with 20 concurrent workers
- **Token usage**: Approximately 237K tokens for 100 test cases

The models showed different performance characteristics:

| Model    | Success Rate | Token Usage | Total Cost (50 questions) | Avg Latency |
| -------- | ------------ | ----------- | ------------------------- | ----------- |
| o4-mini  | 42% (21/50)  | 139,580     | $0.56                     | 17.6s       |
| Claude 4 | 14% (7/50)   | 97,552      | $1.26                     | 28.8s       |

The interface provides:

- Question-by-question breakdown with full reasoning traces
- Token usage and cost analysis
- Side-by-side model comparison with diff highlighting
- Performance analytics by subject area

## Prompt Engineering for HLE

To handle images across different AI providers, we wrote a custom prompt function in Python. OpenAI uses `image_url` format while Anthropic/Claude requires base64 `source` format.

The rendered prompts look like this:

```yaml
- role: system
  content: |
    Your response should be in the following format:
    Explanation: {your explanation for your answer choice}
    Answer: {your chosen answer}
    Confidence: {your confidence score between 0% and 100% for your answer}
- role: user
  content: |
    Which condition of Arrhenius's sixth impossibility theorem do critical views violate?

    Options:
    A) Weak Non-Anti-Egalitarianism
    B) Non-Sadism
    C) Transitivity
    D) Completeness
```

The Python approach enables provider-specific adaptations:

- **OpenAI models**: Uses `image_url` format for images, `developer` role for o1/o3 reasoning models
- **Anthropic models**: Converts images to base64 `source` format for Claude compatibility
- **Response structure**: Standardized format with explanation, answer, and confidence scoring

## Automated Grading

Promptfoo uses LLM-as-a-judge for automated grading with the built-in `llm-rubric` assertion. This approach evaluates model responses against the expected answers without requiring exact string matches.

The grading system:

- Uses a configured judge model to verify answer correctness
- Accounts for equivalent formats (decimals vs fractions, different notation styles)
- Handles both multiple-choice and exact-match question types
- Provides consistent scoring across different response styles

Here's how to configure the grading assertion:

```yaml
defaultTest:
  assert:
    - type: llm-rubric
      value: |
        Evaluate whether the response correctly answers the question.

        Question: {{ question }}
        Model Response: {{ output }}
        Correct Answer: {{ answer }}

        Grade the response on accuracy (0.0 to 1.0 scale):
        - 1.0: Response matches the correct answer exactly or is mathematically/logically equivalent
        - 0.8-0.9: Response is mostly correct with minor differences that don't affect correctness
        - 0.5-0.7: Response is partially correct but has significant errors
        - 0.0-0.4: Response is incorrect or doesn't address the question

        The response should pass if it demonstrates correct understanding and provides the right answer, even if the explanation differs from the expected format.
```

This automated approach scales well for large evaluations while maintaining accuracy comparable to human grading on HLE's objective, closed-ended questions.

## Customization Options

**Key settings:**

- **3K thinking tokens (Claude)**: Tradeoff between cost and reasoning capability - more tokens may improve accuracy
- **4K max tokens**: Allows detailed explanations without truncation
- **50 questions**: Sample size chosen for this demonstration - scale up for production evals
- **Custom prompts**: Can be further optimized for specific models and question types

**Test more questions:**

```yaml
tests:
  - huggingface://datasets/cais/hle?split=test&limit=200
```

**Add more models:**

```yaml
providers:
  - anthropic:claude-sonnet-4-20250514
  - openai:o4-mini
  - deepseek:deepseek-reasoner
```

**Increase reasoning budget:**

```yaml
providers:
  - id: anthropic:claude-sonnet-4-20250514
    config:
      thinking:
        budget_tokens: 8000 # For complex proofs
      max_tokens: 12000
```

## Eval Limitations

Keep in mind these results are preliminary - we only tested 50 questions per model in a single run. That's a pretty small sample from HLE's 14,000+ questions, and we didn't optimize our approach much (token budgets, prompts, etc. were chosen somewhat arbitrarily).

o4-mini's 42% success rate stands out and requires validation through larger samples and multiple runs. Performance will likely vary considerably across different subjects and question formats.

## Implications for AI Development

HLE provides a useful benchmark for measuring AI progress on academic tasks. The low current scores indicate significant room for improvement in AI reasoning capabilities.

As Dan Hendrycks (CAIS co-founder) notes:

> "When I released the MATH benchmark in 2021, the best model scored less than 10%; few predicted that scores higher than 90% would be achieved just three years later. Right now, Humanity's Last Exam shows there are still expert questions models cannot answer. We will see how long that lasts."

**Key findings:**

- Current reasoning models achieve modest performance on HLE questions
- Success varies significantly by domain and question type
- Token budget increases alone don't guarantee accuracy improvements
- Substantial gaps remain between AI and human expert performance

Promptfoo provides HLE eval capabilities through automated dataset integration, parallel execution, and comprehensive results analysis.

## Learn More

### Official Resources

- [HLE Research Paper](https://arxiv.org/abs/2501.14249) - Original academic paper from CAIS and Scale AI
- [HLE Dataset](https://huggingface.co/datasets/cais/hle) - Dataset on Hugging Face
- [Official HLE Website](https://lastexam.ai) - Questions and leaderboard
- [Scale AI HLE Announcement](https://scale.com/blog/humanitys-last-exam-results) - Official results and methodology

### Analysis and Coverage

- [OpenAI Deep Research Performance](https://scale.com/blog/o3-o4-mini-calibration) - Deep Research achieving 26.6% accuracy
- [Medium: HLE Paper Review](https://medium.com/@sulbha.jindal/humanitys-last-exam-hle-paper-review-69316b2cfc04) - Technical analysis of the benchmark
- [Hugging Face Papers](https://huggingface.co/papers/2501.14249) - Community discussion and insights

### Promptfoo Integration

- [HuggingFace Provider Guide](../providers/huggingface.md) - Set up dataset access
- [Model Grading Setup](../../configuration/expected-outputs/model-graded/) - Configure automated grading
- [Anthropic Provider](../providers/anthropic.md) - Configure Claude 4
