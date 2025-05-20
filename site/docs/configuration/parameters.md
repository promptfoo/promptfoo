---
sidebar_position: 4
---

# Prompts, tests, and outputs

This document covers how to configure prompts, tests, and output formats in promptfoo evaluations.

## Prompts

### Prompts from raw text

By default, the config accepts raw text as prompts:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Translate the following text to French: "{{name}}: {{text}}"'
  - 'Translate the following text to German: "{{name}}: {{text}}"'
```

YAML supports multiline strings for more complex prompts:

```yaml title="promptfooconfig.yaml"
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

By default, plaintext prompts are wrapped in a `user`-role message. If you provide JSON, promptfoo will send the `messages` object exactly as provided.

Example of a chat-formatted prompt:

```yaml title="promptfooconfig.yaml"
prompts:
  - file://path/to/personality1.json
```

And in `personality1.json`:

```json title="personality1.json"
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

For complex prompts that are difficult to maintain inline, reference external files. Filepaths are relative to the configuration file directory:

```yaml title="promptfooconfig.yaml"
prompts:
  - file://path/to/prompt1.txt
  - file://path/to/prompt2.txt
  - file://path/to/prompt.json
  - file://path/to/prompt.yaml
  - file://path/to/prompt.yml
  - file://path/to/prompt.md
  - file://path/to/prompt.j2
  # Globs are supported
  - file://prompts/*.txt
  - file://prompts/*.j2
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
Check prompt files into version control. This approach helps in tracking changes, collaboration, and ensuring consistency across different environments.
:::

Examples of prompt files:

```txt title="prompt1.txt"
Translate the following text to French: "{{name}}: {{text}}"
```

```txt title="prompt2.txt"
Translate the following text to German: "{{name}}: {{text}}"
```

JSON prompts can configure multi-shot prompt formats:

```json title="chat_prompt.json"
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

With a single text file, include multiple prompts separated by `---`. For multiple files, use separate files for each prompt.

Example of a single file with multiple prompts:

```text title="prompts.txt"
Translate the following text to French: "{{name}}: {{text}}"
---
Translate the following text to German: "{{name}}: {{text}}"
```

:::info
The prompt separator can be overridden with the `PROMPTFOO_PROMPT_SEPARATOR` environment variable.
:::

### Prompts in different formats

promptfoo supports several file formats for prompts:

#### Markdown prompts

```markdown title="prompt.md"
You are a helpful assistant for Promptfoo. Please answer the following question: {{question}}
```

Note that only one prompt per markdown file is supported.

### Prompts as Jinja2 Templates

Jinja2 template files (`.j2`) use syntax compatible with Nunjucks:

```jinja title="prompt.j2"
You are a helpful assistant for Promptfoo.
Please answer the following question about {{ topic }}: {{ question }}
```

### CSV prompts

CSV files can define multiple prompts in a single file:

**Single-Column Format:**

```csv title="prompts.csv"
prompt
"Tell me about {{topic}}"
"Explain {{topic}} in simple terms"
"Write a poem about {{topic}}"
```

#### Two-Column Format

You can include a "label" column to give each prompt a descriptive name:

```csv title="prompts.csv"
prompt,label
"Tell me about {{topic}}","Basic Query"
"Explain {{topic}} in simple terms","Simple Explanation"
"Write a poem about {{topic}}","Poetry Generator"
```

### Different prompts per model

To use separate prompts for different providers, specify prompt files within the `providers` section:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - id: file://prompts/gpt_chat_prompt.json
    label: gpt_chat_prompt
  - id: file://prompts/llama_completion_prompt.txt
    label: llama_completion_prompt

providers:
  - id: openai:gpt-4.1-mini
    prompts:
      - gpt_chat_prompt
  - id: openai:gpt-4.1
    prompts:
      - gpt_chat_prompt
  - id: replicate:meta/meta-llama-3.1-405b-instruct
    label: llama-3.1-405b-instruct
    prompts:
      - llama_completion_prompt
```

In this configuration, the `gpt_chat_prompt` is used for both GPT-4o and GPT-4o-mini models, while the `llama_completion_prompt` is used for the llama3.1 model.

