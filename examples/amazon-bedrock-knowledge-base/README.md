# amazon-bedrock-knowledge-base (promptfoo Documentation Assistant)

You can run this example with:

```bash
npx promptfoo@latest init --example amazon-bedrock-knowledge-base
```

## Overview

This example demonstrates how to create a documentation assistant for promptfoo using AWS Bedrock Knowledge Base. The Knowledge Base is configured to work with content from promptfoo.dev, allowing you to ask questions about promptfoo and get accurate answers with citations.

## Prerequisites

1. **AWS Account with Bedrock Access**

   - You need an AWS account with access to Amazon Bedrock
   - Ensure you have model access for Claude 3.7 Sonnet in your AWS region

2. **AWS CLI and Credentials**
   - Install and configure the [AWS CLI](https://aws.amazon.com/cli/)
   - Configure with credentials that have permissions for Bedrock resources

## Environment Variables

This example requires the following environment variables:

- `AWS_ACCESS_KEY_ID` - Your AWS access key
- `AWS_SECRET_ACCESS_KEY` - Your AWS secret key
- `AWS_REGION` (optional) - AWS region (defaults to us-east-1)

You can set these in a `.env` file or directly in your environment.

## Knowledge Base Setup

For detailed instructions on setting up an AWS Bedrock Knowledge Base, please refer to the [official AWS documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html).

For this example, you would:

1. Create a Knowledge Base in AWS Bedrock
2. Configure it to crawl or ingest content from promptfoo.dev
3. Use the Amazon Titan Embeddings model for vector embeddings
4. Make note of your Knowledge Base ID for the configuration below

## Configuration

Update the `promptfooconfig.yaml` file with your Knowledge Base details:

```yaml
providers:
  - id: bedrock:kb:us.anthropic.claude-3-7-sonnet-20250219-v1:0
    config:
      region: 'us-east-2' # Change to your region
      knowledgeBaseId: 'YOUR_KNOWLEDGE_BASE_ID' # Replace with your KB ID
```

The example is configured to ask promptfoo-specific questions like:

- "What is promptfoo and what problem does it solve?"
- "How do I evaluate prompts with promptfoo?"
- "What providers and models does promptfoo support?"

## Running the Example

1. Ensure your AWS credentials are configured

2. Run the evaluation:

   ```bash
   promptfoo eval
   ```

3. View the results:
   ```bash
   promptfoo view
   ```

## Understanding the Results

The evaluation compares responses from:

- The Knowledge Base provider (with citations from promptfoo.dev documentation)
- A standard Claude model (without Knowledge Base integration)

Knowledge Base responses include source citations linking to specific promptfoo documentation pages.

## Cleaning Up

To avoid incurring charges, delete these resources when you're done:

1. Delete the Knowledge Base from the AWS Bedrock console

## Additional Resources

- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [Bedrock Knowledge Base Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html)
- [promptfoo Documentation](https://www.promptfoo.dev/docs/)
