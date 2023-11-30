---
sidebar_position: 0
sidebar_label: Guide
---

# Configuration

The YAML configuration format runs each prompt through a series of example inputs (aka "test case") and checks if they meet requirements (aka "assert").

Asserts are _optional_. Many people get value out of reviewing outputs manually, and the web UI helps facilitate this.

## Examples

Let's imagine we're building an app that does language translation. This config runs each prompt through GPT-3.5 and Vicuna, substituting three variables:

```yaml
prompts: [prompt1.txt, prompt2.txt]
providers: [openai:gpt-3.5-turbo, localai:chat:vicuna]
tests:
  - vars:
      language: French
      input: Hello world
  - vars:
      language: German
      input: How's it going?
```

:::tip

For more information on setting up a prompt file, see [input and output files](/docs/configuration/parameters).

:::

Running `promptfoo eval` over this config will result in a _matrix view_ that you can use to evaluate GPT vs Vicuna.

### Use assertions to validate output

Next, let's add an assertion. This automatically rejects any outputs that don't contain JSON:

```yaml
prompts: [prompt1.txt, prompt2.txt]
providers: [openai:gpt-3.5-turbo, localai:chat:vicuna]
tests:
  - vars:
      language: French
      input: Hello world
    // highlight-start
    assert:
      - type: contains-json
    // highlight-end
  - vars:
      language: German
      input: How's it going?
```

We can create additional tests. Let's add a couple other [types of assertions](/docs/configuration/expected-outputs). Use an array of assertions for a single test case to ensure all conditions are met.

In this example, the `javascript` assertion runs Javascript against the LLM output. The `similar` assertion checks for semantic similarity using embeddings:

```yaml
prompts: [prompt1.txt, prompt2.txt]
providers: [openai:gpt-3.5-turbo, localai:chat:vicuna]
tests:
  - vars:
      language: French
      input: Hello world
    assert:
      - type: contains-json
      // highlight-start
      - type: javascript
        value: output.toLowerCase().includes('bonjour')
      // highlight-end
  - vars:
      language: German
      input: How's it going?
    assert:
      // highlight-start
      - type: similar
        value: was geht
        threshold: 0.6   # cosine similarity
      // highlight-end
```

:::tip

To learn more about assertions, see docs on configuring [expected outputs](/docs/configuration/expected-outputs).

:::

### Avoiding repetition

#### Default test cases

Use `defaultTest` to set properties for all tests.

In this example, we use a `model-graded-closedqa` assertion to ensure that the LLM does not refer to itself as an AI. This check applies to all test cases:

```yaml
prompts: [prompt1.txt, prompt2.txt]
providers: [openai:gpt-3.5-turbo, localai:chat:vicuna]
// highlight-start
defaultTest:
  assert:
    - type: model-graded-closedqa
      value: does not describe self as an AI, model, or chatbot
// highlight-end
tests:
  - vars:
      language: French
      input: Hello world
    assert:
      - type: contains-json
      - type: javascript
        value: output.toLowerCase().includes('bonjour')
  - vars:
      language: German
      input: How's it going?
    assert:
      - type: similar
        value: was geht
        threshold: 0.6
```

You can also use `defaultTest` to override the model used for each test. This can be useful for [model-graded evals](/docs/configuration/expected-outputs/model-graded):

```yaml
defaultTest:
  options:
    provider: openai:gpt-3.5-turbo-0613
```

#### YAML references

