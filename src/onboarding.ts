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

export const DEFAULT_YAML_CONFIG = `# This configuration runs each prompt through a series of example inputs and checks if they meet requirements.
# Learn more: https://promptfoo.dev/docs/configuration/guide

prompts:
  - "Example prompt 1"
  - "Example prompt 2"
  - |-
    Example prompt 3
    This is a multi-line prompt
  # You may also import prompts from file. This path is relative to the config file.
  # For more information on prompts, see https://promptfoo.dev/docs/configuration/parameters.
  - file://prompts.txt
providers: [openai:gpt-3.5-turbo-0613]
tests:
  - description: First test case - automatic review
    vars:
      var1: first variable's value
      var2: another value
      var3: some other value
    # For more information on assertions, see https://promptfoo.dev/docs/configuration/expected-outputs
    assert:
      - type: equals
        value: expected LLM output goes here
      - type: contains
        value: some text
      - type: javascript
        value: 1 / (output.length + 1)  # prefer shorter outputs

  - description: Second test case - manual review
    # Test cases don't need assertions if you prefer to manually review the output
    vars:
      var1: new value
      var2: another value
      var3: third value

  - description: Third test case - other types of automatic review
    vars:
      var1: yet another value
      var2: and another
      var3: dear llm, please output your response in json format
    assert:
      - type: contains-json
      - type: similar
        value: ensures that output is semantically similar to this text
      - type: model-graded-closedqa
        value: ensure that output contains a reference to X
`;

export const DEFAULT_README = `To get started, set your OPENAI_API_KEY environment variable.

Next, edit promptfooconfig.yaml.

Then run:
\`\`\`
promptfoo eval
\`\`\`

Afterwards, you can view the results by running \`promptfoo view\`
`;
