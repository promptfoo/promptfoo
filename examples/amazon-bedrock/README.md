# Amazon Bedrock Examples

## Prerequisites

1. Set up your AWS credentials:

   ```bash
   export AWS_ACCESS_KEY_ID="your_access_key"
   export AWS_SECRET_ACCESS_KEY="your_secret_key"
   ```

   See [authentication docs](https://www.promptfoo.dev/docs/providers/aws-bedrock/#authentication) for other auth methods.

2. Request model access in your AWS region:
   - Visit the [AWS Bedrock Model Access page](https://us-west-2.console.aws.amazon.com/bedrock/home?region=us-west-2#/modelaccess)
   - Switch to your desired region. We recommend us-west-2 and us-east-1 which tend to have the most models available.
   - Enable the models you want to use.

## Available Examples

This directory contains several example configurations for different Bedrock models:

- [`promptfooconfig.claude.yaml`](promptfooconfig.claude.yaml) - Claude 3.5
- [`promptfooconfig.llama.yaml`](promptfooconfig.llama.yaml) - Llama3
- [`promptfooconfig.mistral.yaml`](promptfooconfig.mistral.yaml) - Mistral
- [`promptfooconfig.nova.yaml`](promptfooconfig.nova.yaml) - Amazon's Nova models
- [`promptfooconfig.nova.tool.yaml`](promptfooconfig.nova.tool.yaml) - Nova with tool usage examples
- [`promptfooconfig.titan-text.yaml`](promptfooconfig.titan-text.yaml) - Titan text generation examples
- [`promptfooconfig.yaml`](promptfooconfig.yaml) - Combined evaluation across multiple providers

## Getting Started

1. Run the evaluation:

   ```bash
   promptfoo eval -c [path/to/config.yaml]
   ```

2. View the results:

   ```bash
   promptfoo view
   ```
