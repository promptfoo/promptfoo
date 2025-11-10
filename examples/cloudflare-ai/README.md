# cloudflare-ai

Cloudflare Workers AI evaluation with OpenAI-compatible endpoints.

## Quick Start

You can run this example with:

```bash
npx promptfoo@latest init --example cloudflare-ai
```

## Environment Variables

This example requires the following environment variables:

- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID (found in your Cloudflare dashboard)
- `CLOUDFLARE_API_KEY` - Your Cloudflare API key with Workers AI permissions

Set these in your environment:

```bash
export CLOUDFLARE_ACCOUNT_ID=your_account_id_here
export CLOUDFLARE_API_KEY=your_api_key_here
```

## Example Configurations

### Basic Usage (`chat_config.yaml`)

Compares the latest flagship chat models:

- `cloudflare-ai:chat:@cf/openai/gpt-oss-120b` - OpenAI's production, general purpose, high reasoning model
- `cloudflare-ai:chat:@cf/meta/llama-4-scout-17b-16e-instruct` - Meta's Llama 4 Scout with native multimodal capabilities

### Advanced Configuration (`chat_advanced_configuration.yaml`)

Demonstrates OpenAI-compatible parameters with Cloudflare AI:

- Uses `@cf/mistralai/mistral-small-3.1-24b-instruct` (enhanced vision understanding and 128K context)
- Custom `max_tokens`, `temperature`, `seed` parameters
- Environment variable configuration patterns

### Embedding Configuration (`embedding_configuration.yaml`)

Shows embedding generation and similarity testing:

- Chat: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (optimized 70B model with fp8 quantization)
- Embedding: `@cf/google/embeddinggemma-300m` (state-of-the-art embedding model trained on 100+ languages)
- Similarity assertion testing with configurable thresholds

## Provider Types

Cloudflare AI supports three provider types:

1. **Chat**: `cloudflare-ai:chat:model-name` - Conversational AI and instruction following
2. **Completion**: `cloudflare-ai:completion:model-name` - Text completion and generation
3. **Embedding**: `cloudflare-ai:embedding:model-name` - Text embeddings for similarity and search

## Featured Models (2025)

This example showcases the latest flagship models:

- **OpenAI GPT-OSS-120B** (`@cf/openai/gpt-oss-120b`) - Production-ready, high reasoning capabilities
- **Meta Llama 4 Scout** (`@cf/meta/llama-4-scout-17b-16e-instruct`) - Multimodal with mixture-of-experts
- **Meta Llama 3.3 70B Fast** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) - Speed-optimized 70B model
- **Mistral Small 3.1** (`@cf/mistralai/mistral-small-3.1-24b-instruct`) - Enhanced vision and 128K context
- **EmbeddingGemma-300M** (`@cf/google/embeddinggemma-300m`) - Multilingual embeddings (100+ languages)

## OpenAI Compatibility

All examples use Cloudflare's OpenAI-compatible endpoints, supporting standard parameters:

- `temperature` - Response randomness control
- `max_tokens` - Output length limits
- `top_p` - Nucleus sampling
- `frequency_penalty` - Repetition reduction
- `presence_penalty` - Topic diversity

## Local Development

For local testing with your development version:

```bash
npm run local -- eval -c examples/cloudflare-ai/chat_config.yaml
```

## References

- [Cloudflare Workers AI Models](https://developers.cloudflare.com/workers-ai/models/) - Complete model catalog
- [Cloudflare Workers AI Documentation](https://developers.cloudflare.com/workers-ai/) - Platform overview
- [OpenAI Compatibility](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/) - API details
- [promptfoo Cloudflare AI Provider](../../site/docs/providers/cloudflare-ai.md) - Provider documentation
