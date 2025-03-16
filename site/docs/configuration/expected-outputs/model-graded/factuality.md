# Factuality

The `factuality` assertion evaluates the factual consistency between an LLM output and a reference answer. It uses OpenAI's public evals prompt to determine if the output is factually consistent with the reference.

### How to use it

To use the `factuality` assertion type, add it to your test configuration like this:

```yaml
assert:
  - type: factuality
    # Specify the reference statement to check against:
    value: The Earth orbits around the Sun
```

### How it works

The factuality checker evaluates whether completion A (the LLM output) and reference B (the value) are factually consistent. It categorizes the relationship as one of:

- (A) Output is a subset of the reference and is fully consistent
- (B) Output is a superset of the reference and is fully consistent
- (C) Output contains all the same details as the reference
- (D) Output and reference disagree
- (E) Output and reference differ, but differences don't matter for factuality

By default, options A, B, C, and E are considered passing grades, while D is considered failing.

### Example Configuration

Here's a complete example showing how to use factuality checks:

```yaml
prompts:
  - 'What is the capital of {{state}}?'
providers:
  - openai:gpt-4
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

### Customizing Score Thresholds

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

### Overriding the Grader

Like other model-graded assertions, you can override the default grader:

1. Using the CLI:

   ```sh
   promptfoo eval --grader openai:gpt-4o-mini
   ```

2. Using test options:

   ```yaml
   defaultTest:
     options:
       provider: openai:gpt-4o-mini
   ```

3. Using assertion-level override:
   ```yaml
   assert:
     - type: factuality
       value: Sacramento is the capital of California
       provider: openai:gpt-4o-mini
   ```

### Customizing the Prompt

You can customize the evaluation prompt using the `rubricPrompt` property:

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

# Further reading

- See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more options
- Check out the [guide on LLM factuality](/docs/guides/factuality-eval)
