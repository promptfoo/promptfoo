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
