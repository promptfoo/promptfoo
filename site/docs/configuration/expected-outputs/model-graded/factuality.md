# Factuality

The `factuality` assertion evaluates whether an LLM's output is factually consistent with a reference answer. This implementation is based on OpenAI's [factuality evaluation methodology](https://github.com/openai/evals/blob/main/evals/registry/modelgraded/fact.yaml) and is essential for ensuring the accuracy of generated responses.

### How to use it

Add the assertion to your test configuration:

```yaml
assert:
  - type: factuality
    value: 'The capital of California is Sacramento'
```

### How it works

The factuality evaluator compares the LLM output against a reference answer and classifies it into one of five categories:

1. **Subset** (A): Output is a subset of reference and fully consistent
2. **Superset** (B): Output is a superset of reference and fully consistent
3. **Equivalent** (C): Output contains same details as reference
4. **Disagree** (D): Output conflicts with reference
5. **Differ but Factual** (E): Outputs differ, but differences don't affect factuality

By default, categories A, B, C, and E are considered passing grades, while D is considered failing.

### Example Configuration

```yaml
providers:
  - openai:gpt-4
prompts:
  - file://prompts/capitals.txt
tests:
  - vars:
      state: California
      city: Sacramento
    assert:
      - type: factuality
        value: '{{city}} is the capital of {{state}}'
```

### Customizing Scoring

You can customize how each category affects the final score:

```yaml
assert:
  - type: factuality
    value: 'The capital of California is Sacramento'
    options:
      factuality:
        subset: 0.8 # Category A score
        superset: 0.6 # Category B score
        agree: 1.0 # Category C score
        disagree: 0.0 # Category D score
        differButFactual: 0.7 # Category E score
```

### Customizing the Grader

Like other model-graded assertions, you can override the default grader:

```yaml
defaultTest:
  options:
    provider: openai:gpt-4
```

Or at the assertion level:

```yaml
assert:
  - type: factuality
    value: 'The capital of California is Sacramento'
    provider: openai:gpt-4
```

### Customizing the Prompt

You can customize the evaluation prompt using `rubricPrompt`:

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

### Further Reading

- See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more configuration options
- Learn more about [OpenAI's factuality evaluation](https://github.com/openai/evals/blob/main/evals/registry/modelgraded/fact.yaml)
- Check out the [factuality evaluation guide](/docs/guides/factuality-eval) for detailed usage
