---
sidebar_position: 4
---

# Prompts, tests, and outputs

## Prompts

### Prompts from raw text

By default, the config will accept raw text as prompts:

```yaml
prompts:
  - 'Translate the following text to French: "{{name}}: {{text}}"'
  - 'Translate the following text to German: "{{name}}: {{text}}"'
```

YAML supports multiline strings too:

```yaml
prompts:
  - |-
    Hi there LLM,
    Please translate the following text to French:
    "{{name}}: {{text}}"
  - |-
    Translate the following text to German:
    "{{name}}: {{text}}"
```

Use [Nunjucks](https://mozilla.github.io/nunjucks/) templating syntax to include variables in your prompts, which will be replaced with actual values from your test cases during evaluation.

### Prompts as JSON

Some LLM APIs accept prompts in a JSON chat format like `[{ "role" : "user", "content": "..."}]`.

By default, plaintext prompts are wrapped in a `user`-role message. If you provide JSON, then promptfoo will send the `messages` object exactly as provided.

Here's an example of a chat-formatted prompt:

```yaml
prompts:
  - file://path/to/personality1.json
```

And in `personality1.json`:

```json title=personality1.json
[
  {
    "role": "system",
    "content": "You are a helpful assistant"
  },
  {
    "role": "user",
    "content": "Tell me about {{topic}}"
  }
]
```

Learn more about [chat conversations with OpenAI message format](/docs/providers/openai#formatting-chat-messages).

### Prompts from file

Your prompts may be complicated enough that it's difficult to maintain them inline. In that case, reference a file. Filepaths are relative to the configuration file directory:

```yaml
prompts:
  - file://path/to/prompt1.txt
  - file://path/to/prompt2.txt
  - file://path/to/prompt.json
  - file://path/to/prompt.yaml
  - file://path/to/prompt.yml
  - file://path/to/prompt.md
  # Globs are supported
  - file://prompts/*.txt
  - file://path/**/*
  # Prompt functions
  # Executes entire file
  - file:///root/path/to/prompt.js
  - file://./path/to/prompt.py
  # Executes individual functions
  - file:///root/path/to/prompt.js:prompt1
  - file:///root/path/to/prompt.js:prompt2
  - file:///root/path/to/prompt.py:prompt1
  - file:///root/path/to/prompt.py:prompt2
  - file:///root/path/to/prompt.py:PromptClass.prompt1
  - file:///root/path/to/prompt.py:PromptClass.prompt2
```

:::tip
Check them into version control. This approach helps in tracking changes, collaboration, and ensuring consistency across different environments.
:::

Example of multiple prompt files:

```txt title=prompt1.txt
Translate the following text to French: "{{name}}: {{text}}"
```

```txt title=prompt2.txt
Translate the following text to German: "{{name}}: {{text}}"
```

Prompts can be JSON too. Use this to configure multi-shot prompt formats:

```json
[
  {
    "role": "system",
    "content": "You are a translator can converts input to {{ language }}."
  },
  {
    "role": "user",
    "content": "{{ text }}"
  }
]
```

### Multiple prompts in a single text file

If you have only one text file, you can include multiple prompts in the file, separated by the separator `---`. If you have multiple files, each prompt should be in a separate file.

Example of a single prompt file with multiple prompts (`prompts.txt`):

```text title=prompts.txt
Translate the following text to French: "{{name}}: {{text}}"
---
Translate the following text to German: "{{name}}: {{text}}"
```

:::info
The prompt separator can be overridden with the `PROMPTFOO_PROMPT_SEPARATOR` environment variable.
:::

### Prompts as Markdown

Prompts as markdown are treated similarly to prompts as raw text. You can define a prompt in a markdown file as:

```markdown title=prompt.md
You are a helpful assistant for Promptfoo. Please answer the following question: {{question}}
```

Note that only one prompt per markdown file is supported.

### Different prompts per model

To set separate prompts for different providers, you can specify the prompt files within the `providers` section of your `promptfooconfig.yaml`. Each provider can have its own set of prompts that are tailored to its specific requirements or input format.

Here's an example of how to set separate prompts for llama3.1 and GPT-4o models:

```yaml title=promptfooconfig.yaml
prompts:
  - id: file://prompts/gpt_chat_prompt.json
    label: gpt_chat_prompt
  - id: file://prompts/llama_completion_prompt.txt
    label: llama_completion_prompt

providers:
  - id: openai:gpt-4o-mini
    prompts:
      - gpt_chat_prompt
  - id: openai:gpt-4o
    prompts:
      - gpt_chat_prompt
  - id: replicate:meta/meta-llama-3.1-405b-instruct
    label: llama-3.1-405b-instruct
    prompts:
      - llama_completion_prompt
```

In this configuration, the `gpt_chat_prompt` is used for both GPT-4o and GPT-4o-mini models, while the `llama_completion_prompt` is used for the llama3.1 model. The prompts are defined in separate files within the `prompts` directory.

Make sure to create the corresponding prompt files with the content formatted as expected by each model. For example, GPT models might expect a JSON array of messages, while llama might expect a plain text format with a specific prefix.

### Prompt functions

Prompt functions allow you to incorporate custom logic in your prompts. These functions are written in JavaScript or Python and are included in the prompt files with `.js` or `.py` extensions.

To specify a prompt function in `promptfooconfig.yaml`, reference the file directly. For example:

```yaml
prompts:
  - file://prompt.js
  - file://prompt.py
```

In the prompt function, you can access the test case variables and provider information via the context. The function will have access to a `vars` object and `provider` object. Having access to the provider object allows you to dynamically generate prompts for different providers with different formats.

The function should return a string or an object that represents the prompt.

#### Examples

A Javascript prompt function, `prompt.js`:

```javascript title=prompt.js
module.exports = async function ({ vars, provider }) {
  return [
    {
      role: 'system',
      content: `You're an angry pirate named ${provider.label || provider.id}. Be concise and stay in character.`,
    },
    {
      role: 'user',
      content: `Tell me about ${vars.topic}`,
    },
  ];
};
```

To reference a specific function in your prompt file, use the following syntax: `filename.js:functionName`:

```javascript title=prompt.js:prompt1
// highlight-start
module.exports.prompt1 = async function ({ vars, provider }) {
  // highlight-end
  return [
    {
      role: 'system',
      content: `You're an angry pirate named ${provider.label || provider.id}. Be concise and stay in character.`,
    },
    {
      role: 'user',
      content: `Tell me about ${vars.topic}`,
    },
  ];
};
```

A Python prompt function, `prompt.py:my_prompt_function`:

```python title=prompt.py
import json
import sys

