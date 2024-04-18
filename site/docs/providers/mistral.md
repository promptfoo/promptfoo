# Mistral AI

The [Mistral AI API](https://docs.mistral.ai/api/) offers access to Mistral models such as `mistral-tiny`, `mistral-small`, and `mistral-medium`.

## API Key

To use Mistral AI, you need to set the `MISTRAL_API_KEY` environment variable, or specify the `apiKey` in the provider configuration.

Example of setting the environment variable:

```bash
export MISTRAL_API_KEY=your_api_key_here
```

## Model Selection

You can specify which Mistral model to use in your configuration. Currently, the following 5 models are available:

1. `open-mistral-7b`
2. `open-mixtral-8x7b`
3. `open-mixtral-8x22b`
4. `mistral-small-latest`
5. `mistral-medium-latest`
6. `mistral-large-latest`

Here's an example config that compares Mistral-Medium-Latest, Mistral-Small-Latest, and OpenAI GPT-3.5:

```yaml
providers:
  - mistral:mistral-medium-latest
  - mistral:mistral-small-latest
  - openai:chat:gpt-3.5-turbo
```

## Options

The Mistral provider supports several options to customize the behavior of the model. These include:

- `temperature`: Controls the randomness of the output.
- `top_p`: Controls nucleus sampling, affecting the randomness of the output.
- `max_tokens`: The maximum length of the generated text.
- `safe_prompt`: Whether to enforce safe content in the prompt.
- `random_seed`: A seed for deterministic outputs.
- `response_format`: Enable JSON mode, by setting the `response_format` to `{"type": "json_object"}`. The model must be asked explicitly to generate JSON output. This is currently only supported for their updated models `mistral-small-latest` and `mistral-large-latest`.
- `apiKeyEnvar`: An environment variable that contains the API key
- `apiHost`: The hostname of the Mistral API, please also read `MISTRAL_API_HOST` below. |
- `apiBaseUrl`: The base URL of the Mistral API, please also read `MISTRAL_API_BASE_URL` below. |

Example configuration with options:

```yaml
providers:
  - id: mistral:mistral-large-latest
    config:
      temperature: 0.7
      max_tokens: 512
      safe_prompt: true
      response_format: { 'type': 'json_object' }
```

## Additional Capabilities

- **Caching**: Caches previous LLM requests by default.
- **Token Usage Tracking**: Provides detailed information on the number of tokens used in each request, aiding in usage monitoring and optimization.
- **Cost Calculation**: Calculates the cost of each request based on the number of tokens generated and the specific model used.

## Supported environment variables

These Mistral-related environment variables are supported:

| Variable               | Description                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `MISTRAL_API_HOST`     | The hostname to use (useful if you're using an API proxy). Takes priority over `MISTRAL_API_BASE_URL`.   |
| `MISTRAL_API_BASE_URL` | The base URL (protocol + hostname + port) to use, this is a more general option than `MISTRAL_API_HOST`. |
| `MISTRAL_API_KEY`      | Mistral API key.                                                                                         |
