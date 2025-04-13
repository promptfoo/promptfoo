# Amazon Bedrock Example

This example demonstrates how to use the Amazon Bedrock service with promptfoo for model evaluation and comparison.

## Prerequisites

In order to use this example, the following prerequisites must be met:

1. You must have an AWS account with access to the Amazon Bedrock service.
2. You must have set up the necessary AWS credentials. You can either:
   - Configure AWS credentials through the AWS CLI (`aws configure`)
   - Set environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`)
   - Use SSO authentication with the `AWS_PROFILE` environment variable

## Setup

You can run this example with:

```bash
npx promptfoo@latest init --example amazon-bedrock
```

## Quick Start

To run this example, execute the following command:

```bash
cd amazon-bedrock
npm install
npm test
```

To run just one of the configuration files:

```bash
npx promptfoo eval -c promptfooconfig.mistral.yaml
```

## Included Examples

This directory contains several example configurations for different Bedrock models:

- [`promptfooconfig.claude.yaml`](promptfooconfig.claude.yaml) - Claude 3.7 Sonnet
- [`promptfooconfig.llama.yaml`](promptfooconfig.llama.yaml) - Llama3
- [`promptfooconfig.llama3.2.multimodal.yaml`](promptfooconfig.llama3.2.multimodal.yaml) - Llama 3.2 with multimodal capabilities
- [`promptfooconfig.mistral.yaml`](promptfooconfig.mistral.yaml) - Mistral
- [`promptfooconfig.nova.yaml`](promptfooconfig.nova.yaml) - Amazon's Nova models
- [`promptfooconfig.nova.tool.yaml`](promptfooconfig.nova.tool.yaml) - Nova with tool usage examples
- [`promptfooconfig.nova.multimodal.yaml`](promptfooconfig.nova.multimodal.yaml) - Nova with multimodal capabilities
- [`promptfooconfig.a21.yaml`](promptfooconfig.a21.yaml) - AI21's Jamba models
- [`promptfooconfig.kb.yaml`](promptfooconfig.kb.yaml) - Knowledge Base RAG example with citations
- [`promptfooconfig.yaml`](promptfooconfig.yaml) - Combined evaluation across multiple providers

## Multimodal Examples

This repository includes two multimodal examples:

### Amazon Nova Multimodal Example

The Nova multimodal example (`promptfooconfig.nova.multimodal.yaml`) demonstrates how to use Amazon Nova models with image inputs.

### Llama 3.2 Multimodal Example

The Llama 3.2 multimodal example (`promptfooconfig.llama3.2.multimodal.yaml`) showcases Meta's Llama 3.2 vision capabilities. This example includes various vision tasks such as:

- Image captioning
- Visual question answering 
- Entity extraction from images

To use this example, ensure you have the US West (Oregon) region enabled for Llama 3.2 models.

For the most reliable multimodal support in Bedrock, Amazon's Nova models (`promptfooconfig.nova.multimodal.yaml`) may provide more consistent results.

## Knowledge Base Example

The Knowledge Base example (`promptfooconfig.kb.yaml`) demonstrates how to use AWS Bedrock Knowledge Base for Retrieval Augmented Generation (RAG).

This demonstrates how to:

1. Request knowledge base retrievals from AWS Bedrock
2. Pass retrieved citations to LLMs in the context
3. Compare different RAG approaches

### Running the KB Example

Before running the Knowledge Base example, you'll need to:

1. Create a Knowledge Base in the AWS console
2. Update `promptfooconfig.kb.yaml` with your Knowledge Base ID
3. Set the AWS_BEDROCK_KB_REGION environment variable (if different from your standard AWS region)

## Environment Configuration

The example can be configured through environment variables:

- `AWS_BEDROCK_REGION`: The AWS region where your Bedrock models are available (default: `us-east-1`)
- `AWS_BEDROCK_MAX_TOKENS`: Maximum tokens to generate (default: model-specific)
- `AWS_BEDROCK_TEMPERATURE`: Temperature setting for text generation (default: `0`)
- `AWS_BEDROCK_STOP`: JSON array of stop sequences (example: `["##", "END"]`)

## Configuration Details

Each YAML file contains a variety of examples that showcase:

1. Different models available on Amazon Bedrock
2. Assertions to verify outputs meet expectations
3. Various question types and scenarios to test

### Nova Tool Usage

The `promptfooconfig.nova.tool.yaml` file demonstrates how to invoke tools using Nova models.

## Additional Resources

- [Amazon Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [promptfoo Provider Documentation](https://www.promptfoo.dev/docs/providers/bedrock)
- [AWS SDK for JavaScript](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-bedrock-runtime/)
