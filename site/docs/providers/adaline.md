# Adaline Gateway

Adaline Gateway is a fully local production-grade Super SDK that provides a simple, unified, and powerful interface for calling more than 200+ LLMs.

- Adaline Gateway runs locally within Promptfoo, it is not a proxy.
- Adaline Gateway uses custom types for config/parameters, prompts, tools that will work across LLMs. This allows users to set up their Promptfoo config prompts, tests, assertions just once and have them work flawlessly across providers.

Read more about Adaline Gateway: https://github.com/adaline/gateway

## Installation

All Adaline Gateway packages are peer dependencies. You need to install them separately:

```bash
npm install @adaline/anthropic@latest @adaline/azure@latest @adaline/gateway@latest @adaline/google@latest @adaline/groq@latest @adaline/open-router@latest @adaline/openai@latest @adaline/provider@latest @adaline/together-ai@latest @adaline/types@latest @adaline/vertex@latest
```

The packages are loaded dynamically at runtime, so they will only be imported when you actually use a specific provider. This means that if you only use OpenAI, only the OpenAI-related packages will be loaded.

## Provider format

The Adaline Gateway provider (aka adaline) can be used within Promptfoo config using the following format:

```
adaline:<provider_name>:<model_type>:<model_name>
```

`provider_name` can be any of the following with these model types supported

| provider_name | chat models | embedding models |
| ------------- | ----------- | ---------------- |
| openai        | ✅          | ✅               |
| anthropic     | ✅          | ❌               |
| google        | ✅          | ❌               |
| vertex        | ✅          | ✅               |
| azureopenai   | ✅          | ✅               |
| groq          | ✅          | ❌               |
| togetherai    | ✅          | ❌               |
| openrouter    | ✅          | ❌               |
| voyage        | ❌          | ✅               |

`model_type` can be any of the following:

- `chat`
- `embedding`

Note: In case of `azureopenai` the `<model_name>` is the name of your Azure OpenAI model deployment. You specify your Azure resource name using `apiHost` in `config`, check Azure examples.

Examples:

- `adaline:openai:chat:gpt-4o-mini`
- `adaline:azureopenai:chat:my-gpt-4o-deployment`
- `adaline:google:chat:gemini-1.5-flash`
- `adaline:togetherai:chat:meta-llama/Meta-Llama-3-8B-Instruct-Turbo`
- `adaline:openai:embedding:text-embedding-3-large`
- `adaline:voyage:embedding:voyage-3`
- `adaline:vertex:embedding:text-embedding-004`

## Compatibility with Promptfoo's OpenAI provider

Apart from being able to use Adaline Gateway's types, the adaline provider also supports prompts, tools, config / parameters in OpenAI types. If OpenAI types are used in your config file, then expect the response in OpenAI types for the output object when writing tests and assertions, especially for tool calls (see in example section). These configs should still work flawlessly across adaline supported providers and models.

## Env variables

adaline provider uses API keys set using standard Promptfoo env variables such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, etc. The API key can also be set from within the config, example:

```yaml title=promptfooconfig.yaml
providers:
  - id: adaline:openai:chat:gpt-4o-mini
    config:
      apiKey: sk-random-openai-api-key
```

Env variables for each of the Promptfoo supported providers are supported by adaline provider as well -- such as `OPENAI_ORGANIZATION`, `OPENAI_TEMPERATURE`, `ANTHROPIC_BASE_URL`, etc. Please check each provider's individual documentation for an exhaustive list of env variables.

## Configuring parameters

LLM parameters can be set in `config`, example:

```yaml title=promptfooconfig.yaml
providers:
  - id: adaline:openai:chat:gpt-4o-mini
    config:
      temperature: 0.8
      maxTokens: 300
      seed: 64209
```

Complete list of supported parameters:

