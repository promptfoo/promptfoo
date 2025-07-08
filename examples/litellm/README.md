# litellm (LiteLLM Provider Example)

You can run this example with:

```bash
npx promptfoo@latest init --example litellm
```

This example demonstrates how to use LiteLLM with promptfoo for both chat completions and embeddings. LiteLLM provides a unified interface to 100+ LLMs through an OpenAI-compatible API.

## Prerequisites

1. **LiteLLM Server**: You need to have a LiteLLM proxy server running. You can start one using Docker:

   ```bash
   docker run -p 4000:4000 \
     -e OPENAI_API_KEY=$OPENAI_API_KEY \
     -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
     ghcr.io/berriai/litellm:main-latest \
     --model gpt-4o-mini \
     --model claude-3-5-sonnet-20241022 \
     --model text-embedding-3-small
   ```

   Or with a config file:

   ```bash
   # Create litellm_config.yaml
   cat > litellm_config.yaml << EOF
   model_list:
     - model_name: gpt-4o-mini
       litellm_params:
         model: openai/gpt-4o-mini
         api_key: $OPENAI_API_KEY
     
     - model_name: claude-3-5-sonnet-20241022
       litellm_params:
         model: anthropic/claude-3-5-sonnet-20241022
         api_key: $ANTHROPIC_API_KEY
     
     - model_name: text-embedding-3-small
       litellm_params:
         model: openai/text-embedding-3-small
         api_key: $OPENAI_API_KEY
   EOF

   # Run with config
   litellm --config litellm_config.yaml
   ```

2. **Verify the server**: Check that your LiteLLM server is running:

   ```bash
   curl http://localhost:4000/health
   ```

## Environment Variables

This example can work with or without authentication, depending on your LiteLLM server configuration:

- `LITELLM_API_KEY` - (Optional) API key if your LiteLLM server requires authentication
- `LITELLM_BASE_URL` - (Optional) Override the default server URL (http://0.0.0.0:4000)

## What This Example Demonstrates

1. **Chat Completions**: Using LiteLLM to compare responses from different models
2. **Embeddings**: Using LiteLLM's embedding models for semantic similarity checks
3. **Model Comparison**: Evaluating multiple models side-by-side
4. **Advanced Assertions**: Using both exact matching and semantic similarity

## Running the Example

1. Ensure your LiteLLM server is running (see Prerequisites)

2. Run the evaluation:

   ```bash
   npm run local -- eval -c examples/litellm/promptfooconfig.yaml
   ```

3. View the results:

   ```bash
   npm run local -- view
   ```

## Expected Results

You should see:
- Translation quality comparisons between GPT-4 and Claude models
- Semantic similarity scores for translations
- Performance metrics for each model
- Pass/fail status for various assertion types

## Customization

You can modify this example to:
- Add more models by updating your LiteLLM server configuration
- Change the test cases in `promptfooconfig.yaml`
- Adjust similarity thresholds for your use case
- Add custom assertions or metrics

## Troubleshooting

If you encounter issues:

1. **Connection errors**: Ensure LiteLLM server is running on the correct port
2. **Model not found**: Check that the model is configured in your LiteLLM server
3. **Embedding errors**: Verify that your embedding model is properly loaded

Test individual endpoints:

```bash
# Test chat endpoint
curl -X POST http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# Test embedding endpoint
curl -X POST http://localhost:4000/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "Hello world"
  }'
```

## Learn More

- [LiteLLM Documentation](https://docs.litellm.ai/)
- [Promptfoo LiteLLM Provider Guide](https://www.promptfoo.dev/docs/providers/litellm)
- [Similarity Assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs/similar) 