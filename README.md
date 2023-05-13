# promptfoo

[![npm](https://img.shields.io/npm/v/promptfoo)](https://npmjs.com/package/promptfoo)
![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/typpo/promptfoo/main.yml)

`promptfoo` is a library and command-line tool that helps you evaluate LLM prompt & model quality with a systematic approach to comparing model outputs.

With promptfoo, you can:

- **Test multiple prompts** against predefined test cases
- **Evaluate quality and catch regressions** by comparing LLM outputs side-by-side
- **Speed up evaluations** by running tests concurrently
- Use as a command line tool, or integrate into your workflow as a library
- Use OpenAI API models (built-in support), or integrate custom API providers for any LLM API

**» [View docs on website](https://promptfoo.dev/docs/intro) «**

promptfoo works by producing matrix views that allow you to quickly review prompt outputs across many inputs. The goal: tune prompts systematically across all relevant test cases, instead of testing prompts one-off.

Here's an example of a side-by-side comparison of multiple prompts and inputs. You can manually review outputs, or set up "expectations" that automatically flag bad outputs.

![Prompt evaluation matrix - web viewer](https://github.com/typpo/promptfoo/assets/310310/ddcd77df-2783-425e-ade9-1a20dd0b6cd2)

It works on the command line too.
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

## Usage (as a library)

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

```javascript
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

### Prompt Files

Prompt files are plain text files that contain the prompts you want to test. If you have only one file, you can include multiple prompts in the file, separated by the delimiter `---`. If you have multiple files, each prompt should be in a separate file.

You can use [Nunjucks](https://mozilla.github.io/nunjucks/) templating syntax to include variables in your prompts, which will be replaced with actual values from the `vars` CSV file during evaluation.

Example of a single prompt file with multiple prompts (`prompts.txt`):

```
Translate the following text to French: "{{name}}: {{text}}"
---
Translate the following text to German: "{{name}}: {{text}}"
```

Example of multiple prompt files:

- `prompt1.txt`:

  ```
  Translate the following text to French: "{{name}}: {{text}}"
  ```

- `prompt2.txt`:

  ```
  Translate the following text to German: "{{name}}: {{text}}"
  ```

### Vars File

The Vars file is a CSV, JSON, or YAML file that contains the values for the variables used in the prompts. The first row of the CSV file should contain the variable names, and each subsequent row should contain the corresponding values for each test case.

Vars are substituted by [Nunjucks](https://mozilla.github.io/nunjucks/) templating syntax into prompts.

Example of a vars file (`vars.csv`):

```
"name","text"
"Bob","Hello, world!"
"Joe","Goodbye, everyone!"
```

Example of a vars file (`vars.json`):

```json
[
  { "name": "Bob", "text": "Hello, world!" },
  { "name": "Joe", "text": "Goodbye, everyone!" }
]
```

### Expected Outputs

You can specify an expected value for each test case to evaluate the success or failure of the model's output. To do this, add a special field called `__expected` in the `vars` file. The `__expected` field supports these types of value comparisons:

1. If the expected value starts with `eval:`, it will evaluate the contents as the body of a JavaScript function defined like: `function(output) { <eval> }`. The function should return a boolean value, where `true` indicates success and `false` indicates failure.

2. If the expected value starts with `grade:`, it will ask an LLM to evaluate whether the output meets the condition. For example: `grade: don't mention being an AI`. This option requires a provider name to be supplied to promptfoo via the `--grader` argument: `promptfoo --grader openai:gpt-4 ...`.

3. Otherwise, it attempts an exact string match comparison between the expected value and the model's output.

Example of a vars file with the `__expected` field (`vars.csv`):

```
text,__expected
"Hello, world!","Bonjour le monde"
"Goodbye, everyone!","eval:return output.includes('Au revoir');"
"I am a pineapple","grade:doesn't reference any fruits besides pineapple"
```

Example of a vars file with the `__expected` field (`vars.json`):

```json
[
  { "text": "Hello, world!", "__expected": "Bonjour le monde" },
  { "text": "Goodbye, everyone!", "__expected": "eval:output.includes('Au revoir');" }
  { "text": "I am a pineapple", "__expected": "grade:doesn't reference any fruits besides pineapple" }
]
```

When the `__expected` field is provided, the success and failure statistics in the evaluation summary will be based on whether the expected criteria are met.

For more advanced test cases, we recommend using a testing framework like [Jest](https://jestjs.io/) or [Mocha](https://mochajs.org/) and using promptfoo as a library.

### Output File

The results of the evaluation are written to this file. Each record in the output file corresponds to a test case and includes the original prompt, the output generated by the LLM, and the values of the variables used in the test case.

For example outputs, see the [examples/](https://github.com/typpo/promptfoo/tree/main/examples) directory.

### Configuration File

You can specify any option in a configuration file (e.g., `.promptfoorc`, `promptfoo.config.json`). This can help you avoid repetitive command-line options and simplify the CLI invocation.

Example of a configuration file (`promptfoo.config.json`):

```json
{
  "provider": "openai:chat",
  "vars": "/path/to/vars.csv"
}
```

## Installation

1. Clone the repository:

```bash
git clone https://github.com/typpo/promptfoo.git
```

2. Install the dependencies:

```bash
npm install
```

3. Link the CLI tool:

```bash
npm link
```

4. Build:

```bash
npm run build
```

5. Make the entrypoint executable:

```bash
chmod +x dist/main.js
```

### Example

```bash
promptfoo eval -p prompt1.txt prompt2.txt -o results.csv -r openai:chat -v vars.csv
```

## API Providers

`promptfoo` supports OpenAI API models out of the box. To use a custom API provider, create a custom module that implements the `ApiProvider` interface and pass the path to the module as the `provider` option.

### OpenAI API

To use the OpenAI API, set the `OPENAI_API_KEY` environment variable or pass the API key as an argument to the constructor.

Example:

```bash
export OPENAI_API_KEY=your_api_key_here
```

Other OpenAI-related environment variables are supported:

- `OPENAI_TEMPERATURE` - temperature model parameter, defaults to 0
- `OPENAI_MAX_TOKENS` - max_tokens model parameter, defaults to 1024
- `OPENAI_STOP` - stopwords in JSON format, defaults to []
- `OPENAI_API_HOST` - override the hostname for the API request. Useful for proxies like Helicone.
- `REQUEST_TIMEOUT_MS` - maximum request time, in milliseconds (defaults to 60000)

The OpenAI provider supports the following model formats:

- `openai:chat` - defaults to gpt-3.5-turbo
- `openai:completion` - defaults to `text-davinci-003`
- `openai:<model name>` - uses a specific model name (mapped automatically to chat or completion endpoint)
- `openai:chat:<model name>` - uses any model name against the chat endpoint
- `openai:completion:<model name>` - uses any model name against the completion endpoint

The `openai:<endpoint>:<model>` construction is useful if OpenAI releases a new model, or if you have a custom model. For example, if OpenAI releases gpt-5 chat completion, you could begin using it immediately with `openai:chat:gpt-5`.

### Custom API Provider

To create a custom API provider, implement the `ApiProvider` interface in a separate module. Here is the interface:

```javascript
export interface ApiProvider {
  id: () => string;
  callApi: (prompt: string) => Promise<ProviderResult>;
}
```

Below is an example of a custom API provider that returns a predefined output and token usage:

```javascript
// customApiProvider.js
import fetch from 'node-fetch';

class CustomApiProvider {
  id() {
    return 'my-custom-api';
  }

  async callApi(prompt) {
    // Add your custom API logic here

    return {
      // Required
      output: 'Model output',

      // Optional
      tokenUsage: {
        total: 10,
        prompt: 5,
        completion: 5,
      },
    };
  }
}

export default CustomApiProvider;
```

To use the custom API provider with `promptfoo`, pass the path to the module as the `provider` option in the CLI invocation:

```bash
promptfoo eval -p prompt1.txt prompt2.txt -o results.csv  -v vars.csv -r ./customApiProvider.js
```

This command will evaluate the prompts using the custom API provider and save the results to the specified CSV file.

## Development

Contributions are welcome! Please feel free to submit a pull request or open an issue.

`promptfoo` includes several npm scripts to make development easier and more efficient. To use these scripts, run `npm run <script_name>` in the project directory.

Here are some of the available scripts:

- `build`: Transpile TypeScript files to JavaScript
- `watch`: Continuously watch and transpile TypeScript files on changes
- `test`: Run test suite
- `test:watch`: Continuously run test suite on changes