### Prompt functions

Prompt functions incorporate custom logic in your prompts through JavaScript or Python files. Reference the file directly in your config:

```yaml title="promptfooconfig.yaml"
prompts:
  - file://prompt.js
  - file://prompt.py
```

The function has access to `vars` and `provider` objects and can return:

1. A string (used directly as the prompt)
2. An object/array (JSON stringified as the prompt)
3. A structured object with `prompt` and `config` (provider configuration)

Configuration values from prompt functions take precedence over existing configuration values with the same keys.

#### Examples

JavaScript prompt function:

```javascript title="prompt.js"
module.exports = async function ({ vars, provider }) {
  return [
    {
      role: 'system',
      content: `You're an assistant named ${provider.label || provider.id}. Be concise.`,
    },
    {
      role: 'user',
      content: `Tell me about ${vars.topic}`,
    },
  ];
};
```

Reference a specific function using `filename.js:functionName`:

```javascript title="prompt.js:prompt1"
// highlight-start
module.exports.prompt1 = async function ({ vars, provider }) {
  // highlight-end
  return [
    {
      role: 'system',
      content: `You're an assistant named ${provider.label || provider.id}. Be concise.`,
    },
    {
      role: 'user',
      content: `Tell me about ${vars.topic}`,
    },
  ];
};
```

Python prompt function:

```python title="prompt.py:my_prompt_function"
import json
import sys

def my_prompt_function(context: dict) -> str:
    provider: dict = context['provider']
    provider_id: str = provider['id']  # ex. openai:gpt-4.1 or bedrock:anthropic.claude-3-sonnet-20240229-v1:0
    provider_label: str | None = provider.get('label') # exists if set in promptfoo config.

    variables: dict = context['vars'] # access the test case variables

    return (
        f"Describe {variables['topic']} concisely, comparing it to the Python"
        " programming language."
    )
```

JavaScript function with dynamic configuration:

```javascript title="prompt_with_config.js"
module.exports = async function ({ vars, provider }) {
  // Adjust configuration based on topic complexity
  let temperature = 0.7;
  let maxTokens = 100;

  if (vars.topic.includes('complex') || vars.topic.length > 50) {
    // More complex topics get more freedom
    temperature = 0.9;
    maxTokens = 150;
  }

  return {
    prompt: [
      {
        role: 'system',
        content: `You are a helpful assistant. Be concise.`,
      },
      {
        role: 'user',
        content: `Tell me about ${vars.topic}`,
      },
    ],
    config: {
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'text' },
    },
  };
};
```

:::info
By default, promptfoo runs the `python` executable in your shell.

To override the Python executable, set the `PROMPTFOO_PYTHON` environment variable to an executable (e.g. `/usr/bin/python3.11` or `python3.11`).
:::

#### Viewing the final prompt

To see the final prompts for each test case:

1. Run `promptfoo view`
2. Toggle `Table Settings` > `Show full prompt in output cell`

![final prompt shown for each test case](/img/docs/final-prompt-for-test-case.png)

### Prompt configs

Prompts can include a `config` object that merges with the provider configuration:

```yaml title="promptfooconfig.yaml"
prompts:
  - label: 'Prompt #1'
    raw: 'You are a helpful math tutor. Solve {{problem}}'
    config:
      response_format:
        type: json_schema
        json_schema: ...
```

### Nunjucks filters

Nunjucks provides [built-in filters](https://mozilla.github.io/nunjucks/templating.html#builtin-filters) like `{{ varName | capitalize }}` and supports custom filters.

To create a custom filter, define a JavaScript function:

```js title="allcaps.js"
module.exports = function (str) {
  return str.toUpperCase();
};
```

Register it in your configuration:

```yaml title="promptfooconfig.yaml"
prompts:
  - file://prompts.txt
providers:
  - openai:gpt-4.1-mini
// highlight-start
nunjucksFilters:
  allcaps: ./allcaps.js
// highlight-end
tests:
  # ...
