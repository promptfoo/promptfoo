# promptfoo: a prompt engineering tool

[![npm](https://img.shields.io/npm/v/promptfoo)](https://npmjs.com/package/promptfoo)
![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/typpo/promptfoo/main.yml)

`promptfoo` helps you tune LLM prompts systematically across many relevant test cases.

With promptfoo, you can:

- **Test multiple prompts** against predefined test cases
- **Evaluate quality and catch regressions** by comparing LLM outputs side-by-side
- **Speed up evaluations** by running tests concurrently
- **Flag bad outputs automatically** by setting "expectations"
- Use as a command line tool, or integrate into your workflow as a library
- Use OpenAI models, open-source models like Llama and Vicuna, or integrate custom API providers for any LLM API

# [» View full documentation «](https://promptfoo.dev/docs/intro)

promptfoo produces matrix views that allow you to quickly review prompt outputs across many inputs. The goal: tune prompts systematically across all relevant test cases, instead of testing prompts by trial and error.

Here's an example of a side-by-side comparison of multiple prompts and inputs:

![Prompt evaluation matrix - web viewer](https://github.com/typpo/promptfoo/assets/310310/ddcd77df-2783-425e-ade9-1a20dd0b6cd2)

It works on the command line too:
![Prompt evaluation](https://user-images.githubusercontent.com/310310/235529431-f4d5c395-d569-448e-9697-cd637e0372a5.gif)

## Usage (command line & web viewer)

To get started, run the following command:

```
npx promptfoo init
```

This will create some templates in your current directory: `prompts.txt`, `vars.csv`, and `promptfooconfig.js`.

After editing the prompts and variables to your liking, run the eval command to kick off an evaluation:

```
npx promptfoo eval
```

If you're looking to customize your usage, you have the full set of parameters at your disposal:

```bash
npx promptfoo eval -p <prompt_paths...> -o <output_path> -r <providers> [-v <vars_path>] [-j <max_concurrency] [-c <config_path>] [--grader <grading_provider>]
```

- `<prompt_paths...>`: Paths to prompt file(s)
- `<output_path>`: Path to output CSV, JSON, YAML, or HTML file. Defaults to terminal output
- `<providers>`: One or more of: `openai:<model_name>`, or filesystem path to custom API caller module
- `<vars_path>` (optional): Path to CSV, JSON, or YAML file with prompt variables
- `<max_concurrency>` (optional): Number of simultaneous API requests. Defaults to 4
- `<config_path>` (optional): Path to configuration file
- `<grading_provider>`: A provider that handles the grading process, if you are using [LLM grading](#expected-outputs)

After running an eval, you may optionally use the `view` command to open the web viewer:

```
npx promptfoo view
```

### Examples

#### Prompt quality

In this example, we evaluate whether adding adjectives to the personality of an assistant bot affects the responses:

```bash
npx promptfoo eval -p prompts.txt -v vars.csv -r openai:gpt-3.5-turbo
```

<!--
<img width="1362" alt="Side-by-side evaluation of LLM prompt quality, terminal output" src="https://user-images.githubusercontent.com/310310/235329207-e8c22459-5f51-4fee-9714-1b602ac3d7ca.png">

![Side-by-side evaluation of LLM prompt quality, html output](https://user-images.githubusercontent.com/310310/235483444-4ddb832d-e103-4b9c-a862-b0d6cc11cdc0.png)
-->

This command will evaluate the prompts in `prompts.txt`, substituing the variable values from `vars.csv`, and output results in your terminal.

Have a look at the setup and full output [here](https://github.com/typpo/promptfoo/tree/main/examples/assistant-cli).

You can also output a nice [spreadsheet](https://docs.google.com/spreadsheets/d/1nanoj3_TniWrDl1Sj-qYqIMD6jwm5FBy15xPFdUTsmI/edit?usp=sharing), [JSON](https://github.com/typpo/promptfoo/blob/main/examples/simple-cli/output.json), YAML, or an HTML file:

![Table output](https://user-images.githubusercontent.com/310310/235483444-4ddb832d-e103-4b9c-a862-b0d6cc11cdc0.png)

#### Model quality

In this example, we evaluate the difference between GPT 3 and GPT 4 outputs for a given prompt:

```bash
npx promptfoo eval -p prompts.txt -r openai:gpt-3.5-turbo openai:gpt-4 -o output.html
```

Produces this HTML table:

![Side-by-side evaluation of LLM model quality, gpt3 vs gpt4, html output](https://user-images.githubusercontent.com/310310/235490527-e0c31f40-00a0-493a-8afc-8ed6322bb5ca.png)

Full setup and output [here](https://github.com/typpo/promptfoo/tree/main/examples/gpt-3.5-vs-4).

## Usage (node package)

You can also use `promptfoo` as a library in your project by importing the `evaluate` function. The function takes the following parameters:

- `providers`: a list of provider strings or `ApiProvider` objects, or just a single string or `ApiProvider`.
- `options`: the prompts and variables you want to test:

  ```typescript
  {
    prompts: string[];
    vars?: Record<string, string>;
  }
  ```

### Example

`promptfoo` exports an `evaluate` function that you can use to run prompt evaluations.

```js
import promptfoo from 'promptfoo';

const options = {
  prompts: ['Rephrase this in French: {{body}}', 'Rephrase this like a pirate: {{body}}'],
  vars: [{ body: 'Hello world' }, { body: "I'm hungry" }],
};

(async () => {
  const summary = await promptfoo.evaluate('openai:gpt-3.5-turbo', options);
  console.log(summary);
})();
```

This code imports the `promptfoo` library, defines the evaluation options, and then calls the `evaluate` function with these options. The results are logged to the console:

```js
{
  "results": [
    {
      "prompt": {
        "raw": "Rephrase this in French: Hello world",
        "display": "Rephrase this in French: {{body}}"
      },
      "vars": {
        "body": "Hello world"
      },
      "response": {
        "output": "Bonjour le monde",
        "tokenUsage": {
          "total": 19,
          "prompt": 16,
          "completion": 3
        }
      }
    },
    // ...
  ],
  "stats": {
    "successes": 4,
    "failures": 0,
    "tokenUsage": {
      "total": 120,
      "prompt": 72,
      "completion": 48
    }
  },
  "table": [
    // ...
  ]
}
```

[See full example here](https://github.com/typpo/promptfoo/tree/main/examples/simple-import)

## Configuration

- **[Setting up an eval](https://promptfoo.dev/docs/configuration/parameters)**: Learn more about how to set up prompt files, vars file, output, etc.
- **[Configuring test cases](https://promptfoo.dev/docs/configuration/expected-outputs)**:  Learn more about how to configure expected outputs and test assertions.

## Installation

See **[installation docs](https://promptfoo.dev/docs/installation)**

## API Providers

We support OpenAI's API as well as a number of open-source models.  It's also to set up your own custom API provider.  **[See Provider documentation](https://promptfoo.dev/docs/configuration/providers)** for more details.

## Development

Contributions are welcome! Please feel free to submit a pull request or open an issue.

`promptfoo` includes several npm scripts to make development easier and more efficient. To use these scripts, run `npm run <script_name>` in the project directory.

Here are some of the available scripts:

- `build`: Transpile TypeScript files to JavaScript
- `build:watch`: Continuously watch and transpile TypeScript files on changes
- `test`: Run test suite
- `test:watch`: Continuously run test suite on changes

# [» View full documentation «](https://promptfoo.dev/docs/intro)
