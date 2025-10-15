---
title: AWS Bedrock
sidebar_label: AWS Bedrock
sidebar_position: 3
description: Configure Amazon Bedrock for LLM evals with Claude, Llama, Nova, and Mistral models using AWS-managed infrastructure
---

# Bedrock

The `bedrock` provider lets you use Amazon Bedrock in your evals. This is a common way to access Anthropic's Claude, Meta's Llama 3.3, Amazon's Nova, OpenAI's GPT-OSS models, AI21's Jamba, Alibaba's Qwen, and other models. The complete list of available models can be found in the [AWS Bedrock model IDs documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html#model-ids-arns).

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
     - id: bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0
   ```

   Note that the provider is `bedrock:` followed by the [ARN/model id](https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html#model-ids-arns) of the model.

5. Additional config parameters are passed like so:

   ```yaml
   providers:
     - id: bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0
       config:
         accessKeyId: YOUR_ACCESS_KEY_ID
         secretAccessKey: YOUR_SECRET_ACCESS_KEY
         region: 'us-west-2'
         max_tokens: 256
         temperature: 0.7
   ```

## Application Inference Profiles

AWS Bedrock supports Application Inference Profiles, which allow you to use a single ARN to access multiple foundation models across different regions. This helps optimize costs and availability while maintaining consistent performance.

### Using Inference Profiles

When using an inference profile ARN, you must specify the `inferenceModelType` in your configuration to indicate which model family the profile is configured for:

```yaml
providers:
  - id: bedrock:arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/my-profile
    config:
      inferenceModelType: 'claude' # Required for inference profiles
      region: 'us-east-1'
      max_tokens: 256
      temperature: 0.7
```

### Supported Model Types

The `inferenceModelType` config option supports the following values:

- `claude` - For Anthropic Claude models
- `nova` - For Amazon Nova models
- `llama` - Defaults to Llama 4 (latest version)
- `llama2` - For Meta Llama 2 models
- `llama3` - For Meta Llama 3 models
- `llama3.1` or `llama3_1` - For Meta Llama 3.1 models
- `llama3.2` or `llama3_2` - For Meta Llama 3.2 models
- `llama3.3` or `llama3_3` - For Meta Llama 3.3 models
- `llama4` - For Meta Llama 4 models
- `mistral` - For Mistral models
- `cohere` - For Cohere models
- `ai21` - For AI21 models
- `titan` - For Amazon Titan models
- `deepseek` - For DeepSeek models
- `openai` - For OpenAI models
- `qwen` - For Alibaba Qwen models

### Example: Multi-Region Inference Profile

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  # Using an inference profile that routes to Claude models
  - id: bedrock:arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/claude-profile
    config:
      inferenceModelType: 'claude'
      max_tokens: 1024
      temperature: 0.7
      anthropic_version: 'bedrock-2023-05-31'

  # Using an inference profile for Llama models
  - id: bedrock:arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/llama-profile
    config:
      inferenceModelType: 'llama3.3'
      max_gen_len: 1024
      temperature: 0.7

  # Using an inference profile for Nova models
  - id: bedrock:arn:aws:bedrock:eu-west-1:123456789012:application-inference-profile/nova-profile
    config:
      inferenceModelType: 'nova'
      interfaceConfig:
        max_new_tokens: 1024
        temperature: 0.7
```

:::tip

Application Inference Profiles provide several benefits:

- **Automatic failover**: If one region is unavailable, requests automatically route to another region
- **Cost optimization**: Routes to the most cost-effective available model
- **Simplified management**: Use a single ARN instead of managing multiple model IDs

When using inference profiles, ensure the `inferenceModelType` matches the model family your profile is configured for, as the configuration parameters differ between model types.

:::

## Authentication

Amazon Bedrock supports multiple authentication methods, including the new API key authentication for simplified access. Credentials are resolved in this priority order:

### Credential Resolution Order

Credentials are resolved in the following priority order:

1. **Explicit credentials in config** (`accessKeyId`, `secretAccessKey`)
2. **Bedrock API Key authentication** (`apiKey`)
3. **SSO profile authentication** (`profile`)
4. **AWS default credential chain** (environment variables, `~/.aws/credentials`)

The first available credential method is used automatically.

### Authentication Options

#### 1. Explicit credentials (highest priority)

Specify AWS access keys directly in your configuration. **For security, use environment variables instead of hardcoding credentials:**

```yaml title="promptfooconfig.yaml"
providers:
  - id: bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      accessKeyId: '{{env.AWS_ACCESS_KEY_ID}}'
      secretAccessKey: '{{env.AWS_SECRET_ACCESS_KEY}}'
      sessionToken: '{{env.AWS_SESSION_TOKEN}}' # Optional, for temporary credentials
      region: 'us-east-1' # Optional, defaults to us-east-1
```

**Environment variables:**

```bash
export AWS_ACCESS_KEY_ID="your_access_key_id"
export AWS_SECRET_ACCESS_KEY="your_secret_access_key"
export AWS_SESSION_TOKEN="your_session_token"  # Optional
```

:::warning Security Best Practice

**Do not commit credentials to version control.** Use environment variables or a dedicated secrets management system to handle sensitive keys.

:::

This method overrides all other credential sources, including EC2 instance roles and SSO profiles.

#### 2. API Key authentication

Amazon Bedrock API keys provide simplified authentication without managing AWS IAM credentials.

**Using environment variables:**

Set the `AWS_BEARER_TOKEN_BEDROCK` environment variable:

```bash
export AWS_BEARER_TOKEN_BEDROCK="your-api-key-here"
```

```yaml title="promptfooconfig.yaml"
providers:
  - id: bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      region: 'us-east-1' # Optional, defaults to us-east-1
```

**Using config file:**

Specify the API key directly in your configuration:

```yaml title="promptfooconfig.yaml"
providers:
  - id: bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      apiKey: 'your-api-key-here'
      region: 'us-east-1' # Optional, defaults to us-east-1
```

:::note

API keys are limited to Amazon Bedrock and Amazon Bedrock Runtime actions. They cannot be used with:

- InvokeModelWithBidirectionalStream operations
- Agents for Amazon Bedrock API operations
- Data Automation for Amazon Bedrock API operations

For these advanced features, use traditional AWS IAM credentials instead.

:::

#### 3. SSO profile authentication

Use a named profile from your AWS configuration for AWS SSO setups or managing multiple AWS accounts:

```yaml title="promptfooconfig.yaml"
providers:
  - id: bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      profile: 'YOUR_SSO_PROFILE'
      region: 'us-east-1' # Optional, defaults to us-east-1
```

**Prerequisites for SSO profiles:**

1. **Install AWS CLI v2**: Ensure AWS CLI v2 is installed and on your PATH.

2. **Configure AWS SSO**: Set up AWS SSO using the AWS CLI:

   ```bash
   aws configure sso
   ```

3. **Profile configuration**: Your `~/.aws/config` should contain the profile:

   ```ini
   [profile YOUR_SSO_PROFILE]
   sso_start_url = https://your-sso-portal.awsapps.com/start
   sso_region = us-east-1
   sso_account_id = 123456789012
   sso_role_name = YourRoleName
   region = us-east-1
   ```

4. **Active SSO session**: Ensure you have an active SSO session:
   ```bash
   aws sso login --profile YOUR_SSO_PROFILE
   ```

**Use SSO profiles when:**

- Managing multi-account AWS environments
- Working in organizations with centralized AWS SSO
- Your team needs different role-based permissions
- You need to switch between different AWS contexts

#### 4. Default credentials (lowest priority)

Use the AWS SDK's standard credential chain:

```yaml title="promptfooconfig.yaml"
providers:
  - id: bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      region: 'us-east-1' # Only region specified
```

**The AWS SDK checks these sources in order:**

1. **Environment variables**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`
2. **Shared credentials file**: `~/.aws/credentials` (from `aws configure`)
3. **AWS IAM roles**: EC2 instance profiles, ECS task roles, Lambda execution roles
4. **Shared AWS CLI credentials**: Including cached SSO credentials

**Use default credentials when:**

- Running on AWS infrastructure (EC2, ECS, Lambda) with IAM roles
- Developing locally with AWS CLI configured (`aws configure`)
- Working in CI/CD environments with IAM roles or environment variables

**Quick setup for local development:**

```bash
# Option 1: Using AWS CLI
aws configure

# Option 2: Using environment variables
export AWS_ACCESS_KEY_ID="your_access_key"
export AWS_SECRET_ACCESS_KEY="your_secret_key"
export AWS_DEFAULT_REGION="us-east-1"
```

## Example

See [Github](https://github.com/promptfoo/promptfoo/tree/main/examples/amazon-bedrock) for full examples of Claude, Nova, AI21, Llama 3.3, and Titan model usage.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'Write a tweet about {{topic}}'

providers:
  # Using inference profiles (requires inferenceModelType)
  - id: bedrock:arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/my-claude-profile
    config:
      inferenceModelType: 'claude'
      region: 'us-east-1'
      temperature: 0.7
      max_tokens: 256

  # Using regular model IDs
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
  - id: bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0
    config:
      region: 'us-east-1'
      temperature: 0.7
      max_tokens: 256
  - id: bedrock:us.anthropic.claude-opus-4-1-20250805-v1:0
    config:
      region: 'us-east-1'
      temperature: 0.7
      max_tokens: 256
  - id: bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0
    config:
      region: 'us-east-1'
      temperature: 0.7
      max_tokens: 256
  - id: bedrock:us.anthropic.claude-3-5-haiku-20241022-v1:0
    config:
      region: 'us-east-1'
      temperature: 0.7
      max_tokens: 256
  - id: bedrock:us.anthropic.claude-3-opus-20240229-v1:0
    config:
      region: 'us-east-1'
      temperature: 0.7
      max_tokens: 256
  - id: bedrock:openai.gpt-oss-120b-1:0
    config:
      region: 'us-west-2'
      temperature: 0.7
      max_completion_tokens: 256
      reasoning_effort: 'medium'
  - id: bedrock:openai.gpt-oss-20b-1:0
    config:
      region: 'us-west-2'
      temperature: 0.7
      max_completion_tokens: 256
      reasoning_effort: 'low'
  - id: bedrock:qwen.qwen3-coder-480b-a35b-v1:0
    config:
      region: 'us-west-2'
      temperature: 0.7
      max_tokens: 256
      showThinking: true
  - id: bedrock:qwen.qwen3-32b-v1:0
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

### General Configuration Options

- `inferenceModelType`: (Required for inference profiles) Specifies the model family when using application inference profiles. Options include: `claude`, `nova`, `llama`, `llama2`, `llama3`, `llama3.1`, `llama3.2`, `llama3.3`, `llama4`, `mistral`, `cohere`, `ai21`, `titan`, `deepseek`, `openai`, `qwen`

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

For Claude models (e.g., `anthropic.claude-sonnet-4-5-20250929-v1:0`, `anthropic.claude-sonnet-4-20250514-v1:0`, `anthropic.us.claude-3-5-sonnet-20241022-v2:0`), you can use the following configuration options:

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

### OpenAI Models

OpenAI's open-weight models are available through AWS Bedrock with full support for their reasoning capabilities and parameters. The available models include:

- **`openai.gpt-oss-120b-1:0`**: 120 billion parameter model with strong reasoning capabilities
- **`openai.gpt-oss-20b-1:0`**: 20 billion parameter model, more cost-effective

```yaml
config:
  max_completion_tokens: 1024 # Maximum tokens for response (OpenAI-style parameter)
  temperature: 0.7 # Controls randomness (0.0 to 1.0)
  top_p: 0.9 # Nucleus sampling parameter
  frequency_penalty: 0.1 # Reduces repetition of frequent tokens
  presence_penalty: 0.1 # Reduces repetition of any tokens
  stop: ['END', 'STOP'] # Stop sequences
  reasoning_effort: 'medium' # Controls reasoning depth: 'low', 'medium', 'high'
```

#### Reasoning Effort

OpenAI models support adjustable reasoning effort through the `reasoning_effort` parameter:

- **`low`**: Faster responses with basic reasoning
- **`medium`**: Balanced performance and reasoning depth
- **`high`**: Thorough reasoning, slower but more accurate responses

The reasoning effort is implemented via system prompt instructions, allowing the model to adjust its cognitive processing depth.

#### Usage Example

```yaml
providers:
  - id: bedrock:openai.gpt-oss-120b-1:0
    config:
      region: 'us-west-2'
      max_completion_tokens: 2048
      temperature: 0.3
      top_p: 0.95
      reasoning_effort: 'high'
  - id: bedrock:openai.gpt-oss-20b-1:0
    config:
      region: 'us-west-2'
      max_completion_tokens: 1024
      temperature: 0.5
      reasoning_effort: 'medium'
      stop: ['END', 'FINAL']
```

:::note

OpenAI models use `max_completion_tokens` instead of `max_tokens` like other Bedrock models. This aligns with OpenAI's API specification and allows for more precise control over response length.

:::

### Qwen Models

Alibaba's Qwen models (e.g., `qwen.qwen3-coder-480b-a35b-v1:0`, `qwen.qwen3-coder-30b-a3b-v1:0`, `qwen.qwen3-235b-a22b-2507-v1:0`, `qwen.qwen3-32b-v1:0`) support advanced features including hybrid thinking modes, tool calling, and extended context understanding.

**Regional Availability**: Check the [AWS Bedrock console](https://console.aws.amazon.com/bedrock/home) or use `aws bedrock list-foundation-models` to verify which Qwen models are available in your target region, as availability varies by model and region.

You can configure them with the following options:

```yaml
config:
  max_tokens: 2048 # Maximum number of tokens to generate
  temperature: 0.7 # Controls randomness (0.0 to 1.0)
  top_p: 0.9 # Nucleus sampling parameter
  frequency_penalty: 0.1 # Reduces repetition of frequent tokens
  presence_penalty: 0.1 # Reduces repetition of any tokens
  stop: ['END', 'STOP'] # Stop sequences
  showThinking: true # Control whether thinking content is included in output
  tools: [...] # Tool calling configuration (optional)
  tool_choice: 'auto' # Tool selection strategy (optional)
```

#### Hybrid Thinking Modes

Qwen models support hybrid thinking modes where the model can apply step-by-step reasoning before delivering the final answer. The `showThinking` parameter controls whether thinking content is included in the response output:

- When set to `true` (default), thinking content will be included in the output
- When set to `false`, thinking content will be excluded from the output

This allows you to access the model's reasoning process during generation while having the option to present only the final response to end users.

#### Tool Calling Support

Qwen models support tool calling with OpenAI-compatible function definitions:

```yaml
config:
  tools:
    - type: function
      function:
        name: calculate
        description: Perform arithmetic calculations
        parameters:
          type: object
          properties:
            expression:
              type: string
              description: The mathematical expression to evaluate
          required: ['expression']
  tool_choice: auto # 'auto', 'none', or specific function name
```

#### Model Variants

- **Qwen3-Coder-480B-A35B**: Mixture-of-experts model optimized for coding and agentic tasks with 480B total parameters and 35B active parameters
- **Qwen3-Coder-30B-A3B**: Smaller MoE model with 30B total parameters and 3B active parameters, optimized for coding tasks
- **Qwen3-235B-A22B**: General-purpose MoE model with 235B total parameters and 22B active parameters for reasoning and coding
- **Qwen3-32B**: Dense model with 32B parameters for consistent performance in resource-constrained environments

#### Usage Example

```yaml
providers:
  - id: bedrock:qwen.qwen3-coder-480b-a35b-v1:0
    config:
      region: us-west-2
      max_tokens: 2048
      temperature: 0.7
      top_p: 0.9
      showThinking: true
      tools:
        - type: function
          function:
            name: code_analyzer
            description: Analyze code for potential issues
            parameters:
              type: object
              properties:
                code:
                  type: string
                  description: The code to analyze
              required: ['code']
      tool_choice: auto
```

## Model-graded tests

You can use Bedrock models to grade outputs. By default, model-graded tests use `gpt-5` and require the `OPENAI_API_KEY` environment variable to be set. However, when using AWS Bedrock, you have the option of overriding the grader for [model-graded assertions](/docs/configuration/expected-outputs/model-graded/) to point to AWS Bedrock or other providers.

You can use either regular model IDs or application inference profiles for grading:

:::warning

Because of how model-graded evals are implemented, **the LLM grading models must support chat-formatted prompts** (except for embedding or classification models).

:::

To set this for all your test cases, add the [`defaultTest`](/docs/configuration/guide/#default-test-cases) property to your config:

```yaml title="promptfooconfig.yaml"
defaultTest:
  options:
    provider:
      # Using a regular model ID
      id: bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0
      config:
        temperature: 0
        # Other provider config options

      # Or using an inference profile
      # id: bedrock:arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/grading-profile
      # config:
      #   inferenceModelType: 'claude'
      #   temperature: 0
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

**Authentication:**

- `AWS_BEARER_TOKEN_BEDROCK`: Bedrock API key for simplified authentication

**Configuration:**

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

### Authentication Issues

#### "Unable to locate credentials" Error

```text
Error: Unable to locate credentials. You can configure credentials by running "aws configure".
```

**Solutions:**

1. **Check credential priority**: Ensure credentials are available in the expected priority order
2. **Verify AWS CLI setup**: Run `aws configure list` to see active credentials
3. **SSO session expired**: Run `aws sso login --profile YOUR_PROFILE`
4. **Environment variables**: Verify `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set

#### "AccessDenied" or "UnauthorizedOperation" Errors

**Solutions:**

1. **Check IAM permissions**: Ensure your credentials have `bedrock:InvokeModel` permission
2. **Model access**: Enable model access in the AWS Bedrock console
3. **Region mismatch**: Verify the region in your config matches where you enabled model access

#### SSO-Specific Issues

**"SSO session has expired":**

```bash
aws sso login --profile YOUR_PROFILE
```

**"Profile not found":**

- Check `~/.aws/config` contains the profile
- Verify profile name matches exactly (case-sensitive)

#### Debugging Authentication

Enable debug logging to see which credentials are being used:

```bash
export AWS_SDK_JS_LOG=1
npx promptfoo eval
```

This will show detailed AWS SDK logs including credential resolution.

### Model Configuration Issues

#### Inference profile requires inferenceModelType

If you see this error when using an inference profile ARN:

```text
Error: Inference profile requires inferenceModelType to be specified in config. Options: claude, nova, llama (defaults to v4), llama2, llama3, llama3.1, llama3.2, llama3.3, llama4, mistral, cohere, ai21, titan, deepseek, openai, qwen
```

This means you're using an application inference profile ARN but haven't specified which model family it's configured for. Add the `inferenceModelType` to your configuration:

```yaml
providers:
  # Incorrect - missing inferenceModelType
  - id: bedrock:arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/my-profile

  # Correct - includes inferenceModelType
  - id: bedrock:arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/my-profile
    config:
      inferenceModelType: 'claude' # Specify the model family
```

#### ValidationException: On-demand throughput isn't supported

If you see this error:

```text
ValidationException: Invocation of model ID anthropic.claude-3-5-sonnet-20241022-v2:0 with on-demand throughput isn't supported. Retry your request with the ID or ARN of an inference profile that contains this model.
```

This usually means you need to use the region-specific model ID. Update your provider configuration to include the regional prefix:

```yaml
providers:
  # Instead of this:
  - id: bedrock:anthropic.claude-sonnet-4-5-20250929-v1:0
  # Use this:
  - id: bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0 # US region
  # or
  - id: bedrock:eu.anthropic.claude-sonnet-4-5-20250929-v1:0 # EU region
  # or
  - id: bedrock:apac.anthropic.claude-sonnet-4-5-20250929-v1:0 # APAC region
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

- `bedrock:kb:us.anthropic.claude-3-5-sonnet-20241022-v2:0` (US region)
- `bedrock:kb:eu.anthropic.claude-3-5-sonnet-20241022-v2:0` (EU region)

Configuration options include:

- `knowledgeBaseId` (required): The ID of your AWS Bedrock Knowledge Base
- `region`: AWS region where your Knowledge Base is deployed (e.g., 'us-east-1', 'us-east-2', 'eu-west-1')
- `temperature`: Controls randomness in response generation (default: 0.0)
- `max_tokens`: Maximum number of tokens in the generated response
- `accessKeyId`, `secretAccessKey`, `sessionToken`: AWS credentials (if not using environment variables or IAM roles)
- `profile`: AWS profile name for SSO authentication

### Knowledge Base Example

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
  - id: bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0
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

## Bedrock Agents

Amazon Bedrock Agents uses the reasoning of foundation models (FMs), APIs, and data to break down user requests, gathers relevant information, and efficiently completes tasks—freeing teams to focus on high-value work. For detailed information on testing and evaluating deployed agents, see the [AWS Bedrock Agents Provider](./bedrock-agents.md) documentation.

Quick example:

```yaml
providers:
  - bedrock-agent:YOUR_AGENT_ID
    config:
      agentAliasId: PROD_ALIAS
      region: us-east-1
      enableTrace: true
```

## See Also

- [Amazon SageMaker Provider](./sagemaker.md) - For custom-deployed or fine-tuned models on AWS
- [RAG Evaluation Guide](../guides/evaluate-rag.md) - Complete guide to evaluating RAG systems with context-based assertions
- [Context-based Assertions](../configuration/expected-outputs/model-graded/index.md) - Documentation on context-faithfulness, context-relevance, and context-recall
- [Configuration Reference](../configuration/reference.md) - Complete configuration options including contextTransform
- [Command Line Interface](../usage/command-line.md) - How to use promptfoo from the command line
- [Provider Options](../providers/index.md) - Overview of all supported providers
- [Amazon Bedrock Examples](https://github.com/promptfoo/promptfoo/tree/main/examples/amazon-bedrock) - Runnable examples of Bedrock integration, including Knowledge Base and contextTransform examples