| Parameter           | Description                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiBaseUrl`        | Set a custom base URL for the request                                                                                                                     |
| `apiHost`           | Set a custom host to be used in URL for the request                                                                                                       |
| `apiKey`            | Set the API Key for model                                                                                                                                 |
| `apiKeyEnvar`       | An environment variable that contains the API key                                                                                                         |
| `headers`           | Additional headers to include in the request                                                                                                              |
| `organization`      | Your OpenAI organization key (only used in OpenAI requests)                                                                                               |
| `presencePenalty`   | Applies a penalty to new tokens (tokens that haven't appeared in the input), making them less likely to appear in the output                              |
| `frequencyPenalty`  | Applies a penalty to frequent tokens, making them less likely to appear in the output                                                                     |
| `repetitionPenalty` | Used to discourage the repetition of tokens in generated text                                                                                             |
| `temperature`       | Controls the randomness of the output. Higher values (close to 1) make the output more random, while lower values (close to 0) make it more deterministic |
| `maxTokens`         | Controls the maximum length of the output in tokens                                                                                                       |
| `topP`              | Sorts the tokens and selects the smallest subset whose cumulative probability adds up to the value of Top P                                               |
| `minP`              | The counterpart to top P, this is the minimum probability for a token to be considered, relative to the probability of the most likely token              |
| `topK`              | Restricts word selection during text generation to the top K most probable words                                                                          |
| `seed`              | Seed used for deterministic output                                                                                                                        |
| `stop`              | Defines a list of tokens that signal the end of the output                                                                                                |
| `logProbs`          | Flag to specify the model to return log probabilities along with the generated text                                                                       |
| `toolChoice`        | Controls whether the model should use a tool, not use a tool, or a specific tool                                                                          |
| `tools`             | Specify custom tools for model to respond with                                                                                                            |
| `responseFormat`    | Controls the response format of the generated text, can be `text`, `json_object`, `json_schema`                                                           |
| `responseSchema`    | Specifies the schema of generated text when `responseFormat` is set to `json_schema`                                                                      |
| `safetySettings`    | Specifies safety thresholds in various categories (only used with Google, Vertex: https://ai.google.dev/gemini-api/docs/safety-settings)                  |

Here are the type declarations of `config` parameters:

```typescript
type GatewayChatOptions = {
  apiKey?: string;
  apiKeyEnvar?: string;
  apiHost?: string;
  apiBaseUrl?: string;
  cost?: number;
  headers?: { [key: string]: string };
  // OpenAI specific options
  organization?: string;
  // Azure specific options
  azureClientId?: string;
  azureClientSecret?: string;
  azureTenantId?: string;
  azureAuthorityHost?: string;
  azureTokenScope?: string;

  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  repetitionPenalty?: number;
  stop?: string[];
  seed?: number;
  logProbs?: boolean;
  toolChoice?: string;
  tools?: GatewayToolType[];
  responseFormat?: 'text' | 'json_object' | 'json_schema';
  responseSchema?: GatewayResponseSchemaType;
  // Google specific options
  safetySettings?: { category: string; threshold: string }[];
};
```

## Adaline Gateway types

Here is an example of prompt messages used by adaline:

```typescript
[
  {
    role: 'system',
    content: [
      {
        modality: 'text',
        value: 'You are a helpful assistant. You are extremely concise.',
      },
    ],
  },
  {
    role: 'user',
    content: [
      {
        modality: 'text',
        value: 'What is 34 + 43?',
      },
    ],
  },
  {
    role: 'assistant',
    content: [
      {
        modality: 'text',
        value: `77`,
      },
    ],
  },
  {
    role: 'user',
    content: [
      {
        modality: 'image',
        detail: 'auto',
        value: {
          type: 'url',
          url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg',
        },
      },
    ],
  },
];
```

Here is an example of `tools` used by adaline:

```typescript
[
  {
    type: 'function',
    definition: {
      schema: {
        name: 'get_weather_from_location',
        description: 'Get the current weather of a location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'location to get weather of',
            },
          },
          required: ['location'],
        },
      },
    },
  },
  {
    type: 'function',
    definition: {
      schema: {
        name: 'get_current_wind_speed',
        description: 'Get the current wind speed for a given location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'location to get wind speed of',
            },
          },
          required: ['location'],
        },
      },
    },
  },
];
```

The `schema` property supports OpenAI's `tools.function` type, reference: https://platform.openai.com/docs/api-reference/chat/create#chat-create-tools

Here is an example of a model response involving tool call:

```typescript
[
  {
    role: 'assistant',
    content: [
      {
        modality: 'tool-call',
        index: 0,
        id: 'chatcmp-tool-98ncfwe982f3k8wef',
        name: 'get_weather_from_location',
        arguments: '{"location" : "Boston, MA"}',
      },
    ],
  },
];
```

## Examples

### Chat history

`promptfooconfig.yaml`

```yaml
prompts:
  - file://prompt.json
