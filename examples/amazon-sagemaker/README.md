# Amazon SageMaker Provider Examples

This directory contains examples for using the Amazon SageMaker provider with promptfoo, which allows you to evaluate models deployed on SageMaker endpoints.

## Prerequisites

1. AWS account with SageMaker access
2. Deployed SageMaker endpoints with your models
3. AWS credentials configured
4. Required npm packages:
   ```bash
   npm install -g @aws-sdk/client-sagemaker-runtime jsonpath
   ```

## Example Configurations

- **promptfooconfig.openai.yaml**: Configuration for OpenAI-compatible models on SageMaker
- **promptfooconfig.anthropic.yaml**: Configuration for Anthropic Claude models on SageMaker
- **promptfooconfig.jumpstart.yaml**: Configuration for AWS JumpStart foundation models
- **promptfooconfig.llama.yaml**: Configuration for Llama 3.2 models on SageMaker JumpStart
- **promptfooconfig.mistral.yaml**: Configuration for Mistral 7B v3 models on SageMaker (Hugging Face)
- **promptfooconfig.llama-vs-mistral.yaml**: Configuration comparing Llama and Mistral models
- **promptfooconfig.embedding.yaml**: Configuration for embedding models on SageMaker
- **promptfooconfig.multimodel.yaml**: Configuration comparing multiple model types on SageMaker
- **promptfooconfig.transform.yaml**: Configuration demonstrating transform functions for SageMaker endpoints

## Running the Examples

Replace the endpoint names in the example configs with your actual SageMaker endpoints:

```bash
promptfoo eval -c promptfooconfig.jumpstart.yaml
```

To enable caching for faster evaluation and reduced costs when running multiple tests:

```bash
promptfoo eval -c promptfooconfig.jumpstart.yaml --cache
```

## Testing with the Test Script

This directory includes a test script to validate your SageMaker endpoint configuration:

```bash
# Basic test for an OpenAI-compatible endpoint
node test-sagemaker-provider.js --endpoint=my-endpoint --model-type=openai

# Test with an embedding endpoint
node test-sagemaker-provider.js --endpoint=my-embedding-endpoint --embedding=true

# Test with transforms
node test-sagemaker-provider.js --endpoint=my-endpoint --model-type=llama --transform=true

# Test with a custom transform file
node test-sagemaker-provider.js --endpoint=my-endpoint --transform=true --transform-file=transform.js
```

## Transform Functions

The SageMaker provider supports transforming prompts before they're sent to the endpoint. This is especially useful for formatting prompts according to specific model requirements.

### Inline Transform

```yaml
providers:
  - id: sagemaker:llama:your-endpoint
    config:
      region: us-west-2
      modelType: llama
      # Apply an inline transform
      transform: |
        return `<s>[INST] ${prompt} [/INST]`;
```

### File-Based Transform

This directory includes a sample transform file (`transform.js`) that shows how to create reusable transformations:

```yaml
providers:
  - id: sagemaker:jumpstart:your-endpoint
    config:
      region: us-west-2
      modelType: jumpstart
      # Reference an external transform file
      transform: file://transform.js
```

The transform function receives the prompt and a context object containing the provider configuration:

```javascript
module.exports = function(prompt, context) {
  // Access config values
  const maxTokens = context.config?.maxTokens || 256;
  
  // Return transformed input
  return {
    inputs: prompt,
    parameters: {
      max_new_tokens: maxTokens,
      temperature: 0.7
    }
  };
};
```

## JumpStart Models

JumpStart models require a specific input/output format. The provider handles this automatically when `modelType: jumpstart` is specified:

```yaml
providers:
  - id: sagemaker:jumpstart:your-jumpstart-endpoint
    config:
      region: us-west-2
      modelType: jumpstart
      maxTokens: 256
      responseFormat:
        path: "$.generated_text"
```

## Rate Limiting with Delays

For better rate limiting with SageMaker endpoints, you can add delays between API calls:

```yaml
providers:
  - id: sagemaker:your-endpoint
    config:
      region: us-west-2
      delay: 500  # Add a 500ms delay between API calls
```

## Troubleshooting

### "Batch inference failed" Errors

If you encounter "Batch inference failed" errors:

1. Add a `delay` parameter (at least 500ms recommended)
2. Verify you're using the correct `modelType` for your endpoint:
   - For Llama models: Use `modelType: jumpstart`
   - For Mistral models: Use `modelType: huggingface`
3. Ensure you've specified the correct `contentType` and `acceptType` as "application/json"
4. Check that your endpoint is active and functioning in the SageMaker console

### Response Format Issues

If you're getting unusual responses or missing output:

1. Make sure you're using the correct JSONPath for your model type:
   - For Llama models (JumpStart): Use `responseFormat.path: "$.generated_text"`
   - For Mistral models (Hugging Face): Use `responseFormat.path: "$[0].generated_text"`

### Transform Issues

If transforms aren't working correctly:

1. Check that your transform function returns a valid string or object
2. For file-based transforms, verify the file path is correct and the file is accessible
3. Use the test script with `--transform=true` to debug transform behavior

### Rate Limiting

If you're still experiencing errors even with the correct configuration:

1. Increase the delay between requests (try 1000ms or higher)
2. Run fewer tests in parallel
3. Monitor your endpoint metrics in the SageMaker console