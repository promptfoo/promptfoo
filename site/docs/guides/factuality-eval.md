---
sidebar_position: 1
title: Evaluating factuality
description: How to evaluate the factual accuracy of LLM outputs against reference information using promptfoo's factuality assertion
---

# Evaluating factuality

## What is factuality and why is it important?

Factuality is the measure of how accurately an LLM's response aligns with established facts or reference information. As LLMs become increasingly integrated into critical applications, ensuring they provide factually accurate information is essential for:

- **Building trust**: Users need confidence that AI responses are reliable and truthful
- **Reducing misinformation**: Factually incorrect AI outputs can spread misinformation at scale
- **Supporting critical use cases**: Applications in healthcare, finance, education, and legal domains require high factual accuracy
- **Improving model selection**: Comparing factuality across models helps choose the right model for your application
- **Identifying hallucinations**: Factuality evaluation helps detect when models "make up" information

promptfoo's factuality evaluation enables you to systematically measure how well your model outputs align with reference facts, helping you identify and address issues before they reach users.

## Quick Start: Try it today

The fastest way to get started with factuality evaluation is to use our pre-built TruthfulQA example:

```bash
# Initialize the example
npx promptfoo@latest init --example huggingface-dataset-factuality

# Run the evaluation
cd huggingface-dataset-factuality
npx promptfoo eval
npx promptfoo view
```

This example:

- Fetches the TruthfulQA dataset (designed to test model truthfulness)
- Creates test cases with built-in factuality assertions
- Compares model outputs against reference answers
- Provides detailed factuality scores and analysis

You can easily customize it by:

- Uncommenting additional providers in `promptfooconfig.yaml` to test more models
- Adjusting the prompt template to change how questions are asked
- Modifying the factuality scoring weights to match your requirements

## How factuality evaluation works

promptfoo implements a structured factuality evaluation methodology based on [OpenAI's evals](https://github.com/openai/evals/blob/main/evals/registry/modelgraded/fact.yaml), using the [`factuality`](/docs/configuration/expected-outputs#model-assisted-eval-metrics) assertion type.

The model-graded factuality check takes the following three inputs:

- **Prompt**: prompt sent to the LLM
- **Output**: text produced by the LLM
- **Reference**: the ideal LLM output, provided by the author of the eval

The evaluation classifies the relationship between the LLM output and the reference into one of five categories:

- **A**: Output is a subset of the reference and is fully consistent with it
- **B**: Output is a superset of the reference and is fully consistent with it
- **C**: Output contains all the same details as the reference
- **D**: Output and reference disagree
- **E**: Output and reference differ, but differences don't affect factuality

By default, categories A, B, C, and E are considered passing (with customizable scores), while category D (disagreement) is considered failing.

## Creating a basic factuality evaluation

To set up a simple factuality evaluation for your LLM outputs:

1. **Create a configuration file** with a factuality assertion:

```yaml title="promptfooconfig.yaml"
providers:
  - openai:gpt-4o-mini
prompts:
  - |
    Please answer the following question accurately:
    Question: What is the capital of {{location}}?
tests:
  - vars:
      location: California
    assert:
      - type: factuality
        value: The capital of California is Sacramento
```

2. **Run your evaluation**:

```bash
npx promptfoo eval
npx promptfoo view
```

This will produce a report showing how factually accurate your model's responses are compared to the reference answers.

## Comparing Multiple Models

Factuality evaluation is especially useful for comparing how different models perform on the same facts:

```yaml title="promptfooconfig.yaml"
providers:
  - openai:gpt-4o-mini
  - openai:gpt-4o
  - anthropic:claude-3-7-sonnet-20250219
  - google:gemini-1.5-pro-latest
prompts:
  - |
    Question: What is the capital of {{location}}?
    Please answer accurately.
tests:
  - vars:
      location: California
    assert:
      - type: factuality
        value: The capital of California is Sacramento
  - vars:
      location: New York
    assert:
      - type: factuality
        value: Albany is the capital of New York
```

## Evaluating On External Datasets

For comprehensive evaluation, you can run factuality tests against external datasets like TruthfulQA, which we covered in the Quick Start section.

### Creating Your Own Dataset Integration

You can integrate any dataset by:

1. **Create a dataset loader**: Use JavaScript/TypeScript to fetch and format your dataset
2. **Add factuality assertions**: Include a factuality assertion in each test case
3. **Reference in your config**:

```yaml
tests: file://your_dataset_loader.ts:generate_tests
```

## Customizing the Evaluation

### Selecting the Grading Provider

By default, promptfoo selects an appropriate model for grading. To specify a particular grading model:

```yaml
defaultTest:
  options:
    # Set the provider for grading factuality
    provider: openai:gpt-4o
```

You can also override it per assertion:

```yaml
assert:
  - type: factuality
    value: The capital of California is Sacramento
    provider: anthropic:claude-3-7-sonnet-20250219
```

Or via the command line:

```bash
promptfoo eval --grader openai:gpt-4o
```

### Customizing Scoring Weights

Tailor the factuality scoring to your specific requirements:

```yaml
defaultTest:
  options:
    factuality:
      subset: 1.0 # Category A: Output is a subset of reference
      superset: 0.8 # Category B: Output is a superset of reference
      agree: 1.0 # Category C: Output contains all the same details
      disagree: 0.0 # Category D: Output and reference disagree
      differButFactual: 0.7 # Category E: Differences don't affect factuality
```

A score of 0 means fail, while any positive score is considered passing. The actual score value can be used for ranking or reporting.

### Customizing the Evaluation Prompt

For complete control over how factuality is evaluated, customize the prompt:

```yaml
defaultTest:
  options:
    rubricPrompt: |
      You are an expert factuality evaluator. Compare these two answers:

      Question: {{input}}
      Reference answer: {{ideal}}
      Submitted answer: {{completion}}

      Determine if the submitted answer is factually consistent with the reference answer.
      Choose one option:
      A: Submitted answer is a subset of reference (fully consistent)
      B: Submitted answer is a superset of reference (fully consistent)
      C: Submitted answer contains same details as reference
      D: Submitted answer disagrees with reference
      E: Answers differ but differences don't affect factuality

      Respond with JSON: {"category": "LETTER", "reason": "explanation"}
```

Available template variables:

- `{{input}}`: The original prompt/question
- `{{ideal}}`: The reference answer (from the `value` field)
- `{{completion}}`: The LLM's actual response

## Response Formats

The factuality checker supports two response formats:

1. **JSON format** (primary and recommended):

   ```json
   {
     "category": "A",
     "reason": "The submitted answer is a subset of the expert answer and is fully consistent with it."
   }
   ```

2. **Legacy format** (fallback):
   ```
   (A) The submitted answer is a subset of the expert answer and is fully consistent with it.
   ```

## Best Practices

When setting up factuality evaluations:

1. **Choose reference answers carefully**: They should be accurate, clear, and comprehensive
2. **Consider multiple providers**: Different models may excel at different types of factual knowledge
3. **Customize scoring weights**: Adjust based on your application's tolerance for different types of factual issues
4. **Use a strong grader**: More capable models generally provide more reliable factuality assessments
5. **Test with known examples**: Validate your setup with questions where you know the correct answers

## See Also

- [Model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more evaluation options
- [Factuality assertion reference](/docs/configuration/expected-outputs/model-graded/factuality)
- [API reference](/docs/reference/api) for programmatic usage
- [TruthfulQA example on GitHub](https://github.com/promptfoo/promptfoo/tree/main/examples/huggingface-dataset-factuality) - Complete code for the TruthfulQA factuality evaluation example
