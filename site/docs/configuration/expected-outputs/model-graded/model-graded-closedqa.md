# Model Graded Closed QA

The `model-graded-closedqa` assertion type evaluates whether an LLM's output meets specific criteria, using OpenAI's closed-ended question-answering evaluation methodology.

### How to use it

Add the assertion to your test configuration:

```yaml
assert:
  - type: model-graded-closedqa
    # Specify the criteria for grading the output:
    value: Is written in a professional tone without technical jargon
```

### How it works

Based on OpenAI's [closedqa evaluation](https://github.com/openai/evals/blob/main/evals/registry/modelgraded/closedqa.yaml), this assertion:

1. Takes a prompt, output, and criteria
2. Uses an LLM to evaluate if the output satisfies the criteria
3. Returns a binary pass/fail result with explanation

Similar to `llm-rubric` but with a more focused evaluation approach specifically designed for closed-ended criteria checking.

### Example with variables

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

### Customizing the prompt

You can override the default grading prompt:

```yaml
defaultTest:
  options:
    rubricPrompt: >
      [
        {
          "role": "system",
          "content": "You are evaluating if an output meets specific criteria. Output JSON with {pass: boolean, score: number, reason: string}"
        },
        {
          "role": "user",
          "content": "Criteria: {{rubric}}\n\nOutput to evaluate: {{output}}"
        }
      ]
```

### References

- Based on [OpenAI's closedqa evaluation](https://github.com/openai/evals/blob/main/evals/registry/modelgraded/closedqa.yaml)
- See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more configuration options
