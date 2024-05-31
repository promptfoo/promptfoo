---
sidebar_position: 1
---

# OpenAI

To use the OpenAI API, set the `OPENAI_API_KEY` environment variable, specify via `apiKey` field in the configuration file or pass the API key as an argument to the constructor.

Example:

```bash
export OPENAI_API_KEY=your_api_key_here
```

The OpenAI provider supports the following model formats:

- `openai:chat` - defaults to `gpt-3.5-turbo`
- `openai:completion` - defaults to `text-davinci-003`
- `openai:<model name>` - uses a specific model name (mapped automatically to chat or completion endpoint)
- `openai:chat:<model name>` - uses any model name against the `/v1/chat/completions` endpoint
- `openai:chat:ft:gpt-3.5-turbo-0613:company-name:ID` - example of a fine-tuned chat completion model
- `openai:completion:<model name>` - uses any model name against the `/v1/completions` endpoint
- `openai:embeddings:<model name>` - uses any model name against the `/v1/embeddings` endpoint
- `openai:assistant:<assistant id>` - use an assistant

The `openai:<endpoint>:<model name>` construction is useful if OpenAI releases a new model,
or if you have a custom model.
For example, if OpenAI releases `gpt-5` chat completion,
you could begin using it immediately with `openai:chat:gpt-5`.

