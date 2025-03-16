---
sidebar_label: Amazon SageMaker
title: Amazon SageMaker Provider
description: Evaluate models deployed on Amazon SageMaker endpoints with promptfoo
---

# Amazon SageMaker

The `sagemaker` provider allows you to use Amazon SageMaker endpoints in your evals. This enables testing and evaluation of any model deployed on SageMaker, including models from Hugging Face, custom-trained models, foundation models from Amazon SageMaker JumpStart, and more. For AWS-managed foundation models without custom endpoints, you might also consider the [AWS Bedrock provider](./aws-bedrock.md).

## Setup

1. Ensure you have deployed the desired models as SageMaker endpoints.

2. Install required dependencies:

   ```bash
   npm install -g @aws-sdk/client-sagemaker-runtime jsonpath
   ```

3. The AWS SDK will automatically pull credentials from the following locations:

   - IAM roles on EC2
   - `~/.aws/credentials`
   - `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables

   :::info

   See [setting node.js credentials (AWS)](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html) for more details.

   :::

4. Edit your configuration file to point to the SageMaker provider. Here's an example:

   ```yaml
   providers:
     - id: sagemaker:my-sagemaker-endpoint
   ```

   Note that the provider is `sagemaker:` followed by the name of your SageMaker endpoint.

5. Additional config parameters are passed like so:

   ```yaml
   providers:
     - id: sagemaker:my-sagemaker-endpoint
       config:
         accessKeyId: YOUR_ACCESS_KEY_ID
         secretAccessKey: YOUR_SECRET_ACCESS_KEY
         region: 'us-west-2'
         modelType: 'openai'
         maxTokens: 256
         temperature: 0.7
   ```

## Authentication

Configure Amazon SageMaker authentication in your provider's `config` section using one of these methods:

1. Access key authentication:

```yaml
providers:
  - id: sagemaker:my-sagemaker-endpoint
    config:
      accessKeyId: 'YOUR_ACCESS_KEY_ID'
      secretAccessKey: 'YOUR_SECRET_ACCESS_KEY'
      sessionToken: 'YOUR_SESSION_TOKEN' # Optional
      region: 'us-east-1' # Optional, defaults to us-east-1
```

2. SSO authentication:

```yaml
providers:
  - id: sagemaker:my-sagemaker-endpoint
    config:
      profile: 'YOUR_SSO_PROFILE'
      region: 'us-east-1' # Optional, defaults to us-east-1
```

The provider will automatically use AWS SSO credentials when a profile is specified. For access key authentication, both `accessKeyId` and `secretAccessKey` are required, while `sessionToken` is optional.

## Provider Syntax

The SageMaker provider supports several syntax patterns:

1. Basic endpoint specification:

   ```yaml
   sagemaker:my-endpoint-name
   ```

2. Model type specification (for common model formats):

   ```yaml
   sagemaker:openai:my-endpoint-name
   ```

   This helps format requests properly for the specific model type deployed on your endpoint.

3. Embedding endpoint specification:

   ```yaml
   sagemaker:embedding:my-embedding-endpoint
   ```

   For endpoints that generate embeddings rather than text completions.

4. JumpStart model specification:
   ```yaml
   sagemaker:jumpstart:my-jumpstart-endpoint
   ```
   For AWS JumpStart foundation models that require specific input/output formats.

The provider also automatically detects JumpStart models when the endpoint name contains "jumpstart".

## Examples

### Standard Example

```yaml
prompts:
  - 'Write a tweet about {{topic}}'

providers:
  - id: sagemaker:openai:my-gpt-endpoint
    config:
      region: 'us-east-1'
      temperature: 0.7
      maxTokens: 256
  - id: sagemaker:anthropic:my-claude-endpoint
    config:
      region: 'us-east-1'
      temperature: 0.7
      maxTokens: 256

tests:
  - vars:
      topic: Our eco-friendly packaging
  - vars:
      topic: A sneak peek at our secret menu item
  - vars:
      topic: Behind-the-scenes at our latest photoshoot
