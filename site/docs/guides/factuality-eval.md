---
sidebar_position: 1
title: Evaluating factuality
description: How to evaluate the factual accuracy of LLM outputs against reference information using promptfoo's factuality assertion
---

# Evaluating factuality

promptfoo implements a structured factuality evaluation methodology based on [OpenAI's evals](https://github.com/openai/evals/blob/main/evals/registry/modelgraded/fact.yaml), using the [`factuality`](/docs/configuration/expected-outputs#model-assisted-eval-metrics) assertion type.

The model-graded factuality check takes the following three inputs:

- **Prompt**: prompt sent to the LLM
- **Output**: text produced by the LLM
- **Reference**: the ideal LLM output, provided by the author of the eval

## Usage

In this example, we ensure that two prompts correctly output the capital of California. The `value` provided in the assertion is the ideal answer:

```yaml title="promptfooconfig.yaml"
providers:
  - openai:gpt-4o-mini
prompts:
  - file://prompts/name_capitals_concise.txt
  - file://prompts/name_capitals_verbose.txt
tests:
  - vars:
      location: California
    assert:
      # Ensure that the answer agrees with the provided facts
      - type: factuality
        value: The capital of California is Sacramento
```

In this example, we compare the factuality abilities of multiple modern models, while keeping the prompt constant:

```yaml title="promptfooconfig.yaml"
providers:
  - openai:gpt-4o-mini
  - openai:gpt-4o
  - anthropic:claude-3-7-sonnet-20250219
  - ollama:llama3.1:70b
  - google:gemini-1.5-pro-latest
  - meta-llama/meta-llama-3.1-70b
prompts:
  - file://prompts/name_capitals_concise.txt
tests:
  - vars:
      location: California
    assert:
      # Ensure that the answer agrees with the provided facts
      - type: factuality
        value: The capital of California is Sacramento
```

## Running factuality evaluation on external datasets

You can run factuality evaluations over external datasets, which is useful for comprehensive benchmarking of model performance:

```yaml title="promptfooconfig.yaml"
providers:
  - openai:gpt-4o
  - anthropic:claude-3-7-sonnet-20250219
prompts:
  - file://prompts/answer_question.txt
tests:
  - file: test-dataset.jsonl # External dataset with questions and reference answers
    assert:
      - type: factuality
```

Each entry in your dataset should include the input variables for the prompt and a reference answer to compare against.

## Scoring and failure cases

Scoring can be customized in the grading configuration to match your preferred level of factual agreement.

The underlying evaluation classifies the LLM output into one of five categories:

- **A**: The submitted answer is a subset of the expert answer and is fully consistent with it.
- **B**: The submitted answer is a superset of the expert answer and is fully consistent with it.
- **C**: The submitted answer contains all the same details as the expert answer.
- **D**: There is a disagreement between the submitted answer and the expert answer.
- **E**: The answers differ, but these differences don't matter from the perspective of factuality.

The evaluation returns a score and a pass/fail status. The score is determined based on the category into which the LLM output falls. By default, categories A, B, C, and E result in a score of 1 (pass), and category D results in a score of 0 (fail).

```yaml
assert:
  # Ensure the answer agrees with the provided facts
  - type: factuality
    value: The capital of California is Sacramento
    options:
      factuality:
        subset: 0.8 # Score for category A (default: 1)
        superset: 0 # Score for category B (default: 1)
        agree: 1 # Score for category C (default: 1)
        disagree: 0 # Score for category D (default: 0)
        differButFactual: 0 # Score for category E (default: 1)
```

The above configuration marks the eval as failed if the LLM output is a superset of the ideal answer, or if it differs from the ideal answer even if it is still factual. It sets a preference for an exact agreement, but a partial answer still gets a score of 0.8.

## Response formats

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

The system will attempt to parse JSON first, and fall back to pattern matching if JSON parsing fails. This ensures compatibility with both newer and older models.

## Model grading

In general, grading should be done by a model that is proficient in reasoning. By default, promptfoo uses a capable model to run model-graded evals.

However, you can use any model you want to grade the evals. Here are some options that work well for factuality evaluation:

- OpenAI: GPT-4o, GPT-4o-mini
- Anthropic: Claude 3.7 Sonnet, Claude 3.5 Sonnet
- Google: Gemini 1.5 Pro, Gemini 2.0
- Meta: Llama 3, Llama 3.1
- Open-source: Mixtral, Llama 3 (via Ollama)

To use a specific model for grading, see [overriding the LLM grader](/docs/configuration/expected-outputs/model-graded/#overriding-the-llm-grader).

## Customizing the prompt

You can customize the evaluation prompt using the `rubricPrompt` property. The following template variables are available:

- `{{input}}`: The original prompt/question
- `{{ideal}}`: The reference answer (from the `value` field)
- `{{completion}}`: The LLM's actual response

Your custom prompt should instruct the model to either:

1. Return a single letter (A, B, C, D, or E) corresponding to the category, or
2. Return a JSON object with `category` and `reason` fields

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

## See Also

- [Model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more evaluation options
- [Factuality assertion reference](/docs/configuration/expected-outputs/model-graded/factuality)
- [API reference](/docs/reference/api) for programmatic usage
