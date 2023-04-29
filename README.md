promptfoo
---

`promptfoo` is a CLI tool that facilitates prompt editing and evaluation by providing a systematic approach to comparing LLM outputs. With the ability to run a test suite on multiple prompts, catch regressions, and analyze results, `promptfoo` offers a practical solution for evaluating model outputs.

## Features

- Test multiple prompts against predefined test cases
- Compare LLM outputs in a structured manner
- Support for OpenAI API models
- Customizable API provider integration
- CSV input/output for seamless data handling and processing

By incorporating these features, `promptfoo` enables users to make more informed decisions when refining prompts and assessing language model performance.

## Usage

To evaluate prompts using `promptfoo`, use the following command:

```bash
npx promptfoo eval -p <paths...> -o <output_path> -r <provider> [-v <vars_path>]
```

- `<paths...>`: Paths to prompt files
- `<output_path>`: Path to output CSV file
- `<provider>`: One of: `openai:chat`, `openai:completion`, `openai:chat:<model_name>`, `openai:completion:<model_name>`, or filesystem path to custom API caller module
- `<vars_path>` (optional): Path to CSV file with prompt variables

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


### Custom API Provider

To create a custom API provider, implement the `ApiProvider` interface in a separate module. Here is the interface:

```javascript
export interface ApiProvider {
  callApi: (prompt: string) => Promise<ProviderResult>;
}
```

Below is an example of a custom API provider that returns a predefined output and token usage:

```javascript
// customApiProvider.js
class CustomApiProvider {
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
promptfoo eval -p prompt1.txt prompt2.txt -o results.csv -r ./customApiProvider.js -v vars.csv
```

This command will evaluate the prompts using the custom API provider and save the results to the specified CSV file.

## Developing

Contributions are welcome! Please feel free to submit a pull request or open an issue.

`promptfoo` includes several npm scripts to make development easier and more efficient. To use these scripts, run `npm run <script_name>` in the project directory.

Here are some of the available scripts:

- `build`: Transpile TypeScript files to JavaScript
- `watch`: Continuously watch and transpile TypeScript files on changes
- `test`: Run test suite
- `test:watch`: Continuously run test suite on changes