providers:
  - id: adaline:anthropic:chat:claude-3-5-sonnet-20240620
    config:
      maxTokens: 120

defaultTest:
  vars:
    system_message: file://system_message.txt
    previous_messages:
      - user: Who founded Facebook?
      - assistant: Mark Zuckerberg
      - user: What's his favorite food?
      - assistant: Pizza

tests:
  - vars:
      question: What is his role at Internet.org?
  - vars:
      question: Did he create any other companies?
  - vars:
      question: Will he let me borrow $5?
```

`prompt.json`

```json
[
  {
    "role": "system",
    "content": [
      {
        "modality": "text",
        "value": {{ system_message | dump }}
      }
    ]
  },
  {% for message in previous_messages %}
    {% for role, content in message %}
      {
        "role": "{{ role }}",
        "content": [
          {
            "modality": "text",
            "value": {{ content | dump }}
          }
        ]
      },
    {% endfor %}
  {% endfor %}
  {
    "role": "user",
    "content": [
      {
        "modality": "text",
        "value": {{ question | dump }}
      }
    ]
  }
]

```

`system_message.txt`

```txt
Answer very concisely.

Always talk like an angry pirate.
```

### Tool call

`promptfooconfig.yaml`

```yaml
prompts:
  - 'What is the weather like in {{city}}?'

providers:
  - id: adaline:openai:chat:gpt-4o-mini
    config:
      tools:
        [
          {
            type: 'function',
            definition:
              {
                schema:
                  {
                    name: 'get_weather_from_location',
                    description: 'Get the current weather of a location',
                    parameters:
                      {
                        type: 'object',
                        properties:
                          {
                            location: { type: 'string', description: 'location to get weather of' },
                          },
                        required: ['location'],
                      },
                  },
              },
          },
        ]

tests:
  - vars:
      city: Boston
    assert:
      - type: is-json
      - type: javascript
        value: output[0].name === 'get_weather_from_location'
      - type: javascript
        value: JSON.parse(output[0].arguments).location === 'Boston'

  - vars:
      city: New York
    options:
      transform: output[0].name
    assert:
      - type: equals
        value: get_weather_from_location

  - vars:
      city: Paris
    assert:
      - type: equals
        value: get_weather_from_location
        transform: output[0].name
      - type: similar
        value: Paris, France
        threshold: 0.5
        transform: JSON.parse(output[0].arguments).location

  - vars:
      city: Mars
```

### Using OpenAI format

```yaml
prompts:
  - 'What is the weather like in {{city}}?'

providers:
  - id: adaline:google:chat:gemini-1.5-flash
    config:
      tools:
        [
          {
            'type': 'function',
            'function':
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
          },
        ]

tests:
  - vars:
      city: Boston
    assert:
      - type: is-json
      # still works even though Gemini is used as the provider
      - type: is-valid-openai-tools-call
      - type: javascript
        value: output[0].function.name === 'get_current_weather'
      - type: javascript
        value: JSON.parse(output[0].function.arguments).location === 'Boston'

  - vars:
      city: New York
    options:
      transform: output[0].function.name
    assert:
      - type: equals
        value: get_current_weather

  - vars:
      city: Paris
    assert:
      - type: equals
        value: get_current_weather
        transform: output[0].function.name
      - type: similar
        value: Paris, France
        threshold: 0.5
        transform: JSON.parse(output[0].function.arguments).location

  - vars:
      city: Mars
