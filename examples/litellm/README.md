# litellm (LiteLLM Provider Example)

You can run this example with:

```bash
npx promptfoo@latest init --example litellm
```

This example demonstrates how to use LiteLLM with promptfoo for both chat completions and embeddings. LiteLLM provides a unified interface to 400+ LLMs through an OpenAI-compatible API, including the latest models like DeepSeek R1, Claude 4, GPT-4.1, and Gemini 2.5.

## Prerequisites

1. **LiteLLM Server**: You need to have a LiteLLM proxy server running. You can start one using Docker:

   ```bash
   docker run -p 4000:4000 \
     -e OPENAI_API_KEY=$OPENAI_API_KEY \
     -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
     -e GEMINI_API_KEY=$GEMINI_API_KEY \
     ghcr.io/berriai/litellm:main-latest \
     --model gpt-4.1 \
     --model claude-4-sonnet-20250514 \
     --model deepseek-r1 \
     --model gemini-2.5-flash \
     --model text-embedding-3-small
   ```

   Or with a config file:

   ```bash
   # Create litellm_config.yaml
   cat > litellm_config.yaml << EOF
   model_list:
     - model_name: gpt-4.1
       litellm_params:
         model: openai/gpt-4.1
         api_key: os.environ/OPENAI_API_KEY
     
     - model_name: o3-mini
       litellm_params:
         model: openai/o3-mini
         api_key: os.environ/OPENAI_API_KEY
     
     - model_name: claude-4-sonnet-20250514
       litellm_params:
         model: anthropic/claude-4-sonnet-20250514
         api_key: os.environ/ANTHROPIC_API_KEY
     
     - model_name: deepseek-r1
       litellm_params:
         model: deepseek/deepseek-r1
         api_key: os.environ/DEEPSEEK_API_KEY
     
     - model_name: gemini-2.5-flash
       litellm_params:
         model: gemini/gemini-2.5-flash
         api_key: os.environ/GEMINI_API_KEY
     
     - model_name: text-embedding-3-small
       litellm_params:
         model: openai/text-embedding-3-small
         api_key: os.environ/OPENAI_API_KEY
   
   litellm_settings:
     drop_params: true
     set_verbose: false
   EOF
   
   # Run with config
   docker run -p 4000:4000 \
     -v $(pwd)/litellm_config.yaml:/app/config.yaml \
     -e OPENAI_API_KEY=$OPENAI_API_KEY \
     -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
     -e GEMINI_API_KEY=$GEMINI_API_KEY \
     -e DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY \
     ghcr.io/berriai/litellm:main-latest \
     --config /app/config.yaml
   ```

2. Verify the server is running:

   ```bash
   curl http://localhost:4000/health
   ```

## Running the Example

```bash
npx promptfoo@latest eval
```

## What This Example Shows

1. **Latest Chat Models**: Uses the newest models available through LiteLLM:
   - GPT-4.1 (OpenAI's latest)
   - O3 Mini (OpenAI's reasoning model)
   - Claude 4 Sonnet (Anthropic's latest)
   - DeepSeek R1 (Advanced reasoning model)
   - Gemini 2.5 Flash (Google's latest)

2. **Embeddings**: Uses `text-embedding-3-small` for similarity assertions

3. **Multiple Assertions**: Tests translations with various assertion types:
   - `contains-any`: Checks for alternative translations
   - `similar`: Uses embeddings to check semantic similarity
   - `llm-rubric`: Uses another LLM to evaluate quality

4. **Language Support**: Tests translations across multiple languages:
   - French
   - Spanish
   - German
   - Japanese

## LiteLLM Provider Syntax

The example uses three different ways to specify LiteLLM models:

1. **Default (chat)**: `litellm:model-name`
2. **Explicit chat**: `litellm:chat:model-name`
3. **Embeddings**: `litellm:embedding:model-name`

## Tips

1. **Model Configuration**: DeepSeek R1 works best with temperature 0.6-0.7
2. **API Keys**: Make sure all required API keys are set in your environment
3. **Rate Limiting**: LiteLLM handles rate limiting across providers automatically
4. **Cost Tracking**: LiteLLM provides built-in cost tracking for all models

## Available Models (January 2025)

Some of the latest models available through LiteLLM:

### OpenAI
- GPT-4.1, GPT-4.1-mini, GPT-4.1-nano
- O3, O3-mini, O3-pro, O4-mini
- Codex-mini-latest
- GPT-4o-audio-preview

### Anthropic
- Claude-4-opus-20250514
- Claude-4-sonnet-20250514
- Claude-3.7 series

### DeepSeek
- DeepSeek-R1 (reasoning model)
- DeepSeek-R1-distill series (1.5B to 70B)
- DeepSeek-V3

### Google
- Gemini-2.5-pro, Gemini-2.5-flash
- Gemini-2.5-flash-lite
- Gemini-2.0-flash-preview-image-generation

### Others
- xAI: Grok-2-latest, Grok-3
- Mistral: Magistral-medium-latest
- Meta: Llama 4 models
- Perplexity: Sonar-deep-research

## Troubleshooting

1. **Connection Refused**: Make sure the LiteLLM server is running on port 4000
2. **Model Not Found**: Check that the model name matches exactly what LiteLLM expects
3. **API Key Errors**: Ensure all required API keys are set in your environment
4. **Rate Limits**: If you hit rate limits, LiteLLM will automatically retry with exponential backoff

For more information, see the [LiteLLM documentation](https://docs.litellm.ai/docs/). 