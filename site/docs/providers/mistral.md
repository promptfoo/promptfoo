# Mistral AI

The [Mistral AI API](https://docs.mistral.ai/api/) offers access to various Mistral models.

## API Key

To use Mistral AI, you need to set the `MISTRAL_API_KEY` environment variable, or specify the `apiKey` in the provider configuration.

Example of setting the environment variable:

```sh
export MISTRAL_API_KEY=your_api_key_here
```

## Model Selection

You can specify which Mistral model to use in your configuration. The following models are available:

### Chat Models

1. `open-mistral-7b`, `mistral-tiny`, `mistral-tiny-2312`
2. `open-mistral-nemo`, `open-mistral-nemo-2407`, `mistral-tiny-2407`, `mistral-tiny-latest`
3. `mistral-small-2402`, `mistral-small-latest`
4. `mistral-medium-2312`, `mistral-medium`, `mistral-medium-latest`
5. `mistral-large-2402`
6. `mistral-large-2407`, `mistral-large-latest`
7. `codestral-2405`, `codestral-latest`
8. `codestral-mamba-2407`, `open-codestral-mamba`, `codestral-mamba-latest`
9. `open-mixtral-8x7b`, `mistral-small`, `mistral-small-2312`
10. `open-mixtral-8x22b`, `open-mixtral-8x22b-2404`

### Embedding Model

- `mistral-embed`

Here's an example config that compares different Mistral models:

```yaml
providers:
  - mistral:mistral-medium-latest
  - mistral:mistral-small-latest
  - mistral:open-mistral-nemo
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
- `apiHost`: The hostname of the Mistral API, please also read `MISTRAL_API_HOST` below.
- `apiBaseUrl`: The base URL of the Mistral API, please also read `MISTRAL_API_BASE_URL` below.

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
