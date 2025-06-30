# Helicone AI Gateway Example

This example demonstrates how to use the Helicone AI Gateway provider in promptfoo to route requests through a self-hosted Helicone AI Gateway instance for unified provider access.

## What This Example Shows

- **Unified Interface**: Use the same OpenAI-compatible syntax to access multiple providers
- **Load Balancing**: Smart routing based on provider availability and performance
- **Self-Hosted Gateway**: Full control over your LLM routing infrastructure
- **Provider Comparison**: Compare responses from different providers through a single interface
- **Flexible Configuration**: Easy switching between providers and models

## Prerequisites

1. **Helicone AI Gateway**: A running instance (we'll start one locally)
2. **API Keys**: You'll need at least one provider API key:
   - OpenAI API key (recommended)
   - Anthropic API key (optional)
   - Groq API key (optional)

## Setup

1. **Set Environment Variables**:

   ```bash
   # Set your provider API keys
   export OPENAI_API_KEY=your_openai_api_key_here
   export ANTHROPIC_API_KEY=your_anthropic_api_key_here  # Optional
   export GROQ_API_KEY=your_groq_api_key_here           # Optional
   ```

2. **Start Helicone AI Gateway**:

   ```bash
   # In a separate terminal, start the gateway
   npx @helicone/ai-gateway@latest
   ```

   The gateway will start on `http://localhost:8080` by default.

3. **Install promptfoo** (if you haven't already):
   ```bash
   npm install -g promptfoo
   ```

## Running the Example

From this directory, run:

```bash
promptfoo eval
```

This will:

- Send the same prompts to all three providers through the Helicone AI Gateway
- Compare responses and performance across providers
- Generate a detailed comparison report
- Show differences in model capabilities and response patterns

## What Happens

1. **Request Routing**: Each request is sent to the local Helicone AI Gateway at `http://localhost:8080`
2. **Provider Selection**: The gateway routes each request to the appropriate provider (OpenAI, Anthropic, or Groq)
3. **Unified Interface**: All providers use the same OpenAI-compatible request/response format
4. **Response Comparison**: promptfoo compares the responses from each provider

## Gateway Features

The Helicone AI Gateway provides several powerful features:

- **Load Balancing**: Automatic routing to the fastest/most reliable provider
- **Caching**: Built-in response caching to reduce costs and improve latency
- **Rate Limiting**: Configurable rate limits to prevent abuse
- **Observability**: Optional integration with Helicone's observability platform
- **Self-Hosted**: Full control over your infrastructure and data

## Configuration Details

The example configuration includes:

### Provider Setup

```yaml
providers:
  - id: helicone:openai/gpt-4o-mini
    label: 'OpenAI via Helicone Gateway'
    config:
      temperature: 0.7
      max_tokens: 500
```

### Key Features Demonstrated

1. **Unified Interface**: All providers use the same `helicone:provider/model` format
2. **OpenAI Compatibility**: Standard OpenAI parameters work across all providers
3. **Easy Switching**: Change providers by simply updating the model name
4. **Local Gateway**: All requests go through your self-hosted gateway instance

## Customization

You can modify the configuration to:

1. **Add More Providers**: Include any providers supported by your Helicone AI Gateway
2. **Change Models**: Specify different models using the `provider/model` format
3. **Custom Gateway**: Point to a different Helicone AI Gateway instance
4. **Router Configuration**: Use custom routers for different environments

### Example with Custom Gateway and Router

```yaml
providers:
  - id: helicone:openai/gpt-4o
    config:
      baseUrl: http://my-gateway.company.com:8080
      router: production
      temperature: 0.5
```

## Advanced Features

### Using Different Gateway Endpoints

Route to different environments using routers:

```yaml
providers:
  - id: helicone:openai/gpt-4o
    config:
      router: production

  - id: helicone:openai/gpt-3.5-turbo
    config:
      router: development
```

### Custom Gateway Configuration

If you're running your own Helicone AI Gateway with custom configuration:

```yaml
providers:
  - id: helicone:custom-provider/custom-model
    config:
      baseUrl: http://localhost:9000
      headers:
        Custom-Header: value
```

## Troubleshooting

### Common Issues

1. **Authentication Error**: Verify your `HELICONE_API_KEY` is correct
2. **Provider API Key Missing**: Ensure you have valid API keys for the providers you're testing
3. **No Data in Dashboard**: Check that requests are successfully completing

### Debug Mode

For detailed request logging:

```bash
LOG_LEVEL=debug promptfoo eval
```

## Learn More

- [Helicone Documentation](https://docs.helicone.ai/)
- [promptfoo Helicone Provider Guide](/docs/providers/helicone/)
- [promptfoo Documentation](https://promptfoo.dev/docs/)

## Next Steps

1. **Explore the Dashboard**: Review the analytics in your Helicone dashboard
2. **Set Up Alerts**: Configure cost and usage alerts in Helicone
3. **Optimize Costs**: Use caching and rate limiting to reduce expenses
4. **Scale Testing**: Add more providers and test cases for comprehensive evaluation
