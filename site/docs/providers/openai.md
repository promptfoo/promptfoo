---
sidebar_position: 1
---

# OpenAI

To use the OpenAI API, set the `OPENAI_API_KEY` environment variable, specify via `apiKey` field in the configuration file or pass the API key as an argument to the constructor.

Example:

```sh
export OPENAI_API_KEY=your_api_key_here
```

The OpenAI provider supports the following model formats:

- `openai:chat:<model name>` - uses any model name against the `/v1/chat/completions` endpoint
- `openai:responses:<model name>` - uses responses API models over HTTP connections
- `openai:assistant:<assistant id>` - use an assistant
- `openai:<model name>` - uses a specific model name (mapped automatically to chat or completion endpoint)
- `openai:chat` - defaults to `gpt-4.1-mini`
- `openai:chat:ft:gpt-4.1-mini:company-name:ID` - example of a fine-tuned chat completion model
- `openai:completion` - defaults to `text-davinci-003`
- `openai:completion:<model name>` - uses any model name against the `/v1/completions` endpoint
- `openai:embeddings:<model name>` - uses any model name against the `/v1/embeddings` endpoint
- `openai:realtime:<model name>` - uses realtime API models over WebSocket connections

The `openai:<endpoint>:<model name>` construction is useful if OpenAI releases a new model,
or if you have a custom model.
For example, if OpenAI releases `gpt-5` chat completion,
you could begin using it immediately with `openai:chat:gpt-5`.

