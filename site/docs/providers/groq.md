# Groq

The [Groq API](https://wow.groq.com) is integrated into promptfoo using the Groq SDK, providing a native experience for using Groq models in your evaluations. Groq offers high-performance inference for various large language models.

## Setup

To use Groq, you need to set up your API key:

1. Create a Groq API key in the [Groq Console](https://console.groq.com/).
2. Set the `GROQ_API_KEY` environment variable:

```sh
export GROQ_API_KEY=your_api_key_here
```

Alternatively, you can specify the `apiKey` in the provider configuration (see below).

## Configuration

Configure the Groq provider in your promptfoo configuration file:

```yaml
providers:
  - id: groq:llama3-groq-70b-8192-tool-use-preview
    config:
      temperature: 0.7
      max_tokens: 100
      tools:
        - type: function
          function:
            name: get_weather
            description: 'Get the current weather in a given location'
            parameters:
              type: object
              properties:
                location:
                  type: string
                  description: 'The city and state, e.g. San Francisco, CA'
                unit:
                  type: string
                  enum:
                    - celsius
                    - fahrenheit
              required:
                - location
      tool_choice: auto
```

Key configuration options:

- `temperature`: Controls randomness in output (0.0 to 1.0)
- `max_tokens`: Maximum number of tokens in the response
- `tools`: Defines functions the model can use (for tool use/function calling)
- `tool_choice`: Specifies how the model should choose tools ('auto', 'none', or a specific tool)

## Supported Models

Groq supports a variety of models, including:

- `gemma-7b-it`
- `gemma2-9b-it`
- `llama-3.1-405b-reasoning`
- `llama-3.1-70b-versatile`
- `llama-3.1-8b-instant`
- `llama2-70b-4096`
- `llama3-70b-8192`
- `llama3-8b-8192`
- `llama3-groq-70b-8192-tool-use-preview` (recommended for tool use)
- `llama3-groq-8b-8192-tool-use-preview` (recommended for tool use)
- `mixtral-8x7b-32768`

For the most up-to-date list and detailed information about each model, refer to the [Groq Console documentation](https://console.groq.com/docs/models).

## Using the Provider

Specify the Groq provider in your test configuration:

```yaml
providers:
  - id: groq:llama3-groq-70b-8192-tool-use-preview
    config:
      temperature: 0.5
      max_tokens: 150

prompts:
  - Tell me about the weather in {{city}} in the default unit for the location.

tests:
  - vars:
      city: Boston
  - vars:
      city: New York
```

## Tool Use (Function Calling)

Groq supports tool use, allowing models to call predefined functions. Configure tools in your provider settings:

```yaml
providers:
  - id: groq:llama3-groq-70b-8192-tool-use-preview
    config:
      tools:
        - type: function
          function:
            name: get_weather
            description: 'Get the current weather in a given location'
            parameters:
              type: object
              properties:
                location:
                  type: string
                  description: 'The city and state, e.g. San Francisco, CA'
                unit:
                  type: string
                  enum:
                    - celsius
                    - fahrenheit
              required:
                - location
      tool_choice: auto
```

For complex tools or ambiguous queries, use the `llama3-groq-70b-8192-tool-use-preview` model.

## Additional Capabilities

- **Caching**: Groq provider caches previous LLM requests by default for improved performance.
- **Token Usage Tracking**: Provides detailed information on token usage for each request.
- **Cost Calculation**: Automatically calculates the cost of each request based on token usage and the specific model used.
