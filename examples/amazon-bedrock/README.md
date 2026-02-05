# amazon-bedrock (Amazon Bedrock Examples)

You can run this example with:

```bash
npx promptfoo@latest init --example amazon-bedrock
```

## Prerequisites

1. Set up your AWS credentials:

   ```bash
   export AWS_ACCESS_KEY_ID="your_access_key"
   export AWS_SECRET_ACCESS_KEY="your_secret_key"
   ```

   See [authentication docs](https://www.promptfoo.dev/docs/providers/aws-bedrock/#authentication) for other auth methods, including SSO profiles.

2. Request model access in your AWS region:
   - Visit the [AWS Bedrock Model Access page](https://us-west-2.console.aws.amazon.com/bedrock/home?region=us-west-2#/modelaccess)
   - Switch to your desired region. We recommend us-west-2 and us-east-1 which tend to have the most models available.
   - Enable the models you want to use.
3. Install required dependencies:

   ```bash
   # For basic Bedrock models
   npm install @aws-sdk/client-bedrock-runtime

   # For Knowledge Base examples
   npm install @aws-sdk/client-bedrock-agent-runtime
   ```

## Available Examples

This directory contains several example configurations for different Bedrock models:

- [`promptfooconfig.claude.yaml`](promptfooconfig.claude.yaml) - Claude 4.1 Opus, Claude 4 Opus/Sonnet, Claude 3.7 Sonnet
- [`promptfooconfig.openai.yaml`](promptfooconfig.openai.yaml) - OpenAI GPT-OSS models (120B and 20B) with reasoning effort
- [`promptfooconfig.llama.yaml`](promptfooconfig.llama.yaml) - Llama3
- [`promptfooconfig.mistral.yaml`](promptfooconfig.mistral.yaml) - Mistral
- [`promptfooconfig.nova.yaml`](promptfooconfig.nova.yaml) - Amazon's Nova models
- [`promptfooconfig.nova.tool.yaml`](promptfooconfig.nova.tool.yaml) - Nova with tool usage examples
- [`promptfooconfig.nova.multimodal.yaml`](promptfooconfig.nova.multimodal.yaml) - Nova with multimodal capabilities
- [`promptfooconfig.titan-text.yaml`](promptfooconfig.titan-text.yaml) - Titan text generation examples
- [`promptfooconfig.kb.yaml`](promptfooconfig.kb.yaml) - Knowledge Base RAG example with citations and contextTransform
- [`promptfooconfig.inference-profiles.yaml`](promptfooconfig.inference-profiles.yaml) - Comprehensive Application Inference Profiles example with multiple model types
- [`promptfooconfig.inference-profiles-simple.yaml`](promptfooconfig.inference-profiles-simple.yaml) - Simple production-ready inference profile setup for high availability
- [`promptfooconfig.yaml`](promptfooconfig.yaml) - Combined evaluation across multiple providers
- [`promptfooconfig.nova-sonic.yaml`](promptfooconfig.nova-sonic.yaml) - Amazon Nova Sonic model for audio
- [`promptfooconfig.converse.yaml`](promptfooconfig.converse.yaml) - Converse API with extended thinking (ultrathink)

## Converse API Example

The Converse API example (`promptfooconfig.converse.yaml`) demonstrates the unified Bedrock Converse API with extended thinking (ultrathink) support.

### Key Features

- **Extended Thinking**: Enable Claude's reasoning capabilities with configurable token budgets
- **Unified Interface**: Single API format works across Claude, Nova, Llama, Mistral, and more
- **Performance Optimization**: Use `performanceConfig.latency: optimized` for faster responses
- **Show/Hide Thinking**: Control whether thinking content appears in output with `showThinking`

### Configuration

```yaml
providers:
  - id: bedrock:converse:us.anthropic.claude-sonnet-4-5-20250929-v1:0
    label: Claude Sonnet 4.5 with Thinking
    config:
      region: us-west-2
      maxTokens: 20000
      thinking:
        type: enabled
        budget_tokens: 16000
      showThinking: true
      performanceConfig:
        latency: optimized
```

Run the Converse API example with:

```bash
promptfoo eval -c examples/amazon-bedrock/promptfooconfig.converse.yaml
```

## Knowledge Base Example

The Knowledge Base example (`promptfooconfig.kb.yaml`) demonstrates how to use AWS Bedrock Knowledge Base for Retrieval Augmented Generation (RAG).

### Knowledge Base Setup

For this example, you'll need to:

1. Create a Knowledge Base in AWS Bedrock
2. Configure it to crawl or ingest content (the example assumes promptfoo documentation content)
3. Use the Amazon Titan Embeddings model for vector embeddings
4. Update the config with your Knowledge Base ID:

```yaml
providers:
  - id: bedrock:kb:us.anthropic.claude-sonnet-4-5-20250929-v1:0
    config:
      region: 'us-east-2' # Change to your region
      knowledgeBaseId: 'YOUR_KNOWLEDGE_BASE_ID' # Replace with your KB ID
```

When running the Knowledge Base example, you'll see:

- Responses from a Knowledge Base-enhanced model with citations
- Responses from a standard model for comparison
- Citations from source documents that show where information was retrieved from
- Example of `contextTransform` feature extracting context from citations for evaluation

The example includes questions about promptfoo configuration, providers, and evaluation techniques that work well with the embedded promptfoo documentation.

**Note**: You'll need to update the `knowledgeBaseId` with your actual Knowledge Base ID and ensure the Knowledge Base is configured to work with the selected Claude model.

For detailed Knowledge Base setup instructions, see the [AWS Bedrock Knowledge Base Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html).

## Application Inference Profiles Example

The Application Inference Profiles example (`promptfooconfig.inference-profiles.yaml`) demonstrates how to use AWS Bedrock's inference profiles for multi-region failover and cost optimization.

### Key Benefits of Inference Profiles

- **Automatic Failover**: If one region is unavailable, requests automatically route to another region
- **Cost Optimization**: Routes to the most cost-effective available model
- **Simplified Management**: Use a single ARN instead of managing multiple model IDs
- **Cross-Region Availability**: Access models across multiple regions with a single profile

### Configuration Requirements

When using inference profiles, you **must** specify the `inferenceModelType` parameter:

```yaml
providers:
  - id: bedrock:arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/my-profile
    config:
      inferenceModelType: 'claude' # Required!
      region: 'us-east-1'
      max_tokens: 1024
```

### Supported Model Types

- `claude` - Anthropic Claude models
- `nova` - Amazon Nova models
- `llama` - Defaults to Llama 4
- `llama2`, `llama3`, `llama3.1`, `llama3.2`, `llama3.3`, `llama4` - Specific Llama versions
- `mistral` - Mistral models
- `cohere` - Cohere models
- `ai21` - AI21 models
- `titan` - Amazon Titan models
- `deepseek` - DeepSeek models (with thinking capability)
- `openai` - OpenAI GPT-OSS models

### Running the Examples

We provide two inference profile examples:

1. **Comprehensive Example** (`promptfooconfig.inference-profiles.yaml`):

   ```bash
   promptfoo eval -c examples/amazon-bedrock/promptfooconfig.inference-profiles.yaml
   ```

   This includes:
   - Multiple inference profiles for different model families
   - Comparison with direct model IDs
   - Use of inference profiles for grading assertions
   - Various model-specific configurations

2. **Simple Production Example** (`promptfooconfig.inference-profiles-simple.yaml`):
   ```bash
   promptfoo eval -c examples/amazon-bedrock/promptfooconfig.inference-profiles-simple.yaml
   ```
   This demonstrates:
   - A realistic customer support use case
   - High availability setup with failover
   - Comparison between inference profile and direct model access
   - Consistent grading using inference profiles

**Note**: Replace the example ARNs with your actual application inference profile ARNs. To create an inference profile, visit the AWS Bedrock console and navigate to the "Application inference profiles" section.

## OpenAI Models Example

The OpenAI example (`promptfooconfig.openai.yaml`) demonstrates OpenAI's GPT-OSS models available through AWS Bedrock:

- **openai.gpt-oss-120b-1:0** - 120 billion parameter model with strong reasoning capabilities
- **openai.gpt-oss-20b-1:0** - 20 billion parameter model, more cost-effective

### Key Features

- **Reasoning Effort**: Control reasoning depth with `low`, `medium`, or `high` settings
- **OpenAI API Format**: Uses familiar OpenAI parameters like `max_completion_tokens`
- **Available in us-west-2**: Ensure you have model access in the correct region

Run the OpenAI example with:

```bash
promptfoo eval -c examples/amazon-bedrock/promptfooconfig.openai.yaml
```

## New Converse API Features (SDK 3.943+)

The Converse API supports additional stop reason handling:

- `malformed_model_output`: Model produced invalid output
- `malformed_tool_use`: Model produced a malformed tool use request

These are returned as errors in the response with `metadata.isModelError: true`.

## Nova Sonic Configuration

Nova Sonic now supports configurable timeouts:

```yaml
providers:
  - id: bedrock:nova-sonic:amazon.nova-sonic-v1:0
    config:
      region: us-east-1
      sessionTimeout: 300000 # 5 minutes (default)
      requestTimeout: 120000 # 2 minutes
```

Error responses include categorized error types in `metadata.errorType`:

- `connection`: Network/AWS connectivity issues
- `timeout`: Request or session timeout
- `api`: Authentication/authorization errors
- `parsing`: Response parsing failures
- `session`: Bidirectional stream session errors

## Getting Started

1. Run the evaluation:

   ```bash
   promptfoo eval -c [path/to/config.yaml]
   ```

2. View the results:

   ```bash
   promptfoo view
   ```
