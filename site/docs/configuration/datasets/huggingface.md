---
sidebar_position: 1
---

# HuggingFace Datasets

promptfoo can load test cases directly from HuggingFace datasets, making it easy to evaluate your models on established benchmarks or custom datasets.

## Quick Start

To use a HuggingFace dataset in your configuration, specify it using the `huggingface://datasets/` prefix:

```yaml
tests: huggingface://datasets/fka/awesome-chatgpt-prompts
```

Each row in the dataset becomes a test case, with dataset fields available as variables in your prompts.

## Configuration Options

You can customize the dataset loading using query parameters:

```yaml
# Load from training split
tests: huggingface://datasets/fka/awesome-chatgpt-prompts?split=train

# Load from validation split with custom config
tests: huggingface://datasets/fka/awesome-chatgpt-prompts?split=validation&config=custom

# Limit the number of test cases
tests: huggingface://datasets/fka/awesome-chatgpt-prompts?limit=100
```

### Supported Parameters

| Parameter | Description                                   | Default   |
| --------- | --------------------------------------------- | --------- |
| `split`   | Dataset split to load (train/test/validation) | `test`    |
| `config`  | Dataset configuration name                    | `default` |
| `limit`   | Maximum number of test cases to load          | No limit  |

## Example: Evaluating Models on MMLU

Here's a complete example that evaluates models on the MMLU (Massive Multitask Language Understanding) dataset:

```yaml
description: 'Model comparison on MMLU reasoning tasks'

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
  - openai:gpt-4
  - anthropic:claude-2

defaultTest:
  assert:
    - type: llm-rubric
      value: Response must include clear step-by-step reasoning
    - type: regex
      value: "Therefore, the answer is [ABCD]\\."

tests:
  # Load specific MMLU subjects
  - huggingface://datasets/cais/mmlu?split=test&subset=abstract_algebra&config=abstract_algebra&limit=10
  - huggingface://datasets/cais/mmlu?split=test&subset=formal_logic&config=formal_logic&limit=10
```

## Best Practices

1. **Use Limits**: Start with a small subset of the dataset using the `limit` parameter to test your configuration.
2. **Choose Appropriate Splits**: Use `test` split for final evaluations, `validation` for development.
3. **Handle Missing Fields**: Ensure your prompts handle cases where dataset fields might be missing.
4. **Cache Results**: Enable caching to avoid re-running evaluations on the same data.

## Troubleshooting

If you encounter issues:

1. Check that the dataset exists and is publicly accessible
2. Verify the field names match your prompt variables
3. Ensure you have sufficient permissions if using private datasets
4. Check the dataset documentation for specific configuration options
