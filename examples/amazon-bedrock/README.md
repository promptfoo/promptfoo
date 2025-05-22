# amazon-bedrock

Evaluating various models (including Claude 4, Nova, Llama) through Amazon Bedrock.

You can run this example with:

```bash
npx promptfoo@latest init --example amazon-bedrock
```

This example demonstrates how to evaluate and compare different foundation models available through Amazon Bedrock, with a focus on the latest Claude 4 models.

## Available Models

### Claude 4 Models (Latest)

- **Claude Opus 4** (`anthropic.claude-opus-4-20250514-v1:0`): The most advanced model for complex tasks and deep reasoning
  - Available in: US East (Ohio, N. Virginia), US West (Oregon)
- **Claude Sonnet 4** (`anthropic.claude-sonnet-4-20250514-v1:0`): Optimized for efficiency at scale with enhanced performance
  - Available in: US East (Ohio, N. Virginia), US West (Oregon), Asia Pacific, Europe (Spain)

### Other Models

- Claude 3.7 Sonnet
- Amazon Nova (Lite, Micro, Pro, Premier)
- Meta Llama 3.3
- Mistral Large
- AI21 Jamba
- DeepSeek

## Configuration Examples

### Basic Claude 4 Configuration

```yaml
providers:
  - id: bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0
    config:
      region: us-west-2
      temperature: 0.7
      max_tokens: 2048
```

### Claude 4 with Extended Thinking

```yaml
providers:
  - id: bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0
    config:
      thinking:
        type: enabled
        budget_tokens: 1024
      showThinking: true
```

### Tool Use with Claude 4

```yaml
providers:
  - id: bedrock:us.anthropic.claude-sonnet-4-20250514-v1:0
    config:
      tools:
        - name: get_weather
          description: Get the current weather
          input_schema:
            type: object
            properties:
              location:
                type: string
```

## Running the Examples

1. **Main comparison** (`promptfooconfig.yaml`): Compares Claude 4, Nova, Llama, and other models
2. **Claude-specific** (`promptfooconfig.claude.yaml`): Focuses on Claude 4 models with thinking capabilities
3. **Tool use** (`promptfooconfig.bedrock.yaml` in tool-use example): Demonstrates Claude 4's tool calling abilities
4. **Knowledge Base** (`promptfooconfig.kb.yaml`): Shows Claude 4 with AWS Bedrock Knowledge Base for RAG

## Prerequisites

1. AWS credentials configured
2. Model access enabled in AWS Bedrock console
3. Install AWS SDK: `npm install -g @aws-sdk/client-bedrock-runtime`

## Regional Availability

When using Claude 4 models, ensure you're using the correct regional prefix:

- US: `us.anthropic.claude-*`
- EU: `eu.anthropic.claude-*` (Sonnet 4 only)
- APAC: `apac.anthropic.claude-*` (Sonnet 4 only)

## Available Examples

This directory contains several example configurations for different Bedrock models:

- [`promptfooconfig.claude.yaml`](promptfooconfig.claude.yaml) - Claude 3.7 Sonnet
- [`promptfooconfig.llama.yaml`](promptfooconfig.llama.yaml) - Llama3
- [`promptfooconfig.mistral.yaml`](promptfooconfig.mistral.yaml) - Mistral
- [`promptfooconfig.nova.yaml`](promptfooconfig.nova.yaml) - Amazon's Nova models
- [`promptfooconfig.nova.tool.yaml`](promptfooconfig.nova.tool.yaml) - Nova with tool usage examples
- [`promptfooconfig.nova.multimodal.yaml`](promptfooconfig.nova.multimodal.yaml) - Nova with multimodal capabilities
- [`promptfooconfig.titan-text.yaml`](promptfooconfig.titan-text.yaml) - Titan text generation examples
- [`promptfooconfig.kb.yaml`](promptfooconfig.kb.yaml) - Knowledge Base RAG example with citations
- [`promptfooconfig.yaml`](promptfooconfig.yaml) - Combined evaluation across multiple providers
- [`promptfooconfig.nova-sonic.yaml`](promptfooconfig.nova-sonic.yaml) - Amazon Nova Sonic model for audio

## Knowledge Base Example

The Knowledge Base example (`promptfooconfig.kb.yaml`) demonstrates how to use AWS Bedrock Knowledge Base for Retrieval Augmented Generation (RAG).

### Knowledge Base Setup

For this example, you'll need to:

1. Create a Knowledge Base in AWS Bedrock
2. Configure it to crawl or ingest content (the example uses promptfoo.dev content)
3. Use the Amazon Titan Embeddings model for vector embeddings
4. Update the config with your Knowledge Base ID:

```yaml
providers:
  - id: bedrock:kb:us.anthropic.claude-3-7-sonnet-20250219-v1:0
    config:
      region: 'us-east-2' # Change to your region
      knowledgeBaseId: 'YOUR_KNOWLEDGE_BASE_ID' # Replace with your KB ID
```

When running the Knowledge Base example, you'll see:

- Responses from a Knowledge Base-enhanced model with citations
- Responses from a standard model for comparison
- Citations from source documents that show where information was retrieved from

For detailed Knowledge Base setup instructions, see the [AWS Bedrock Knowledge Base Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html).

## Getting Started

1. Run the evaluation:

   ```bash
   promptfoo eval -c [path/to/config.yaml]
   ```

2. View the results:

   ```bash
   promptfoo view
   ```
