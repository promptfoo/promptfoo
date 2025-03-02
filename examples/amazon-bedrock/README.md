# Amazon Bedrock Example

This example demonstrates how to use promptfoo with Amazon Bedrock to evaluate multiple foundation models. It includes configurations for testing Claude, Llama 2, and other models available through Bedrock.

## Quick Start

```bash
npx promptfoo@latest init --example amazon-bedrock
```

## Configuration

1. Set up your AWS credentials:

```bash
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_REGION=your_region
```

2. Review the configuration files:
   - `promptfooconfig.yaml`: Main configuration for Claude models
   - `promptfooconfig.llama.yaml`: Configuration for Llama 2 models
   - `promptfooconfig.titan.yaml`: Configuration for Amazon Titan models

## Usage

Run evaluations for specific models:

```bash
# Test Claude models
promptfoo eval -c promptfooconfig.yaml

# Test Llama 2 models
promptfoo eval -c promptfooconfig.llama.yaml

# Test Titan models
promptfoo eval -c promptfooconfig.titan.yaml
```

View results:

```bash
promptfoo view
```

## What's Being Tested

This example evaluates:

- Response quality across different model families
- Cost and performance tradeoffs
- Model-specific capabilities and limitations

## Additional Resources

- [Amazon Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [Bedrock Provider Guide](https://promptfoo.dev/docs/providers/bedrock)
- [Configuration Reference](https://promptfoo.dev/docs/configuration/)
