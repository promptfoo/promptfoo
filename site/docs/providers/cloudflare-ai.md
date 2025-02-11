# Cloudflare Workers AI

[Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) provides OpenAI-compatible access to various language models through their serverless edge embedding and inference runtime. Compatible with all [OpenAI provider](/docs/providers/openai/) options in promptfoo.

## Configuration

Calling the Workers AI requires the user to supply a Cloudflare account ID and API key with
sufficient permissions to invoke the Workers AI REST endpoints.

```yaml title="promptfooconfig.yaml"
providers:
  - id: cloudflare-ai:chat:@cf/meta/llama-3.1-8b-instruct
    config:
      accountId: YOUR_ACCOUNT_ID_HERE # or set CLOUDFLARE_ACCOUNT_ID
      # apiKey: YOUR_API_KEY_HERE      # Not recommended, use env var instead
      apiKeyEnvar: CLOUDFLARE_API_KEY # Default, can be customized
      temperature: 0.7 # Optional: Standard OpenAI parameters
```

### Authentication

Required environment variables:

```sh
export CLOUDFLARE_ACCOUNT_ID=YOUR_ACCOUNT_ID_HERE  # Account ID (not secret)
export CLOUDFLARE_API_KEY=YOUR_API_KEY_HERE        # API key (keep secret)
```

The account ID can be safely included in your config file, but the API key should be kept secure in environment variables.

## Available Models

Cloudflare is constantly adding new models to its inventory. See their [official list of
models](https://developers.cloudflare.com/workers-ai/models/) for a list of supported models.
Different models support different parameters, which is supported by supplying those
parameters as additional keys of the config object in the `promptfoo` config file.

### Llama 3 Series (Meta)

Latest generation models with multilingual capabilities and improved reasoning:

#### Llama 3.3

- `@cf/meta/llama-3.3-70b-instruct-fp8-fast` - Fastest 70B model, FP8 quantized

#### Llama 3.2

- `@cf/meta/llama-3.2-11b-vision-instruct` - Vision capabilities
- `@cf/meta/llama-3.2-1b-instruct` - Smallest 3.2 variant
- `@cf/meta/llama-3.2-3b-instruct` - Mid-size variant

#### Llama 3.1

- `@cf/meta/llama-3.1-70b-instruct` - Largest model
- `@cf/meta/llama-3.1-8b-instruct` - Base 8B model
- `@cf/meta/llama-3.1-8b-instruct-awq` - Int4 quantized
- `@cf/meta/llama-3.1-8b-instruct-fp8` - FP8 quantized
- `@cf/meta/llama-3.1-8b-instruct-fast` - Speed-optimized

#### Llama 3.0

- `@cf/meta/llama-3-8b-instruct` - Original 3.0 base
- `@cf/meta/llama-3-8b-instruct-awq` - Int4 quantized

### Llama 2 Series (Meta)

- `@cf/meta/llama-2-70b-chat-{fp16,int8}` - 70B parameters
- `@cf/meta/llama-2-13b-chat-awq` - 13B AWQ quantized
- `@cf/meta/llama-2-7b-chat-{fp16,int8}` - 7B parameters
- `@cf/meta/llama-2-7b-chat-hf-lora` - With LoRA support

#### Mistral Series

- `@cf/mistralai/mistral-7b-instruct-v0.2` - Latest version
- `@cf/mistralai/mistral-7b-instruct-v0.2-lora` - With LoRA
- `@cf/mistralai/mistral-7b-instruct-v0.1` - Original version

#### Gemma Series (Google)

- `@cf/google/gemma-7b-it` - Base 7B model
- `@cf/google/gemma-7b-it-lora` - With LoRA support
- `@cf/google/gemma-2b-it-lora` - Smaller variant

#### Specialized Models

- `@cf/microsoft/phi-2` - Microsoft's compact model
- `@cf/openchat/openchat-3.5-0106` - OpenChat's latest
- `@cf/qwen/qwen1.5-{7b,14b}-chat-awq` - Alibaba's Qwen models
- `@cf/defog/sqlcoder-7b-2` - SQL generation specialist
- `@cf/nexusflow/starling-lm-7b-beta` - Advanced reasoning

### Embedding Models (BAAI)

- `@cf/baai/bge-large-en-v1.5` - 1024 dimensions
- `@cf/baai/bge-base-en-v1.5` - 768 dimensions
- `@cf/baai/bge-small-en-v1.5` - 384 dimensions

## Model Parameters

Supports standard OpenAI parameters:

- `temperature` - Controls randomness (0.0 to 1.0)
- `max_tokens` - Maximum output length
- `top_p` - Nucleus sampling parameter
- `frequency_penalty` - Repetition control
- `presence_penalty` - Topic diversity control

## Examples

### Basic Chat Completion

prompts:

- Tell me a really funny joke about {{topic}}. The joke should contain the word {{topic}}

```yaml title="promptfooconfig.yaml"
providers:
  - id: cloudflare-ai:chat:@cf/meta/llama-3.1-8b-instruct
      accountId: YOUR_ACCOUNT_ID_HERE
      # It is not recommended to keep your API key on the config file since it is a secret value.
      # Use the CLOUDFLARE_API_KEY environment variable or set the apiKeyEnvar value
      # in the config
      # apiKey: YOUR_API_KEY_HERE
      # apiKeyEnvar: SOME_ENV_HAR_CONTAINING_THE_API_KEY
```

### Embeddings Configuration

```yaml
providers:
  - id: cloudflare-ai:embedding:@cf/baai/bge-large-en-v1.5
```

For more examples, see:

- `examples/cloudflare-ai/embedding_configuration.yaml`
- `examples/cloudflare-ai/chat_advanced_configuration.yaml`

## OpenAI Compatibility

Cloudflare AI provides OpenAI-compatible endpoints:

- Chat completions: `/v1/chat/completions`
- Embeddings: `/v1/embeddings`

This allows for easy migration from OpenAI to Cloudflare AI by simply changing the base URL and model names.
