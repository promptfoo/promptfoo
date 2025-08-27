---
sidebar_label: LLM Rubric
description: 'Create flexible custom rubrics using natural language to evaluate LLM outputs against specific quality and safety criteria'
---

# LLM rubric

The `llm-rubric` assertion is promptfoo's most flexible evaluation method, using an LLM to grade outputs against any custom criteria.

**What it measures**: Given your custom evaluation criteria (the rubric), an LLM judge evaluates the output and provides a score (0-1), pass/fail status, and reasoning for its decision.

**Example**:

- Rubric: "Response should be professional yet friendly"
- Output evaluation: Score 0.8, Pass, "Uses formal language while maintaining approachable tone"

This metric is ideal for **nuanced evaluation** of any quality you care about - tone, style, completeness, or domain-specific requirements.

## Required fields

The llm-rubric assertion requires:

- `value` - Your evaluation criteria (the rubric)
- `threshold` (optional) - Minimum score from 0 to 1 (no default - uses pass/fail from LLM)
- Output - The LLM's response to evaluate

## Configuration

### Basic usage

```yaml
assert:
  - type: llm-rubric
    value: 'Is not apologetic and provides a clear, concise answer'
```

### With threshold

```yaml
assert:
  - type: llm-rubric
    value: 'Response demonstrates deep technical understanding'
    threshold: 0.8 # Require high confidence score
```

### Complete example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Use LLM rubric for flexible custom evaluation'

prompts:
  - 'Write a {{type}} about {{topic}}'

providers:
  - id: openai:gpt-4o-mini

tests:
  - description: 'Evaluate professional email'
    vars:
      type: 'business email'
      topic: 'project delay'
    assert:
      # Simple rubric
      - type: llm-rubric
        value: 'Email is professional, empathetic, and provides clear next steps'

      # Detailed rubric with scoring guidelines
      - type: llm-rubric
        value: |
          Evaluate the email on professionalism (0.0-1.0):
          - 0.0-0.3: Casual or inappropriate tone
          - 0.4-0.6: Somewhat professional but lacking
          - 0.7-0.9: Professional and appropriate
          - 1.0: Exemplary business communication

          Pass if score >= 0.7
        threshold: 0.7

  - description: 'Evaluate creative writing'
    vars:
      type: 'short story'
      topic: 'time travel'
    assert:
      - type: llm-rubric
        value: |
          Grade the story on creativity and engagement:
          - Does it have an original twist?
          - Are the characters compelling?
          - Is the plot engaging?

          Score 0.8+ for publication-quality writing
        threshold: 0.6
```

## How it works

Under the hood, `llm-rubric` uses a model to evaluate the output based on the criteria you provide. By default, it uses different models depending on which API keys are available:

- **OpenAI API key**: `gpt-4.1-2025-04-14`
- **Anthropic API key**: `claude-sonnet-4-20250514`
- **Google AI Studio API key**: `gemini-2.5-pro` (GEMINI_API_KEY, GOOGLE_API_KEY, or PALM_API_KEY)
- **Google Vertex credentials**: `gemini-2.5-pro` (service account credentials)
- **Mistral API key**: `mistral-large-latest`
- **GitHub token**: `openai/gpt-4.1`
- **Azure credentials**: Your configured Azure GPT deployment

You can override this by setting the `provider` option (see below).

The LLM rubric evaluation process:

1. **Sends your rubric and output** to a grading LLM (GPT-4o by default)
2. **LLM analyzes the output** against your criteria
3. **Returns structured feedback**:

   ```json
   {
     "reason": "Clear analysis of strengths and weaknesses",
     "score": 0.75, // 0.0-1.0 scale
     "pass": true // Pass/fail judgment
   }
   ```

You can use this structure knowledge to craft detailed rubrics:

```yaml
assert:
  - type: llm-rubric
    value: |
      Evaluate humor level (0.0 to 1.0):
      - 0.1: Slight smile
      - 0.5: Laughing out loud
      - 1.0: Rolling on floor laughing

      Pass if funny enough for SNL (0.7+)
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

## When to use llm-rubric vs. alternatives

- **Use `llm-rubric`** for flexible, custom evaluation with explanations
- **Use [`g-eval`](/docs/configuration/expected-outputs/model-graded/g-eval)** for complex evaluation needing chain-of-thought
- **Use [`model-graded-closedqa`](/docs/configuration/expected-outputs/model-graded/model-graded-closedqa)** for simple yes/no checks
- **Use [`pi`](/docs/configuration/expected-outputs/model-graded/pi)** for deterministic scoring

## Related assertions

- [`g-eval`](/docs/configuration/expected-outputs/model-graded/g-eval) - Chain-of-thought evaluation
- [`model-graded-closedqa`](/docs/configuration/expected-outputs/model-graded/model-graded-closedqa) - Binary pass/fail
- [`factuality`](/docs/configuration/expected-outputs/model-graded/factuality) - Fact-checking
- [`answer-relevance`](/docs/configuration/expected-outputs/model-graded/answer-relevance) - Query-answer relevance

## Further reading

- [Model-graded metrics](/docs/configuration/expected-outputs/model-graded) overview
- [Getting Started](/docs/getting-started) for promptfoo basics
- [Best practices](/docs/guides/best-practices) for evaluation design