```

### Multi provider comparison

`promptfooconfig.yaml`

```yaml
prompts:
  - file://prompt.json
providers:
  - id: adaline:openai:chat:gpt-4o
  - id: adaline:anthropic:chat:claude-3-opus-20240229
  - id: adaline:google:chat:gemini-1.5-pro

tests:
  - vars:
      question: 'Do you think you can solve 1 + 0.5 + 0.25 + 0.125 + 0.0625 + 0.03125 + 0.015625 .... till 0 ?'
    assert:
      - type: contains
        value: 'Yes'
      - type: contains
        value: ' 2'
```

`prompt.json`

```prompt.json
[
  {
    "role": "system",
    "content": [
      {
        "modality": "text",
        "value": "You are a math assistant and respond with a yes or no before you solve the question."
      }
    ]
  },
  {
    "role": "user",
    "content": [
      {
        "modality": "text",
        "value": "{{question}}"
      }
    ]
  }
]
```

### Structured output

`promptfooconfig.yaml`

```yaml
prompts:
  - 'Analyze the following customer support query: "{{query}}"'

providers:
  - id: adaline:openai:chat:gpt-4o-mini
    config:
      seed: 322431
      responseFormat: json_schema
      responseSchema:
        name: customer_support_analysis
        strict: true
        description: 'output schema for analysis of a customer support query'
        schema:
          type: object
          properties:
            query_summary:
              type: string
              description: "A brief summary of the customer's query"
            category:
              type: string
              enum:
                [
                  'billing',
                  'technical_issue',
                  'product_inquiry',
                  'complaint',
                  'feature_request',
                  'other',
                ]
              description: "The main category of the customer's query"
            sentiment:
              type: string
              enum: ['positive', 'neutral', 'negative']
              description: "The overall sentiment of the customer's query"
            urgency:
              type: string
              enum: ['1', '2', '3', '4', '5']
              description: 'The urgency level of the query, where 1 is lowest and 5 is highest'
            suggested_actions:
              type: array
              items:
                type: object
                properties:
                  action:
                    type: string
                    description: 'A specific action to be taken'
                  priority:
                    type: string
                    enum: ['low', 'medium', 'high']
                required: ['action', 'priority']
                additionalProperties: false
            estimated_resolution_time:
              type: string
              description: "Estimated time to resolve the query (e.g., '2 hours', '1 day')"
          required:
            [
              'query_summary',
              'category',
              'sentiment',
              'urgency',
              'suggested_actions',
              'estimated_resolution_time',
            ]
          additionalProperties: false