```

### Llama Model Example (JumpStart)

For Llama 3 models deployed via JumpStart:

```yaml
prompts:
  - 'Generate a creative name for a coffee shop that specializes in {{flavor}} coffee.'

providers:
  - id: sagemaker:jumpstart:llama-3-2-1b-instruct
    label: 'Llama 3.2 (8B) on SageMaker'
    delay: 500 # Add 500ms delay between requests to prevent rate limiting
    config:
      region: us-west-2
      modelType: jumpstart # Use the JumpStart format handler
      temperature: 0.7
      maxTokens: 256
      topP: 0.9
      contentType: 'application/json'
      acceptType: 'application/json'
      responseFormat:
        path: '$.generated_text' # Extract this field from the response

tests:
  - vars:
      flavor: caramel
  - vars:
      flavor: pumpkin spice
  - vars:
      flavor: lavender
```

### Mistral Model Example (Hugging Face)

For Mistral 7B models deployed via Hugging Face:

```yaml
prompts:
  - 'Generate a creative name for a coffee shop that specializes in {{flavor}} coffee.'

providers:
  - id: sagemaker:huggingface:mistral-7b-v3
    label: 'Mistral 7B v3 on SageMaker'
    delay: 500 # Add 500ms delay between requests to prevent rate limiting
    config:
      region: us-west-2
      modelType: huggingface # Use the Hugging Face format handler
      temperature: 0.7
      maxTokens: 256
      topP: 0.9
      contentType: 'application/json'
      acceptType: 'application/json'
      responseFormat:
        path: '$[0].generated_text' # Note the array-based response format

tests:
  - vars:
      flavor: caramel
  - vars:
      flavor: pumpkin spice
  - vars:
      flavor: lavender
```

### Comparing Multiple Models

This example shows how to compare Llama and Mistral models side-by-side:

```yaml
description: 'Comparison between Mistral 7B and Llama 3 on SageMaker'

prompts:
  - 'Generate a creative name for a coffee shop that specializes in {{flavor}} coffee.'
  - 'Write a short story about {{topic}} in {{style}} style. Aim for {{length}} words.'
  - 'Explain the concept of {{concept}} to {{audience}} in a way they can understand.'

providers:
  # Llama 3.2 provider
  - id: sagemaker:jumpstart:llama-3-2-1b-instruct
    label: 'Llama 3.2 (8B)'
    delay: 500 # Add 500ms delay between requests
    config:
      region: us-west-2
      modelType: jumpstart
      temperature: 0.7
      maxTokens: 256
      topP: 0.9
      contentType: 'application/json'
      acceptType: 'application/json'
      responseFormat:
        path: '$.generated_text'

  # Mistral 7B provider
  - id: sagemaker:huggingface:mistral-7b-v3
    label: 'Mistral 7B v3'
    delay: 500 # Add 500ms delay between requests
    config:
      region: us-west-2
      modelType: huggingface
      temperature: 0.7
      maxTokens: 256
      topP: 0.9
      contentType: 'application/json'
      acceptType: 'application/json'
      responseFormat:
        path: '$[0].generated_text'

tests:
  - vars:
      flavor: caramel
      topic: a robot that becomes self-aware
      style: science fiction
      length: '250'
      concept: artificial intelligence
      audience: a 10-year-old
  - vars:
      flavor: lavender
      topic: a barista who can read customers' minds
      style: mystery
      length: '300'
      concept: machine learning
      audience: a senior citizen
```

## Model Types

The SageMaker provider supports various model types to properly format requests and parse responses. Specify the model type in the provider ID or in the configuration:

```yaml
# In provider ID
providers:
  - id: sagemaker:openai:my-endpoint

# Or in config
providers:
  - id: sagemaker:my-endpoint
    config:
      modelType: 'openai'