def my_prompt_function(context: dict) -> str:

    provider: dict = context['provider']
    provider_id: str = provider['id']  # ex. openai:gpt-4o or bedrock:anthropic.claude-3-sonnet-20240229-v1:0
    provider_label: str | None = provider.get('label') # exists if set in promptfoo config.

    variables: dict = context['vars'] # access the test case variables

    return (
        f"Describe {variables['topic']} concisely, comparing it to the Python"
        " programming language."
    )

if __name__ == "__main__":
    # If you don't specify a `function_name` in the provider string, it will run the main
    print(my_prompt_function(json.loads(sys.argv[1])))
```

To verify that your function is producing the correct prompt:

1. Run `promptfoo view`
2. Check that the table header contains your function code.
3. Hover over a particular output that you want to investigate and click the Magnifying Glass (🔎) to view the final prompt in the details pane.

:::info
By default, promptfoo runs the `python` executable in your shell.

To override the Python executable, set the `PROMPTFOO_PYTHON` environment variable to an executable (e.g. `/usr/bin/python3.11` or `python3.11`).
:::

#### Viewing the final prompt

Prompt functions show source code at the top of the results table because they can return dynamic values that differ between test cases.

In order to see the prompts for each test case, toggle `Table Settings` > `Show full prompt in output cell`. This will display the final prompt for each test case/provider combination.

![final prompt shown for each test case](/img/docs/final-prompt-for-test-case.png)

### Prompt configs

Prompts can be configured with a `config` object. This object is merged with the provider configuration object and the combined object is used to call the provider API.

A good use case for this is to set the `response_format` for a specific prompt.

#### Example

```yaml
prompts:
  - label: 'Prompt #1'
    raw: 'You are a helpful math tutor. Solve {{problem}}'
    config:
      response_format:
        type: json_schema
        json_schema: ...
```

### Nunjucks filters

Nunjucks is a templating language with many [built-in filters](https://mozilla.github.io/nunjucks/templating.html#builtin-filters) that can be applied to variables. For example: `{{ varName | capitalize }}`.

Nunjucks [custom filters](https://mozilla.github.io/nunjucks/api.html#custom-filters) are Javascript functions that can be applied to variables in your templates.

To define a Nunjucks filter, create a JavaScript file that exports a function. This function will be used as the filter and it should take the input value as an argument and return the transformed value.

Here's an example of a custom Nunjucks filter that transforms a string to uppercase (`allcaps.js`):

```js
module.exports = function (str) {
  return str.toUpperCase();
};
```

To use a custom Nunjucks filter in Promptfoo, add it to your configuration file (`promptfooconfig.yaml`). The `nunjucksFilters` field should contain a mapping of filter names to the paths of the JavaScript files that define them:

```yaml
prompts:
  - file://prompts.txt