```

Use the filter in prompts:

```txt
Translate this to {{language}}: {{body | allcaps}}
```

### Default prompt

If `prompts` is not defined, promptfoo uses a "passthrough" prompt: `{{prompt}}`, which simply passes through the `prompt` variable content.

## Tests and Vars

For large test sets, keep tests separate from the main config file by creating a `tests.yaml`:

```yaml title="promptfooconfig.yaml"
prompts:
  # ...

providers:
  # ...

tests: file://path/to/tests.yaml
```

You can use multiple files or globs:

```yaml title="promptfooconfig.yaml"
tests:
  - file://relative/path/to/normal_test.yaml
  - file://relative/path/to/special_test.yaml
  - file:///absolute/path/to/more_tests/*.yaml
```

### Import from Javascript or Typescript

You can also import tests from Javascript or Typescript files.

```yaml title="promptfooconfig.yaml"
tests:
  - file://path/to/tests.js
  # or
  - file://path/to/tests.ts:generate_tests
```

Example JavaScript file:

```js title="tests.js"
export default [
  { vars: { var1: 'value1', var2: 'value2' }, assert: [], description: 'Test #1' },
  { vars: { var1: 'value3', var2: 'value4' }, assert: [], description: 'Test #2' },
];
```

TypeScript with dynamic generation:

```ts title="tests.ts"
export async function generate_tests() {
  // Fetch test cases from database
  const results = await mockDb.query('SELECT input, context FROM test_cases');
  return results.map((row, i) => ({
    vars: {
      var1: row.input,
      var2: row.context,
    },
    assert: [],
    description: `Test #${i + 1}`,
  }));
}
```

### Import from Python

You can also import tests from Python files. The Python file should contain a function that returns a list of test cases:

```yaml title="promptfooconfig.yaml"
tests: file://path/to/tests.py:generate_tests
```

```python title="tests.py"
import pandas as pd

def generate_tests():
    # Load test data from CSV - or from any other data source
    df = pd.read_csv('test_data.csv')

    test_cases = []
    for _, row in df.iterrows():
        test_case = {
            "vars": {
                "input": row['input_text'],
                "context": row['context']
            },
            "assert": [{
                "type": "contains",
                "value": row['expected_output']
            }],
            "description": f"Test case for: {row['input_text'][:30]}..."
        }
        test_cases.append(test_case)
    return test_cases
```

### Import from JSON/JSONL

JSON files contain an array of test cases:

```json title="tests.json"
[
  { "vars": { "var1": "value1" }, "assert": [], "description": "Test #1" },
  { "vars": { "var1": "value2" }, "assert": [], "description": "Test #2" }
]
```

JSONL files with one test case per line:

```jsonl title="tests.jsonl"
{"vars": {"var1": "value1"}, "assert": [], "description": "Test #1"}
{"vars": {"var1": "value2"}, "assert": [], "description": "Test #2"}
```

### Import from CSV

promptfoo also supports a test CSV format.

The first row of the CSV file should contain the variable names, and each subsequent row should contain the corresponding values for each test case.

Vars are substituted by [Nunjucks](https://mozilla.github.io/nunjucks/) templating syntax into prompts. The first row is the variable names. All other rows are variable values.

Example of a tests file (`tests.csv`):

```csv title="tests.csv"
language,input
German,"Hello, world!"
Spanish,Where is the library?
```

Special columns include:

- `__expected`: For [test assertions](/docs/configuration/expected-outputs)
  - For multiple assertions: `__expected1`, `__expected2`, etc.
- `__prefix`: Prepended to each prompt
- `__suffix`: Appended to each prompt
- `__description`: Test description
- `__metric`: Metric for all assertions
- `__threshold`: Test threshold
- `__metadata:*`: Filterable metadata (e.g., `__metadata:topic`)
  - Array values: `__metadata:*[]` (e.g., `__metadata:categories[]`)

Example with assertions:

```csv title="tests_with_assertions.csv"
input,__expected1,__expected2,__expected3
"What's the capital of France? Respond only with the city name.","contains: Paris","llm-rubric: Is the response accurate and factual?","python: file://verify_capitals.py"
"What is the sum of 15 + 27","equals: 42","contains: sum","javascript: file://check_math.js"
```

Example with metadata:

```csv title="tests_with_metadata.csv"
input,__metadata:topic,__metadata:categories[]
"Hello world","greeting","basic,introduction"
"What's 2+2?","math","arithmetic,basic\,math"
```

Filter by metadata:

```bash
# Filter by single value metadata
promptfoo eval --filter-metadata topic=greeting

