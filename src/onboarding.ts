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

providers: [openai:gpt-3.5-turbo-0613, openai:gpt-4]

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
      - type: model-graded-closedqa
        value: ensure that the output is funny
`;

export const DEFAULT_README = `To get started, set your OPENAI_API_KEY environment variable.

Next, edit promptfooconfig.yaml.

Then run:
\`\`\`
promptfoo eval
\`\`\`

Afterwards, you can view the results by running \`promptfoo view\`
`;