providers:
  - openai:gpt-4o-mini
// highlight-start
nunjucksFilters:
  allcaps: ./allcaps.js
// highlight-end
tests:
  # ...
```

Then, use the filter in prompts by appending it to a variable or expression with the pipe (`|`) symbol:

```txt
Translate this to {{language}}: {{body | allcaps}}
```

In this example, the `body` variable is passed through the `allcaps` filter before it's used in the prompt. This means that the text will be transformed to uppercase.

### Default prompt

If `prompts` is not defined in the config, then by default Promptfoo will use a "passthrough" prompt: `{{prompt}}`. This prompt simply passes through content of the `prompt` variable.

## Tests File

If you have a lot of tests, you can optionally keep them separate from the main config file.

The easiest way to do this is by creating a `tests.yaml` file that contains a list of tests. Then, include it in your `promptfooconfig.yaml` like so:

```yaml
prompts:
  # ...

providers:
  # ...

tests: file://path/to/tests.yaml
```

You can even break it into multiple files or globs:

```yaml
tests:
  - file://relative/path/to/normal_test.yaml
  - file://relative/path/to/special_test.yaml
  - file:///absolute/path/to/more_tests/*.yaml
```

### Import from Javascript or Typescript

You can also import tests from Javascript or Typescript files.

```yaml
tests: file://path/to/tests.js
```

The file should export an array of test cases:

```js
export default [
  { vars: { var1: 'value1', var2: 'value2' }, assert: [], description: 'Test #1' },
  { vars: { var1: 'value3', var2: 'value4' }, assert: [], description: 'Test #2' },
];
```

### Import from JSON/JSONL

JSON files contain an array of test cases:

```json
[
  { "vars": { "var1": "value1" }, "assert": [], "description": "Test #1" },
  { "vars": { "var1": "value2" }, "assert": [], "description": "Test #2" }
]
```

JSONL files contain one JSON test case per line:

```jsonl
{"vars": {"var1": "value1"}, "assert": [], "description": "Test #1"}
{"vars": {"var1": "value2"}, "assert": [], "description": "Test #2"}
```

### Import from CSV

promptfoo also supports a test CSV format.

The first row of the CSV file should contain the variable names, and each subsequent row should contain the corresponding values for each test case.

Vars are substituted by [Nunjucks](https://mozilla.github.io/nunjucks/) templating syntax into prompts. The first row is the variable names. All other rows are variable values.

Example of a tests file (`tests.csv`):

```csv
language,input
German,"Hello, world!"
Spanish,Where is the library?
```

The tests file optionally supports several special columns:

- `__expected`: A column that includes [test assertions](/docs/configuration/expected-outputs). This column lets you automatically mark output according to quality expectations.
  - For multiple assertions, use `__expected1`, `__expected2`, `__expected3`, etc.
- `__prefix`: This string is prepended to each prompt before it's sent to the API
- `__suffix`: This string is appended to each prompt before it's sent to the API
- `__description`: The test description
- `__metric`: The metric assigned to every assertion in the test case
- `__threshold`: The threshold assigned to the test case

:::tip
You can load your tests from [Google Sheets](/docs/configuration/guide#loading-tests-from-csv).
:::

## Output File

The results of the evaluation are written to this file. For example:

```
promptfoo eval --output filepath.json
```

The output file can also be set using the `outputPath` key in the promptfoo configuration.

Several file formats are supported, including JSON, YAML, CSV, and HTML.

Each record in the output file corresponds to a test case and includes the original prompt, the output generated by the LLM, and the values of the variables used in the test case.

For example outputs, see the [examples/](https://github.com/promptfoo/promptfoo/tree/main/examples/simple-cli) directory.

## Permuting inputs and assertions

A vanilla `prompts.txt`/`promptfooconfig.yaml` pair supports each test combining one set of variables with one set of assertions. Trying to combine many sets of variables with many sets of assertions can lead to exponentially more config entries.

[Scenarios](/docs/configuration/scenarios.md) enable you to use all possible combinations of 1+ sets of variables and 1+ sets of assertions within one config entry.
