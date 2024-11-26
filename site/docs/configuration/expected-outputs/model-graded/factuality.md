# Factuality

The `factuality` assertion type evaluates whether an LLM's output is factually consistent with a reference answer. This implementation is based on OpenAI's [factuality evaluation methodology](https://github.com/openai/evals/blob/main/evals/registry/modelgraded/fact.yaml).

### How to use it

Add the assertion to your test configuration:

```yaml
assert:
  - type: factuality
    # Provide the reference answer to check against:
    value: The capital of California is Sacramento
```

### How it works

The factuality evaluator compares the LLM output against a reference answer and classifies it into one of five categories:

1. **Subset** (A): Output is a subset of reference and fully consistent
2. **Superset** (B): Output is a superset of reference and fully consistent
3. **Equivalent** (C): Output contains same details as reference
4. **Disagree** (D): Output conflicts with reference
5. **Differ but Factual** (E): Outputs differ, but differences don't affect factuality

### Customizing scoring

You can customize how each category affects the final score:

```yaml
assert:
  - type: factuality
    value: The capital of California is Sacramento
    options:
      factuality:
        subset: 0.8 # Category A score
        superset: 0.6 # Category B score
        agree: 1.0 # Category C score
        disagree: 0.0 # Category D score
        differButFactual: 0.7 # Category E score
```

### Example with variables

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

### Overriding the grader

Like other model-graded metrics, you can override the default grader:

```yaml
defaultTest:
  options:
    provider: openai:gpt-4o-mini
```

### References

- Based on [OpenAI's factuality evaluation](https://github.com/openai/evals/blob/main/evals/registry/modelgraded/fact.yaml)
- See [factuality evaluation guide](/docs/guides/factuality-eval) for detailed usage
- See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more configuration options
