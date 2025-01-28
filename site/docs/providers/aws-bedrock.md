---
sidebar_label: AWS Bedrock
sidebar_position: 3
---

# Bedrock

The `bedrock` lets you use Amazon Bedrock in your evals. This is a common way to access Anthropic's Claude, Meta's Llama 3.1, Amazon's Nova, AI21's Jamba, and other models. The complete list of available models can be found [here](https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html#model-ids-arns).

## Setup

1. Ensure you have access to the desired models under the [Providers](https://console.aws.amazon.com/bedrock/home) page in Amazon Bedrock.

2. Install `@aws-sdk/client-bedrock-runtime`:

   ```sh
   npm install -g @aws-sdk/client-bedrock-runtime
   ```

3. The AWS SDK will automatically pull credentials from the following locations:

   - IAM roles on EC2
   - `~/.aws/credentials`
   - `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables

   See [setting node.js credentials (AWS)](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html) for more details.

4. Edit your configuration file to point to the AWS Bedrock provider. Here's an example:

   ```yaml
   providers:
     - id: bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0
   ```

   Note that the provider is `bedrock:` followed by the [ARN/model id](https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html#model-ids-arns) of the model.

5. Additional config parameters are passed like so:

   ```yaml
   providers:
     - id: bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0
       config:
         accessKeyId: YOUR_ACCESS_KEY_ID
         secretAccessKey: YOUR_SECRET_ACCESS_KEY
         region: 'us-west-2'
         max_tokens: 256
         temperature: 0.7
   ```

## Authentication

Configure Amazon Bedrock authentication in your provider's `config` section using one of these methods:

1. Access key authentication:

```yaml
providers:
  - id: bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      accessKeyId: 'YOUR_ACCESS_KEY_ID'
      secretAccessKey: 'YOUR_SECRET_ACCESS_KEY'
      sessionToken: 'YOUR_SESSION_TOKEN' # Optional
      region: 'us-east-1' # Optional, defaults to us-east-1
```

2. SSO authentication:

```yaml
providers:
  - id: bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      profile: 'YOUR_SSO_PROFILE'
      region: 'us-east-1' # Optional, defaults to us-east-1
```

The provider will automatically use AWS SSO credentials when a profile is specified. For access key authentication, both `accessKeyId` and `secretAccessKey` are required, while `sessionToken` is optional.

## Example

See [Github](https://github.com/promptfoo/promptfoo/tree/main/examples/amazon-bedrock) for full examples of Claude, Nova, AI21, Llama 3.1, and Titan model usage.

```yaml
prompts:
  - 'Write a tweet about {{topic}}'

providers:
  - id: bedrock:meta.llama3-1-405b-instruct-v1:0
    config:
      region: 'us-east-1'
      temperature: 0.7
      max_tokens: 256
  - id: bedrock:amazon.nova-lite-v1:0
    config:
      region: 'us-east-1'
      interfaceConfig:
        temperature: 0.7
        max_new_tokens: 256
  - id: bedrock:anthropic.claude-3-5-sonnet-20240229-v1:0
    config:
      region: 'us-east-1'
      temperature: 0.7
      max_tokens: 256

tests:
  - vars:
      topic: Our eco-friendly packaging
  - vars:
      topic: A sneak peek at our secret menu item
  - vars:
      topic: Behind-the-scenes at our latest photoshoot
```

## Model-specific Configuration

Different models may support different configuration options. Here are some model-specific parameters:

### Amazon Nova Models

Amazon Nova models (e.g., `amazon.nova-lite-v1:0`, `amazon.nova-pro-v1:0`, `amazon.nova-micro-v1:0`) support advanced features like tool use and structured outputs. You can configure them with the following options:

```yaml
providers:
  - id: bedrock:amazon.nova-lite-v1:0
    config:
      interfaceConfig:
        max_new_tokens: 256 # Maximum number of tokens to generate
        temperature: 0.7 # Controls randomness (0.0 to 1.0)
        top_p: 0.9 # Nucleus sampling parameter
        top_k: 50 # Top-k sampling parameter
        stopSequences: ['END'] # Optional stop sequences
      toolConfig: # Optional tool configuration
        tools:
          - toolSpec:
              name: 'calculator'
              description: 'A basic calculator for arithmetic operations'
              inputSchema:
                json:
                  type: 'object'
                  properties:
                    expression:
                      description: 'The arithmetic expression to evaluate'
                      type: 'string'
                  required: ['expression']
        toolChoice: # Optional tool selection
          tool:
            name: 'calculator'
```

Note: Nova models use a slightly different configuration structure compared to other Bedrock models, with separate `interfaceConfig` and `toolConfig` sections.

### AI21 Models

For AI21 models (e.g., `ai21.jamba-1-5-mini-v1:0`, `ai21.jamba-1-5-large-v1:0`), you can use the following configuration options:

```yaml
config:
  max_tokens: 256
  temperature: 0.7
  top_p: 0.9
  frequency_penalty: 0.5
  presence_penalty: 0.3
```

### Claude Models

For Claude models (e.g., `anthropic.us.claude-3-5-sonnet-20241022-v2:0`), you can use the following configuration options:

```yaml
config:
  max_tokens: 256
  temperature: 0.7
  anthropic_version: 'bedrock-2023-05-31'
  tools: [...] # Optional: Specify available tools
  tool_choice: { ... } # Optional: Specify tool choice
```

### Titan Models

For Titan models (e.g., `amazon.titan-text-express-v1`), you can use the following configuration options:

```yaml
config:
  maxTokenCount: 256
  temperature: 0.7
  topP: 0.9
  stopSequences: ['END']
```

### Llama

For Llama models (e.g., `meta.llama3-1-70b-instruct-v1:0`), you can use the following configuration options:

```yaml
config:
  max_gen_len: 256
  temperature: 0.7
  top_p: 0.9
```

### Cohere Models

For Cohere models (e.g., `cohere.command-text-v14`), you can use the following configuration options:

```yaml
config:
  max_tokens: 256
  temperature: 0.7
  p: 0.9
  k: 0
  stop_sequences: ['END']
```

### Mistral Models

For Mistral models (e.g., `mistral.mistral-7b-instruct-v0:2`), you can use the following configuration options:

```yaml
config:
  max_tokens: 256
  temperature: 0.7
  top_p: 0.9
  top_k: 50
```

## Model-graded tests

You can use Bedrock models to grade outputs. By default, model-graded tests use OpenAI and require the `OPENAI_API_KEY` environment variable to be set. However, when using AWS Bedrock, you have the option of overriding the grader for [model-graded assertions](/docs/configuration/expected-outputs/model-graded/) to point to AWS Bedrock or other providers.

Note that because of how model-graded evals are implemented, **the LLM grading models must support chat-formatted prompts** (except for embedding or classification models).

To set this for all your test cases, add the [`defaultTest`](/docs/configuration/guide/#default-test-cases) property to your config:

```yaml title=promptfooconfig.yaml
defaultTest:
  options:
    provider:
      id: provider:chat:modelname
      config:
        temperature: 0
        # Other provider config options
```

You can also do this for individual assertions:

```yaml
# ...
assert:
  - type: llm-rubric
    value: Do not mention that you are an AI or chat assistant
    provider:
      text:
        id: provider:chat:modelname
        config:
          region: us-east-1
          temperature: 0
          # Other provider config options...
```

Or for individual tests:

```yaml
# ...
tests:
  - vars:
      # ...
    options:
      provider:
        id: provider:chat:modelname
        config:
          temperature: 0
          # Other provider config options
    assert:
      - type: llm-rubric
        value: Do not mention that you are an AI or chat assistant
```

## Embeddings

To override the embeddings provider for all assertions that require embeddings (such as similarity), use `defaultTest`:

```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: bedrock:embeddings:amazon.titan-embed-text-v2:0
        config:
          region: us-east-1
```

## Guardrails

To use guardrails, set the `guardrailIdentifier` and `guardrailVersion` in the provider config.

For example:

```yaml
providers:
  - id: bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      guardrailIdentifier: 'test-guardrail'
      guardrailVersion: 1 # The version number for the guardrail. The value can also be DRAFT.
```

## Environment Variables

The following environment variables can be used to configure the Bedrock provider:

- `AWS_BEDROCK_REGION`: Default region for Bedrock API calls
- `AWS_BEDROCK_MAX_TOKENS`: Default maximum number of tokens to generate
- `AWS_BEDROCK_TEMPERATURE`: Default temperature for generation
- `AWS_BEDROCK_TOP_P`: Default top_p value for generation
- `AWS_BEDROCK_FREQUENCY_PENALTY`: Default frequency penalty (for supported models)
- `AWS_BEDROCK_PRESENCE_PENALTY`: Default presence penalty (for supported models)
- `AWS_BEDROCK_STOP`: Default stop sequences (as a JSON string)
- `AWS_BEDROCK_MAX_RETRIES`: Number of retry attempts for failed API calls (default: 10)

Model-specific environment variables:

- `MISTRAL_MAX_TOKENS`, `MISTRAL_TEMPERATURE`, `MISTRAL_TOP_P`, `MISTRAL_TOP_K`: For Mistral models
- `COHERE_TEMPERATURE`, `COHERE_P`, `COHERE_K`, `COHERE_MAX_TOKENS`: For Cohere models

These environment variables can be overridden by the configuration specified in the YAML file.

## Troubleshooting

### ValidationException: On-demand throughput isn't supported

If you see this error:

```text
ValidationException: Invocation of model ID anthropic.claude-3-5-sonnet-20241022-v2:0 with on-demand throughput isn't supported. Retry your request with the ID or ARN of an inference profile that contains this model.
```

This usually means you need to use the region-specific model ID. Update your provider configuration to include the regional prefix:

```yaml
providers:
  # Instead of this:
  - id: bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0
  # Use this:
  - id: bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0 # US region
  # or
  - id: bedrock:eu.anthropic.claude-3-5-sonnet-20241022-v2:0 # EU region
  # or
  - id: bedrock:apac.anthropic.claude-3-5-sonnet-20241022-v2:0 # APAC region
```

Make sure to:

1. Choose the correct regional prefix (`us.`, `eu.`, or `apac.`) based on your AWS region
2. Configure the corresponding region in your provider config
3. Ensure you have model access enabled in your AWS Bedrock console for that region

### AccessDeniedException: You don't have access to the model with the specified model ID

If you see this error. Make sure you have access to the model in the region you're using:

1. Verify model access in AWS Console:
   - Go to AWS Bedrock Console
   - Navigate to "Model access"
   - Enable access for the specific model
2. Check your region configuration matches the model's region.
