# promptfoo: test your LLM app locally

[![npm](https://img.shields.io/npm/v/promptfoo)](https://npmjs.com/package/promptfoo)
[![npm](https://img.shields.io/npm/dm/promptfoo)](https://npmjs.com/package/promptfoo)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/typpo/promptfoo/main.yml)](https://github.com/typpo/promptfoo/actions/workflows/main.yml)
![MIT license](https://img.shields.io/github/license/typpo/promptfoo)
[![Discord](https://dcbadge.vercel.app/api/server/gHPS9jjfbs?style=flat&compact=true)](https://discord.gg/gHPS9jjfbs)

`promptfoo` is a tool for testing and evaluating LLM output quality.

With promptfoo, you can:

- **Build reliable prompts, models, and RAGs** with benchmarks specific to your use-case
- **Speed up evaluations** with caching, concurrency, and live reloading
- **Score outputs automatically** by defining [metrics](https://promptfoo.dev/docs/configuration/expected-outputs)
- Use as a [CLI](https://promptfoo.dev/docs/usage/command-line), [library](https://promptfoo.dev/docs/usage/node-package), or in [CI/CD](https://promptfoo.dev/docs/integrations/github-action)
- Use OpenAI, Anthropic, Azure, Google, HuggingFace, open-source models like Llama, or integrate custom API providers for [any LLM API](https://promptfoo.dev/docs/providers)

The goal: **test-driven LLM development** instead of trial-and-error.

```sh
npx promptfoo@latest init
```

# [» View full documentation «](https://promptfoo.dev/docs/intro)

promptfoo produces matrix views that let you quickly evaluate outputs across many prompts and inputs:

![prompt evaluation matrix - web viewer](https://github.com/promptfoo/promptfoo/assets/310310/ce5a7817-da82-4484-b26d-32474f1cabc5)

It works on the command line too:

![Prompt evaluation](https://github.com/typpo/promptfoo/assets/310310/480e1114-d049-40b9-bd5f-f81c15060284)

## Why choose promptfoo?

There are many different ways to evaluate prompts. Here are some reasons to consider promptfoo:

- **Developer friendly**: promptfoo is fast, with quality-of-life features like live reloads and caching.
- **Battle-tested**: Originally built for LLM apps serving over 10 million users in production. Our tooling is flexible and can be adapted to many setups.
- **Simple, declarative test cases**: Define evals without writing code or working with heavy notebooks.
- **Language agnostic**: Use Python, Javascript, or any other language.
- **Share & collaborate**: Built-in share functionality & web viewer for working with teammates.
- **Open-source**: LLM evals are a commodity and should be served by 100% open-source projects with no strings attached.
- **Private**: This software runs completely locally. The evals run on your machine and talk directly with the LLM.

## Workflow

Start by establishing a handful of test cases - core use cases and failure cases that you want to ensure your prompt can handle.

As you explore modifications to the prompt, use `promptfoo eval` to rate all outputs. This ensures the prompt is actually improving overall.

As you collect more examples and establish a user feedback loop, continue to build the pool of test cases.

<img width="772" alt="LLM ops" src="https://github.com/typpo/promptfoo/assets/310310/cf0461a7-2832-4362-9fbb-4ebd911d06ff">

## Usage

To get started, run this command:

```
npx promptfoo@latest init
```

This will create some placeholders in your current directory: `prompts.txt` and `promptfooconfig.yaml`.

After editing the prompts and variables to your liking, run the eval command to kick off an evaluation:

```
npx promptfoo@latest eval
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
      - type: llm-rubric
        value: does not describe self as an AI, model, or chatbot
      - type: similar
        value: was geht
        threshold: 0.6 # cosine similarity
```

### Supported assertion types

See [Test assertions](https://promptfoo.dev/docs/configuration/expected-outputs) for full details.

Deterministic eval metrics

| Assertion Type                  | Returns true if...                                                |
| ------------------------------- | ----------------------------------------------------------------- |
| `equals`                        | output matches exactly                                            |
| `contains`                      | output contains substring                                         |
| `icontains`                     | output contains substring, case insensitive                       |
| `regex`                         | output matches regex                                              |
| `starts-with`                   | output starts with string                                         |
| `contains-any`                  | output contains any of the listed substrings                      |
| `contains-all`                  | output contains all list of substrings                            |
| `icontains-any`                 | output contains any of the listed substrings, case insensitive    |
| `icontains-all`                 | output contains all list of substrings, case insensitive          |
| `is-json`                       | output is valid json (optional json schema validation)            |
| `contains-json`                 | output contains valid json (optional json schema validation)      |
| `javascript`                    | provided Javascript function validates the output                 |
| `python`                        | provided Python function validates the output                     |
| `webhook`                       | provided webhook returns `{pass: true}`                           |
| `rouge-n`                       | Rouge-N score is above a given threshold                          |
| `levenshtein`                   | Levenshtein distance is below a threshold                         |
| `latency`                       | Latency is below a threshold (milliseconds)                       |
| `perplexity`                    | Perplexity is below a threshold                                   |
| `cost`                          | Cost is below a threshold (for models with cost info such as GPT) |
| `is-valid-openai-function-call` | Ensure that the function call matches the function's JSON schema  |
| `is-valid-openai-tools-call`    | Ensure that all tool calls match the tools JSON schema            |

Model-assisted eval metrics

| Assertion Type                                                                                  | Method                                                                          |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [similar](https://promptfoo.dev/docs/configuration/expected-outputs/similar)                    | Embeddings and cosine similarity are above a threshold                          |
| [classifier](https://promptfoo.dev/docs/configuration/expected-outputs/classifier)              | Run LLM output through a classifier                                             |
| [llm-rubric](https://promptfoo.dev/docs/configuration/expected-outputs/model-graded)            | LLM output matches a given rubric, using a Language Model to grade output       |
| [answer-relevance](https://promptfoo.dev/docs/configuration/expected-outputs/model-graded)      | Ensure that LLM output is related to original query                             |
| [context-faithfulness](https://promptfoo.dev/docs/configuration/expected-outputs/model-graded)  | Ensure that LLM output uses the context                                         |
| [context-recall](https://promptfoo.dev/docs/configuration/expected-outputs/model-graded)        | Ensure that ground truth appears in context                                     |
| [context-relevance](https://promptfoo.dev/docs/configuration/expected-outputs/model-graded)     | Ensure that context is relevant to original query                               |
| [factuality](https://promptfoo.dev/docs/configuration/expected-outputs/model-graded)            | LLM output adheres to the given facts, using Factuality method from OpenAI eval |
| [model-graded-closedqa](https://promptfoo.dev/docs/configuration/expected-outputs/model-graded) | LLM output adheres to given criteria, using Closed QA method from OpenAI eval   |
| [moderation](https://promptfoo.dev/docs/configuration/expected-outputs/moderation)              | Make sure outputs are safe                                                      |
| [select-best](https://promptfoo.dev/docs/configuration/expected-outputs/model-graded)           | Compare multiple outputs for a test case and pick the best one                  |

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

| Option                              | Description                                                                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-p, --prompts <paths...>`          | Paths to [prompt files](https://promptfoo.dev/docs/configuration/parameters#prompt-files), directory, or glob                                                                      |
| `-r, --providers <name or path...>` | One of: openai:chat, openai:completion, openai:model-name, localai:chat:model-name, localai:completion:model-name. See [API providers][providers-docs]                             |
| `-o, --output <path>`               | Path to [output file](https://promptfoo.dev/docs/configuration/parameters#output-file) (csv, json, yaml, html)                                                                     |
| `--tests <path>`                    | Path to [external test file](https://promptfoo.dev/docs/configurationexpected-outputsassertions#load-an-external-tests-file)                                                       |
| `-c, --config <paths>`              | Path to one or more [configuration files](https://promptfoo.dev/docs/configuration/guide). `promptfooconfig.js/json/yaml` is automatically loaded if present                       |
| `-j, --max-concurrency <number>`    | Maximum number of concurrent API calls                                                                                                                                             |
| `--table-cell-max-length <number>`  | Truncate console table cells to this length                                                                                                                                        |
| `--prompt-prefix <path>`            | This prefix is prepended to every prompt                                                                                                                                           |
| `--prompt-suffix <path>`            | This suffix is append to every prompt                                                                                                                                              |
| `--grader`                          | [Provider][providers-docs] that will conduct the evaluation, if you are [using LLM to grade your output](https://promptfoo.dev/docs/configuration/expected-outputs#llm-evaluation) |

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

This command will evaluate the prompts in `prompts.txt`, substituting the variable values from `vars.csv`, and output results in your terminal.

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
    outputPath?: string | string[]; // Optional: write results to file
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

    // Override the provider for this test
    provider?: string | ProviderOptions | ApiProvider;
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

We support OpenAI's API as well as a number of open-source models. It's also to set up your own custom API provider. **[See Provider documentation][providers-docs]** for more details.

## Development

Here's how to build and run locally:

```sh
git clone https://github.com/promptfoo/promptfoo.git
cd promptfoo

npm i
cd path/to/experiment-with-promptfoo   # contains your promptfooconfig.yaml
npx path/to/promptfoo-source eval
```

The web UI is located in `src/web/nextui`. To run it in dev mode, run `npm run local:web`. This will host the web UI at http://localhost:3000. The web UI expects `promptfoo view` to be running separately.

In order to build the next.js app, you'll have to set some placeholder envars (it is _not_ necessary to sign up for a supabase account). You can edit `src/web/nextui/.env` to include the following placeholders:

```sh
DATABASE_URL="postgresql://..."

NEXT_PUBLIC_PROMPTFOO_WITH_DATABASE=1
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.promptfoo.dev
NEXT_PUBLIC_SUPABASE_ANON_KEY=abc123
```

Then run:

```sh
npm run build
```

The build has some side effects such as e.g. copying HTML templates, migrations, etc.

Contributions are welcome! Please feel free to submit a pull request or open an issue.

`promptfoo` includes several npm scripts to make development easier and more efficient. To use these scripts, run `npm run <script_name>` in the project directory.

Here are some of the available scripts:

- `build`: Transpile TypeScript files to JavaScript
- `build:watch`: Continuously watch and transpile TypeScript files on changes
- `test`: Run test suite
- `test:watch`: Continuously run test suite on changes
- `db:generate`: Generate new db migrations (and create the db if it doesn't already exist). Note that after generating a new migration, you'll have to `npm i` to copy the migrations into `dist/`.
- `db:migrate`: Run existing db migrations (and create the db if it doesn't already exist)

To run the CLI during development you can run a command like: `npm run local -- eval --config $(readlink -f ./examples/cloudflare-ai/chat_config.yaml)`, where any parts of the command after `--` are passed through to our CLI entrypoint. Since the Next dev server isn't supported in this mode, see the instructions above for running the web server.

# [» View full documentation «](https://promptfoo.dev/docs/intro)

[providers-docs]: https://promptfoo.dev/docs/providers

### Adding a New Provider

1. Create an implementation in `src/providers/SOME_PROVIDER_FILE`
2. Update `loadApiProvider` in `src/providers.ts` to load your provider via string
3. Add test cases in `test/providers.test.ts`
   1. Test the actual provider implementation
   2. Test loading the provider via a `loadApiProvider` test