promptfoo configurations support JSON schema [references](https://opis.io/json-schema/2.x/references.html), which define reusable blocks.

Use the `$ref` key to re-use assertions without having to fully define them more than once. Here's an example:

```yaml
prompts: [prompt1.txt, prompt2.txt]
providers: [openai:gpt-3.5-turbo, localai:chat:vicuna]
tests:
  - vars:
      language: French
      input: Hello world
    assert:
      - $ref: '#assertionTemplates/startsUpperCase'
  - vars:
      language: German
      input: How's it going?
    assert:
      - $ref: '#assertionTemplates/noAIreference'
      - $ref: '#assertionTemplates/startsUpperCase'

// highlight-start
assertionTemplates:
    noAIreference:
      - type: model-graded-closedqa
        value: does not describe self as an AI, model, or chatbot
    startsUpperCase:
      - type: javascript
        value: output[0] === output[0].toUpperCase()
// highlight-end
```

#### Import tests from separate files

The `tests` config attribute takes a list of paths to files or directories. For example:

```yaml
prompts: prompts.txt
providers: openai:gpt-3.5-turbo

# Load & runs all test cases matching these filepaths
tests:
  # You can supply an exact filepath
  - tests/tests2.yaml

  # Or a glob (wildcard)
  - tests/*

  # Mix and match with actual test cases
  - vars:
      var1: foo
      var2: bar
```

A single string is also valid:

```yaml
tests: tests/*
```

Or a list of paths:

```yaml
tests: ['tests/accuracy', 'tests/creativity', 'tests/hallucination']
```

#### Import vars from separate files

The `vars` attribute can point to a file or directory. For example:

```yaml
tests:
  - vars: path/to/vars*.yaml
```

You can also load individual variables from file by using the `file://` prefix. For example:

```yaml
tests:
  - vars:
      var1: some value...
      var2: another value...
      var3: file://path/to/var3.txt
```

### Multiple variables in a single test case

The `vars` map in the test also supports array values. If values are an array, the test case will run each combination of values.

For example:

```yaml
prompts: prompts.txt
providers: [openai:gpt-3.5-turbo, openai:gpt-4]
tests:
  - vars:
      // highlight-start
      language: [French, German, Spanish]
      input: ['Hello world', 'Good morning', 'How are you?']
      // highlight-end
    assert:
      - type: similar
        value: 'Hello world'
        threshold: 0.8
```

Evaluates each `language` x `input` combination:

<img alt="Multiple combinations of var inputs" src="https://user-images.githubusercontent.com/310310/243108917-dab27ca5-689b-4843-bb52-de8d459d783b.png" />

### Using nunjucks templates

In the above examples, `vars` values are strings. But `vars` can be any JSON or YAML entity, including nested objects. You can manipulate these objects in the prompt, which are [nunjucks](https://mozilla.github.io/nunjucks/) templates.

For example, consider this test case, which lists a handful of user and assistant messages in an OpenAI-compatible format:

```yaml
tests:
  - vars:
      previous_messages:
        - role: user
          content: hello world
        - role: assistant
          content: how are you?
        - role: user
          content: great, thanks
```

The corresponding `prompt.txt` file simply passes through the `previous_messages` object using the [dump](https://mozilla.github.io/nunjucks/templating.html#dump) and [safe](https://mozilla.github.io/nunjucks/templating.html#safe) filters to convert the object to a JSON string:

```nunjucks
{{ previous_messages | dump | safe }}
```

Running `promptfoo eval -p prompt.txt -c path_to.yaml` will call the Chat Completion API with the following prompt:

```json
[
  {
    "role": "user",
    "content": "hello world"
  },
  {
    "role": "assistant",
    "content": "how are you?"
  },
  {
    "role": "user",
    "content": "great, thanks"
  }
]
```

Use Nunjucks templates to exert additional control over your prompt templates, including loops, conditionals, and more.

### Other capabilities

#### Functions

promptfoo supports OpenAI functions and other provider-specific configurations like temperature, number of tokens, and so on.

To use, override the `config` key of the provider. See example [here](/docs/providers/openai#using-functions).

#### Postprocessing

The `TestCase.options.postprocess` field is a Javascript snippet that modifies the LLM output. Postprocessing occurs before any assertions are run.

Postprocess is a function that takes a string output and a context object:

```
postprocessFn: (output: string, context: {
  vars: Record<string, any>
})
```

This is useful if you need to somehow transform or clean LLM output before running an eval.

For example:

```yaml
# ...
tests:
  - vars:
      language: French
      body: Hello world
    options:
      // highlight-start
      postprocess: output.toUpperCase()
      // highlight-end
    # ...
```

Or multiline:

```yaml
# ...
tests:
  - vars:
      language: French
      body: Hello world
    options:
      // highlight-start
      postprocess: |
        output = output.replace(context.vars.language, 'foo');
        const words = output.split(' ').filter(x => !!x);
        return JSON.stringify(words);
      // highlight-end
    # ...
```

Tip: use `defaultTest` apply a postprocessing option to every test case in your test suite.

## Configuration structure

For detailed information on the config structure, see [Configuration Reference](/docs/configuration/reference).

## Loading tests from CSV

YAML is nice, but some organizations maintain their LLM tests in spreadsheets for ease of collaboration. promptfoo supports a special [CSV file format](/docs/configuration/parameters#tests-file).

```yaml
prompts: [prompt1.txt, prompt2.txt]
providers: [openai:gpt-3.5-turbo, localai:chat:vicuna]
// highlight-next-line
tests: tests.csv
```

promptfoo also has built-in ability to pull test cases from a Google Sheet. The sheet must be visible to "anyone with the link". For example:

```yaml
prompts: [prompt1.txt, prompt2.txt]
providers: [openai:gpt-3.5-turbo, localai:chat:vicuna]
// highlight-next-line
tests: https://docs.google.com/spreadsheets/d/1eqFnv1vzkPvS7zG-mYsqNDwOzvSaiIAsKB3zKg9H18c/edit?usp=sharing
```

Here's a [full example](https://github.com/promptfoo/promptfoo/tree/main/examples/google-sheets). See also: **[import tests from another file](#loading-tests-from-file)**.