# Filter by array value metadata (matches any value in the array)
promptfoo eval --filter-metadata categories=arithmetic
```

See a full example on [GitHub](https://github.com/promptfoo/promptfoo/tree/main/examples/csv-metadata).

:::tip
You can load tests from [Google Sheets](/docs/configuration/guide#loading-tests-from-csv).
:::

##### CSV with JSON Fields

CSV files can include JSON fields as structured data:

- Simple JSON: unquoted (`{"answer":""}`)
- JSON with commas: escaped (`"{""key"":""value""}"`)

By default, promptfoo parses both formats. Set `PROMPTFOO_CSV_STRICT=true` for RFC 4180 compliance.

Parse JSON in prompts with the `load` filter: `{{ (json_field | load).property }}`.

##### Passing Configuration to Custom Assertions

Custom assertions can receive configuration through CSV columns:

```csv title="tests.csv"
question,__expected,groundTruthValue,configKey
What is the difference between supervised and unsupervised learning?,"python: file://custom_assertion.py","reference answer","some value"
```

Access these values in assertions:

```python title="custom_assertion.py"
def custom_assertion(output, context):
    # Access configuration from CSV columns
    vars = context.get('vars', {})
    ground_truth = vars.get('groundTruthValue')
    config_value = vars.get('configKey')
    # ... rest of assertion logic
```

```javascript title="custom_assertion.js"
module.exports = (output, { vars }) => {
  const groundTruth = vars.groundTruthValue;
  const configValue = vars.configKey;
  // ... rest of assertion logic
};
```

### Loading media files

promptfoo supports loading various file types as variables:

```yaml title="promptfooconfig.yaml"
tests:
  - vars:
      text_file: file://path/to/text.txt
      yaml_file: file://path/to/data.yaml
      pdf_document: file://path/to/document.pdf
      image: file://path/to/image.png
      video: file://path/to/video.mp4
```

File handling:

- **Text files**: Loaded as plain text
- **YAML/YML files**: Loaded as JSON strings
- **PDF files**: Parsed to extract text (requires `pdf-parse` package)
- **Images**: Converted to base64 strings
- **Videos**: Converted to base64 strings

Example with an image for a vision model:

```yaml title="promptfooconfig.yaml"
prompts:
  - |-
    [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Describe what you see in this image:"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/jpeg;base64,{{image}}"
            }
          }
        ]
      }
    ]

tests:
  - vars:
      image: file://path/to/image.jpg
```

Example with video content:

```yaml title="promptfooconfig.yaml"
prompts:
  - |-
    [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Describe what happens in this video:"
          },
          {
            "type": "video_url",
            "video_url": {
              "url": "data:video/mp4;base64,{{video}}"
            }
          }
        ]
      }
    ]

tests:
  - vars:
      video: file://path/to/video.mp4
```

The media files will be automatically loaded and converted to base64 strings that can be used directly in your prompts for multimodal models.

To disable this behavior, set the `PROMPTFOO_DISABLE_MULTIMEDIA_AS_BASE64` environment variable to `true`.

## Output File

Write evaluation results to a file:

```bash
promptfoo eval --output filepath.json
```

The output file can also be configured with the `outputPath` key in `promptfooconfig.yaml`.

Supported formats:

- JSON
- YAML
- CSV
- HTML

Each record includes the original prompt, LLM output, and test variables.

See [examples/](https://github.com/promptfoo/promptfoo/tree/main/examples/simple-cli) for sample outputs.

## Permuting inputs and assertions

A vanilla `prompts.txt`/`promptfooconfig.yaml` pair supports each test combining one set of variables with one set of assertions. Trying to combine many sets of variables with many sets of assertions can lead to exponentially more config entries.

[Scenarios](/docs/configuration/scenarios.md) enable you to use all possible combinations of 1+ sets of variables and 1+ sets of assertions within one config entry.
