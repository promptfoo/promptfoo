---
sidebar_label: AWS Bedrock
sidebar_position: 3
description: Learn how to use Amazon Bedrock models in your evaluations, including Claude, Llama, Nova, and other models
---

# Bedrock

The `bedrock` lets you use Amazon Bedrock in your evals. This is a common way to access Anthropic's Claude, Meta's Llama 3.3, Amazon's Nova, AI21's Jamba, and other models. The complete list of available models can be found [here](https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html#model-ids-arns).

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
     - id: bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0
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

Amazon Bedrock follows a specific credential resolution order that prioritizes explicitly configured credentials over default AWS mechanisms.

### Credential Resolution Order

When authenticating with AWS Bedrock, credentials are resolved in this sequence:

1. **Config file credentials**: Explicitly provided `accessKeyId` and `secretAccessKey` in your promptfoo configuration
2. **SSO profile**: When a `profile` is specified in your config
3. **AWS default credential chain**:
   - Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
   - Shared credentials file (`~/.aws/credentials`)
   - EC2 instance profile or ECS task role
   - SSO credentials from AWS CLI

### Authentication Options

#### 1. Explicit credentials (highest priority)

Specify direct access keys in your config:

```yaml title="promptfooconfig.yaml"
providers:
  - id: bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0
    config:
      accessKeyId: 'YOUR_ACCESS_KEY_ID'
      secretAccessKey: 'YOUR_SECRET_ACCESS_KEY'
      sessionToken: 'YOUR_SESSION_TOKEN' # Optional
      region: 'us-east-1' # Optional, defaults to us-east-1
```

This method overrides all other credential sources, including EC2 instance roles.

#### 2. SSO profile authentication

Use a profile from your AWS configuration:

```yaml title="promptfooconfig.yaml"
providers:
  - id: bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0
    config:
      profile: 'YOUR_SSO_PROFILE'
      region: 'us-east-1' # Optional, defaults to us-east-1
```

#### 3. Default credentials (lowest priority)

Rely on the AWS default credential chain:

```yaml title="promptfooconfig.yaml"
providers:
  - id: bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0
    config:
      region: 'us-east-1' # Only region specified
```

This method is ideal when running on EC2 instances with IAM roles, as it automatically uses the instance's credentials.

## Example

See [Github](https://github.com/promptfoo/promptfoo/tree/main/examples/amazon-bedrock) for full examples of Claude, Nova, AI21, Llama 3.3, and Titan model usage.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'Write a tweet about {{topic}}'

providers:
  - id: bedrock:meta.llama3-1-405b-instruct-v1:0
    config:
      region: 'us-east-1'
      temperature: 0.7
      max_tokens: 256
  - id: bedrock:us.meta.llama3-3-70b-instruct-v1:0
    config:
      max_gen_len: 256
  - id: bedrock:amazon.nova-lite-v1:0
    config:
      region: 'us-east-1'
      interfaceConfig:
        temperature: 0.7
        max_new_tokens: 256
  - id: bedrock:us.amazon.nova-premier-v1:0
    config:
      region: 'us-east-1'
      interfaceConfig:
        temperature: 0.7
        max_new_tokens: 256
  - id: bedrock:us.anthropic.claude-opus-4-20250514-v1:0
    config:
      region: 'us-east-1'
      temperature: 0.7
      max_tokens: 256
  - id: bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0
    config:
      region: 'us-east-1'
      temperature: 0.7
      max_tokens: 256
  - id: bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0
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

Amazon Nova models (e.g., `amazon.nova-lite-v1:0`, `amazon.nova-pro-v1:0`, `amazon.nova-micro-v1:0`, `amazon.nova-premier-v1:0`) support advanced features like tool use and structured outputs. You can configure them with the following options:

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

:::note

Nova models use a slightly different configuration structure compared to other Bedrock models, with separate `interfaceConfig` and `toolConfig` sections.

:::

### Amazon Nova Sonic Model

The Amazon Nova Sonic model (`amazon.nova-sonic-v1:0`) is a multimodal model that supports audio input and text/audio output with tool-using capabilities. It has a different configuration structure compared to other Nova models:

```yaml
providers:
  - id: bedrock:amazon.nova-sonic-v1:0
    config:
      inferenceConfiguration:
        maxTokens: 1024 # Maximum number of tokens to generate
        temperature: 0.7 # Controls randomness (0.0 to 1.0)
        topP: 0.95 # Nucleus sampling parameter
      textOutputConfiguration:
        mediaType: text/plain
      toolConfiguration: # Optional tool configuration
        tools:
          - toolSpec:
              name: 'getDateTool'
              description: 'Get information about the current date'
              inputSchema:
                json: '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{},"required":[]}'
      toolUseOutputConfiguration:
        mediaType: application/json
      # Optional audio output configuration
      audioOutputConfiguration:
        mediaType: audio/lpcm
        sampleRateHertz: 24000
        sampleSizeBits: 16
        channelCount: 1
        voiceId: matthew
        encoding: base64
        audioType: SPEECH
```

Note: Nova Sonic has advanced multimodal capabilities including audio input/output, but audio input requires base64 encoded data which may be better handled through the API directly rather than in the configuration file.

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

For Claude models (e.g., `anthropic.claude-sonnet-4-20250514-v1:0`, `anthropic.us.claude-3-5-sonnet-20241022-v2:0`), you can use the following configuration options:

```yaml
config:
  max_tokens: 256
  temperature: 0.7
  anthropic_version: 'bedrock-2023-05-31'
  tools: [...] # Optional: Specify available tools
  tool_choice: { ... } # Optional: Specify tool choice
  thinking: { ... } # Optional: Enable Claude's extended thinking capability
  showThinking: true # Optional: Control whether thinking content is included in output
```

When using Claude's extended thinking capability, you can configure it like this:

```yaml
config:
  max_tokens: 20000
  thinking:
    type: 'enabled'
    budget_tokens: 16000 # Must be ≥1024 and less than max_tokens
  showThinking: true # Whether to include thinking content in the output (default: true)
```

:::tip

The `showThinking` parameter controls whether thinking content is included in the response output:

- When set to `true` (default), thinking content will be included in the output
- When set to `false`, thinking content will be excluded from the output

This is useful when you want to use thinking for better reasoning but don't want to expose the thinking process to end users.

:::

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

For Llama models (e.g., `meta.llama3-1-70b-instruct-v1:0`, `meta.llama3-2-90b-instruct-v1:0`, `meta.llama3-3-70b-instruct-v1:0`, `meta.llama4-scout-17b-instruct-v1:0`, `meta.llama4-maverick-17b-instruct-v1:0`), you can use the following configuration options:

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

### DeepSeek Models

For DeepSeek models, you can use the following configuration options:

```yaml
config:
  # Deepseek params
  max_tokens: 256
  temperature: 0.7
  top_p: 0.9

  # Promptfoo control params
  showThinking: true # Optional: Control whether thinking content is included in output
```

DeepSeek models support an extended thinking capability. The `showThinking` parameter controls whether thinking content is included in the response output:

- When set to `true` (default), thinking content will be included in the output
- When set to `false`, thinking content will be excluded from the output

This allows you to access the model's reasoning process during generation while having the option to present only the final response to end users.

## Model-graded tests

You can use Bedrock models to grade outputs. By default, model-graded tests use `gpt-4.1-2025-04-14` and require the `OPENAI_API_KEY` environment variable to be set. However, when using AWS Bedrock, you have the option of overriding the grader for [model-graded assertions](/docs/configuration/expected-outputs/model-graded/) to point to AWS Bedrock or other providers.

:::warning

Because of how model-graded evals are implemented, **the LLM grading models must support chat-formatted prompts** (except for embedding or classification models).

:::

To set this for all your test cases, add the [`defaultTest`](/docs/configuration/guide/#default-test-cases) property to your config:

```yaml title="promptfooconfig.yaml"
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

## Multimodal Capabilities

Some Bedrock models, like Amazon Nova, support multimodal inputs including images and text. To use these capabilities, you'll need to structure your prompts to include both the image data and text content.

### Nova Vision Capabilities

Amazon Nova supports comprehensive vision understanding for both images and videos:

- **Images**: Supports PNG, JPG, JPEG, GIF, WebP formats via Base-64 encoding. Multiple images allowed per payload (up to 25MB total).
- **Videos**: Supports various formats (MP4, MKV, MOV, WEBM, etc.) via Base-64 (less than 25MB) or Amazon S3 URI (up to 1GB).

Here's an example configuration for running multimodal evaluations:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Bedrock Nova Eval with Images'

prompts:
  - file://nova_multimodal_prompt.json

providers:
  - id: bedrock:amazon.nova-pro-v1:0
    config:
      region: 'us-east-1'
      inferenceConfig:
        temperature: 0.7
        max_new_tokens: 256

tests:
  - vars:
      image: file://path/to/image.jpg
```

The prompt file (`nova_multimodal_prompt.json`) should be structured to include both image and text content. This format will depend on the specific model you're using:

```json title="nova_multimodal_prompt.json"
[
  {
    "role": "user",
    "content": [
      {
        "image": {
          "format": "jpg",
          "source": { "bytes": "{{image}}" }
        }
      },
      {
        "text": "What is this a picture of?"
      }
    ]
  }
]
```

See [Github](https://github.com/promptfoo/promptfoo/blob/main/examples/amazon-bedrock/promptfooconfig.nova.multimodal.yaml) for a runnable example.

When loading image files as variables, Promptfoo automatically converts them to the appropriate format for the model. The supported image formats include:

- jpg/jpeg
- png
- gif
- bmp
- webp
- svg

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
  - id: bedrock:anthropic.claude-sonnet-4-20250514-v1:0
  # Use this:
  - id: bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0 # US region
  # or
  - id: bedrock:eu.anthropic.claude-sonnet-4-20250514-v1:0 # EU region
  # or
  - id: bedrock:apac.anthropic.claude-sonnet-4-20250514-v1:0 # APAC region
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

## Knowledge Base

AWS Bedrock Knowledge Bases provide Retrieval Augmented Generation (RAG) functionality, allowing you to query a knowledge base with natural language and get responses based on your data.

### Prerequisites

To use the Knowledge Base provider, you need:

1. An existing Knowledge Base created in AWS Bedrock
2. Install the required SDK:

   ```sh
   npm install -g @aws-sdk/client-bedrock-agent-runtime
   ```

### Configuration

Configure the Knowledge Base provider by specifying `kb` in your provider ID. Note that the model ID needs to include the regional prefix (`us.`, `eu.`, or `apac.`):

```yaml title="promptfooconfig.yaml"
providers:
  - id: bedrock:kb:us.anthropic.claude-3-7-sonnet-20250219-v1:0
    config:
      region: 'us-east-2'
      knowledgeBaseId: 'YOUR_KNOWLEDGE_BASE_ID'
      temperature: 0.0
      max_tokens: 1000
```

The provider ID follows this pattern: `bedrock:kb:[REGIONAL_MODEL_ID]`

For example:

- `bedrock:kb:us.anthropic.claude-3-7-sonnet-20250219-v1:0` (US region)
- `bedrock:kb:eu.anthropic.claude-3-sonnet-20240229-v1:0` (EU region)

Configuration options include:

- `knowledgeBaseId` (required): The ID of your AWS Bedrock Knowledge Base
- `region`: AWS region where your Knowledge Base is deployed (e.g., 'us-east-1', 'us-east-2', 'eu-west-1')
- `temperature`: Controls randomness in response generation (default: 0.0)
- `max_tokens`: Maximum number of tokens in the generated response
- `accessKeyId`, `secretAccessKey`, `sessionToken`: AWS credentials (if not using environment variables or IAM roles)
- `profile`: AWS profile name for SSO authentication

### Example

Here's a complete example to test your Knowledge Base with a few questions:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'What is the capital of France?'
  - 'Tell me about quantum computing.'

providers:
  # Knowledge Base provider
  - id: bedrock:kb:us.anthropic.claude-3-7-sonnet-20250219-v1:0
    config:
      region: 'us-east-2'
      knowledgeBaseId: 'YOUR_KNOWLEDGE_BASE_ID'
      temperature: 0.0
      max_tokens: 1000

  # Regular Claude model for comparison
  - id: bedrock:us.anthropic.claude-3-7-sonnet-20250219-v1:0
    config:
      region: 'us-east-2'
      temperature: 0.0
      max_tokens: 1000

tests:
  - description: 'Basic factual questions from the knowledge base'
```

### Citations

The Knowledge Base provider returns both the generated response and citations from the source documents. These citations are included in the evaluation results and can be used to verify the accuracy of the responses.

:::info

When viewing evaluation results in the UI, citations appear in a separate section within the details view of each response. You can click on the source links to visit the original documents or copy citation content for reference.

:::

### Response Format

When using the Knowledge Base provider, the response will include:

1. **output**: The text response generated by the model based on your query
2. **metadata.citations**: An array of citations that includes:
   - `retrievedReferences`: References to source documents that informed the response
   - `generatedResponsePart`: Parts of the response that correspond to specific citations

### Context Evaluation with contextTransform

The Knowledge Base provider supports extracting context from citations for evaluation using the `contextTransform` feature:

```yaml title="promptfooconfig.yaml"
tests:
  - vars:
      query: 'What is promptfoo?'
    assert:
      # Extract context from all citations
      - type: context-faithfulness
        contextTransform: |
          if (!metadata?.citations) return '';
          return metadata.citations
            .flatMap(citation => citation.retrievedReferences || [])
            .map(ref => ref.content?.text || '')
            .filter(text => text.length > 0)
            .join('\n\n');
        threshold: 0.7

      # Extract context from first citation only
      - type: context-relevance
        contextTransform: 'metadata?.citations?.[0]?.retrievedReferences?.[0]?.content?.text || ""'
        threshold: 0.6
```

This approach allows you to:

- **Evaluate real retrieval**: Test against the actual context retrieved by your Knowledge Base
- **Measure faithfulness**: Verify responses don't hallucinate beyond the retrieved content
- **Assess relevance**: Check if retrieved context is relevant to the query
- **Validate recall**: Ensure important information appears in retrieved context

See the [Knowledge Base contextTransform example](https://github.com/promptfoo/promptfoo/tree/main/examples/amazon-bedrock) for complete configuration examples.

## See Also

- [Amazon SageMaker Provider](./sagemaker.md) - For custom-deployed or fine-tuned models on AWS
- [RAG Evaluation Guide](../guides/evaluate-rag.md) - Complete guide to evaluating RAG systems with context-based assertions
- [Context-based Assertions](../configuration/expected-outputs/model-graded/index.md) - Documentation on context-faithfulness, context-relevance, and context-recall
- [Configuration Reference](../configuration/reference.md) - Complete configuration options including contextTransform
- [Command Line Interface](../usage/command-line.md) - How to use promptfoo from the command line
- [Provider Options](../providers/index.md) - Overview of all supported providers
- [Amazon Bedrock Examples](https://github.com/promptfoo/promptfoo/tree/main/examples/amazon-bedrock) - Runnable examples of Bedrock integration, including Knowledge Base and contextTransform examples
