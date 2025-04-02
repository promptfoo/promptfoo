---
description: Use OpenAI's public evals prompt to determine if LLM outputs meet specific criteria with a simple yes/no evaluation
---

# Model-graded Closed QA

`model-graded-closedqa` is a criteria-checking evaluation that uses OpenAI's public evals prompt to determine if an LLM output meets specific requirements.

## How to use it

To use the `model-graded-closedqa` assertion type, add it to your test configuration like this:

```yaml
assert:
  - type: model-graded-closedqa
    # Specify the criteria that the output must meet:
    value: Provides a clear answer without hedging or uncertainty
```

This assertion will use a language model to evaluate whether the output meets the specified criterion, returning a simple yes/no response.

## How it works

Under the hood, `model-graded-closedqa` uses OpenAI's closed QA evaluation prompt to analyze the output. The grader will return:

- `Y` if the output meets the criterion
- `N` if the output does not meet the criterion

The assertion passes if the response ends with 'Y' and fails if it ends with 'N'.

## Example Configuration

Here's a complete example showing how to use model-graded-closedqa:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'What is {{topic}}?'
providers:
  - openai:gpt-4o
tests:
  - vars:
      topic: quantum computing
    assert:
      - type: model-graded-closedqa
        value: Explains the concept without using technical jargon
      - type: model-graded-closedqa
        value: Includes a practical real-world example
```

## Overriding the Grader

Like other model-graded assertions, you can override the default grader:

1. Using the CLI:

   ```bash
   promptfoo eval --grader anthropic:messages:claude-3-7-sonnet-20250219
   ```

2. Using test options:

   ```yaml
   defaultTest:
     options:
       provider: anthropic:messages:claude-3-7-sonnet-20250219
   ```

3. Using assertion-level override:
   ```yaml
   assert:
     - type: model-graded-closedqa
       value: Is concise and clear
       provider: anthropic:messages:claude-3-7-sonnet-20250219
   ```

## Customizing the Prompt

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

## See Also

- [Model-graded metrics overview](/docs/configuration/expected-outputs/model-graded)
- [LLM-Rubric](/docs/configuration/expected-outputs/model-graded/llm-rubric) for more flexible model-based grading
- [G-Eval](/docs/configuration/expected-outputs/model-graded/g-eval) for multi-criteria evaluation
- [OpenAI evals documentation](https://github.com/openai/evals)
