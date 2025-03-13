---
sidebar_position: 1
---

# Evaluating factuality

promptfoo implements OpenAI's evaluation methodology for factuality, using the [`factuality`](/docs/configuration/expected-outputs#model-assisted-eval-metrics) assertion type.

The model-graded factuality check takes the following three inputs:

- **Prompt**: prompt sent to the LLM
- **Output**: text produced by the LLM
- **Reference**: the ideal LLM output, provided by the author of the eval

## Usage

In this example, we ensure that two prompts correctly output the capital of California. The `value` provided in the assertion is the ideal answer:

```yaml
providers:
  - openai:gpt-4o-mini
prompts:
  - file://prompts/name_capitals_concise.txt
  - file://prompts/name_capitals_verbose.txt
tests:
  - vars:
      location: Sacramento
    assert:
      # Ensure that the answer agrees with the provided facts
      - type: factuality
        value: The capital of California is Sacramento
```

In this example, we compare the factuality abilities of three models (GPT-3.5, GPT-4, and Llama2-70b), while keeping the prompt constant:

```yaml
providers:
  - openai:gpt-4o-mini
  - openai:gpt-4o
  - ollama:llama3.1:70b
prompts:
  - file://prompts/name_capitals_concise.txt
tests:
  - vars:
      location: Sacramento
    assert:
      # Ensure that the answer agrees with the provided facts
      - type: factuality
        value: The capital of California is Sacramento
```

## Scoring and failure cases

Scoring can be customized in the grading configuration to match your preferred level of factual agreement.

The underlying evaluation classifies the LLM output into one of five categories:

- A: The submitted answer is a subset of the expert answer and is fully consistent with it.
- B: The submitted answer is a superset of the expert answer and is fully consistent with it.
- C: The submitted answer contains all the same details as the expert answer.
- D: There is a disagreement between the submitted answer and the expert answer.
- E: The answers differ, but these differences don't matter from the perspective of factuality.

The evaluation returns a score and a pass/fail status. The score is determined based on the category into which the LLM output falls. By default, categories A, B, C, and E result in a score of 1 (pass), and category D results in a score of 0 (fail).

```yaml
assert:
  # Ensure the answer agrees with the provided facts
  - type: factuality
    value: The capital of California is Sacramento
    options:
      factuality:
        subset: 0.8
        superset: 0
        agree: 1
        disagree: 0
        differButFactual: 0
```

The above configuration marks the eval as failed if the LLM output is a superset of the ideal answer, or if it differs from the ideal answer even if it is still factual. It sets a preference for an exact agreement, but a partial answer still gets a score of 0.8.

## Model grading

In general, grading should be done by a model that is proficient in reasoning. By default, promptfoo uses GPT-4o to run model-graded evals.

However, you can use any model you want to grade the evals. To use something other than GPT-4, see [overriding the LLM grader](/docs/configuration/expected-outputs/model-graded/#overriding-the-llm-grader).
