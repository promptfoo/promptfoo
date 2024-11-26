# Select Best

The `select-best` assertion type compares multiple outputs from the same test case and selects the one that best meets specified criteria. This is useful for comparing outputs across different prompts or providers.

### How to use it

Add the assertion to your test configuration:

```yaml
assert:
  - type: select-best
    value: 'Criteria for selecting the best output'
```

### How it works

Under the hood, `select-best`:

1. Collects all outputs from a single test case
2. Uses an LLM to evaluate which output best matches the given criteria
3. Marks the winning output as PASS (score: 1.0) and others as FAIL (score: 0.0)

### Example Configuration

Here's a basic example comparing outputs for humor and factual content:

```yaml
prompts:
  - 'Write a tweet about {{topic}}'
  - 'Write a very concise, funny tweet about {{topic}}'

providers:
  - openai:gpt-4

tests:
  - vars:
      topic: bananas
    assert:
      - type: select-best
        value: choose the funniest tweet

  - vars:
      topic: nyc
    assert:
      - type: select-best
        value: choose the tweet that contains the most facts
```

### Customizing the Grading

Like other model-graded metrics, you can override the default grader:

```yaml
defaultTest:
  options:
    provider:
      text:
        id: openai:gpt-4o-mini
        config:
          temperature: 0
```

### Custom Rubric Prompt

You can customize the grading prompt using the `rubricPrompt` option with these variables:

- `{{outputs}}`: List of outputs to compare
- `{{criteria}}`: The selection criteria

```yaml
defaultTest:
  options:
    rubricPrompt: >
      Compare these outputs: {{outputs}}

      Selection criteria: {{criteria}}

      Analyze each output and return the index (0-based) of the best output.
```

### References

- See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more configuration options
