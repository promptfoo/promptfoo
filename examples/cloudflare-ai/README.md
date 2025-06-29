# Cloudflare Workers AI Examples

This example demonstrates how to use Cloudflare Workers AI with promptfoo using their OpenAI-compatible API endpoints.

## Quick Start

You can run this example with:

```bash
npx promptfoo@latest init --example cloudflare-ai
```

## Setup

Before running the examples, set your Cloudflare credentials:

```bash
export CLOUDFLARE_ACCOUNT_ID=your_account_id_here
export CLOUDFLARE_API_KEY=your_api_key_here
```

## Example Files

This directory contains several configuration examples:

### Basic Usage (`chat_config.yaml`)
Demonstrates the difference between chat and completion providers using the same model:
- `cloudflare-ai:completion:@cf/meta/llama-3-8b-instruct` - For completion-style tasks
- `cloudflare-ai:chat:@cf/meta/llama-3-8b-instruct` - For conversational AI

### Advanced Configuration (`chat_advanced_configuration.yaml`)
Shows how to use OpenAI-compatible parameters with Cloudflare AI:
- Custom `max_tokens`, `temperature`, `seed` parameters
- Account ID configuration
- Environment variable usage for API keys

### Embedding Configuration (`embedding_configuration.yaml`)
Demonstrates how to use Cloudflare AI for embedding generation and similarity testing:
- `cloudflare-ai:embedding:@cf/baai/bge-base-en-v1.5` provider
- Similarity assertion testing

## Provider Types

Cloudflare AI supports three provider types:

1. **Chat**: `cloudflare-ai:chat:model-name` - For conversational AI
2. **Completion**: `cloudflare-ai:completion:model-name` - For text completion
3. **Embedding**: `cloudflare-ai:embedding:model-name` - For text embeddings

## OpenAI Compatibility

Since Cloudflare AI uses OpenAI-compatible endpoints, you can use familiar OpenAI parameters like:
- `temperature`
- `max_tokens` 
- `top_p`
- `frequency_penalty`
- `presence_penalty`

## References

- [Cloudflare Workers AI Documentation](https://developers.cloudflare.com/workers-ai/)
- [Cloudflare REST API Documentation](https://developers.cloudflare.com/api/operations/workers-ai-post-run-model)
- [Available Models](https://developers.cloudflare.com/workers-ai/models/)
- [promptfoo Cloudflare AI Provider Documentation](../../site/docs/providers/cloudflare-ai.md)
