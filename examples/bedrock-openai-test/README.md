# OpenAI Models via AWS Bedrock Example

This example demonstrates how to evaluate OpenAI's gpt-oss models (120B and 20B parameter versions) through AWS Bedrock using promptfoo.

## Prerequisites

1. **AWS Credentials**: Configure your AWS credentials with access to Bedrock
2. **Region Access**: Ensure you have access to OpenAI models in `us-west-2`
3. **Model Access**: The OpenAI gpt-oss models should be automatically enabled in Bedrock

## Available Models

- `openai.gpt-oss-120b-1:0` - 120 billion parameter model with strong reasoning capabilities
- `openai.gpt-oss-20b-1:0` - 20 billion parameter model, more cost-effective

## Configuration Features

This example showcases:

- **Multiple reasoning levels**: `low`, `medium`, `high` via the `reasoning_effort` parameter
- **Parameter tuning**: Different temperature, top_p, and token settings
- **Comparison testing**: Includes Claude Sonnet 4 for performance comparison
- **Comprehensive assertions**: Uses various assertion types to evaluate responses

## Usage

```bash
# Run the evaluation
npm run local -- eval -c examples/bedrock-openai-test/promptfooconfig.yaml

# Run with specific output format
npm run local -- eval -c examples/bedrock-openai-test/promptfooconfig.yaml --output results.json
```

## Key Parameters

- `max_completion_tokens`: Maximum tokens for response (up to context limit)
- `temperature`: Controls randomness (0.0 = deterministic, 1.0 = creative)  
- `top_p`: Nucleus sampling parameter
- `frequency_penalty`: Reduces repetition of frequent tokens
- `presence_penalty`: Reduces repetition of any tokens
- `reasoning_effort`: Controls reasoning depth (`low`, `medium`, `high`)

## Reasoning Effort

The OpenAI gpt-oss models support adjustable reasoning effort:
- `low`: Faster responses, basic reasoning
- `medium`: Balanced performance and reasoning depth  
- `high`: Thorough reasoning, slower but more accurate

This is implemented via system prompts in the Bedrock integration.