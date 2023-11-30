---
sidebar_position: 1
---

# OpenAI

To use the OpenAI API, set the `OPENAI_API_KEY` environment variable,
specify via `apiKey` field in the configuration file,
or pass the API key as an argument to the constructor.

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

The OpenAI provider supports a handful of [configuration options](https://github.com/promptfoo/promptfoo/blob/main/src/providers/openai.ts#L14-L32), such as `temperature` and `functions`, which can be used to customize the behavior of the model like so:

```yaml title=promptfooconfig.yaml
providers:
  - id: openai:gpt-3.5-turbo
    config:
      temperature: 0
      max_tokens: 1024
```

## Formatting chat messages

The [prompt file](/docs/configuration/parameters#prompt-files) supports a message in OpenAI's JSON prompt format. This allows you to set multiple messages including the system prompt. For example:

```json
[
  { "role": "system", "content": "You are a helpful assistant." },
  { "role": "user", "content": "Who won the world series in {{ year }}?" }
]
```

Equivalent yaml is also supported:

```yaml
- role: system
  content: You are a helpful assistant.
- role: user
  content: Who won the world series in {{ year }}?
```

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
| `stop`              | Defines a list of tokens that signal the end of the output.                                                                                                     |
| `stop`              | Defines a list of tokens that signal the end of the output.                                                                                                     |
| `response_format`   | Response format restrictions.                                                                                                                                   |
| `seed`              | Seed used for deterministic output. Defaults to 0                                                                                                               |
| `apiKey`            | Your OpenAI API key.                                                                                                                                            |
| `apiHost`           | The hostname of the OpenAI API, please also read `OPENAI_API_HOST` below.                                                                                       |
| `apiBaseUrl`        | The base URL of the OpenAI API, please also read `OPENAI_API_BASE_URL` below.                                                                                   |
| `organization`      | Your OpenAI organization key.                                                                                                                                   |

Here are the type declarations of `config` parameters:

```typescript
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
function_call?: 'none' | 'auto' | { name: string; };
stop?: string[];
response_format?: { type: string; };
seed?: number;

// General OpenAI parameters
apiKey?: string;
apiHost?: string;
apiBaseUrl?: string;
organization?: string;
```

## Chat conversations

The OpenAI provider supports full "multishot" chat conversations, including multiple assistant, user, and system prompts.

The most straightforward way to do this is by creating a list of `{role, content}` objects. Here's an example:

```yaml
prompts: [prompt.json]

providers: [openai:gpt-3.5-turbo]

tests:
  - vars:
      messages:
        - role: system
          content: Respond as a pirate
        - role: user
          content: Who founded Facebook?
        - role: assistant
          content: Mark Zuckerberg
        - role: user
          content: Did he found any other companies?
```

Then the prompt itself is just a JSON dump of `messages`:

```liquid title=prompt.json
{{ messages | dump }}
```

### Simplified chat markup

Alternatively, you may prefer to specify a list of `role: message`, like this:

```yaml
tests:
  - vars:
      messages:
        - user: Who founded Facebook?
        - assistant: Mark Zuckerberg
        - user: Did he found any other companies?
```

This simplifies the config, but we need to work some magic in the prompt template:

```liquid title=prompt.json
[
{% for message in messages %}
  {% set outer_loop = loop %}
  {% for role, content in message %}
  {
    "role": "{{ role }}",
    "content": "{{ content }}"
  }{% if not (loop.last and outer_loop.last) %},{% endif %}
  {% endfor %}
{% endfor %}
]
```

### Creating a conversation history fixture

Using nunjucks templates, we can combine multiple chat messages. Here's an example in which the previous conversation is a fixture for _all_ tests. Each case tests a different follow-up message:

```yaml
# Set up the conversation history
defaultTest:
  vars:
    messages:
      - user: Who founded Facebook?
      - assistant: Mark Zuckerberg
      - user: What's his favorite food?
      - assistant: Pizza

# Test multiple follow-ups
tests:
  - vars:
      question: Did he create any other companies?
  - vars:
      question: What is his role at Internet.org?
  - vars:
      question: Will he let me borrow $5?
```

In the prompt template, we construct the conversation history followed by a user message containing the `question`:

```liquid title=prompt.json
[
  {% for message in messages %}
    {% for role, content in message %}
      {
        "role": "{{ role }}",
        "content": "{{ content }}"
      },
    {% endfor %}
  {% endfor %}
  {
    "role": "user",
    "content": "{{ question }}"
  }
]
```

### Using the `_conversation` variable

A built-in `_conversation` variable contains the full prompt and previous turns of a conversation. Use it to reference previous outputs and test an ongoing chat conversation.

The `_conversation` variable has the following type signature:

```ts
type Completion = {
  prompt: string | object;
  input: string;
  output: string;
};

type Conversation = Completion[];
```

In most cases, you'll loop through the `_conversation` variable and use each `Completion` object.

Use `completion.prompt` to reference the previous conversation. For example, to get the number of messages in a chat-formatted prompt:

```
{{ completion.prompt.length }}
```

Or to get the first message in the conversation:

```
{{ completion.prompt[0] }}
```

Use `completion.input` as a shortcut to get the last user message. In a chat-formatted prompt, `input` is set to the last user message, equivalent to `completion.prompt[completion.prompt.length - 1].content`.

Here's an example test config. Note how each question assumes context from the previous output:

```yaml
tests:
  - vars:
      question: Who founded Facebook?
  - vars:
      question: Where does he live?
  - vars:
      question: Which state is that in?
```

Here is the corresponding prompt:

```json
[
  // highlight-start
  {% for completion in _conversation %}
    {
      "role": "user",
      "content": "{{ completion.input }}"
    },
    {
      "role": "assistant",
      "content": "{{ completion.output }}"
    },
  {% endfor %}
  // highlight-end
  {
    "role": "user",
    "content": "{{ question }}"
  }
]
```

The prompt inserts the previous conversation into the test case, creating a full turn-by-turn conversation:

![multiple turn conversation eval](https://github.com/promptfoo/promptfoo/assets/310310/70048ae5-34ce-46f0-bd28-42d3aa96f03e)

Try it yourself by using the [full example config](https://github.com/promptfoo/promptfoo/tree/main/examples/multiple-turn-conversation).

:::info
When the `_conversation` variable is present, the eval will run single-threaded (concurrency of 1).
:::

### Including JSON in prompt content

In some cases, you may want to send JSON _within_ the OpenAI `content` field. In order to do this, you must ensure that the JSON is properly escaped.

Here's an example that prompts OpenAI with a JSON object of the structure `{query: string, history: {reply: string}[]}`. It first constructs this JSON object as the `input` variable. Then, it includes `input` in the prompt with proper JSON escaping:

```json
{% set input %}
{
    "query": "{{ query }}",
    "history": [
      {% for completion in _conversation %}
        {"reply": "{{ completion.output }}"} {% if not loop.last %},{% endif %}
      {% endfor %}
    ]
}
{% endset %}

[{
  "role": "user",
  "content": {{ input | trim | dump }}
}]
```

Here's the associated config:

```yaml
prompts: [prompt.json]
providers: [openai:gpt-3.5-turbo-0613]
tests:
  - vars:
      query: how you doing
  - vars:
      query: need help with my passport
```

This has the effect of including the conversation history _within_ the prompt content. Here's what's sent to OpenAI for the second test case:

```json
[
  {
    "role": "user",
    "content": "{\n    \"query\": \"how you doing\",\n    \"history\": [\n      \n    ]\n}"
  }
]
```

## Using functions

OpenAI functions are supported. See [full example](https://github.com/typpo/promptfoo/tree/main/examples/openai-function-call).

To set functions on an OpenAI provider, use the provider's `config` key. Add your function definitions under this key.

```yaml
prompts: [prompt.txt]
providers:
  - openai:chat:gpt-3.5-turbo-0613:
      config:
        'functions':
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
tests:
  - vars:
      city: Boston
  - vars:
      city: New York
  # ...
```

## Supported environment variables

These OpenAI-related environment variables are supported:

| Variable                         | Description                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OPENAI_TEMPERATURE`             | Temperature model parameter, defaults to 0.                                                                                                      |
| `OPENAI_MAX_TOKENS`              | Max_tokens model parameter, defaults to 1024.                                                                                                    |
| `OPENAI_API_HOST`                | The hostname to use (useful if you're using an API proxy). Takes priority over `OPENAI_API_BASE_URL`.                                            |
| `OPENAI_API_BASE_URL`            | The base URL (protocol + hostname + port) to use, this is a more general option than `OPENAI_API_HOST`.                                          |
| `OPENAI_API_KEY`                 | OpenAI API key.                                                                                                                                  |
| `OPENAI_ORGANIZATION`            | The OpenAI organization key to use.                                                                                                              |
| `PROMPTFOO_REQUIRE_JSON_PROMPTS` | By default the chat completion provider will wrap non-JSON messages in a single user message. Setting this envar to true disables that behavior. |
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
      tools:
        - type: code_interpreter
        - type: retrieval
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

## Troubleshooting

### OpenAI rate limits

There are a few things you can do if you encounter OpenAI rate limits (most commonly with GPT-4):

1. **Reduce concurrency to 1** by setting `--max-concurrency 1` in the CLI, or by setting `evaluateOptions.maxConcurrency` in the config.
2. **Set a delay between requests** by setting `--delay 3000` (3000 ms) in the CLI,
   or by setting `evaluateOptions.delay` in the config,
   or with the environment variable `PROMPTFOO_DELAY_MS` (all values are in milliseconds).
3. **Adjust the exponential backoff for failed requests** by setting the environment variable `PROMPTFOO_REQUEST_BACKOFF_MS`. This defaults to 5000 milliseconds and retries exponential up to 4 times. You can increase this value if requests are still failing, but note that this can significantly increase end-to-end test time.
