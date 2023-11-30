---
sidebar_position: 4
---

# Input and output files

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

### Prompts from file

Your prompts may be complicated enough that it's difficult to maintain them inline. In that case, reference a file. Filepaths are relative to the configuration file directory:

```yaml
prompts:
  - file://path/to/prompt1.txt
  - file://path/to/prompt2.txt
  - file://path/to/prompt.json
  - file://path/to/prompt.yaml
  # Globs are supported
  - file://prompts/*.txt
  - file://path/**/*
  # Prompt functions
  - file:///root/path/to/prompt.js
  - file://./path/to/prompt.py
```

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

#### Multiple prompts in a single file

If you have only one file, you can include multiple prompts in the file, separated by the delimiter `---`. If you have multiple files, each prompt should be in a separate file.

Example of a single prompt file with multiple prompts (`prompts.txt`):

```
Translate the following text to French: "{{name}}: {{text}}"
---
Translate the following text to German: "{{name}}: {{text}}"
```

### Prompt functions

Prompt functions allow you to incorporate custom logic in your prompts. These functions are written in JavaScript or Python and are included in the prompt files with `.js` or `.py` extensions.

To specify a prompt function in `promptfooconfig.yaml`, reference the file directly. For example:

```yaml
prompts: ['prompt.js', 'prompt.py']
```

In the prompt function, you can access the test case variables through the `vars` object. The function should return a string or an object that represents the prompt.

#### Examples

A Javascript prompt function, `prompt.js`:

```javascript title=prompt.js
module.exports = async function ({ vars }) {
  return [
    {
      role: 'system',
      content: `You're an angry pirate. Be concise and stay in character.`,
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
module.exports.prompt1 = async function ({ vars }) {
  // highlight-end
  return [
    {
      role: 'system',
      content: `You're an angry pirate. Be concise and stay in character.`,
    },
    {
      role: 'user',
      content: `Tell me about ${vars.topic}`,
    },
  ];
};
```

A Python prompt function, `prompt.py`:

```python title=prompt.py
import json
import sys

def generate_prompt(context: dict) -> str:
    return (
        f"Describe {context['vars']['topic']} concisely, comparing it to the Python"
        " programming language."
    )

if __name__ == "__main__":
    print(generate_prompt(json.loads(sys.argv[1])))
```

To verify that your function is producing the correct prompt:

1. Run `promptfoo view`
1. Check that the table header contains your function code.
1. Hover over a particular output that you want to investigate and click the Magnifying Glass (🔎) to view the final prompt in the details pane.

:::info
By default, promptfoo runs the `python` executable in your shell.

To override the Python executable, set the `PROMPTFOO_PYTHON` environment variable to an executable (e.g. `/usr/bin/python3.11` or `python3.11`).
:::

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

To use a custom Nunjucks filter in PromptFoo, add it to your configuration file (`promptfooconfig.yaml`). The `nunjucksFilters` field should contain a mapping of filter names to the paths of the JavaScript files that define them:

```yaml
prompts: [prompts.txt]
providers: [openai:gpt-3.5-turbo]
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

## Tests File

The tests file is an optional CSV file that can be used to define test cases
separately from the `promptfooconfig` configuration file.

The first row of the CSV file should contain the variable names,
and each subsequent row should contain the corresponding values for each test case.

Vars are substituted by [Nunjucks](https://mozilla.github.io/nunjucks/) templating syntax into prompts. The first row is the variable names. All other rows are variable values.

Example of a tests file (`tests.csv`):

```csv
language,input
German,"Hello, world!"
Spanish,Where is the library?
```

The tests file optionally supports several special columns:

- `__expected`: A column that includes [test assertions](/docs/configuration/expected-outputs). This column lets you automatically mark output according to quality expectations.
- `__prefix`: This string is prepended to each prompt before it's sent to the API
- `__suffix`: This string is appended to each prompt before it's sent to the API

## Output File

The results of the evaluation are written to this file. Each record in the output file corresponds to a test case and includes the original prompt, the output generated by the LLM, and the values of the variables used in the test case.

For example outputs, see the [examples/](https://github.com/typpo/promptfoo/tree/main/examples/simple-cli) directory.

The output file is specified by the `outputPath` key in the promptfoo configuration.

## Permuting inputs and assertions

A vanilla `prompts.txt`/`promptfooconfig.yaml` pair supports
each test combining one set of variables with one set of assertions.
Trying to combine many sets of variables with many sets of assertions
can lead to exponentially more config entries.

[Scenarios](/docs/configuration/scenarios.md)
enables one to use all possible combinations of 1+ sets of variables
and 1+ sets of assertions within one config entry.
