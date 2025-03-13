# Select Best

The `select-best` assertion compares multiple outputs in the same test case and selects the one that best meets a specified criterion. This is useful for comparing different prompt or model variations to determine which produces the best result.

### How to use it

To use the `select-best` assertion type, add it to your test configuration like this:

```yaml
assert:
  - type: select-best
    value: 'choose the most concise and accurate response'
```

Note: This assertion requires multiple prompts or providers to generate different outputs to compare.

### How it works

The select-best checker:

1. Takes all outputs from the test case
2. Evaluates each output against the specified criterion
3. Selects the best output
4. Returns pass=true for the winning output and pass=false for others

### Example Configuration

Here's a complete example showing how to use select-best to compare different prompt variations:

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
     - type: select-best
       value: 'choose the most engaging response'
       provider: openai:gpt-4o-mini
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

# Further reading

See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more options.
