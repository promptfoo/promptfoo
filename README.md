# promptfoo

`promptfoo` is a library and command-line tool that helps you evaluate LLM prompt & model quality with a systematic approach to comparing model outputs.

With promptfoo, you can:

- **Test multiple prompts** against predefined test cases
- **Evaluate quality and catch regressions** by comparing LLM outputs side-by-side
- Use as a command line tool, or integrate into your workflow as a library
- Use OpenAI API models (built-in support), or integrate custom API providers for any LLM API

## Usage (command line)

To evaluate prompts using `promptfoo`, use the following command:

```bash
npx promptfoo eval -p <prompt_paths...> -o <output_path> -r <provider> [-v <vars_path>] [-c <config_path>]
```

- `<prompt_paths...>`: Paths to prompt file(s)
- `<output_path>`: Path to output CSV, JSON, YAML, HTML file
- `<provider>`: One or more of: `openai:<model_name>`, or filesystem path to custom API caller module
- `<vars_path>` (optional): Path to CSV, JSON, or YAML file with prompt variables
- `<config_path>` (optional): Path to configuration file

### Examples

#### Prompt quality

In this example, we evaluate whether adding adjectives to the personality of an assistant bot affects the responses:

<!--
<img width="1362" alt="Side-by-side evaluation of LLM prompt quality, terminal output" src="https://user-images.githubusercontent.com/310310/235329207-e8c22459-5f51-4fee-9714-1b602ac3d7ca.png">
-->
![Side-by-side evaluation of LLM prompt quality, html output](https://user-images.githubusercontent.com/310310/235483444-4ddb832d-e103-4b9c-a862-b0d6cc11cdc0.png)


```bash
npx promptfoo eval -p prompts.txt -v vars.csv -r openai:gpt-3.5-turbo
```

This command will evaluate the prompts in `prompts.txt`, substituing the variable values from `vars.csv`, and output results in your terminal.

Have a look at the files and full output [here](https://github.com/typpo/promptfoo/tree/main/examples/assistant-cli).

You can run the command without an `-o` option to output in your terminal ([example](https://user-images.githubusercontent.com/310310/235329207-e8c22459-5f51-4fee-9714-1b602ac3d7ca.png)), or use `-o` to specify an HTML ([example](https://user-images.githubusercontent.com/310310/235483444-4ddb832d-e103-4b9c-a862-b0d6cc11cdc0.png)), CSV ([example](https://docs.google.com/spreadsheets/d/1nanoj3_TniWrDl1Sj-qYqIMD6jwm5FBy15xPFdUTsmI/edit?usp=sharing)), JSON ([example](https://github.com/typpo/promptfoo/blob/main/examples/simple-cli/output.json)), or YAML output.

#### Model quality

In this example, we evaluate the difference between GPT 3 and GPT 4 outputs for a given prompt:

![Side-by-side evaluation of LLM model quality, gpt3 vs gpt4, html output](https://user-images.githubusercontent.com/310310/235490527-e0c31f40-00a0-493a-8afc-8ed6322bb5ca.png)

```bash
npx promptfoo eval -p prompts.txt -r openai:gpt-3.5-turbo openai:gpt-4 -o output.html
```

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
  results: [
    {
      prompt: 'Rephrase this in French: {{body}}',
      output: 'Bonjour le monde',
      body: 'Hello world'
    },
    {
      prompt: 'Rephrase this like a pirate: {{body}}',
      output: 'Ahoy thar, me hearties! Avast ye, world!',
      body: 'Hello world'
    },
    {
      prompt: 'Rephrase this in French: {{body}}',
      output: "J'ai faim.",
      body: "I'm hungry"
    },
    {
      prompt: 'Rephrase this like a pirate: {{body}}',
      output: "Arrr, me belly be empty and me throat be parched! I be needin' some grub, matey!",
      body: "I'm hungry"
    }
  ],
  table: [
    [
      'Rephrase this in French: {{body}}',
      'Rephrase this like a pirate: {{body}}',
      'body'
    ],
    [
      'Bonjour le monde',
      'Ahoy thar, me hearties! Avast ye, world!',
      'Hello world'
    ],
    [
      "J'ai faim.",
      "Arrr, me belly be empty and me throat be parched! I be needin' some grub, matey!",
      "I'm hungry"
    ]
  ]
  stats: {
    successes: 4,
    failures: 0,
    tokenUsage: { total: 120, prompt: 72, completion: 48 }
  }
}
```

[See example here](https://github.com/typpo/promptfoo/tree/main/examples/simple-import)

## Configuration

### Prompt Files

Prompt files are plain text files that contain the prompts you want to test. If you have only one file, you can include multiple prompts in the file, separated by the delimiter `---`. If you have multiple files, each prompt should be in a separate file.

You can use [Nunjucks](https://mozilla.github.io/nunjucks/) templating syntax to include variables in your prompts, which will be replaced with actual values from the `vars` CSV file during evaluation.

Example of a single prompt file with multiple prompts (`prompts.txt`):

```
Translate the following text to French: "{{text}}"
---
Translate the following text to German: "{{text}}"
```

Example of multiple prompt files:

- `prompt1.txt`:

  ```
  Translate the following text to French: "{{text}}"
  ```

- `prompt2.txt`:

  ```
  Translate the following text to German: "{{text}}"
  ```

### Vars File

The Vars file is a CSV, JSON, or YAML file that contains the values for the variables used in the prompts. The first row of the CSV file should contain the variable names, and each subsequent row should contain the corresponding values for each test case.

Vars are substituted by [Nunjucks](https://mozilla.github.io/nunjucks/) templating syntax into prompts.

Example of a vars file (`vars.csv`):

```
text
"Hello, world!"
"Goodbye, everyone!"
```

Example of a vars file (`vars.json`):

```json
[{ "text": "Hello, world!" }, { "text": "Goodbye, everyone!" }]
```

### Output File

The output file is a CSV file that contains the results of the evaluation. Each row in the output file corresponds to a test case and includes the original prompt, the output generated by the LLM, and the values of the variables used in the test case.

Example of an output file (`results.csv`):

```
Prompt,Output,text
"Translate the following text to French: ""{{text}}""","Bonjour, le monde !","Hello, world!"
"Translate the following text to French: ""{{text}}""","Au revoir, tout le monde !","Goodbye, everyone!"
```

Example of an output file (`results.json`):

```json
[
  {
    "Prompt": "Translate the following English text to French: \"{{text}}\"",
    "Output": "Bonjour, le monde !",
    "text": "Hello, world!"
  },
  {
    "Prompt": "Translate the following English text to French: \"{{text}}\"",
    "Output": "Au revoir, tout le monde !",
    "text": "Goodbye, everyone!"
  }
]
```

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

module.exports.default = CustomApiProvider;
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
