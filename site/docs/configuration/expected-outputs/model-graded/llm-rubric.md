---
sidebar_label: LLM Rubric
---

# LLM Rubric

`llm-rubric` is promptfoo's general-purpose grader for "LLM as a judge" evaluation.

It is similar to OpenAI's [model-graded-closedqa](/docs/configuration/expected-outputs) prompt, but can be more effective and robust in certain cases.

## How to use it

To use the `llm-rubric` assertion type, add it to your test configuration like this:

```yaml
assert:
  - type: llm-rubric
    # Specify the criteria for grading the LLM output:
    value: Is not apologetic and provides a clear, concise answer
```

This assertion will use a language model to grade the output based on the specified rubric.

## How it works

Under the hood, `llm-rubric` uses a model to evaluate the output based on the criteria you provide. By default, it uses GPT-4o, but you can override this by setting the `provider` option (see below).

It asks the model to output a JSON object that looks like this:

```json
{
  "reason": "<Analysis of the rubric and the output>",
  "score": 0.5, // 0.0-1.0
  "pass": true // true or false
}
```

Use your knowledge of this structure to give special instructions in your rubric, for example:

```yaml
assert:
  - type: llm-rubric
    value: |
      Evaluate the output based on how funny it is.  Grade it on a scale of 0.0 to 1.0, where:
      Score of 0.1: Only a slight smile.
      Score of 0.5: Laughing out loud.
      Score of 1.0: Rolling on the floor laughing.

      Anything funny enough to be on SNL should pass, otherwise fail.
```

## Using variables in the rubric

You can incorporate test variables into your LLM rubric. This is particularly useful for detecting hallucinations or ensuring the output addresses specific aspects of the input. Here's an example:

```yaml
providers:
  - openai:gpt-4.1
prompts:
  - file://prompt1.txt
  - file://prompt2.txt
defaultTest:
  assert:
    - type: llm-rubric
      value: 'Provides a direct answer to the question: "{{question}}" without unnecessary elaboration'
tests:
  - vars:
      question: What is the capital of France?
  - vars:
      question: How many planets are in our solar system?
```

## Overriding the LLM grader

By default, `llm-rubric` uses `gpt-4.1-2025-04-14` for grading. You can override this in several ways:

1. Using the `--grader` CLI option:

   ```sh
   promptfoo eval --grader openai:gpt-4.1-mini
   ```

2. Using `test.options` or `defaultTest.options`:

   ```yaml
   defaultTest:
     // highlight-start
     options:
       provider: openai:gpt-4.1-mini
     // highlight-end
     assert:
       - description: Evaluate output using LLM
         assert:
           - type: llm-rubric
             value: Is written in a professional tone
   ```

3. Using `assertion.provider`:

   ```yaml
   tests:
     - description: Evaluate output using LLM
       assert:
         - type: llm-rubric
           value: Is written in a professional tone
           // highlight-start
           provider: openai:gpt-4.1-mini
           // highlight-end
   ```

## Customizing the rubric prompt

For more control over the `llm-rubric` evaluation, you can set a custom prompt using the `rubricPrompt` property:

```yaml
defaultTest:
  options:
  rubricPrompt: >
    [
        {
            "role": "system",
            "content": "Evaluate the following output based on these criteria:\n1. Clarity of explanation\n2. Accuracy of information\n3. Relevance to the topic\n\nProvide a score out of 10 for each criterion and an overall assessment."
        },
        {
            "role": "user",
            "content": "Output to evaluate: {{output}}\n\nRubric: {{rubric}}"
        }
    ]
```

### Object handling in rubric prompts

When using `{{output}}` or `{{rubric}}` variables that contain objects, promptfoo automatically converts them to JSON strings by default to prevent display issues. If you need to access specific properties of objects in your rubric prompts, you can enable object property access:

```bash
export PROMPTFOO_DISABLE_OBJECT_STRINGIFY=true
promptfoo eval
```

With this enabled, you can access object properties directly in your rubric prompts:

```yaml
rubricPrompt: >
  [
      {
          "role": "user", 
          "content": "Evaluate this answer: {{output.text}}\nFor the question: {{rubric.question}}\nCriteria: {{rubric.criteria}}"
      }
  ]
```

For more details, see the [object template handling guide](/docs/usage/troubleshooting#object-template-handling).

## Threshold Support

The `llm-rubric` assertion type supports an optional `threshold` property that sets a minimum score requirement. When specified, the output must achieve a score greater than or equal to the threshold to pass. For example:

```yaml
assert:
  - type: llm-rubric
    value: Is not apologetic and provides a clear, concise answer
    threshold: 0.8 # Requires a score of 0.8 or higher to pass
```

The threshold is applied to the score returned by the LLM (which ranges from 0.0 to 1.0). If the LLM returns an explicit pass/fail status, the threshold will still be enforced - both conditions must be met for the assertion to pass.

## Further reading

See [model-graded metrics](/docs/configuration/expected-outputs/model-graded) for more options.
