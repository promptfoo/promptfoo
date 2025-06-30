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

Compares chat and completion providers using current state-of-the-art models:

- `cloudflare-ai:completion:@cf/qwen/qwen2.5-coder-32b-instruct` - Advanced code generation model
- `cloudflare-ai:chat:@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` - Reasoning and conversation model

### Advanced Configuration (`chat_advanced_configuration.yaml`)

Demonstrates OpenAI-compatible parameters with Cloudflare AI:

- Uses `@cf/google/gemma-3-12b-it` (latest Gemma with 128K context)
- Custom `max_tokens`, `temperature`, `seed` parameters
- Environment variable configuration patterns

### Embedding Configuration (`embedding_configuration.yaml`)

Shows embedding generation and similarity testing:

- Chat: `@cf/hf/nousresearch/hermes-2-pro-mistral-7b` (function calling support)
- Embedding: `@cf/baai/bge-large-en-v1.5` (high-quality embeddings)
- Similarity assertion testing with configurable thresholds

## Provider Types

Cloudflare AI supports three provider types:

1. **Chat**: `cloudflare-ai:chat:model-name` - Conversational AI and instruction following
2. **Completion**: `cloudflare-ai:completion:model-name` - Text completion and generation
3. **Embedding**: `cloudflare-ai:embedding:model-name` - Text embeddings for similarity and search

## Featured Models (2025)

This example showcases current state-of-the-art models:

- **DeepSeek R1 Distilled** (`@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`) - Advanced reasoning
- **Qwen 2.5 Coder** (`@cf/qwen/qwen2.5-coder-32b-instruct`) - Code generation leader
- **Gemma 3** (`@cf/google/gemma-3-12b-it`) - 128K context, multilingual
- **Hermes 2 Pro** (`@cf/hf/nousresearch/hermes-2-pro-mistral-7b`) - Function calling
- **BGE Large** (`@cf/baai/bge-large-en-v1.5`) - High-quality embeddings

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
