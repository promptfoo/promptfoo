# LLM Providers in promptfoo

Providers in promptfoo are the interfaces to various language models and AI services. This guide will help you understand how to configure and use providers in your promptfoo evaluations.

## Quick Start

Here's a basic example of configuring providers in your promptfoo YAML config:

```yaml
providers:
  - openai:gpt-4o-mini
  - anthropic:messages:claude-3-5-sonnet-20240620
  - vertex:gemini-pro
```

## Available Providers

promptfoo supports a wide range of providers:

### API Based Providers

- [OpenAI](./openai.md): `openai:model_name` (e.g., `openai:gpt-4o-mini`)
- [Anthropic](./anthropic.md): `anthropic:model_name` (e.g., `anthropic:messages:claude-3-5-sonnet-20240620`)
- [AI21 Labs](./ai21.md): `ai21:model_name` (e.g., `ai21:j2-ultra`)
- [AWS Bedrock](./aws-bedrock.md): `bedrock:model_name` (e.g., `bedrock:anthropic.claude-3-5sonnet-20240620-v1:0`)
- [Azure OpenAI](./azure.md): `azureopenai:deployment_name`
- [Cloudflare AI](./cloudflare-ai.md): `cloudflare-ai:model_name`
- [Cohere](./cohere.md): `cohere:model_name` (e.g., `cohere:command`)
- [fal.ai](./fal.md): `fal:model_type:model_name`
- [Google AI Studio (PaLM)](./palm.md): `google:model_name` (e.g., `google:gemini-pro`)
- [Google Vertex AI](./vertex.md): `vertex:model_name` (e.g., `vertex:gemini-pro`)
- [Groq](./groq.md): `groq:model_name`
- [Hugging Face](./huggingface.md): `huggingface:task:model_name` (e.g., `huggingface:text-generation:gpt2`)
- [IBM BAM](./ibm-bam.md): `bam:model_name`
- [LiteLLM](./litellm.md): Compatible with OpenAI syntax
- [llama.cpp](./llama.cpp.md): `llama:model_name`
- [LocalAI](./localai.md): `localai:model_name`
- [Mistral AI](./mistral.md): `mistral:model_name`
- [OpenLLM](./openllm.md): Compatible with OpenAI syntax
- [OpenRouter](./openrouter.md): `openrouter:model_name`
- [Perplexity AI](./perplexity.md): Compatible with OpenAI syntax
- [Replicate](./replicate.md): `replicate:model_name:version`
- [Together AI](./togetherai.md): Compatible with OpenAI syntax
- [vLLM](./vllm.md): Compatible with OpenAI syntax
- [Voyage AI](./voyage.md): `voyage:model_name`

### Local Providers

- [Ollama](./ollama.md): `ollama:model_name` (e.g., `ollama:llama3.2`)

### Custom and Specialized Providers

- [Javascript](./custom-api.md): For custom API integrations
- [Shell Command](./custom-script.md): For custom script-based providers
- [Echo](./echo.md): `echo` (for testing purposes)
- [Browser](./browser.md): browser-based interactions (ChatGPT, LMArena, etc.)
- [HTTP](./http.md): For generic HTTP-based providers
- [Manual Input](./manual-input.md): `promptfoo:manual-input`
- [Python](./python.md): For Python-based custom providers
- [Webhook](./webhook.md): For webhook-based integrations
- [WebSocket](./websocket.md): For WebSocket-based providers
- [Text Generation WebUI](./text-generation-webui.md): For text generation web interfaces

## Provider Syntax

Providers are specified using various syntax options:

1. Simple string format:

   ```
   provider_name:model_name
   ```

   Example: `openai:gpt-4o-mini` or `anthropic:claude-3-sonnet-20240229`

2. Object format with configuration:

   ```yaml
   - id: provider_name:model_name
     config:
       option1: value1
       option2: value2
   ```

   Example:

   ```yaml
   - id: openai:gpt-4o-mini
     config:
       temperature: 0.7
       max_tokens: 150
   ```

3. File-based configuration:

   ```yaml
   - file://path/to/provider_config.yaml
   ```

## Configuring Providers

Most providers use environment variables for authentication:

```sh
export OPENAI_API_KEY=your_api_key_here
export ANTHROPIC_API_KEY=your_api_key_here
```

You can also specify API keys in your configuration file:

```yaml
providers:
  - id: openai:gpt-4o-mini
    config:
      apiKey: your_api_key_here
```

## Custom Integrations

promptfoo supports several types of custom integrations:

1. File-based providers:

   ```yaml
   providers:
     - file://path/to/provider_config.yaml
   ```

2. JavaScript providers:

   ```yaml
   providers:
     - file://path/to/custom_provider.js
   ```

3. Python providers:

   ```yaml
   providers:
     - id: file://path/to/custom_provider.py
   ```

4. HTTP/HTTPS API:

   ```yaml
   providers:
     - id: https://api.example.com/v1/chat/completions
       config:
         headers:
           Authorization: 'Bearer your_api_key'
   ```

5. WebSocket:

   ```yaml
   providers:
     - id: ws://example.com/ws
       config:
         messageTemplate: '{"prompt": "{{prompt}}"}'
   ```

6. Custom scripts:

   ```yaml
   providers:
     - 'exec: python chain.py'
   ```

## Common Configuration Options

Many providers support these common configuration options:

- `temperature`: Controls randomness (0.0 to 1.0)
- `max_tokens`: Maximum number of tokens to generate
- `top_p`: Nucleus sampling parameter
- `frequency_penalty`: Penalizes frequent tokens
- `presence_penalty`: Penalizes new tokens based on presence in text
- `stop`: Sequences where the API will stop generating further tokens

Example:

```yaml
providers:
  - id: openai:gpt-4o-mini
    config:
      temperature: 0.7
      max_tokens: 150
      top_p: 0.9
      frequency_penalty: 0.5
      presence_penalty: 0.5
      stop: ["\n", 'Human:', 'AI:']
```

## Using Multiple Providers

promptfoo allows easy comparison of multiple providers:

```yaml
providers:
  - openai:gpt-4o-mini
  - openai:gpt-4o
  - anthropic:claude-3-sonnet-20240229
  - vertex:gemini-pro
  - file://custom_provider.js
```

This setup enables A/B testing and model comparison across different providers.

## Troubleshooting

If you encounter issues with a provider:

1. Verify API keys and environment variables:

   ```sh
   echo $OPENAI_API_KEY
   ```

2. Check configuration syntax:

   ```yaml
   providers:
     - id: openai:gpt-4o-mini
       config:
         temperature: 0.7 # Make sure this is a number, not a string
   ```

3. Look for provider-specific error messages in the promptfoo output:

   ```
   Error: OpenAI API request failed: Invalid API key provided
   ```

4. Consult provider documentation for known issues or limitations.

5. For custom integrations, use debug logging:

   ```sh
   LOG_LEVEL=debug npx promptfoo eval
   ```

For more detailed information on each provider, refer to their specific documentation pages linked in the [Available Providers](#available-providers) section.