The OpenAI provider supports a handful of [configuration options](https://github.com/promptfoo/promptfoo/blob/main/src/providers/openai.ts#L14-L32), such as `temperature`, `functions`, and `tools`, which can be used to customize the behavior of the model like so:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:gpt-4.1-mini
    config:
      temperature: 0
      max_tokens: 1024
```

> **Note:** OpenAI models can also be accessed through [Azure OpenAI](/docs/providers/azure/), which offers additional enterprise features, compliance options, and regional availability.

## Formatting chat messages

For information on setting up chat conversation, see [chat threads](/docs/configuration/chat).

## Configuring parameters

The `providers` list takes a `config` key that allows you to set parameters like `temperature`, `max_tokens`, and [others](https://platform.openai.com/docs/api-reference/chat/create#chat/create-temperature). For example:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:gpt-4.1-mini
    config:
      temperature: 0
      max_tokens: 128
      apiKey: sk-abc123
```

Supported parameters include:

| Parameter               | Description                                                                                                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiBaseUrl`            | The base URL of the OpenAI API, please also read `OPENAI_BASE_URL` below.                                                                                                                                                                                                                         |
| `apiHost`               | The hostname of the OpenAI API, please also read `OPENAI_API_HOST` below.                                                                                                                                                                                                                         |
| `apiKey`                | Your OpenAI API key, equivalent to `OPENAI_API_KEY` environment variable                                                                                                                                                                                                                          |
| `apiKeyEnvar`           | An environment variable that contains the API key                                                                                                                                                                                                                                                 |
| `best_of`               | Controls the number of alternative outputs to generate and select from.                                                                                                                                                                                                                           |
| `frequency_penalty`     | Applies a penalty to frequent tokens, making them less likely to appear in the output.                                                                                                                                                                                                            |
| `function_call`         | Controls whether the AI should call functions. Can be either 'none', 'auto', or an object with a `name` that specifies the function to call.                                                                                                                                                      |
| `functions`             | Allows you to define custom functions. Each function should be an object with a `name`, optional `description`, and `parameters`.                                                                                                                                                                 |
| `functionToolCallbacks` | A map of function tool names to function callbacks. Each callback should accept a string and return a string or a `Promise<string>`.                                                                                                                                                              |
| `headers`               | Additional headers to include in the request.                                                                                                                                                                                                                                                     |
| `max_tokens`            | Controls the maximum length of the output in tokens. Not valid for reasoning models (o1, o3, o3-pro, o3-mini, o4-mini).                                                                                                                                                                           |
| `metadata`              | Key-value pairs for request tagging and organization.                                                                                                                                                                                                                                             |
| `organization`          | Your OpenAI organization key.                                                                                                                                                                                                                                                                     |
| `passthrough`           | A flexible object that allows passing arbitrary parameters directly to the OpenAI API request body. Useful for experimental, new, or provider-specific parameters not yet explicitly supported in promptfoo. This parameter is merged into the final API request and can override other settings. |
| `presence_penalty`      | Applies a penalty to new tokens (tokens that haven't appeared in the input), making them less likely to appear in the output.                                                                                                                                                                     |
| `reasoning`             | Enhanced reasoning configuration for o-series models. Object with `effort` ('low', 'medium', 'high') and optional `summary` ('auto', 'concise', 'detailed') fields.                                                                                                                               |
| `response_format`       | Specifies the desired output format, including `json_object` and `json_schema`. Can also be specified in the prompt config. If specified in both, the prompt config takes precedence.                                                                                                             |
| `seed`                  | Seed used for deterministic output.                                                                                                                                                                                                                                                               |
| `stop`                  | Defines a list of tokens that signal the end of the output.                                                                                                                                                                                                                                       |
| `store`                 | Whether to store the conversation for future retrieval (boolean).                                                                                                                                                                                                                                 |
| `temperature`           | Controls the randomness of the AI's output. Higher values (close to 1) make the output more random, while lower values (close to 0) make it more deterministic.                                                                                                                                   |
| `tool_choice`           | Controls whether the AI should use a tool. See [OpenAI Tools documentation](https://platform.openai.com/docs/api-reference/chat/create#chat-create-tools)                                                                                                                                         |
| `tools`                 | Allows you to define custom tools. See [OpenAI Tools documentation](https://platform.openai.com/docs/api-reference/chat/create#chat-create-tools)                                                                                                                                                 |
| `top_p`                 | Controls the nucleus sampling, a method that helps control the randomness of the AI's output.                                                                                                                                                                                                     |
| `user`                  | A unique identifier representing your end-user, for tracking and abuse prevention.                                                                                                                                                                                                                |
| `max_completion_tokens` | Maximum number of tokens to generate for reasoning models (o1, o3, o3-pro, o3-mini, o4-mini).                                                                                                                                                                                                     |

Here are the type declarations of `config` parameters:

```typescript
interface OpenAiConfig {
  // Completion parameters
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  reasoning?: {
    effort?: 'low' | 'medium' | 'high' | null;
    summary?: 'auto' | 'concise' | 'detailed' | null;
  };
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  best_of?: number;
  functions?: OpenAiFunction[];
  function_call?: 'none' | 'auto' | { name: string };
  tools?: OpenAiTool[];
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function'; function?: { name: string } };
  response_format?: { type: 'json_object' | 'json_schema'; json_schema?: object };
  stop?: string[];
  seed?: number;
  user?: string;
  metadata?: Record<string, string>;
  store?: boolean;
  passthrough?: object;

  // Function tool callbacks
  functionToolCallbacks?: Record<
    OpenAI.FunctionDefinition['name'],
    (arg: string) => Promise<string>
  >;

  // General OpenAI parameters
  apiKey?: string;
  apiKeyEnvar?: string;
  apiHost?: string;
  apiBaseUrl?: string;
  organization?: string;
  headers?: { [key: string]: string };
}
```

## Models

### GPT-4.1

GPT-4.1 is OpenAI's flagship model for complex tasks with a 1,047,576 token context window and 32,768 max output tokens. Available in three variants with different price points:

| Model        | Description                                  | Input Price         | Output Price        |
| ------------ | -------------------------------------------- | ------------------- | ------------------- |
| GPT-4.1      | Flagship model for complex tasks             | $2.00 per 1M tokens | $8.00 per 1M tokens |
| GPT-4.1 Mini | More affordable, strong general capabilities | $0.40 per 1M tokens | $1.60 per 1M tokens |
| GPT-4.1 Nano | Most economical, good for high-volume tasks  | $0.10 per 1M tokens | $0.40 per 1M tokens |

All variants support text and image input with text output and have a May 31, 2024 knowledge cutoff.

#### Usage Examples

Standard model:

```yaml
providers:
  - id: openai:chat:gpt-4.1 # or openai:responses:gpt-4.1
    config:
      temperature: 0.7
```

More affordable variants:

```yaml
providers:
  - id: openai:chat:gpt-4.1-mini # or -nano variant
```

Specific snapshot versions are also available:

```yaml
providers:
  - id: openai:chat:gpt-4.1-2025-04-14 # Standard
  - id: openai:chat:gpt-4.1-mini-2025-04-14 # Mini
  - id: openai:chat:gpt-4.1-nano-2025-04-14 # Nano
```

### Reasoning Models (o1, o3, o3-pro, o3-mini, o4-mini)

Reasoning models, like `o1`, `o3`, `o3-pro`, `o3-mini`, and `o4-mini`, are large language models trained with reinforcement learning to perform complex reasoning. These models excel in complex problem-solving, coding, scientific reasoning, and multi-step planning for agentic workflows.

When using reasoning models, there are important differences in how tokens are handled:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:o1
    config:
      reasoning:
        effort: 'medium' # Can be "low", "medium", or "high"
      max_completion_tokens: 25000 # Can also be set via OPENAI_MAX_COMPLETION_TOKENS env var
```

Unlike standard models that use `max_tokens`, reasoning models use:

- `max_completion_tokens` to control the total tokens generated (both reasoning and visible output)
- `reasoning` to control how thoroughly the model thinks before responding (with `effort`: low, medium, high)

#### How Reasoning Models Work

Reasoning models "think before they answer," generating internal reasoning tokens that:

- Are not visible in the output
- Count towards token usage and billing
- Occupy space in the context window

Both `o1` and `o3-mini` models have a 128,000 token context window, while `o3-pro` and `o4-mini` have a 200,000 token context window. OpenAI recommends reserving at least 25,000 tokens for reasoning and outputs when starting with these models.

### GPT-4.5 Models (Preview)

GPT-4.5 is OpenAI's largest GPT model designed specifically for creative tasks and agentic planning, currently available in a research preview. It features a 128k token context length.

Models in this series include:

- `gpt-4.5-preview`
- `gpt-4.5-preview-2025-02-27`

You can specify the model name in the `providers` section:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:gpt-4.5-preview
    config:
      temperature: 0.7
```

## Images

### Sending images in prompts

You can include images in the prompt by using content blocks. For example, here's an example config:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - file://prompt.json

providers:
  - openai:gpt-4.1

tests:
  - vars:
      question: 'What do you see?'
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg'
  # ...
```

And an example `prompt.json`:

```json title="prompt.json"
[
  {
    "role": "user",
    "content": [
      {
        "type": "text",
        "text": "{{question}}"
      },
      {
        "type": "image_url",
        "image_url": {
          "url": "{{url}}"
        }
      }
    ]
  }
]
```

See the [OpenAI vision example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-vision).

### Generating images

OpenAI supports Dall-E generations via `openai:image:dall-e-3`. See the [OpenAI Dall-E example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-dalle-images).

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'In the style of Van Gogh: {{subject}}'
  - 'In the style of Dali: {{subject}}'

providers:
  - openai:image:dall-e-3

tests:
  - vars:
      subject: bananas
  - vars:
      subject: new york city
```

To display images in the web viewer, wrap vars or outputs in markdown image tags like so:

```markdown
![](/path/to/myimage.png)
```

Then, enable 'Render markdown' under Table Settings.

## Using tools and functions

OpenAI tools and functions are supported. See [OpenAI tools example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-tools-call) and [OpenAI functions example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-function-call).

### Using tools

To set `tools` on an OpenAI provider, use the provider's `config` key. The model may return tool calls in two formats:

1. An array of tool calls: `[{type: 'function', function: {...}}]`
2. A message with tool calls: `{content: '...', tool_calls: [{type: 'function', function: {...}}]}`

Tools can be defined inline or loaded from an external file:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - file://prompt.txt
providers:
  - id: openai:chat:gpt-4.1-mini
    // highlight-start
    config:
      # Load tools from external file
      tools: file://./weather_tools.yaml
      # Or define inline
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

Sometimes OpenAI function calls don't match `tools` schemas. Use [`is-valid-openai-tools-call`](/docs/configuration/expected-outputs/deterministic/#is-valid-openai-function-call) or [`is-valid-openai-tools-call`](/docs/configuration/expected-outputs/deterministic/#is-valid-openai-tools-call) assertions to enforce an exact schema match between tools and the function definition.

To further test `tools` definitions, you can use the `javascript` assertion and/or `transform` directives. For example:

```yaml title="promptfooconfig.yaml"
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

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - file://prompt.txt
providers:
  - id: openai:chat:gpt-4.1-mini
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

Sometimes OpenAI function calls don't match `functions` schemas. Use [`is-valid-openai-function-call`](/docs/configuration/expected-outputs/deterministic#is-valid-openai-function-call) assertions to enforce an exact schema match between function calls and the function definition.

To further test function call definitions, you can use the `javascript` assertion and/or `transform` directives. For example:

```yaml title="promptfooconfig.yaml"
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
    # transform returns only the 'name' property for this test case
    transform: output.name
    assert:
      - type: is-json
      - type: similar
        value: NYC
```

### Loading tools/functions from a file

Instead of duplicating function definitions across multiple configurations, you can reference an external YAML (or JSON) file that contains your functions. This allows you to maintain a single source of truth for your functions, which is particularly useful if you have multiple versions or regular changes to definitions.

To load your functions from a file, specify the file path in your provider configuration like so:

```yaml title="promptfooconfig.yaml"
providers:
  - file://./path/to/provider_with_function.yaml
```

You can also use a pattern to load multiple files:

```yaml title="promptfooconfig.yaml"
providers:
  - file://./path/to/provider_*.yaml
```

Here's an example of how your `provider_with_function.yaml` might look:

```yaml title="provider_with_function.yaml"
id: openai:chat:gpt-4.1-mini
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

## Using `response_format`

Promptfoo supports the `response_format` parameter, which allows you to specify the expected output format.

`response_format` can be included in the provider config, or in the prompt config.

#### Prompt config example

```yaml title="promptfooconfig.yaml"
prompts:
  - label: 'Prompt #1'
    raw: 'You are a helpful math tutor. Solve {{problem}}'
    config:
      response_format:
        type: json_schema
        json_schema: ...
```

#### Provider config example

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:chat:gpt-4.1-mini
    config:
      response_format:
        type: json_schema
        json_schema: ...
```

#### External file references

To make it easier to manage large JSON schemas, external file references are supported for `response_format` in both Chat and Responses APIs. This is particularly useful for:

- Reusing complex JSON schemas across multiple configurations
- Managing large schemas in separate files for better organization
- Version controlling schemas independently from configuration files

```yaml
config:
  response_format: file://./path/to/response_format.json
```

The external file should contain the complete `response_format` configuration object:

```json title="response_format.json"
{
  "type": "json_schema",
  "name": "event_extraction",
  "schema": {
    "type": "object",
    "properties": {
      "event_name": { "type": "string" },
      "date": { "type": "string" },
      "location": { "type": "string" }
    },
    "required": ["event_name", "date", "location"],
    "additionalProperties": false
  }
}
```

For a complete example with the Chat API, see the [OpenAI Structured Output example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-structured-output) or initialize it with:

```bash
npx promptfoo@latest init --example openai-structured-output
```

For an example with the Responses API, see the [OpenAI Responses API example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-responses) and run:

```bash
npx promptfoo@latest init --example openai-responses
cd openai-responses
npx promptfoo@latest eval -c promptfooconfig.external-format.yaml
```

## Supported environment variables

These OpenAI-related environment variables are supported:

| Variable                       | Description                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_TEMPERATURE`           | Temperature model parameter, defaults to 0. Not supported by reasoning models.                                                                              |
| `OPENAI_MAX_TOKENS`            | Max_tokens model parameter, defaults to 1024. Not supported by reasoning models.                                                                            |
| `OPENAI_MAX_COMPLETION_TOKENS` | Max_completion_tokens model parameter, defaults to 1024. Used by reasoning models.                                                                          |
| `OPENAI_REASONING_EFFORT`      | Reasoning effort parameter for reasoning models, defaults to "medium". Options are "low", "medium", or "high". Maps to `reasoning.effort` config parameter. |
| `OPENAI_API_HOST`              | The hostname to use (useful if you're using an API proxy). Takes priority over `OPENAI_BASE_URL`.                                                           |
| `OPENAI_BASE_URL`              | The base URL (protocol + hostname + port) to use, this is a more general option than `OPENAI_API_HOST`.                                                     |
| `OPENAI_API_KEY`               | OpenAI API key.                                                                                                                                             |
| `OPENAI_ORGANIZATION`          | The OpenAI organization key to use.                                                                                                                         |
| `PROMPTFOO_DELAY_MS`           | Number of milliseconds to delay between API calls. Useful if you are hitting OpenAI rate limits (defaults to 0).                                            |
| `PROMPTFOO_REQUEST_BACKOFF_MS` | Base number of milliseconds to backoff and retry if a request fails (defaults to 5000).                                                                     |

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
- `tool_resources` - Tool resources to include in the thread - see [Assistant v2 tool resources](https://platform.openai.com/docs/assistants/migration)
- `attachments` - File attachments to include in messages - see [Assistant v2 attachments](https://platform.openai.com/docs/assistants/migration)

Here's an example of a more detailed config:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'Write a tweet about {{topic}}'
providers:
  // highlight-start
  - id: openai:assistant:asst_fEhNN3MClMamLfKLkIaoIpgZ
    config:
      model: gpt-4.1
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

This requires defining your config in a JavaScript file instead of YAML.

```js
module.exports = /** @type {import('promptfoo').TestSuiteConfig} */ ({
  prompts: 'Please add the following numbers together: {{a}} and {{b}}',
  providers: [
    {
      id: 'openai:assistant:asst_fEhNN3MClMamLfKLkIaoIpgZ',
      config:
        /** @type {InstanceType<import('promptfoo')["providers"]["OpenAiAssistantProvider"]>["config"]} */ ({
          model: 'gpt-4.1',
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

## Audio capabilities

OpenAI models with audio support (like `gpt-4o-audio-preview` and `gpt-4o-mini-audio-preview`) can process audio inputs and generate audio outputs. This enables testing speech-to-text, text-to-speech, and speech-to-speech capabilities.

### Using audio inputs

You can include audio files in your prompts using the following format:

```json title="audio-input.json"
[
  {
    "role": "user",
    "content": [
      {
        "type": "text",
        "text": "You are a helpful customer support agent. Listen to the customer's request and respond with a helpful answer."
      },
      {
        "type": "input_audio",
        "input_audio": {
          "data": "{{audio_file}}",
          "format": "mp3"
        }
      }
    ]
  }
]
```

With a corresponding configuration:

```yaml title="promptfooconfig.yaml"
prompts:
  - id: file://audio-input.json
    label: Audio Input

providers:
  - id: openai:chat:gpt-4o-audio-preview
    config:
      modalities: ['text'] # also supports 'audio'

tests:
  - vars:
      audio_file: file://assets/transcript1.mp3
    assert:
      - type: llm-rubric
        value: Resolved the customer's issue
```

Supported audio file formats include WAV, MP3, OGG, AAC, M4A, and FLAC.

### Audio configuration options

The audio configuration supports these parameters:

| Parameter | Description                    | Default | Options                                 |
| --------- | ------------------------------ | ------- | --------------------------------------- |
| `voice`   | Voice for audio generation     | alloy   | alloy, echo, fable, onyx, nova, shimmer |
| `format`  | Audio format to generate       | wav     | wav, mp3, opus, aac                     |
| `speed`   | Speaking speed multiplier      | 1.0     | Any number between 0.25 and 4.0         |
| `bitrate` | Bitrate for compressed formats | -       | e.g., "128k", "256k"                    |

In the web UI, audio outputs display with an embedded player and transcript. For a complete working example, see the [OpenAI audio example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-audio) or initialize it with:

```bash
npx promptfoo@latest init --example openai-audio
```

## Realtime API Models

The Realtime API allows for real-time communication with GPT-4o class models using WebSockets, supporting both text and audio inputs/outputs with streaming responses.

### Supported Realtime Models

- `gpt-4o-realtime-preview-2024-12-17`
- `gpt-4.1-mini-realtime-preview-2024-12-17`

### Using Realtime API

To use the OpenAI Realtime API, use the provider format `openai:realtime:<model name>`:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:realtime:gpt-4o-realtime-preview-2024-12-17
    config:
      modalities: ['text', 'audio']
      voice: 'alloy'
      instructions: 'You are a helpful assistant.'
      temperature: 0.7
      websocketTimeout: 60000 # 60 seconds
```

### Realtime-specific Configuration Options

The Realtime API configuration supports these parameters in addition to standard OpenAI parameters:

| Parameter                    | Description                                         | Default                | Options                                 |
| ---------------------------- | --------------------------------------------------- | ---------------------- | --------------------------------------- |
| `modalities`                 | Types of content the model can process and generate | ['text', 'audio']      | 'text', 'audio'                         |
| `voice`                      | Voice for audio generation                          | 'alloy'                | alloy, echo, fable, onyx, nova, shimmer |
| `instructions`               | System instructions for the model                   | 'You are a helpful...' | Any text string                         |
| `input_audio_format`         | Format of audio input                               | 'pcm16'                | 'pcm16', 'g711_ulaw', 'g711_alaw'       |
| `output_audio_format`        | Format of audio output                              | 'pcm16'                | 'pcm16', 'g711_ulaw', 'g711_alaw'       |
| `websocketTimeout`           | Timeout for WebSocket connection (milliseconds)     | 30000                  | Any number                              |
| `max_response_output_tokens` | Maximum tokens in model response                    | 'inf'                  | Number or 'inf'                         |
| `tools`                      | Array of tool definitions for function calling      | []                     | Array of tool objects                   |
| `tool_choice`                | Controls how tools are selected                     | 'auto'                 | 'none', 'auto', 'required', or object   |

### Function Calling with Realtime API

The Realtime API supports function calling via tools, similar to the Chat API. Here's an example configuration:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:realtime:gpt-4o-realtime-preview-2024-12-17
    config:
      tools:
        - type: function
          name: get_weather
          description: Get the current weather for a location
          parameters:
            type: object
            properties:
              location:
                type: string
                description: The city and state, e.g. San Francisco, CA
            required: ['location']
      tool_choice: 'auto'
```

### Complete Example

For a complete working example that demonstrates the Realtime API capabilities, see the [OpenAI Realtime API example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-realtime) or initialize it with:

```bash
npx promptfoo@latest init --example openai-realtime
```

This example includes:

- Basic single-turn interactions with the Realtime API
- Multi-turn conversations with persistent context
- Conversation threading with separate conversation IDs
- JavaScript prompt function for properly formatting messages
- Function calling with the Realtime API
- Detailed documentation on handling content types correctly

### Input and Message Format

When using the Realtime API with promptfoo, you can specify the prompt in JSON format:

```json title="realtime-input.json"
[
  {
    "role": "user",
    "content": [
      {
        "type": "text",
        "text": "{{question}}"
      }
    ]
  }
]
```

The Realtime API supports the same multimedia formats as the Chat API, allowing you to include images and audio in your prompts.

### Multi-Turn Conversations

The Realtime API supports multi-turn conversations with persistent context. For implementation details and examples, see the [OpenAI Realtime example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-realtime), which demonstrates both single-turn interactions and conversation threading using the `conversationId` metadata property.

> **Important**: When implementing multi-turn conversations, use `type: "input_text"` for user inputs and `type: "text"` for assistant responses.

## Responses API

OpenAI's Responses API is the most advanced interface for generating model responses, supporting text and image inputs, function calling, and conversation state. It provides access to OpenAI's full suite of features including reasoning models like o1, o3, and o4 series.

### Supported Responses Models

The Responses API supports a wide range of models, including:

- `gpt-4.1` - OpenAI's most capable vision model
- `o1` - Powerful reasoning model
- `o1-mini` - Smaller, more affordable reasoning model
- `o1-pro` - Enhanced reasoning model with more compute
- `o3-pro` - Highest-tier reasoning model
- `o3` - OpenAI's most powerful reasoning model
- `o3-mini` - Smaller, more affordable reasoning model
- `o4-mini` - Latest fast, cost-effective reasoning model
- `codex-mini-latest` - Fast reasoning model optimized for the Codex CLI

### Using the Responses API

To use the OpenAI Responses API, use the provider format `openai:responses:<model name>`:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:gpt-4.1
    config:
      temperature: 0.7
      max_output_tokens: 500
      instructions: 'You are a helpful, creative AI assistant.'
```

### Responses-specific Configuration Options

The Responses API configuration supports these parameters in addition to standard OpenAI parameters:

| Parameter              | Description                                       | Default    | Options                             |
| ---------------------- | ------------------------------------------------- | ---------- | ----------------------------------- |
| `instructions`         | System instructions for the model                 | None       | Any text string                     |
| `max_output_tokens`    | Maximum tokens to generate in the response        | 1024       | Any number                          |
| `metadata`             | Key-value pairs attached to the model response    | None       | Map of string keys to string values |
| `parallel_tool_calls`  | Allow model to run tool calls in parallel         | true       | Boolean                             |
| `previous_response_id` | ID of a previous response for multi-turn context  | None       | String                              |
| `store`                | Whether to store the response for later retrieval | true       | Boolean                             |
| `truncation`           | Strategy to handle context window overflow        | 'disabled' | 'auto', 'disabled'                  |
| `reasoning`            | Configuration for reasoning models                | None       | Object with `effort` field          |

### MCP (Model Context Protocol) Support

The Responses API supports OpenAI's MCP integration, allowing models to use remote MCP servers to perform tasks. MCP tools enable access to external services and APIs through a standardized protocol.

#### Basic MCP Configuration

To use MCP tools with the Responses API, add them to the `tools` array:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:gpt-4.1-2025-04-14
    config:
      tools:
        - type: mcp
          server_label: deepwiki
          server_url: https://mcp.deepwiki.com/mcp
          require_approval: never
```

#### MCP Tool Configuration Options

| Parameter          | Description                             | Required | Options                                  |
| ------------------ | --------------------------------------- | -------- | ---------------------------------------- |
| `type`             | Tool type (must be 'mcp')               | Yes      | 'mcp'                                    |
| `server_label`     | Label to identify the MCP server        | Yes      | Any string                               |
| `server_url`       | URL of the remote MCP server            | Yes      | Valid URL                                |
| `require_approval` | Approval settings for tool calls        | No       | 'never' or object with approval settings |
| `allowed_tools`    | Specific tools to allow from the server | No       | Array of tool names                      |
| `headers`          | Custom headers for authentication       | No       | Object with header key-value pairs       |

#### Authentication with MCP Servers

Most MCP servers require authentication. Use the `headers` parameter to provide API keys or tokens:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:gpt-4.1-2025-04-14
    config:
      tools:
        - type: mcp
          server_label: stripe
          server_url: https://mcp.stripe.com
          headers:
            Authorization: 'Bearer sk-test_...'
          require_approval: never
```

#### Filtering MCP Tools

To limit which tools are available from an MCP server, use the `allowed_tools` parameter:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:gpt-4.1-2025-04-14
    config:
      tools:
        - type: mcp
          server_label: deepwiki
          server_url: https://mcp.deepwiki.com/mcp
          allowed_tools: ['ask_question']
          require_approval: never
```

#### Approval Settings

By default, OpenAI requires approval before sharing data with MCP servers. You can configure approval settings:

```yaml title="promptfooconfig.yaml"
# Never require approval for all tools
providers:
  - id: openai:responses:gpt-4.1-2025-04-14
    config:
      tools:
        - type: mcp
          server_label: deepwiki
          server_url: https://mcp.deepwiki.com/mcp
          require_approval: never

# Never require approval for specific tools only
providers:
  - id: openai:responses:gpt-4.1-2025-04-14
    config:
      tools:
        - type: mcp
          server_label: deepwiki
          server_url: https://mcp.deepwiki.com/mcp
          require_approval:
            never:
              tool_names: ["ask_question", "read_wiki_structure"]
```

#### Complete MCP Example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'What are the transport protocols supported in the MCP specification for {{repo}}?'

providers:
  - id: openai:responses:gpt-4.1-2025-04-14
    config:
      tools:
        - type: mcp
          server_label: deepwiki
          server_url: https://mcp.deepwiki.com/mcp
          require_approval: never
          allowed_tools: ['ask_question']

tests:
  - vars:
      repo: modelcontextprotocol/modelcontextprotocol
    assert:
      - type: contains
        value: 'transport protocols'
```

For a complete working example, see the [OpenAI MCP example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-mcp) or initialize it with:

```bash
npx promptfoo@latest init --example openai-mcp
```

### Reasoning Models

When using reasoning models like `o1`, `o1-pro`, `o3`, `o3-pro`, `o3-mini`, or `o4-mini`, you can control the reasoning effort:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:o3
    config:
      reasoning:
        effort: 'medium' # Can be "low", "medium", or "high"
      max_output_tokens: 1000
```

Reasoning models "think before they answer," generating internal reasoning that isn't visible in the output but counts toward token usage and billing.

### o3 and o4-mini Models

OpenAI offers advanced reasoning models in the o-series:

#### o3 and o4-mini

These reasoning models provide different performance and efficiency profiles:

- **o3**: Powerful reasoning model, optimized for complex mathematical, scientific, and coding tasks
- **o4-mini**: Efficient reasoning model with strong performance in coding and visual tasks at lower cost

Both models feature:

- Large context window (200,000 tokens)
- High maximum output tokens (100,000 tokens)

For current specifications and pricing information, refer to [OpenAI's pricing page](https://openai.com/pricing).

Example configuration:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:o3
    config:
      reasoning:
        effort: 'high'
      max_output_tokens: 2000

  - id: openai:responses:o4-mini
    config:
      reasoning:
        effort: 'medium'
      max_output_tokens: 1000
```

### Sending Images in Prompts

The Responses API supports structured prompts with text and image inputs. Example:

```json title="prompt.json"
[
  {
    "type": "message",
    "role": "user",
    "content": [
      {
        "type": "input_text",
        "text": "Describe what you see in this image about {{topic}}."
      },
      {
        "type": "image_url",
        "image_url": {
          "url": "{{image_url}}"
        }
      }
    ]
  }
]
```

### Function Calling

The Responses API supports tool and function calling, similar to the Chat API:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:responses:gpt-4.1
    config:
      tools:
        - type: function
          function:
            name: get_weather
            description: Get the current weather for a location
            parameters:
              type: object
              properties:
                location:
                  type: string
                  description: The city and state, e.g. San Francisco, CA
              required: ['location']
      tool_choice: 'auto'
```

### Complete Example

For a complete working example, see the [OpenAI Responses API example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-responses) or initialize it with:

```bash
npx promptfoo@latest init --example openai-responses
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

## Agents SDK Integration

Promptfoo supports evaluation of OpenAI's Agents SDK, which enables building multi-agent systems with specialized agents, handoffs, and persistent context. You can integrate the Agents SDK as a [Python provider](./python.md).

```yaml title="promptfooconfig.yaml"
providers:
  - file://agent_provider.py:call_api
```

For a complete working example of an airline customer service system with multiple agents, see the [OpenAI Agents SDK example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-agents) or initialize it with:

```bash
npx promptfoo@latest init --example openai-agents
```
