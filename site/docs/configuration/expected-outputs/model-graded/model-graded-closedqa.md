# Model-graded Closed QA

The `model-graded-closedqa` assertion evaluates whether an LLM's output meets specific criteria, using OpenAI's closed-ended question-answering evaluation methodology. While similar to `llm-rubric`, this evaluator is specifically optimized for yes/no criteria checking rather than nuanced scoring.

### Key differences from llm-rubric

- Focused on binary pass/fail evaluation
- Uses OpenAI's official closedqa prompt template
- Better suited for clear, objective criteria
- Less flexible but potentially more consistent for simple checks

### How to use it

Add the assertion to your test configuration:

```yaml
assert:
  - type: model-graded-closedqa
    value: 'Is written in a professional tone without technical jargon'
```

### How it works

Based on OpenAI's [closedqa evaluation](https://github.com/openai/evals/blob/main/evals/registry/modelgraded/closedqa.yaml), this assertion:

1. Takes a prompt, output, and criteria
2. Uses an LLM to evaluate if the output satisfies the criteria
3. Returns a binary pass/fail result with explanation

The grader will return:

- `Y` if the output meets the criterion
- `N` if the output does not meet the criterion

### Example Configuration

Here's a complete example showing how to use model-graded-closedqa:

```yaml
providers:
  - openai:gpt-4
prompts:
  - file://prompts/customer_service.txt
tests:
  - vars:
      customer_name: John
      issue: refund
    assert:
      - type: model-graded-closedqa
        value: |
          Meets these requirements:
          1. Addresses the customer by name
          2. Acknowledges the refund request
          3. Maintains professional tone
```

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
     - type: model-graded-closedqa
       value: Is concise and clear
       provider: openai:gpt-4
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

### Further Reading

- Based on [OpenAI's closedqa evaluation](https://github.com/openai/evals/blob/main/evals/registry/modelgraded/closedqa.yaml)
- See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more configuration options
