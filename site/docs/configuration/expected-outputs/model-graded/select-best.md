# Select Best

The `select-best` assertion compares multiple outputs from the same test case and selects the one that best meets specified criteria. This is useful for comparing outputs across different prompts or providers to determine which produces the best result.

### How to use it

Add the assertion to your test configuration:

```yaml
assert:
  - type: select-best
    value: 'choose the most concise and accurate response'
```

### Requirements

The assertion requires:

- Multiple outputs to compare (from different prompts or providers)
- A clear criterion for selection
- All outputs must be from the same test case

### How it works

Under the hood, `select-best`:

1. Collects all outputs from a single test case
2. Uses an LLM to compare outputs against the specified criteria
3. Performs pairwise comparisons when needed for complex evaluations
4. Marks the winning output as PASS (1.0) and others as FAIL (0.0)

### Example Configuration

Here's a complete example comparing different prompt variations:

```yaml
prompts:
  - 'Write a tweet about {{topic}}'
  - 'Write a very concise, funny tweet about {{topic}}'
  - 'Compose a tweet about {{topic}} that will go viral'
providers:
  - openai:gpt-4
tests:
  - vars:
      topic: 'artificial intelligence'
    assert:
      - type: select-best
        value: 'choose the tweet that is most likely to get high engagement'
  - vars:
      topic: 'climate change'
    assert:
      - type: select-best
        value: 'choose the tweet that best balances information and humor'
```

### Scoring Methodology

Unlike `llm-rubric` which provides nuanced scoring between 0-1, `select-best` uses a binary scoring system:

- Winner: score = 1.0 (PASS)
- Others: score = 0.0 (FAIL)

For more granular comparison, consider using multiple `llm-rubric` assertions with specific criteria.

### Customizing the Grader

Like other model-graded assertions, you can override the default grader in three ways:

1. Using the CLI:

   ```sh
   promptfoo eval --grader openai:gpt-4
   ```

2. Using test options:

   ```yaml
   defaultTest:
     options:
       provider: openai:gpt-4
   ```

3. Using assertion-level override:
   ```yaml
   assert:
     - type: select-best
       value: 'choose the most engaging response'
       provider: openai:gpt-4
   ```

### Customizing the Prompt

You can customize the evaluation prompt using the `rubricPrompt` property:

```yaml
defaultTest:
  options:
    rubricPrompt: |
      Here are {{ outputs | length }} responses:
      {% for output in outputs %}
      Output {{ loop.index0 }}: {{ output }}
      {% endfor %}

      Criteria: {{ criteria }}

      Analyze each output against the criteria.
      Choose the best output by responding with its index (0 to {{ outputs | length - 1 }}).
```

### Further Reading

- See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more configuration options
- Learn about [comparison evaluations](/docs/guides/comparison-eval) for advanced usage