```

Supported model types:

| Model Type    | Description                                     | JSONPath for Results  |
| ------------- | ----------------------------------------------- | --------------------- |
| `openai`      | OpenAI-compatible models                        | Standard format       |
| `anthropic`   | Anthropic Claude-compatible models              | Standard format       |
| `llama`       | LLama-compatible models                         | Standard format       |
| `huggingface` | Hugging Face models (like Mistral)              | `$[0].generated_text` |
| `jumpstart`   | AWS JumpStart foundation models                 | `$.generated_text`    |
| `custom`      | Custom model formats (default if not specified) | Depends on model      |

:::warning

Different model types return results in different response formats. You should configure the appropriate JSONPath for response extraction:

- **JumpStart models** (Llama): Use `responseFormat.path: "$.generated_text"`
- **Hugging Face models** (Mistral): Use `responseFormat.path: "$[0].generated_text"`

:::

## Configuration Options

Common configuration options for SageMaker endpoints:

| Option          | Description                                  | Default            |
| --------------- | -------------------------------------------- | ------------------ |
| `endpoint`      | SageMaker endpoint name                      | (from provider ID) |
| `region`        | AWS region                                   | `us-east-1`        |
| `modelType`     | Model type for request/response formatting   | `custom`           |
| `maxTokens`     | Maximum number of tokens to generate         | `1024`             |
| `temperature`   | Controls randomness (0.0 to 1.0)             | `0.7`              |
| `topP`          | Nucleus sampling parameter                   | `1.0`              |
| `stopSequences` | Array of sequences where generation stops    | `[]`               |
| `contentType`   | Content type for SageMaker request           | `application/json` |
| `acceptType`    | Accept type for SageMaker response           | `application/json` |
| `delay`         | Delay between API calls in milliseconds      | `0`                |
| `transform`     | Function to transform prompts before sending | N/A                |

## Response Parsing with JSONPath

For endpoints with unique response formats, you can use JSONPath to extract the specific field containing the generated text:

```yaml
providers:
  - id: sagemaker:my-custom-endpoint
    config:
      responseFormat:
        path: '$.custom.nested.responseField'
```

This will extract the value at the specified path from the JSON response.

## Embeddings

To use SageMaker embedding endpoints:

```yaml
providers:
  - id: sagemaker:embedding:my-embedding-endpoint
    config:
      region: 'us-east-1'
      modelType: 'openai' # Optional, helps format the request
```

For assertions that require embeddings (like similarity comparisons), you can specify a SageMaker embedding provider:

```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: sagemaker:embedding:my-embedding-endpoint
        config:
          region: us-east-1
```

## Environment Variables

The following environment variables can be used to configure the SageMaker provider:

- `AWS_REGION` or `AWS_DEFAULT_REGION`: Default region for SageMaker API calls
- `AWS_SAGEMAKER_MAX_TOKENS`: Default maximum number of tokens to generate
- `AWS_SAGEMAKER_TEMPERATURE`: Default temperature for generation
- `AWS_SAGEMAKER_TOP_P`: Default top_p value for generation
- `AWS_SAGEMAKER_MAX_RETRIES`: Number of retry attempts for failed API calls (default: 3)

These environment variables can be overridden by the configuration specified in the YAML file.

## Caching Support

The SageMaker provider fully supports the promptfoo caching system, which can significantly speed up evaluations and reduce costs when running repeated tests:

```yaml
# Enable caching in your config
cache: true

providers:
  - id: sagemaker:my-endpoint
    config:
      region: us-east-1
```

When caching is enabled:

- Responses for identical prompts are stored and reused
- Token usage statistics are maintained with a `cached` flag
- Debug mode will bypass the cache when needed

You can enable caching with the command line flag:

```bash
promptfoo eval --cache
```

Or disable caching for specific test runs even when globally enabled:

```bash
promptfoo eval --no-cache
```

## Rate Limiting with Delays

The SageMaker provider supports rate limiting through configurable delays between API calls:

```yaml
providers:
  - id: sagemaker:my-endpoint
    config:
      region: us-east-1
      delay: 1000 # Add a 1000ms (1 second) delay between API calls
```

You can also specify the delay directly at the provider level:

```yaml
providers:
  - id: sagemaker:my-endpoint
    delay: 1000 # 1 second delay
    config:
      region: us-east-1
