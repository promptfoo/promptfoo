# AWS Bedrock Knowledge Base Example

This example demonstrates how to use AWS Bedrock Knowledge Base with promptfoo for evaluating responses from your knowledge base.

## Prerequisites

1. AWS Account with Bedrock access
2. A Knowledge Base created in AWS Bedrock
3. AWS credentials configured (see [AWS Bedrock setup guide](../../site/docs/providers/aws-bedrock.md))

## Setup

1. Note your Knowledge Base ID from the AWS Console (format: `kb-12345`)
2. Update `knowledge-base.yaml` with your Knowledge Base ID
3. Configure AWS credentials (either through environment variables or AWS config)

## Running the Example

```bash
promptfoo eval -c knowledge-base.yaml
```

This will:

1. Connect to your AWS Bedrock Knowledge Base
2. Run the test prompts against your knowledge base
3. Validate the responses using the defined assertions

## Configuration

The example in `knowledge-base.yaml` demonstrates:

- Knowledge Base provider configuration
- Vector search options
- Multiple test prompts
- Response validation using assertions

See the [AWS Bedrock documentation](../../site/docs/providers/aws-bedrock.md#knowledge-base) for more configuration options.
