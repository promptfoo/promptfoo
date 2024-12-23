# Model-graded Closed QA

`model-graded-closedqa` is a criteria-checking evaluation that uses OpenAI's public evals prompt to determine if an LLM output meets specific requirements.

### How to use it

To use the `model-graded-closedqa` assertion type, add it to your test configuration like this:

```yaml
assert:
  - type: model-graded-closedqa
    # Specify the criteria that the output must meet:
    value: Provides a clear answer without hedging or uncertainty
```

This assertion will use a language model to evaluate whether the output meets the specified criterion, returning a simple yes/no response.

### How it works

Under the hood, `model-graded-closedqa` uses OpenAI's closed QA evaluation prompt to analyze the output. The grader will return:

- `Y` if the output meets the criterion
- `N` if the output does not meet the criterion

The assertion passes if the response ends with 'Y' and fails if it ends with 'N'.

### Example Configuration

Here's a complete example showing how to use model-graded-closedqa:

```yaml
prompts:
  - 'What is {{topic}}?'
providers:
  - openai:gpt-4
tests:
  - vars:
      topic: quantum computing
    assert:
      - type: model-graded-closedqa
        value: Explains the concept without using technical jargon
      - type: model-graded-closedqa
        value: Includes a practical real-world example
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
     - type: model-graded-closedqa
       value: Is concise and clear
       provider: openai:gpt-4o-mini
   ```

### Customizing the Prompt

You can customize the evaluation prompt using the `rubricPrompt` property:

```yaml
defaultTest:
  options:
    rubricPrompt: |
      Question: {{input}}
      Criterion: {{criteria}}
      Response: {{completion}}

      Does this response meet the criterion? Answer Y or N.
```

# Further reading

See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more options.
