---
description: Compare multiple outputs from different LLMs or prompts to determine which one best meets specific criteria
---

# Select Best

The `select-best` assertion compares multiple outputs from different LLMs or prompts and determines which one best meets specific criteria. This is useful for directly comparing the quality of different models or prompt versions.

## How to use it

To use the `select-best` assertion type, add it to your test configuration like this:

```yaml
assert:
  - type: select-best
    value: 'The criteria for selecting the best output (e.g., most accurate, most concise, etc.)'
```

## How it works

The select-best checker:

1. Collects all outputs from different providers or prompts for the same test case
2. Prompts an LLM to evaluate which output best matches the specified criteria
3. Returns the winner and an explanation for the selection

This helps you identify which model or prompt variation performs best for specific tasks.

## Example Configuration

Here's a complete example showing how to compare tweets written by different prompts:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Write a tweet about {{topic}}'
  - 'Write a very concise, funny tweet about {{topic}}'
  - 'Write a professional tweet about {{topic}} suitable for a business account'
providers:
  - openai:gpt-4o
tests:
  - vars:
      topic: artificial intelligence
    assert:
      - type: select-best
        value: Choose the tweet that is most engaging and would get the most likes
  - vars:
      topic: climate change
    assert:
      - type: select-best
        value: Choose the tweet that is most informative while still being concise
```

You can also compare outputs across different providers:

```yaml
prompts:
  - 'Write a concise explanation of {{topic}}'
providers:
  - openai:gpt-4o
  - openai:gpt-3.5-turbo
  - anthropic:messages:claude-3-7-sonnet-20250219
tests:
  - vars:
      topic: quantum computing
    assert:
      - type: select-best
        value: Choose the explanation that is most accurate and easy to understand
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
     - type: select-best
       value: Choose the most concise response
       provider: anthropic:messages:claude-3-7-sonnet-20250219
   ```

## Customizing the Prompt

You can customize the evaluation prompt using the `rubricPrompt` property:

```yaml
defaultTest:
  options:
    rubricPrompt: |
      I need to select the best output based on the following criteria:
      
      {{criteria}}
      
      Here are the outputs to compare:
      
      {% for output in outputs %}
      Output {{loop.index}}:
      {{output}}
      
      {% endfor %}
      
      Please select the best output by its number (1, 2, 3, etc.) and explain your reasoning.
```

## See Also

- [Model-graded metrics overview](/docs/configuration/expected-outputs/model-graded)
- [Factuality](/docs/configuration/expected-outputs/model-graded/factuality) for checking factual accuracy
- [LLM-Rubric](/docs/configuration/expected-outputs/model-graded/llm-rubric) for custom evaluation criteria
- [Guide on LLM evaluation](/docs/guides/llm-evaluation)
- [Guide on prompt optimization](/docs/guides/prompt-optimization)