tests:
  - vars:
      query: "I've been charged twice for my subscription this month. Can you please refund the extra charge?"
    assert:
      - type: is-json
        metric: ValidJSON
      - type: javascript
        value: output.category === 'billing'
        metric: CategoryAccuracy
      - type: javascript
        value: output.sentiment === 'negative'
        metric: SentimentAccuracy
      - type: javascript
        value: parseInt(output.urgency) >= 3
        metric: UrgencyAccuracy
      - type: javascript
        value: output.suggested_actions.length > 0 && output.suggested_actions.some(action => action.action.toLowerCase().includes('refund'))
        metric: ActionRelevance
      - type: llm-rubric
        value: "Does the query summary accurately reflect the customer's issue about being charged twice?"
        metric: SummaryAccuracy

  - vars:
      query: "How do I change my password? I can't find the option in my account settings."
    assert:
      - type: is-json
        metric: ValidJSON
      - type: javascript
        value: output.category === 'technical_issue'
        metric: CategoryAccuracy
      - type: javascript
        value: output.sentiment === 'neutral'
        metric: SentimentAccuracy
      - type: javascript
        value: parseInt(output.urgency) <= 3
        metric: UrgencyAccuracy
      - type: javascript
        value: output.suggested_actions.some(action => action.action.toLowerCase().includes('password'))
        metric: ActionRelevance
      - type: llm-rubric
        value: "Does the query summary accurately reflect the customer's issue about changing their password?"
        metric: SummaryAccuracy

  - vars:
      query: "I love your new feature! It's made my work so much easier. Any plans to expand on it?"
    assert:
      - type: is-json
        metric: ValidJSON
      - type: javascript
        value: output.category === 'feature_request'
        metric: CategoryAccuracy
      - type: javascript
        value: output.sentiment === 'positive'
        metric: SentimentAccuracy
      - type: javascript
        value: parseInt(output.urgency) <= 2
        metric: UrgencyAccuracy
      - type: javascript
        value: output.suggested_actions.some(action => action.action.toLowerCase().includes('feedback'))
        metric: ActionRelevance
      - type: llm-rubric
        value: "Does the query summary accurately reflect the customer's positive feedback and interest in feature expansion?"
        metric: SummaryAccuracy

  - vars:
      query: "Your product is terrible and never works! I want a full refund and I'm cancelling my account!"
    assert:
      - type: is-json
        metric: ValidJSON
      - type: javascript
        value: output.category === 'complaint'
        metric: CategoryAccuracy
      - type: javascript
        value: output.sentiment === 'negative'
        metric: SentimentAccuracy
      - type: javascript
        value: |
          output.urgency === '5'
        metric: UrgencyAccuracy
      - type: javascript
        value: output.suggested_actions.some(action => action.priority === 'high')
        metric: ActionRelevance
      - type: llm-rubric
        value: "Does the query summary accurately reflect the customer's severe complaint and refund request?"
        metric: SummaryAccuracy

derivedMetrics:
  - name: 'OverallAccuracy'
    value: '(CategoryAccuracy + SentimentAccuracy + UrgencyAccuracy + ActionRelevance + SummaryAccuracy) / 5'
  - name: 'ResponseQuality'
    value: '(ValidJSON + OverallAccuracy) / 2'
```

### Vision

`promptfooconfig.yaml`

```yaml
prompts:
  - file://prompt.json
providers:
  - id: adaline:openai:chat:gpt-4o

tests:
  - vars:
      question: 'What do you see?'
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg'
    options:
      transformVars: |
        return { ...vars, image_markdown: `![image](${vars.url})` }
    assert:
      - type: contains
        value: 'boardwalk'
```

`prompt.json`

```prompt.json
[
  {
    "role": "user",
    "content": [
      {
        "modality": "text",
        "value": "{{question}}"
      },
      {
        "modality": "image",
        "detail": "auto",
        "value": {
          "type": "url",
          "url": "{{url}}"
        }
      }
    ]
  }
]
```

### Embedding similarity

`promptfooconfig.yaml`

```yaml
prompts:
  - file://prompt.json
providers:
  - id: adaline:anthropic:chat:claude-3-5-sonnet-20240620
    config:
      maxTokens: 120

defaultTest:
  vars:
    system_message: file://system_message.txt
    previous_messages:
      - user: Who founded Facebook?
      - assistant: Mark Zuckerberg

tests:
  - vars:
      question: What is his role at Internet.org?
    assert:
      - type: similar
        value: Founder and CEO
        threshold: 0.25
        provider: gateway:openai:embedding:text-embedding-3-large
  - vars:
      question: Is he still connected with Facebook?
    assert:
      - type: similar
        value: Yes
        threshold: 0.5
        provider: gateway:openai:embedding:text-embedding-3-small
```

`prompt.json`

```prompt.json
[
  {
    "role": "system",
    "content": [
      {
        "modality": "text",
        "value": {{ system_message | dump }}
      }
    ]
  },
  {% for message in previous_messages %}
    {% for role, content in message %}
      {
        "role": "{{ role }}",
        "content": [
          {
            "modality": "text",
            "value": {{ content | dump }}
          }
        ]
      },
    {% endfor %}
  {% endfor %}
  {
    "role": "user",
    "content": [
      {
        "modality": "text",
        "value": {{ question | dump }}
      }
    ]
  }
]
```

`system_message.txt`

```system_message.txt
You are a helpful assistant. You answer extremely concisely.
```
