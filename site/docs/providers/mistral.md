# Mistral AI

The [Mistral AI API](https://docs.mistral.ai/api/) offers access to Mistral models such as `mistral-tiny`, `mistral-small`, and `mistral-medium`.

## API Key

To use Mistral AI, you need to set the `MISTRAL_API_KEY` environment variable, or specify the `apiKey` in the provider configuration.

Example of setting the environment variable:

```bash
export MISTRAL_API_KEY=your_api_key_here
```

## Model Selection

You can specify which Mistral model to use in your configuration. Currently, the following 3 models are available:
1. `mistral-tiny`
2. `mistral-small`
3. `mistral-medium`

Here's an example config that compares Mistral-Medium, Mistral-Small, and OpenAI GPT-3.5:

```yaml
providers:
  - mistral:mistral-medium
  - mistral:mistral-small
  - openai:chat:gpt-3.5-turbo
```

## Options

The Mistral provider supports several options to customize the behavior of the model. These include:

- `temperature`: Controls the randomness of the output.
- `top_p`: Controls nucleus sampling, affecting the randomness of the output.
- `max_tokens`: The maximum length of the generated text.
- `safe_prompt`: Whether to enforce safe content in the prompt.
- `random_seed`: A seed for deterministic outputs.
- `fix_json`: Fixes common JSON formatting issues in the output, useful for parsing. Note: This is not a Mistral feature, but was added for convenience.

Example configuration with options:

```yaml
providers:
- id: mistral:mistral-medium
  config:
    temperature: 0.7
    max_tokens: 512
    safe_prompt: true
    fix_json: true
```

## Additional Capabilities

- **Caching**: Caches previous LLM requests by default.
- **Token Usage Tracking**: Provides detailed information on the number of tokens used in each request, aiding in usage monitoring and optimization.
- **Cost Calculation**: Calculates the cost of each request based on the number of tokens generated and the specific model used.