```

This helps:

- Avoid rate limiting by SageMaker endpoints
- Reduce costs by spacing out requests
- Improve reliability for endpoints with concurrency limitations

Note that delays are only applied for actual API calls, not when responses are retrieved from cache.

## Transforming Prompts

The SageMaker provider supports transforming prompts before they're sent to the endpoint. This is especially useful for:

- Formatting prompts specifically for a particular model type
- Adding system instructions or context
- Converting between different prompt formats
- Preprocessing text for specialized models

You can specify a transform function in your configuration:

```yaml
providers:
  - id: sagemaker:my-endpoint
    config:
      region: us-east-1
      transform: |
        // Transform the prompt before sending to SageMaker
        return `<s>[INST] ${prompt} [/INST]`
```

For more complex transformations, use a file:

```yaml
providers:
  - id: sagemaker:jumpstart:my-llama-endpoint
    config:
      region: us-west-2
      modelType: jumpstart
      transform: file://transform.js
```

Where `transform.js` might contain:

```javascript
// Transform function for formatting Llama prompts
module.exports = function (prompt, context) {
  return {
    inputs: prompt,
    parameters: {
      max_new_tokens: context.config?.maxTokens || 256,
      temperature: context.config?.temperature || 0.7,
      top_p: context.config?.topP || 0.9,
      do_sample: true,
    },
  };
};
```

The transform function can also be specified directly at the provider level:

```yaml
providers:
  - id: sagemaker:my-endpoint
    transform: file://transforms/format-prompt.js
    config:
      region: us-east-1
```

Transformed prompts maintain proper caching and include metadata about the transformation in the response.

## Troubleshooting

### Installation Issues

If you see this error:

> "Could not load the SageMaker Runtime client"

Make sure you've installed the required AWS SDK package:

```bash
npm install -g @aws-sdk/client-sagemaker-runtime
```

### Authentication Errors

If you get "Access denied" or similar authentication errors, ensure your AWS credentials have permissions to invoke the SageMaker endpoint. The IAM policy should include:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sagemaker:InvokeEndpoint",
      "Resource": "arn:aws:sagemaker:*:*:endpoint/*"
    }
  ]
}
```

### Endpoint Issues

If your endpoint isn't found, verify that:

1. The endpoint name is correct and matches exactly
2. The endpoint is deployed and in service
3. You're using the correct AWS region

You can check the status of your endpoints in the SageMaker console or using the AWS CLI:

```bash
aws sagemaker list-endpoints --region us-east-1
```

### Response Format Issues

If you're getting unusual responses from your endpoint, try:

1. Setting `modelType` to match your model (or `custom` if unique)
2. Using the `responseFormat.path` option to extract the correct field:
   - For Llama models (JumpStart): Use `path: "$.generated_text"`
   - For Mistral models (Hugging Face): Use `path: "$[0].generated_text"`
3. Checking that your endpoint is correctly processing the input format
4. Adding a delay parameter (e.g., `delay: 500`) to prevent rate limiting

For debug purposes, you can run with detailed logging:

```bash
DEBUG=* promptfoo eval
```

### "Batch inference failed" Errors

If you encounter "Batch inference failed" errors:

1. Add a `delay` parameter (at least 500ms recommended)
2. Verify you're using the correct `modelType` for your endpoint:
   - For Llama models: Use `modelType: jumpstart`
   - For Mistral models: Use `modelType: huggingface`
3. Ensure you've specified the correct `contentType` and `acceptType` as "application/json"
4. Check that your endpoint is active and functioning in the SageMaker console

## See Also

- [Configuration Reference](../reference/configuration.md)
- [Command Line Interface](../reference/cli.md)
- [Provider Options](../reference/providers.md)
- [Amazon SageMaker Examples](https://github.com/promptfoo/promptfoo/tree/main/examples/amazon-sagemaker)
- [AWS Bedrock Provider](./aws-bedrock.md) - For using AWS-managed foundation models without deploying custom endpoints