The OpenAI provider supports a handful of [configuration options](https://github.com/promptfoo/promptfoo/blob/main/src/providers/openai.ts#L14-L32), such as `temperature`, `functions`, and `tools`, which can be used to customize the behavior of the model like so:

```yaml title=promptfooconfig.yaml
providers:
  - id: openai:gpt-3.5-turbo
    config:
      temperature: 0
      max_tokens: 1024
```

## Formatting chat messages

For information on setting up chat conversation, see [chat threads](/docs/configuration/chat).

## Configuring parameters

The `providers` list takes a `config` key that allows you to set parameters like `temperature`, `max_tokens`, and [others](https://platform.openai.com/docs/api-reference/chat/create#chat/create-temperature). For example:

```yaml
providers:
  - id: openai:gpt-3.5-turbo-0613
    config:
      temperature: 0
      max_tokens: 128
      apiKey: sk-abc123
```

Supported parameters include:

| Parameter           | Description                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `temperature`       | Controls the randomness of the AI's output. Higher values (close to 1) make the output more random, while lower values (close to 0) make it more deterministic. |
| `max_tokens`        | Controls the maximum length of the output in tokens.                                                                                                            |
| `top_p`             | Controls the nucleus sampling, a method that helps control the randomness of the AI's output.                                                                   |
| `frequency_penalty` | Applies a penalty to frequent tokens, making them less likely to appear in the output.                                                                          |
| `presence_penalty`  | Applies a penalty to new tokens (tokens that haven't appeared in the input), making them less likely to appear in the output.                                   |
| `best_of`           | Controls the number of alternative outputs to generate and select from.                                                                                         |
| `functions`         | Allows you to define custom functions. Each function should be an object with a `name`, optional `description`, and `parameters`.                               |
| `function_call`     | Controls whether the AI should call functions. Can be either 'none', 'auto', or an object with a `name` that specifies the function to call.                    |
| `tools`             | Allows you to define custom tools. See [OpenAI Tools documentation](https://platform.openai.com/docs/api-reference/chat/create#chat-create-tools)               |
| `tool_choice`       | Controls whether the AI should use a tool. See [OpenAI Tools documentation](https://platform.openai.com/docs/api-reference/chat/create#chat-create-tools)       |
| `stop`              | Defines a list of tokens that signal the end of the output.                                                                                                     |
| `stop`              | Defines a list of tokens that signal the end of the output.                                                                                                     |
| `response_format`   | Response format restrictions.                                                                                                                                   |
| `seed`              | Seed used for deterministic output. Defaults to 0                                                                                                               |
| `apiKey`            | Your OpenAI API key, equivalent to `OPENAI_API_KEY` environment variable                                                                                        |
| `apiKeyEnvar`       | An environment variable that contains the API key                                                                                                               |
| `apiHost`           | The hostname of the OpenAI API, please also read `OPENAI_API_HOST` below.                                                                                       |
| `apiBaseUrl`        | The base URL of the OpenAI API, please also read `OPENAI_BASE_URL` below.                                                                                       |
| `organization`      | Your OpenAI organization key.                                                                                                                                   |
| `headers`           | Additional headers to include in the request.                                                                                                                   |

Here are the type declarations of `config` parameters:

```typescript
interface OpenAiConfig {
  // Completion parameters
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  best_of?: number;
  functions?: {
    name: string;
    description?: string;
    parameters: any;
  }[];
  function_call?: 'none' | 'auto' | { name: string };
  tools?: {
    type: string;
    function: {
      name: string;
      description?: string;
      parameters: any;
    };
  }[];
  tool_choice?: 'none' | 'auto' | { type: 'function'; function?: { name: string } } | { type: 'file_search' };
  stop?: string[];
  response_format?: { type: string };
  seed?: number;

  // General OpenAI parameters
  apiKey?: string;
  apiKeyEnvar?: string;
  apiHost?: string;
  apiBaseUrl?: string;
  organization?: string;
  headers?: { [key: string]: string };
}
```

## Images / gpt-4-vision

You can include images in the prompt by using content blocks.

See [OpenAI vision example](https://github.com/typpo/promptfoo/tree/main/examples/openai-vision).

## Using tools and functions

OpenAI tools and functions are supported. See [OpenAI tools example](https://github.com/typpo/promptfoo/tree/main/examples/openai-tools-call) and [OpenAI functions example](https://github.com/typpo/promptfoo/tree/main/examples/openai-function-call).

### Using tools

To set `tools` on an OpenAI provider, use the provider's `config` key. Add your function definitions under this key.

```yaml
prompts: [prompt.txt]
providers:
  - id: openai:chat:gpt-3.5-turbo-0613
    // highlight-start
    config:
      tools: [
        {
        "type": "function",
          "function": {
            "name": "get_current_weather",
            "description": "Get the current weather in a given location",
            "parameters": {
              "type": "object",
                "properties": {
                  "location": {
                    "type": "string",
                      "description": "The city and state, e.g. San Francisco, CA"
                    },
                    "unit": {
                      "type": "string",
                      "enum": ["celsius", "fahrenheit"]
                    }
                  },
              "required": ["location"]
            }
          }
        }
      ]
      tool_choice: 'auto'
    // highlight-end

tests:
   - vars:
        city: Boston
     assert:
        - type: is-json
        - type: is-valid-openai-tools-call
        - type: javascript
          value: output[0].function.name === 'get_current_weather'
        - type: javascript
          value: JSON.parse(output[0].function.arguments).location === 'Boston, MA'

   - vars:
        city: New York
# ...
```

Sometimes OpenAI function calls don't match `tools` schemas. Use [`is-valid-openai-tools-call`](/docs/configuration/expected-outputs/#is-valid-openai-function-call) or [`is-valid-openai-tools-call`](/docs/configuration/expected-outputs/#is-valid-openai-tools-call) assertions to enforce an exact schema match between tools and the function definition.

To further test `tools` definitions, you can use the `javascript` assertion and/or `transform` directives. For example:

```yaml
tests:
  - vars:
      city: Boston
    assert:
      - type: is-json
      - type: is-valid-openai-tools-call
      - type: javascript
        value: output[0].function.name === 'get_current_weather'
      - type: javascript
        value: JSON.parse(output[0].function.arguments).location === 'Boston, MA'

  - vars:
      city: New York
      # transform returns only the 'name' property
    transform: output[0].function.name
    assert:
      - type: is-json
      - type: similar
        value: NYC
```

:::tip
Functions can use variables from test cases:

```js
{
  type: "function",
  function: {
    description: "Get temperature in {{city}}"
    // ...
  }
}
```

They can also include functions that dynamically reference vars:

```js
{
  type: "function",
  function: {
    name: "get_temperature",
    parameters: {
      type: "object",
        properties: {
          unit: {
            type: "string",
            // highlight-start
            enum: (vars) => vars.units,
            // highlight-end
          }
        },
    }
  }
}
```
:::

### Using functions

> `functions` and `function_call` is deprecated in favor of `tools` and `tool_choice`, see detail in [OpenAI API reference](https://platform.openai.com/docs/api-reference/chat/create#chat-create-function_call).

Use the `functions` config to define custom functions. Each function should be an object with a `name`, optional `description`, and `parameters`. For example:

```yaml
prompts: [prompt.txt]
providers:
  - id: openai:chat:gpt-3.5-turbo-0613
    // highlight-start
    config:
      functions:
        [
          {
            'name': 'get_current_weather',
            'description': 'Get the current weather in a given location',
            'parameters':
              {
                'type': 'object',
                'properties':
                  {
                    'location':
                      {
                        'type': 'string',
                        'description': 'The city and state, e.g. San Francisco, CA',
                      },
                    'unit': { 'type': 'string', 'enum': ['celsius', 'fahrenheit'] },
                  },
                'required': ['location'],
              },
          },
        ]
    // highlight-end
tests:
  - vars:
      city: Boston
    assert:
      // highlight-next-line
      - type: is-valid-openai-function-call
  - vars:
      city: New York
  # ...
```

Sometimes OpenAI function calls don't match `functions` schemas. Use [`is-valid-openai-function-call`](/docs/configuration/expected-outputs/#is-valid-openai-function-call) assertions to enforce an exact schema match between function calls and the function definition.

To further test function call definitions, you can use the `javascript` assertion and/or `transform` directives. For example:

```yaml
tests:
  - vars:
      city: Boston
    assert:
      - type: is-valid-openai-function-call
      - type: javascript
        value: output.name === 'get_current_weather'
      - type: javascript
        value: JSON.parse(output.arguments).location === 'Boston, MA'

  - vars:
      city: New York
    # transform returns only the 'name' property for this testcase
    transform: output.name
    assert:
      - type: is-json
      - type: similar
        value: NYC
```

### Loading tools/functions from a file

Instead of duplicating function definitions across multiple configurations, you can reference an external YAML (or JSON) file that contains your functions. This allows you to maintain a single source of truth for your functions, which is particularly useful if you have multiple versions or regular changes to definitions.

To load your functions from a file, specify the file path in your provider configuration like so:

```yaml
providers:
  - file://./path/to/provider_with_function.yaml
```

Here's an example of how your `provider_with_function.yaml` might look:

```yaml
id: openai:chat:gpt-3.5-turbo-0613
config:
  functions:
    - name: get_current_weather
      description: Get the current weather in a given location
      parameters:
        type: object
        properties:
          location:
            type: string
            description: The city and state, e.g. San Francisco, CA
          unit:
            type: string
            enum:
              - celsius
              - fahrenheit
            description: The unit in which to return the temperature
        required:
          - location
```

## Supported environment variables

These OpenAI-related environment variables are supported:

| Variable                         | Description                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OPENAI_TEMPERATURE`             | Temperature model parameter, defaults to 0.                                                                                                      |
| `OPENAI_MAX_TOKENS`              | Max_tokens model parameter, defaults to 1024.                                                                                                    |
| `OPENAI_API_HOST`                | The hostname to use (useful if you're using an API proxy). Takes priority over `OPENAI_BASE_URL`.                                                |
| `OPENAI_BASE_URL`                | The base URL (protocol + hostname + port) to use, this is a more general option than `OPENAI_API_HOST`.                                          |
| `OPENAI_API_KEY`                 | OpenAI API key.                                                                                                                                  |
| `OPENAI_ORGANIZATION`            | The OpenAI organization key to use.                                                                                                              |
| `PROMPTFOO_DELAY_MS`             | Number of milliseconds to delay between API calls. Useful if you are hitting OpenAI rate limits (defaults to 0).                                 |
| `PROMPTFOO_REQUEST_BACKOFF_MS`   | Base number of milliseconds to backoff and retry if a request fails (defaults to 5000).                                                          |

## Evaluating assistants

To test out an Assistant via OpenAI's Assistants API, first create an Assistant in the [API playground](https://platform.openai.com/playground).

Set functions, code interpreter, and files for retrieval as necessary.

Then, include the assistant in your config:

```yaml
prompts:
  - 'Write a tweet about {{topic}}'
providers:
  - openai:assistant:asst_fEhNN3MClMamLfKLkIaoIpgZ
tests:
  - vars:
      topic: bananas
  # ...
```

Code interpreter, function calls, and retrievals will be included in the output alongside chat messages. Note that the evaluator creates a new thread for each eval.

The following properties can be overwritten in provider config:

- `model` - OpenAI model to use
- `instructions` - System prompt
- `tools` - Enabled [tools](https://platform.openai.com/docs/api-reference/runs/createRun)
- `thread.messages` - A list of message objects that the thread is created with.
- `temperature` - Temperature for the model
- `toolChoice` - Controls whether the AI should use a tool

Here's an example of a more detailed config:

```yaml
prompts:
  - 'Write a tweet about {{topic}}'
providers:
  // highlight-start
  - id: openai:assistant:asst_fEhNN3MClMamLfKLkIaoIpgZ
    config:
      model: gpt-4-1106-preview
      instructions: "You always speak like a pirate"
      temperature: 0.2
      toolChoice:
        type: file_search
      tools:
        - type: code_interpreter
        - type: file_search
      thread:
        messages:
          - role: user
            content: "Hello world"
          - role: assistant
            content: "Greetings from the high seas"
  // highlight-end
tests:
  - vars:
      topic: bananas
  # ...
```

### Automatically handling function tool calls

You can specify JavaScript callbacks that are automatically called to create
the output of a function tool call.

This requires definining your config in a JavaScript file instead of YAML.

```js
module.exports = /** @type {import('promptfoo').TestSuiteConfig} */ ({
  prompts: 'Please add the following numbers together: {{a}} and {{b}}',
  providers: [
    {
      id: 'openai:assistant:asst_fEhNN3MClMamLfKLkIaoIpgZ',
      config:
        /** @type {InstanceType<import('promptfoo')["providers"]["OpenAiAssistantProvider"]>["config"]} */ ({
          model: 'gpt-4-1106-preview',
          instructions: 'You can add two numbers together using the `addNumbers` tool',
          tools: [
            {
              type: 'function',
              function: {
                name: 'addNumbers',
                description: 'Add two numbers together',
                parameters: {
                  type: 'object',
                  properties: {
                    a: { type: 'number' },
                    b: { type: 'number' },
                  },
                  required: ['a', 'b'],
                },
              },
            },
          ],
          /**
           * Map of function tool names to function callback.
           */
          functionToolCallbacks: {
            // this function should accept a string, and return a string
            // or a `Promise<string>`.
            addNumbers: (parametersJsonString) => {
              const { a, b } = JSON.parse(parametersJsonString);
              return JSON.stringify(a + b);
            },
          },
        }),
    },
  ],
  tests: [
    {
      vars: { a: 5, b: 6 },
    },
  ],
});
```

## Troubleshooting

### OpenAI rate limits

There are a few things you can do if you encounter OpenAI rate limits (most commonly with GPT-4):

1. **Reduce concurrency to 1** by setting `--max-concurrency 1` in the CLI, or by setting `evaluateOptions.maxConcurrency` in the config.
2. **Set a delay between requests** by setting `--delay 3000` (3000 ms) in the CLI,
   or by setting `evaluateOptions.delay` in the config,
   or with the environment variable `PROMPTFOO_DELAY_MS` (all values are in milliseconds).
3. **Adjust the exponential backoff for failed requests** by setting the environment variable `PROMPTFOO_REQUEST_BACKOFF_MS`. This defaults to 5000 milliseconds and retries exponential up to 4 times. You can increase this value if requests are still failing, but note that this can significantly increase end-to-end test time.

### OpenAI flakiness

To retry HTTP requests that are Internal Server errors, set the `PROMPTFOO_RETRY_5XX` environment variable to `1`.
