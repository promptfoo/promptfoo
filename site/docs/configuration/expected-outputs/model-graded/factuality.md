---
sidebar_label: Factuality
description: 'Validate factual accuracy of LLM responses against reference answers'
---

# Factuality

The `factuality` assertion checks if the LLM output is factually consistent with a ground truth reference.

**What it measures**: Given a reference answer (ground truth) and the LLM's output, it evaluates whether they are factually consistent - the output doesn't have to match exactly, but it can't contradict the facts.

**Example**:

- Reference: "Paris is the capital of France with 2.2 million residents"
- Good output: "The capital of France is Paris" ✓
- Good output: "Paris, France's capital, has 2.2M people in a metro area of 10M" ✓
- Bad output: "Lyon is the capital of France" ✗

## Required fields

The factuality assertion requires:

- `value` - The reference answer/ground truth to check against
- Output - The LLM's response to evaluate

## Configuration

### Basic usage

```yaml
assert:
  - type: factuality
    value: 'The Earth orbits around the Sun'
```

For non-English evaluation output, see the [multilingual evaluation guide](/docs/configuration/expected-outputs/model-graded#non-english-evaluation).

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
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Verify factual accuracy against known correct answers'

prompts:
  - 'What is the capital of {{state}}?'
  - 'Tell me about the capital city of {{state}}'

providers:
  - id: openai:gpt-4.1-mini

tests:
  - description: 'Test California capital knowledge'
    vars:
      state: California
    assert:
      - type: factuality
        value: Sacramento is the capital of California
        
  - description: 'Test New York capital knowledge'
    vars:
      state: New York
    assert:
      - type: factuality
        value: Albany is the capital city of New York state
        
  - description: 'Test with detailed reference'
    vars:
      state: Texas
    assert:
      - type: factuality
        value: Austin is the capital of Texas, located in central Texas
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
       provider: anthropic:messages:claude-opus-4-1-latest
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
