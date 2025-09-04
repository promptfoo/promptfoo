---
sidebar_label: Factuality
description: 'Validate factual accuracy of LLM responses using AI-powered fact-checking against verified knowledge bases and sources'
---

# Factuality

The `factuality` assertion evaluates the factual consistency between an LLM output and a reference answer. It uses a structured prompt based on [OpenAI's evals](https://github.com/openai/evals/blob/main/evals/registry/modelgraded/fact.yaml) to determine if the output is factually consistent with the reference.

## How to use it

To use the `factuality` assertion type, add it to your test configuration like this:

```yaml
assert:
  - type: factuality
    # Specify the reference statement to check against:
    value: The Earth orbits around the Sun
```

## How it works

The factuality checker evaluates whether completion A (the LLM output) and reference B (the value) are factually consistent. It categorizes the relationship as one of:

- **(A)** Output is a subset of the reference and is fully consistent
- **(B)** Output is a superset of the reference and is fully consistent
- **(C)** Output contains all the same details as the reference
- **(D)** Output and reference disagree
- **(E)** Output and reference differ, but differences don't matter for factuality

By default, options A, B, C, and E are considered passing grades, while D is considered failing.

## Example Configuration

Here's a complete example showing how to use factuality checks:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'What is the capital of {{state}}?'
providers:
  - openai:gpt-4.1
  - anthropic:claude-3-7-sonnet-20250219
tests:
  - vars:
      state: California
    assert:
      - type: factuality
        value: Sacramento is the capital of California
  - vars:
      state: New York
    assert:
      - type: factuality
        value: Albany is the capital city of New York state
```

## Customizing Score Thresholds

You can customize which factuality categories are considered passing by setting scores in your test configuration:

```yaml
defaultTest:
  options:
    factuality:
      subset: 1 # Score for category A (default: 1)
      superset: 1 # Score for category B (default: 1)
      agree: 1 # Score for category C (default: 1)
      disagree: 0 # Score for category D (default: 0)
      differButFactual: 1 # Score for category E (default: 1)
```

## Overriding the Grader

Like other model-graded assertions, you can override the default grader:

1. Using the CLI:

   ```sh
   promptfoo eval --grader openai:gpt-4.1-mini
   ```

2. Using test options:

   ```yaml
   defaultTest:
     options:
       provider: anthropic:claude-3-7-sonnet-20250219
   ```

3. Using assertion-level override:

   ```yaml
   assert:
     - type: factuality
       value: Sacramento is the capital of California
       provider: openai:gpt-4.1-mini
   ```

## Customizing the Prompt

You can customize the evaluation prompt using the `rubricPrompt` property. The prompt has access to the following Nunjucks template variables:

- `{{input}}`: The original prompt/question
- `{{ideal}}`: The reference answer (from the `value` field)
- `{{completion}}`: The LLM's actual response (provided automatically by promptfoo)

Your custom prompt should instruct the model to either:

1. Return a single letter (A, B, C, D, or E) corresponding to the category, or
2. Return a JSON object with `category` and `reason` fields

Here's an example of a custom prompt:

```yaml
defaultTest:
  options:
    rubricPrompt: |
      Input: {{input}}
      Reference: {{ideal}}
      Completion: {{completion}}

      Evaluate the factual consistency between the completion and reference.
      Choose the most appropriate option:
      (A) Completion is a subset of reference
      (B) Completion is a superset of reference
      (C) Completion and reference are equivalent
      (D) Completion and reference disagree
      (E) Completion and reference differ, but differences don't affect factuality

      Answer with a single letter (A/B/C/D/E).
```

The factuality checker will parse either format:

- A single letter response like "A" or "(A)"
- A JSON object: `{"category": "A", "reason": "Detailed explanation..."}`

## See Also

- [Model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more options
- [Guide on LLM factuality](/docs/guides/factuality-eval)
