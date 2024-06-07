export const DEFAULT_PROMPTS = `Your first prompt goes here
---
Next prompt goes here. You can substitute variables like this: {{var1}} {{var2}} {{var3}}
---
This is the next prompt.

These prompts are nunjucks templates, so you can use logic like this:
{% if var1 %}
  {{ var1 }}
{% endif %}
---
[
  {"role": "system", "content": "This is another prompt. JSON is supported."},
  {"role": "user", "content": "Using this format, you may construct multi-shot OpenAI prompts"}
  {"role": "user", "content": "Variable substitution still works: {{ var3 }}"}
]
---
If you prefer, you can break prompts into multiple files (make sure to edit promptfooconfig.yaml accordingly)
`;

export const DEFAULT_YAML_CONFIG = `# This configuration compares LLM output of 2 prompts x 2 GPT models across 3 test cases.
# Learn more: https://promptfoo.dev/docs/configuration/guide
description: 'My first eval'

prompts:
  - "Write a tweet about {{topic}}"
  - "Write a very concise, funny tweet about {{topic}}"

providers:
  - openai:gpt-3.5-turbo
  - openai:gpt-4o

tests:
  - vars:
      topic: bananas

  - vars:
      topic: avocado toast
    assert:
      # For more information on assertions, see https://promptfoo.dev/docs/configuration/expected-outputs
      - type: icontains
        value: avocado
      - type: javascript
        value: 1 / (output.length + 1)  # prefer shorter outputs

  - vars:
      topic: new york city
    assert:
      # For more information on model-graded evals, see https://promptfoo.dev/docs/configuration/expected-outputs/model-graded
      - type: llm-rubric
        value: ensure that the output is funny
`;

export const MODEL_COMPARISON_CONFIG = `# This configuration compares the performance of a single prompt across 2 models.
# Learn more: https://promptfoo.dev/docs/configuration/guide
description: 'Model comparison eval'

prompts:
  - "Write a tweet about {{topic}}"

providers:
  - openai:gpt-3.5-turbo
  - openai:gpt-4o

tests:
  - vars:
      topic: bananas

  - vars:
      topic: avocado toast
    assert:
      # For more information on assertions, see https://promptfoo.dev/docs/configuration/expected-outputs
      - type: icontains
        value: avocado
      - type: javascript
        value: 1 / (output.length + 1)  # prefer shorter outputs

  - vars:
      topic: new york city
    assert:
      # For more information on model-graded evals, see https://promptfoo.dev/docs/configuration/expected-outputs/model-graded
      - type: llm-rubric
        value: ensure that the output is funny
`;

export const PROMPT_COMPARISON_CONFIG = `# This configuration compares the performance of a single model across 2 prompts.
# Learn more: https://promptfoo.dev/docs/configuration/guide
description: 'Prompt comparison eval'

prompts:
  - "Write a tweet about {{topic}}"
  - "Write a very concise, funny tweet about {{topic}}"

providers:
  - openai:gpt-3.5-turbo

tests:
  - vars:
      topic: bananas

  - vars:
      topic: avocado toast
    assert:
      # For more information on assertions, see https://promptfoo.dev/docs/configuration/expected-outputs
      - type: icontains
        value: avocado
      - type: javascript
        value: 1 / (output.length + 1)  # prefer shorter outputs

  - vars:
      topic: new york city
    assert:
      # For more information on model-graded evals, see https://promptfoo.dev/docs/configuration/expected-outputs/model-graded
      - type: llm-rubric
        value: ensure that the output is funny
`;

export const CONFIG_TEMPLATE = `# Learn more about building a configuration: https://promptfoo.dev/docs/configuration/guide
description: 'My first eval'

prompts:
  {% for prompt in prompts %}
  - {{prompt | dump }}
  {% endfor %}

providers:
  {% for provider in providers %}
  - {{provider | dump }}
  {% endfor %}

{% if type == 'rag' or type == 'agent' %}
tests:
  - vars:
      inquiry: "I have a problem with my order"
      context: file://path/to/context.txt

  - vars:
      inquiry: "I want to return my widget"
      # See how to use dynamic context to e.g. use a vector store https://promptfoo.dev/docs/guides/evaluate-rag/#using-dynamic-context
      context: file://path/to/fetch_from_database.py
    assert:
      # For more information on assertions, see https://promptfoo.dev/docs/configuration/expected-outputs

      # Make sure output contains the phrase "return label"
      - type: icontains
        value: return label

      # Prefer shorter outputs
      - type: javascript
        value: 1 / (output.length + 1)

  - vars:
      inquiry: "I need help with my account"
      context: |
        This is a multi-line string.
        You can include multiple paragraphs here.
        Account ID: 123456
    assert:
      # For more information on model-graded evals, see https://promptfoo.dev/docs/configuration/expected-outputs/model-graded
      - type: llm-rubric
        value: ensure that the output is friendly and empathetic
{% else %}
tests:
  - vars:
      topic: bananas

  - vars:
      topic: avocado toast
    assert:
      # For more information on assertions, see https://promptfoo.dev/docs/configuration/expected-outputs

      # Make sure output contains the word "avocado"
      - type: icontains
        value: avocado

      # Prefer shorter outputs
      - type: javascript
        value: 1 / (output.length + 1)

  - vars:
      topic: new york city
    assert:
      # For more information on model-graded evals, see https://promptfoo.dev/docs/configuration/expected-outputs/model-graded
      - type: llm-rubric
        value: ensure that the output is funny
{% endif %}
`;

export const DEFAULT_README = `To get started, set your OPENAI_API_KEY environment variable.

Next, edit promptfooconfig.yaml.

Then run:
\`\`\`
promptfoo eval
\`\`\`

Afterwards, you can view the results by running \`promptfoo view\`
`;
