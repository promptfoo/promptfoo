# promptfoo: test your prompts

[![npm](https://img.shields.io/npm/v/promptfoo)](https://npmjs.com/package/promptfoo)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/typpo/promptfoo/main.yml)](https://github.com/typpo/promptfoo/actions/workflows/main.yml)
![MIT license](https://img.shields.io/github/license/typpo/promptfoo)

`promptfoo` is a tool for testing and evaluating LLM output quality.

With promptfoo, you can:

- **Systematically test prompts & models** against predefined test cases
- **Evaluate quality and catch regressions** by comparing LLM outputs side-by-side
- **Speed up evaluations** with caching and concurrency
- **Score outputs automatically** by defining test cases
- Use as a CLI, library, or in CI/CD
- Use OpenAI, Anthropic, Azure, open-source models like Llama, or integrate custom API providers for any LLM API

The goal: **test-driven prompt engineering**, rather than trial-and-error.

# [» View full documentation «](https://promptfoo.dev/docs/intro)

promptfoo produces matrix views that let you quickly evaluate outputs across many prompts.

Here's an example of a side-by-side comparison of multiple prompts and inputs:

![prompt evaluation matrix - web viewer](https://github.com/promptfoo/promptfoo/assets/310310/ce5a7817-da82-4484-b26d-32474f1cabc5)

It works on the command line too:

![Prompt evaluation](https://github.com/typpo/promptfoo/assets/310310/480e1114-d049-40b9-bd5f-f81c15060284)

## Workflow

Start by establishing a handful of test cases - core use cases and failure cases that you want to ensure your prompt can handle.

As you explore modifications to the prompt, use `promptfoo eval` to rate all outputs. This ensures the prompt is actually improving overall.

As you collect more examples and establish a user feedback loop, continue to build the pool of test cases.

<img width="772" alt="LLM ops" src="https://github.com/typpo/promptfoo/assets/310310/cf0461a7-2832-4362-9fbb-4ebd911d06ff">

## Usage

To get started, run this command:

```
npx promptfoo init
```

This will create some placeholders in your current directory: `prompts.txt` and `promptfooconfig.yaml`.

After editing the prompts and variables to your liking, run the eval command to kick off an evaluation:

```
npx promptfoo eval
```

### Configuration

The YAML configuration format runs each prompt through a series of example inputs (aka "test case") and checks if they meet requirements (aka "assert").

See the [Configuration docs](https://www.promptfoo.dev/docs/configuration/guide) for a detailed guide.

```yaml
prompts: [prompt1.txt, prompt2.txt]
providers: [openai:gpt-3.5-turbo, ollama:llama2:70b]
tests:
  - description: 'Test translation to French'
    vars:
      language: French
      input: Hello world
    assert:
      - type: contains-json
      - type: javascript
        value: output.length < 100

  - description: 'Test translation to German'
    vars:
      language: German
      input: How's it going?
    assert:
      - type: model-graded-closedqa
        value: does not describe self as an AI, model, or chatbot
      - type: similar
        value: was geht
        threshold: 0.6 # cosine similarity
```

### Supported assertion types

See [Test assertions](https://promptfoo.dev/docs/configuration/expected-outputs) for full details.

| Assertion Type            | Returns true if...                                                              |
| ------------------------- | ------------------------------------------------------------------------------- |
| `equals`                  | output matches exactly                                                          |
| `contains`                | output contains substring                                                       |
| `icontains`               | output contains substring, case insensitive                                     |
| `regex`                   | output matches regex                                                            |
| `starts-with`             | output starts with string                                                       |
| `contains-any `           | output contains any of the listed substrings                                    |
| `contains-all`            | output contains all list of substrings                                          |
| `is-json`                 | output is valid json (optional json schema validation)                          |
| `contains-json`           | output contains valid json (optional json schema validation)                    |
| `javascript`              | provided Javascript function validates the output                               |
| `python`                  | provided Python function validates the output                                   |
| `webhook`                 | provided webhook returns `{pass: true}`                                         |
| `similar`                 | embeddings and cosine similarity are above a threshold                          |
| `llm-rubric`              | LLM output matches a given rubric, using a Language Model to grade output       |
| `model-graded-factuality` | LLM output adheres to the given facts, using Factuality method from OpenAI eval |
| `model-graded-closedqa`   | LLM output adheres to given criteria, using Closed QA method from OpenAI eval   |
| `rouge-n`                 | Rouge-N score is above a given threshold                                        |
| `levenshtein`             | Levenshtein distance is below a threshold                                       |

Every test type can be negated by prepending `not-`. For example, `not-equals` or `not-regex`.

### Tests from spreadsheet

Some people prefer to configure their LLM tests in a CSV. In that case, the config is pretty simple:

```yaml
prompts: [prompts.txt]
providers: [openai:gpt-3.5-turbo]
tests: tests.csv
```

See [example CSV](https://github.com/typpo/promptfoo/blob/main/examples/simple-test/tests.csv).

### Command-line

If you're looking to customize your usage, you have a wide set of parameters at your disposal.

| Option                              | Description                                                                                                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-p, --prompts <paths...>`          | Paths to [prompt files](https://promptfoo.dev/docs/configuration/parameters#prompt-files), directory, or glob                                                                                                          |
| `-r, --providers <name or path...>` | One of: openai:chat, openai:completion, openai:model-name, localai:chat:model-name, localai:completion:model-name. See [API providers](https://promptfoo.dev/docs/configuration/providers)                             |
| `-o, --output <path>`               | Path to [output file](https://promptfoo.dev/docs/configuration/parameters#output-file) (csv, json, yaml, html)                                                                                                         |
| `--tests <path>`                    | Path to [external test file](https://promptfoo.dev/docs/configurationexpected-outputsassertions#load-an-external-tests-file)                                                                                           |
| `-c, --config <path>`               | Path to [configuration file](https://promptfoo.dev/docs/configuration/guide). `promptfooconfig.js/json/yaml` is automatically loaded if present                                                                        |
| `-j, --max-concurrency <number>`    | Maximum number of concurrent API calls                                                                                                                                                                                 |
| `--table-cell-max-length <number>`  | Truncate console table cells to this length                                                                                                                                                                            |
| `--prompt-prefix <path>`            | This prefix is prepended to every prompt                                                                                                                                                                               |
| `--prompt-suffix <path>`            | This suffix is append to every prompt                                                                                                                                                                                  |
| `--grader`                          | [Provider](https://promptfoo.dev/docs/configuration/providers) that will conduct the evaluation, if you are [using LLM to grade your output](https://promptfoo.dev/docs/configuration/expected-outputs#llm-evaluation) |

After running an eval, you may optionally use the `view` command to open the web viewer:

```
npx promptfoo view
```

### Examples

#### Prompt quality

In [this example](https://github.com/typpo/promptfoo/tree/main/examples/assistant-cli), we evaluate whether adding adjectives to the personality of an assistant bot affects the responses:

```bash
npx promptfoo eval -p prompts.txt -r openai:gpt-3.5-turbo -t tests.csv
```

<!--
<img width="1362" alt="Side-by-side evaluation of LLM prompt quality, terminal output" src="https://user-images.githubusercontent.com/310310/235329207-e8c22459-5f51-4fee-9714-1b602ac3d7ca.png">

![Side-by-side evaluation of LLM prompt quality, html output](https://user-images.githubusercontent.com/310310/235483444-4ddb832d-e103-4b9c-a862-b0d6cc11cdc0.png)
-->

This command will evaluate the prompts in `prompts.txt`, substituing the variable values from `vars.csv`, and output results in your terminal.

You can also output a nice [spreadsheet](https://docs.google.com/spreadsheets/d/1nanoj3_TniWrDl1Sj-qYqIMD6jwm5FBy15xPFdUTsmI/edit?usp=sharing), [JSON](https://github.com/typpo/promptfoo/blob/main/examples/simple-cli/output.json), YAML, or an HTML file:

![Table output](https://user-images.githubusercontent.com/310310/235483444-4ddb832d-e103-4b9c-a862-b0d6cc11cdc0.png)

#### Model quality

In the [next example](https://github.com/typpo/promptfoo/tree/main/examples/gpt-3.5-vs-4), we evaluate the difference between GPT 3 and GPT 4 outputs for a given prompt:

```bash
npx promptfoo eval -p prompts.txt -r openai:gpt-3.5-turbo openai:gpt-4 -o output.html
```

Produces this HTML table:

![Side-by-side evaluation of LLM model quality, gpt3 vs gpt4, html output](https://user-images.githubusercontent.com/310310/235490527-e0c31f40-00a0-493a-8afc-8ed6322bb5ca.png)

## Usage (node package)

You can also use `promptfoo` as a library in your project by importing the `evaluate` function. The function takes the following parameters:

- `testSuite`: the Javascript equivalent of the promptfooconfig.yaml

  ```typescript
  interface EvaluateTestSuite {
    providers: string[]; // Valid provider name (e.g. openai:gpt-3.5-turbo)
    prompts: string[]; // List of prompts
    tests: string | TestCase[]; // Path to a CSV file, or list of test cases

    defaultTest?: Omit<TestCase, 'description'>; // Optional: add default vars and assertions on test case
    outputPath?: string; // Optional: write results to file
  }

  interface TestCase {
    // Optional description of what you're testing
    description?: string;

    // Key-value pairs to substitute in the prompt
    vars?: Record<string, string | string[] | object>;

    // Optional list of automatic checks to run on the LLM output
    assert?: Assertion[];

    // Additional configuration settings for the prompt
    options?: PromptConfig & OutputConfig & GradingConfig;

    // The required score for this test case.  If not provided, the test case is graded pass/fail.
    threshold?: number;
  }

  interface Assertion {
    type: string;
    value?: string;
    threshold?: number; // Required score for pass
    weight?: number; // The weight of this assertion compared to other assertions in the test case. Defaults to 1.
    provider?: ApiProvider; // For assertions that require an LLM provider
  }
  ```

- `options`: misc options related to how the tests are run

  ```typescript
  interface EvaluateOptions {
    maxConcurrency?: number;
    showProgressBar?: boolean;
    generateSuggestions?: boolean;
  }
  ```

### Example

`promptfoo` exports an `evaluate` function that you can use to run prompt evaluations.

```js
import promptfoo from 'promptfoo';

const results = await promptfoo.evaluate({
  prompts: ['Rephrase this in French: {{body}}', 'Rephrase this like a pirate: {{body}}'],
  providers: ['openai:gpt-3.5-turbo'],
  tests: [
    {
      vars: {
        body: 'Hello world',
      },
    },
    {
      vars: {
        body: "I'm hungry",
      },
    },
  ],
});
```

This code imports the `promptfoo` library, defines the evaluation options, and then calls the `evaluate` function with these options.

See the full example [here](https://github.com/typpo/promptfoo/tree/main/examples/simple-import), which includes an example results object.

## Configuration

- **[Main guide](https://promptfoo.dev/docs/configuration/guide)**: Learn about how to configure your YAML file, setup prompt files, etc.
- **[Configuring test cases](https://promptfoo.dev/docs/configuration/expected-outputs)**: Learn more about how to configure expected outputs and test assertions.

## Installation

See **[installation docs](https://promptfoo.dev/docs/installation)**

## API Providers

We support OpenAI's API as well as a number of open-source models. It's also to set up your own custom API provider. **[See Provider documentation](https://promptfoo.dev/docs/configuration/providers)** for more details.

## Development

Contributions are welcome! Please feel free to submit a pull request or open an issue.

`promptfoo` includes several npm scripts to make development easier and more efficient. To use these scripts, run `npm run <script_name>` in the project directory.

Here are some of the available scripts:

- `build`: Transpile TypeScript files to JavaScript
- `build:watch`: Continuously watch and transpile TypeScript files on changes
- `test`: Run test suite
- `test:watch`: Continuously run test suite on changes

# [» View full documentation «](https://promptfoo.dev/docs/intro)
