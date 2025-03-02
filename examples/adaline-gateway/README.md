# Adaline Gateway Example

This example demonstrates how to use promptfoo with Adaline's API Gateway for testing multiple vision and language models. It includes several sub-examples showcasing different features and capabilities.

## Quick Start

```bash
npx promptfoo@latest init --example adaline-gateway
```

## Structure

This example contains multiple sub-examples:

- `adaline-chat/`: Basic chat completion example
- `adaline-vision/`: Vision model testing with direct image URLs
- `adaline-vision-base64/`: Vision model testing with base64-encoded images

Each subdirectory contains its own:

- Configuration file (`promptfooconfig.yaml`)
- Test prompts and cases
- Model-specific settings

## Configuration

1. Set up your Adaline API credentials:

```bash
export ADALINE_API_KEY=your_api_key_here
```

2. Review the configuration in each subdirectory's `promptfooconfig.yaml` to understand:
   - Model selection and parameters
   - Test case setup
   - Input/output formats

## Additional Resources

- [Adaline API Documentation](https://docs.adaline.ai)
- [Vision Testing Guide](https://promptfoo.dev/docs/configuration/image-testing)
- [Configuration Reference](https://promptfoo.dev/docs/configuration/)
